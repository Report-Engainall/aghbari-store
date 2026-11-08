import { readBoundedTextBody } from "./bounded-body.ts";
import {
  hasAllowedProductImageRole,
  isSafeProductImageRequest,
  isValidProductImageObjectPath,
  isWebpPayload,
  PRODUCT_IMAGE_MAX_BYTES,
} from "../../../src/lib/product-image-security.ts";

export const PRODUCT_IMAGE_BUCKET = "product-images";

type AuthUser = { id: string };
type AuthClient = {
  auth: {
    getUser(token: string): Promise<{ data: { user: AuthUser | null }; error: unknown | null }>;
  };
  setProductImageUrl(
    token: string,
    productId: string,
    expectedImageUrl: string | null,
    nextImageUrl: string | null,
  ): Promise<{ data: unknown; error: unknown | null }>;
  addProductGalleryImage(
    token: string,
    productId: string,
    imageUrl: string,
  ): Promise<{ data: unknown; error: unknown | null }>;
};
type ProductImageStorage = {
  upload(
    objectPath: string,
    bytes: Uint8Array,
    options: { contentType: "image/webp"; cacheControl: string; upsert: false },
  ): Promise<{ error: unknown | null }>;
  remove(paths: string[]): Promise<{ error: unknown | null }>;
  getPublicUrl(objectPath: string): { data: { publicUrl: string } };
};
type AdminClient = {
  getProfileByAuthUserId(authUserId: string): Promise<{
    data: { id: string; organization_id: string; is_active: boolean } | null;
    error: unknown | null;
  }>;
  getRoles(profileId: string): Promise<{ data: { role: unknown }[] | null; error: unknown | null }>;
  productExists(productId: string, organizationId: string): Promise<{
    data: { id: string } | null;
    error: unknown | null;
  }>;
  storage: ProductImageStorage;
};

export type ProductImageUploadDependencies = {
  getEnv(name: string): string | undefined;
  createAuthClient(url: string, anonKey: string): AuthClient;
  createAdminClient(url: string, serviceKey: string): AdminClient;
  randomUUID?: () => string;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, x-client-info, content-type, x-product-id, x-expected-image-url, x-image-mode",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function reply(value: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: CORS });
}

function uuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function cancelUploadBodyQuietly(body: ReadableStream<Uint8Array> | null): Promise<void> {
  try {
    await body?.cancel();
  } catch {
    // Preserve the bounded-size rejection.
  }
}

async function cancelUploadReaderQuietly(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Preserve the bounded read result.
  }
}

async function readBoundedBytes(request: Request, limit: number): Promise<Uint8Array | null> {
  const header = request.headers.get("content-length");
  const contentLength = Number(header ?? "");
  if (header !== null && Number.isFinite(contentLength) && contentLength > limit) {
    await cancelUploadBodyQuietly(request.body);
    return null;
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) {
        await cancelUploadReaderQuietly(reader);
        return null;
      }
      chunks.push(result.value);
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  } catch {
    await cancelUploadReaderQuietly(reader);
    return null;
  } finally {
    reader.releaseLock();
  }
}

type ProductImageCommand =
  | { action: "delete"; productId: string; objectPath: string }
  | { action: "unlink"; productId: string; expectedImageUrl: string | null; objectPath: string | null }
  | { action: "upload"; productId: string; mode: "primary" | "gallery"; expectedImageUrl: string | null; bytes: Uint8Array };

type ProductImageCommandResult =
  | { ok: true; command: ProductImageCommand }
  | { ok: false; response: Response };

function commandFailure(error: string, status: number): ProductImageCommandResult {
  return { ok: false, response: reply({ error }, status) };
}

async function parseJsonCommand(request: Request): Promise<ProductImageCommandResult> {
  const bodyRead = await readBoundedTextBody(
    request.body,
    2048,
    request.headers.get("content-length"),
  );
  if (!bodyRead.ok) {
    const error = bodyRead.reason === "too_large"
      ? "request_too_large"
      : bodyRead.reason === "invalid_utf8" ? "invalid_utf8" : "invalid_request_body";
    const status = bodyRead.reason === "too_large" ? 413 : 400;
    return commandFailure(error, status);
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyRead.text);
  } catch {
    return commandFailure("invalid_json", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return commandFailure("invalid_request", 400);
  }

  const value = body as Record<string, unknown>;
  const productId = typeof value.product_id === "string" ? value.product_id : "";
  if (value.action === "delete") {
    return {
      ok: true,
      command: {
        action: "delete",
        productId,
        objectPath: typeof value.object_path === "string" ? value.object_path : "",
      },
    };
  }

  if (value.action === "unlink") {
    const expectedImageUrl = value.expected_image_url;
    const objectPath = value.object_path;
    if (
      !(expectedImageUrl === null || (typeof expectedImageUrl === "string" && expectedImageUrl.length <= 2048))
      || !(objectPath === null || (typeof objectPath === "string" && objectPath.length <= 512))
      || !Object.prototype.hasOwnProperty.call(value, "expected_image_url")
      || !Object.prototype.hasOwnProperty.call(value, "object_path")
    ) {
      return commandFailure("invalid_request", 400);
    }
    return {
      ok: true,
      command: {
        action: "unlink",
        productId,
        expectedImageUrl,
        objectPath,
      },
    };
  }

  return commandFailure("invalid_action", 400);
}

