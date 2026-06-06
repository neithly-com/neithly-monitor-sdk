/**
 * Resolved monitor ingest endpoint URLs derived from a base origin.
 */
export interface MonitorEndpoints {
  logs: string;
  metrics: string;
  traces: string;
}

/**
 * Resolve the monitor ingest endpoints (logs/metrics/traces) from a base
 * origin URL.
 *
 * - The input is validated via `new URL(origin)`. Invalid URLs throw a
 *   `TypeError` (re-thrown from the `URL` constructor).
 * - Inputs containing a query string (`?...`) or a fragment (`#...`) are
 *   rejected with a `TypeError`.
 * - Trailing slashes on the path are stripped before composing endpoints.
 * - Scheme, host, port and any path prefix on the origin are preserved.
 *
 * @param origin - The base origin URL (e.g. `https://ingest.neithly.com`
 *                 or `http://localhost:4318/monitor`).
 * @returns The three endpoint URLs as strings.
 */
export function resolveEndpoints(origin: string): MonitorEndpoints {
  // `new URL` throws TypeError on invalid input — let it propagate.
  const url = new URL(origin);

  if (url.search !== '' || url.hash !== '') {
    throw new TypeError(
      `resolveEndpoints: origin must not contain a query string or hash, got ${origin}`,
    );
  }

  // Compose origin + path without using URL.toString() (which can add a
  // trailing slash for bare-origin inputs). This preserves the exact path
  // prefix the caller provided, minus trailing slashes.
  const pathname = url.pathname.replace(/\/+$/, '');
  const base = `${url.origin}${pathname}`;

  return {
    logs: `${base}/v1/logs`,
    metrics: `${base}/v1/metrics`,
    traces: `${base}/v1/traces`,
  };
}
