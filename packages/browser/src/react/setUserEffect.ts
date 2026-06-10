/**
 * `useSetUserEffect(user)` — apply the given user to the active Monitor
 * scope on mount and whenever the user object changes (deep-compared via
 * JSON snapshot). On unmount, clears the user (`setUser(null)`).
 *
 * Designed for SPA host code that pulls the current user from an auth
 * context. Typical wiring:
 *
 *   function AppShell() {
 *     const { user } = useAuth();
 *     useSetUserEffect(user);
 *     return <Outlet />;
 *   }
 *
 * If you'd rather not own the wiring, pass `userResolver` to
 * `<MonitorProvider>` instead — same end state, less manual.
 */

import { useEffect } from 'react';

import { useMonitor } from './useMonitor.js';
import type { MonitorUser } from './MonitorProvider.js';

export function useSetUserEffect(user: MonitorUser | null | undefined): void {
  const client = useMonitor();
  // JSON snapshot doubles as the effect dep and as a deep-equal guard so
  // callers passing a fresh `{ id }` literal each render don't get a flood
  // of redundant `setUser` calls.
  const key =
    user === undefined ? '__undefined' : user === null ? 'null' : JSON.stringify(user);

  useEffect(() => {
    if (user === undefined) {
      return;
    }
    // Defensive copy — if the caller mutates the original after the call,
    // the value we restored on unmount must not change with it.
    const snap: MonitorUser | null = user === null ? null : { ...user };
    client.setUser(snap);
    return () => {
      client.setUser(null);
    };
    // Note: `key` captures the deep-equal identity of `user`; tracking the
    // raw `user` ref would re-apply on every render. The
    // react-hooks/exhaustive-deps rule is not enabled in this repo, so no
    // disable comment is required.
  }, [client, key]);
}