async function parseUploadCommand(
  request: Request,
  admin: AdminClient,
  organizationId: string,
): Promise<ProductImageCommandResult> {
  const productId = request.headers.get("x-product-id") ?? "";
  if (!uuid(productId) || !isSafeProductImageRequest(productId, organizationId)) {
    return commandFailure("invalid_product", 400);
  }

  const { data: product, error: productError } = await admin.productExists(productId, organizationId);
  if (productError || !product) return commandFailure("product_not_in_organization", 404);

  const bytes = await readBoundedBytes(request, PRODUCT_IMAGE_MAX_BYTES);
  if (!bytes) return commandFailure("invalid_image_size", 413);
  if (bytes.byteLength < 1) return commandFailure("invalid_image", 400);
  if (!isWebpPayload(bytes)) return commandFailure("webp_signature_required", 415);

  const modeHeader = request.headers.get("x-image-mode") ?? "primary";
  if (modeHeader !== "primary" && modeHeader !== "gallery") {
    return commandFailure("invalid_image_mode", 400);
  }
  const expectedHeader = request.headers.get("x-expected-image-url");
  if (modeHeader === "primary" && expectedHeader !== null && expectedHeader.length > 2048) {
    return commandFailure("invalid_expected_image_url", 400);
  }

  return {
    ok: true,
    command: {
      action: "upload",
      productId,
      mode: modeHeader,
      expectedImageUrl: expectedHeader || null,
      bytes,
    },
  };
}

async function parseProductImageCommand(
  request: Request,
  admin: AdminClient,
  organizationId: string,
): Promise<ProductImageCommandResult> {
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType === "application/json") return parseJsonCommand(request);
  if (contentType !== "image/webp") return commandFailure("webp_required", 415);
  return parseUploadCommand(request, admin, organizationId);
}

async function executeDeleteCommand(
  admin: AdminClient,
  organizationId: string,
  command: Extract<ProductImageCommand, { action: "delete" }>,
): Promise<Response> {
  if (!uuid(command.productId)) return reply({ error: "invalid_product" }, 400);

  const { data: product, error: productError } = await admin.productExists(command.productId, organizationId);
  if (productError || !product) return reply({ error: "product_not_in_organization" }, 404);
  if (!isValidProductImageObjectPath(command.objectPath, organizationId, command.productId)) {
    return reply({ error: "invalid_object_path" }, 400);
  }

  const { error } = await admin.storage.remove([command.objectPath]);
  if (error) return reply({ error: "image_cleanup_failed" }, 502);
  return reply({ deleted: true });
}

function rpcErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

async function executeUploadCommand(
  admin: AdminClient,
  auth: AuthClient,
  token: string,
  organizationId: string,
  command: Extract<ProductImageCommand, { action: "upload" }>,
  randomUUID: () => string,
): Promise<Response> {
  const objectPath = organizationId + "/" + command.productId + "/" + randomUUID() + ".webp";
  const { error: uploadError } = await admin.storage.upload(objectPath, command.bytes, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) return reply({ error: "image_upload_failed" }, 502);

  const publicUrl = admin.storage.getPublicUrl(objectPath).data.publicUrl;
  const { data, error } = command.mode === "gallery"
    ? await auth.addProductGalleryImage(token, command.productId, publicUrl)
    : await auth.setProductImageUrl(token, command.productId, command.expectedImageUrl, publicUrl);
  if (error) {
    let cleanupFailed = false;
    try {
      const cleanup = await admin.storage.remove([objectPath]);
      cleanupFailed = Boolean(cleanup.error);
    } catch {
      cleanupFailed = true;
    }
    const stale = rpcErrorCode(error) === "40001";
    const galleryLimit = command.mode === "gallery" && rpcErrorCode(error) === "22023";
    return reply({
      error: stale
        ? "image_link_changed"
        : galleryLimit ? "gallery_limit_reached"
        : cleanupFailed ? "image_link_failed_cleanup_pending" : "image_link_failed",
    }, stale || galleryLimit ? 409 : 502);
  }

  const saved = data && typeof data === "object" ? data as Record<string, unknown> : null;
  if (!saved || saved.id !== command.productId || saved.image_url !== publicUrl) {
    // An unrecognized acknowledgement is ambiguous: keep the object so a possibly
    // committed database link is never left pointing to a deleted file.
    return reply({ error: "image_link_state_unconfirmed" }, 503);
  }

  return reply({
    public_url: publicUrl,
    object_path: objectPath,
    image_linked: true,
    image_role: command.mode,
  });
}

