/**
 * Browser CORS policy for the student UI.
 *
 * - localhost / 127.0.0.1 on any port are always allowed (local frontend).
 * - Extra origins come only from CORS_ORIGINS (deployed SPAs).
 * - Requests with no Origin header (curl, server-to-server) are allowed.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      LOCAL_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) {
    return true;
  }

  if (isLocalDevOrigin(origin)) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

/** Nest / cors `origin` callback. Reflects the request origin when allowed. */
export function corsOriginDelegate(
  allowedOrigins: string[],
): (
  requestOrigin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void {
  return (requestOrigin, callback) => {
    callback(null, isAllowedCorsOrigin(requestOrigin, allowedOrigins));
  };
}
