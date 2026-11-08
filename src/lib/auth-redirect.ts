const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * Preserve only supported, single-use in-app invitation tokens through email
 * confirmation. Never preserve arbitrary query parameters or accept an external
 * redirect destination from browser input.
 */
export function getAuthEmailRedirectUrl(origin: string, pathname: string, search: string): string {
  const safeOrigin = new URL(origin).origin;

  if (pathname === "/company/accept-invitation") {
    const token = new URLSearchParams(search).get("token") ?? "";
    if (TOKEN_PATTERN.test(token)) {
      return `${safeOrigin}/company/accept-invitation?token=${token.toLowerCase()}`;
    }
  }

  const customerActivation = pathname.match(/^\/customer\/activate\/([0-9a-f]{64})$/i);
  if (customerActivation) {
    return `${safeOrigin}/customer/activate/${customerActivation[1].toLowerCase()}`;
  }

  return `${safeOrigin}/login`;
}
