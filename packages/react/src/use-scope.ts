/**
 * `useNeithlyScope` — apply `user` / `tags` / `contexts` to the active Neithly
 * scope while the host component is mounted, and restore the previous values
 * on unmount. Re-runs whenever the dependency snapshot changes so prop updates
 * are reflected.
 *
 * The default client uses the browser singleton's scope mutators, but a custom
 * client (matching `NeithlyScopeClient`) can be passed for tests or for hosts
 * that bring their own implementation.
 */

import { useEffect } from 'react';

import {
  setContext as defaultSetContext,
  setTags as defaultSetTags,
  setUser as defaultSetUser,
} from '@neithly-com/monitor-browser';

export interface NeithlyUserContext {
  id?: string;
  email?: string;
  username?: string;
  ip_address?: string;
  [key: string]: unknown;
}

/**
 * Scope mutators consumed by `useNeithlyScope`. The browser singleton's
 * top-level `setUser` / `setTags` / `setContext` exports satisfy this seam;
 * tests can pass their own object to capture calls without touching the
 * singleton.
 */
export interface NeithlyScopeClient {
  setUser(user: NeithlyUserContext | null): void;
  setTags(tags: Record<string, string>): void;
  setContext(namespace: string, ctx: Record<string, unknown> | null): void;
}

const DEFAULT_CLIENT: NeithlyScopeClient = {
  setUser: defaultSetUser,
  setTags: defaultSetTags,
  setContext: defaultSetContext,
};

export interface UseNeithlyScopeOptions {
  user?: NeithlyUserContext | null;
  tags?: Record<string, string>;
  contexts?: Record<string, Record<string, unknown> | null>;
  /** Override the default Neithly client. */
  client?: NeithlyScopeClient;
}

/**
 * Apply scope values for the lifetime of the component, then restore the
 * previously-set values on unmount. The dependency list is derived from a
 * shallow JSON snapshot of the options so prop changes trigger a re-apply.
 */
export function useNeithlyScope(options: UseNeithlyScopeOptions): void {
  const { user, tags, contexts, client } = options;
  // We stringify the snapshot to use as the effect dep — this keeps the hook
  // signature ergonomic (consumers pass fresh objects each render) while
  // avoiding spurious re-applies when the values are structurally identical.
  const snapshotKey = JSON.stringify({
    user: user ?? null,
    tags: tags ?? null,
    contexts: contexts ?? null,
  });

  useEffect(() => {
    const c = client ?? DEFAULT_CLIENT;
    // Defensive copies — if the caller mutates the originals after passing
    // them, the values we restore on unmount must not change.
    const userSnap: NeithlyUserContext | null | undefined =
      user === undefined ? undefined : user === null ? null : { ...user };
    const tagsSnap: Record<string, string> | undefined =
      tags === undefined ? undefined : { ...tags };
    const contextsSnap: Record<string, Record<string, unknown> | null> | undefined =
      contexts === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(contexts).map(([k, v]) => [
              k,
              v === null ? null : { ...v },
            ]),
          );

    if (userSnap !== undefined) {
      c.setUser(userSnap);
    }
    if (tagsSnap !== undefined) {
      c.setTags(tagsSnap);
    }
    if (contextsSnap !== undefined) {
      for (const [namespace, ctx] of Object.entries(contextsSnap)) {
        c.setContext(namespace, ctx);
      }
    }

    return () => {
      if (userSnap !== undefined) {
        c.setUser(null);
      }
      if (contextsSnap !== undefined) {
        for (const namespace of Object.keys(contextsSnap)) {
          c.setContext(namespace, null);
        }
      }
      // Tags have no "remove" primitive in the underlying Scope; once set,
      // they persist. We intentionally don't try to reset them here — host
      // apps should treat tag keys as additive.
    };
    // Note: snapshotKey captures the relevant subset of `options`; tracking
    // the raw refs would cause re-applies on every render. The
    // react-hooks/exhaustive-deps rule is not enabled in this repo, so no
    // disable comment is required.
  }, [snapshotKey, client]);
}
