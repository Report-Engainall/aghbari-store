export type ImportRequestIntent = "replace" | "merge" | "new_version";

export type ImportRequestIdentity = {
  /** Local scoping only; the database still derives the authoritative actor from auth.uid(). */
  actorId: string;
  fileName: string;
  fileHash: string;
  fileSize: number;
  jobType: string;
  profileId: string | null;
  periodKey: string | null;
  sourceSystem: string;
  /** External ERP/Onyx/supplier batch reference; local identity only, validated again by the server. */
  externalSourceReference?: string | null;
  intent: ImportRequestIntent;
};

export type ImportRequestKeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ImportRequestKeyResult = {
  requestKey: string;
  storageKey: string;
  reused: boolean;
};

type StoredRequestKey = {
  version: 1;
  requestKey: string;
  fingerprint: string;
  createdAt: number;
};

type RequestKeyOptions = {
  /** Test seam; production defaults to the current browser tab's sessionStorage. */
  storage?: ImportRequestKeyStorage | null;
  /** Test seam; production defaults to Date.now(). */
  now?: number;
  /** Test seam; production defaults to crypto.randomUUID(). */
  createRequestKey?: () => string;
};

const STORAGE_PREFIX = "aghbari-commerce:import-request:v1:";
const IMPORT_REQUEST_KEY_TTL_MS = 60 * 60 * 1000;
const REQUEST_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSessionStorage(): ImportRequestKeyStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function stableIdentity(identity: ImportRequestIdentity): string {
  return JSON.stringify({
    actorId: identity.actorId,
    fileName: identity.fileName,
    fileHash: identity.fileHash,
    fileSize: identity.fileSize,
    jobType: identity.jobType,
    profileId: identity.profileId ?? null,
    periodKey: identity.periodKey ?? null,
    sourceSystem: identity.sourceSystem || "manual",
    externalSourceReference: identity.externalSourceReference?.trim() || null,
    intent: identity.intent,
  });
}

async function fingerprint(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // The fingerprint is only a local storage namespace; the server validates the full payload.
  }

  // Deterministic non-cryptographic fallback for restricted Web Crypto contexts.
  // Server-side payload comparison still rejects any accidental key/fingerprint collision.
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64-${hash.toString(16).padStart(16, "0")}`;
}

function randomRequestKey(createRequestKey?: () => string): string {
  const value = createRequestKey ? createRequestKey() : globalThis.crypto?.randomUUID?.();
  if (!value || !REQUEST_KEY_PATTERN.test(value)) {
    throw new Error("يتعذر توليد مفتاح آمن لمحاولة الاستيراد في هذا المتصفح.");
  }
  return value;
}

/**
 * Reuses a request key for retries of the same logical import operation in this tab.
 * A changed payload or intent receives a fresh key. The server remains authoritative
 * and independently rejects reuse of a key with a different payload.
 */
export async function getOrCreateImportRequestKey(
  identity: ImportRequestIdentity,
  options: RequestKeyOptions = {},
): Promise<ImportRequestKeyResult> {
  const storage = options.storage === undefined ? getSessionStorage() : options.storage;
  if (!storage) {
    throw new Error("تعذر حفظ مفتاح محاولة الاستيراد في جلسة المتصفح؛ لم يبدأ إنشاء دفعة جديدة.");
  }

  const serializedIdentity = stableIdentity(identity);
  const requestFingerprint = await fingerprint(serializedIdentity);
  const storageKey = `${STORAGE_PREFIX}${requestFingerprint}`;
  const now = options.now ?? Date.now();

  try {
    const raw = storage.getItem(storageKey);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<StoredRequestKey>;
      const isFresh = saved.version === 1
        && saved.fingerprint === requestFingerprint
        && typeof saved.requestKey === "string"
        && REQUEST_KEY_PATTERN.test(saved.requestKey)
        && typeof saved.createdAt === "number"
        && Number.isFinite(saved.createdAt)
        && saved.createdAt <= now
        && now - saved.createdAt < IMPORT_REQUEST_KEY_TTL_MS;

      if (isFresh) {
        return { requestKey: String(saved.requestKey), storageKey, reused: true };
      }
      storage.removeItem(storageKey);
    }

    const requestKey = randomRequestKey(options.createRequestKey);
    const saved: StoredRequestKey = {
      version: 1,
      requestKey,
      fingerprint: requestFingerprint,
      createdAt: now,
    };
    storage.setItem(storageKey, JSON.stringify(saved));
    return { requestKey, storageKey, reused: false };
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("مفتاح آمن")) throw cause;
    throw new Error("تعذر تثبيت مفتاح محاولة الاستيراد في جلسة المتصفح؛ لم يبدأ إنشاء دفعة جديدة.");
  }
}

/** Call only after the server confirms that it returned the job for this request key. */
export function completeImportRequestKey(
  storageKey: string,
  options: Pick<RequestKeyOptions, "storage"> = {},
): void {
  const storage = options.storage === undefined ? getSessionStorage() : options.storage;
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // A replay remains safe: the server returns the same job for the same key/payload.
    // The stored key expires after one hour if browser storage cannot be cleared.
  }
}
