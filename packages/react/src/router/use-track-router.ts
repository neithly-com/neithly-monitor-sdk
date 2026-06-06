/**
 * `useTrackRouter` — emits a `navigation` breadcrumb on every react-router
 * location change. The initial mount does not emit; only transitions count.
 *
 * The hook accepts an optional `client` object that exposes an
 * `addBreadcrumb(breadcrumb)` method (the Neithly singleton from
 * `@neithly-com/monitor-browser` satisfies this shape). When no client is
 * passed the hook is a silent no-op — host code is expected to pass the
 * singleton (or a thin wrapper) explicitly. Keeping the seam pure also
 * removes any hard runtime dependency on `@neithly-com/monitor-browser` from
 * the hook itself, which matters for SSR.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import type { Breadcrumb } from '@neithly-com/monitor-core';

/**
 * Subset of the Neithly client surface this hook depends on. Kept narrow so
 * tests can pass an inline fake without re-creating the full singleton.
 */
export interface BreadcrumbClient {
  addBreadcrumb: (breadcrumb: Breadcrumb) => void;
}

/**
 * Data payload carried by every `navigation` breadcrumb emitted by this hook.
 */
export interface NavigationBreadcrumbData {
  from: string;
  to: string;
  search: string;
}

/**
 * Subscribe to `useLocation` and emit a `navigation` breadcrumb every time the
 * location changes. The very first render is treated as the baseline and does
 * not emit a breadcrumb. Returns nothing — the side effect lives in the
 * `useEffect` body.
 *
 * @param client Optional explicit breadcrumb client. When omitted the hook is
 *   a silent no-op. Pass the `Neithly` singleton (or `{ addBreadcrumb }` from
 *   `@neithly-com/monitor-browser`) to wire it up to the real SDK.
 */
export function useTrackRouter(client?: BreadcrumbClient): void {
  const location = useLocation();
  const previousRef = useRef<{ pathname: string; search: string } | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    const current = { pathname: location.pathname, search: location.search };

    if (previous === null) {
      // First render — establish the baseline without emitting.
      previousRef.current = current;
      return;
    }

    if (
      previous.pathname === current.pathname &&
      previous.search === current.search
    ) {
      // No-op: effect re-ran with identical url (e.g. client identity flip).
      return;
    }

    if (client !== undefined) {
      client.addBreadcrumb({
        category: 'navigation',
        data: {
          from: previous.pathname,
          to: current.pathname,
          search: current.search,
        },
      });
    }

    previousRef.current = current;
  }, [client, location.pathname, location.search]);
}
