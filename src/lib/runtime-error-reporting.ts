type RuntimeErrorContext = {
  boundary?: string;
};

/**
 * Provider-neutral browser diagnostics.
 *
 * Deliberately excludes raw messages, stack traces, URLs, tokens, customer data,
 * and arbitrary context values. Detailed server-side errors remain in trusted
 * server logs; there is no third-party telemetry or editor-preview bridge.
 */
export function reportRuntimeError(error: unknown, context: RuntimeErrorContext = {}) {
  if (typeof window === "undefined") return;

  const errorName =
    error instanceof Error
      ? error.name
      : error instanceof Response
        ? "ResponseError"
        : "UnknownError";
  const httpStatus = error instanceof Response ? error.status : undefined;
  const boundary =
    typeof context.boundary === "string"
      ? context.boundary.slice(0, 80)
      : undefined;

  console.error("[Aghbari] Runtime error", {
    errorName,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(boundary ? { boundary } : {}),
  });
}
