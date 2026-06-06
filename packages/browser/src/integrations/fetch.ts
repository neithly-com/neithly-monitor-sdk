/**
 * Patch `window.fetch` with a wrapper that records an `http` breadcrumb for
 * every request: method, url, status (or `0` on network error), and elapsed
 * duration in ms.
 *
 * The original `fetch`'s promise (resolved or rejected) is returned untouched
 * so callers see no behavioural difference.
 */

import type { Breadcrumb } from '@neithly-com/monitor-core';

export type AddBreadcrumbFn = (breadcrumb: Breadcrumb) => void;

export type FetchUninstaller = () => void;

interface FetchBreadcrumbData extends Record<string, unknown> {
  method: string;
  url: string;
  status_code: number;
  duration_ms: number;
}

/**
 * Resolve the request method and URL from the polymorphic `fetch(input, init)`
 * signature without throwing on exotic inputs.
 */
function describeRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): { method: string; url: string } {
  let url: string;
  let method: string | undefined;

  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else {
    // Request-like — has .url and .method.
    url = input.url;
    method = input.method;
  }

  if (init?.method !== undefined) {
    method = init.method;
  }

  return { method: (method ?? 'GET').toUpperCase(), url };
}

export function installFetchInstrumentation(
  addBreadcrumb: AddBreadcrumbFn,
): FetchUninstaller {
  const original = window.fetch;
  if (typeof original !== 'function') {
    // No fetch to patch — return a no-op uninstaller for symmetry.
    return (): void => {
      /* no-op */
    };
  }

  const patched: typeof window.fetch = async (input, init) => {
    const start = Date.now();
    const { method, url } = describeRequest(input, init);

    try {
      const response = await original.call(window, input, init);
      const data: FetchBreadcrumbData = {
        method,
        url,
        status_code: response.status,
        duration_ms: Date.now() - start,
      };
      try {
        addBreadcrumb({
          category: 'http',
          level: response.ok ? 'info' : 'warning',
          data,
        });
      } catch {
        // Breadcrumb sink must not break the host request.
      }
      return response;
    } catch (err) {
      const data: FetchBreadcrumbData = {
        method,
        url,
        status_code: 0,
        duration_ms: Date.now() - start,
      };
      try {
        addBreadcrumb({
          category: 'http',
          level: 'error',
          data,
        });
      } catch {
        // Breadcrumb sink must not break the host request.
      }
      throw err;
    }
  };

  window.fetch = patched;

  return (): void => {
    if (window.fetch === patched) {
      window.fetch = original;
    }
  };
}