async function executeUnlinkCommand(
  admin: AdminClient,
  auth: AuthClient,
  token: string,
  organizationId: string,
  command: Extract<ProductImageCommand, { action: "unlink" }>,
): Promise<Response> {
  if (!uuid(command.productId)) return reply({ error: "invalid_product" }, 400);
  const { data: product, error: productError } = await admin.productExists(command.productId, organizationId);
  if (productError || !product) return reply({ error: "product_not_in_organization" }, 404);
  if (command.objectPath && !isValidProductImageObjectPath(command.objectPath, organizationId, command.productId)) {
    return reply({ error: "invalid_object_path" }, 400);
  }

  const { data, error } = await auth.setProductImageUrl(
    token,
    command.productId,
    command.expectedImageUrl,
    null,
  );
  if (error) {
    const stale = rpcErrorCode(error) === "40001";
    return reply({ error: stale ? "image_link_changed" : "image_unlink_failed" }, stale ? 409 : 502);
  }

  const saved = data && typeof data === "object" ? data as Record<string, unknown> : null;
  if (!saved || saved.id !== command.productId || saved.image_url !== null) {
    return reply({ error: "image_unlink_state_unconfirmed" }, 503);
  }

  if (command.objectPath) {
    try {
      const { error: cleanupError } = await admin.storage.remove([command.objectPath]);
      if (cleanupError) return reply({ unlinked: true, cleaned: false });
    } catch {
      return reply({ unlinked: true, cleaned: false });
    }
  }
  return reply({ unlinked: true, cleaned: true });
}

/**
 * Authenticated product-image boundary, dependency-injected so tests exercise the
 * actual HTTP decisions without production credentials or a live storage service.
 */
export function createProductImageUploadHandler(deps: ProductImageUploadDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

    const url = deps.getEnv("SUPABASE_URL");
    const anonKey = deps.getEnv("SUPABASE_ANON_KEY");
    const serviceKey = deps.getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
    if (!url || !anonKey || !serviceKey) return reply({ error: "image_service_not_configured" }, 503);
    if (!token) return reply({ error: "unauthorized" }, 401);

    try {
      const authClient = deps.createAuthClient(url, anonKey);
      const { data: authData, error: authError } = await authClient.auth.getUser(token);
      if (authError || !authData.user) return reply({ error: "unauthorized" }, 401);

      const admin = deps.createAdminClient(url, serviceKey);
      const { data: profile, error: profileError } = await admin.getProfileByAuthUserId(authData.user.id);
      if (profileError || !profile || profile.is_active !== true || !uuid(profile.organization_id)) {
        return reply({ error: "active_organization_required" }, 403);
      }

      const { data: roleRows, error: roleError } = await admin.getRoles(profile.id);
      if (roleError || !hasAllowedProductImageRole((roleRows ?? []).map((row) => row.role))) {
        return reply({ error: "product_image_permission_required" }, 403);
      }

      const parsed = await parseProductImageCommand(request, admin, profile.organization_id);
      if (!parsed.ok) return parsed.response;

      if (parsed.command.action === "delete") {
        return executeDeleteCommand(admin, profile.organization_id, parsed.command);
      }
      if (parsed.command.action === "unlink") {
        return executeUnlinkCommand(
          admin, authClient, token, profile.organization_id, parsed.command,
        );
      }

      return executeUploadCommand(
        admin,
        authClient,
        token,
        profile.organization_id,
        parsed.command,
        deps.randomUUID ?? (() => crypto.randomUUID()),
      );
    } catch {
      // Do not leak provider/service-role details through unhandled Edge exceptions.
      return reply({ error: "image_service_unavailable" }, 503);
    }
  };
}
