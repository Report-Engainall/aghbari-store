export type BoundedTextBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "unreadable" | "invalid_utf8" };

async function cancelBodyQuietly(body: ReadableStream<Uint8Array> | null): Promise<void> {
  try {
    await body?.cancel();
  } catch {
    // Preserve the bounded-size rejection.
  }
}

async function cancelReaderQuietly(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Preserve the bounded read result.
  }
}

function declaresOversizeBody(contentLength: string | null, maxBytes: number): boolean {
  if (contentLength === null || !/^\d+$/.test(contentLength.trim())) return false;
  const declaredBytes = Number(contentLength.trim());
  return Number.isSafeInteger(declaredBytes) && declaredBytes > maxBytes;
}

/**
 * Read UTF-8 text without buffering beyond maxBytes.
 * Content-Length is an early-rejection hint only; streamed bytes are always counted.
 */
export async function readBoundedTextBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  contentLength: string | null = null,
): Promise<BoundedTextBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a nonnegative safe integer");
  }

  if (declaresOversizeBody(contentLength, maxBytes)) {
    await cancelBodyQuietly(body);
    return { ok: false, reason: "too_large" };
  }

  if (!body) return { ok: true, text: "" };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await cancelReaderQuietly(reader);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    await cancelReaderQuietly(reader);
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid_utf8" };
  }
}
