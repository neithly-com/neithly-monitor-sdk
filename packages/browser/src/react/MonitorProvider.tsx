/**
 * `<MonitorProvider>` — React context provider that wires the browser SDK
 * for an SPA host. Calls `init({ dsn, environment, release })` on mount
 * (idempotent — the SDK's own `init()` warns + no-ops on second call) and
 * publishes a thin client surface through React context for hooks.
 *
 * The provider intentionally stays minimal: it owns init, not transport
 * installers. Hosts that want `installOnerror` / `installPagehideFlush` etc.
 * call them next to the provider mount (or inside a `useEffect`); the
 * provider is the one-line "wire it up" hook.
 *
 * An optional `userResolver` is called on mount + every render to pull the
 * current authenticated user from the host's auth context. When the resolved
 * user changes (deep-equal via JSON snapshot), the provider re-applies
 * `setUser(user)` so events emitted while that user is active carry their
 * identity. Pass `null` from the resolver to clear.
 */

import {
  createContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import {
  addBreadcrumb,
  captureException,
  captureMessage,
  init,
  setContext,
  setExtra,
  setTags,
  setUser,
} from '../api/index.js';
import type {
  BrowserIntegration,
  CaptureMessageOptions,
} from '../api/index.js';

/**
 * Minimal `user` shape consumed by `setUser`. Mirrors `UserContext` from
 * `@neithly-com/monitor-core` without re-exporting the dependency type.
 */
export interface MonitorUser {
  id?: string;
  email?: string;
  username?: string;
  ip_address?: string;
  [key: string]: unknown;
}

/**
 * The React client surface published on the provider context. This is a
 * subset of the browser SDK's named exports — the hooks layer never reaches
 * into the singleton directly so tests can stub the whole surface.
 */
export interface MonitorClient {
  captureException(err: unknown): string;
  captureMessage(message: string, options?: CaptureMessageOptions): string;
  setUser(user: MonitorUser | null): void;
  setTags(tags: Record<string, string>): void;
  setContext(
    namespace: string,
    ctx: Record<string, unknown> | null,
  ): void;
  setExtra(key: string, value: unknown): void;
  addBreadcrumb(crumb: Parameters<typeof addBreadcrumb>[0]): void;
}

const defaultClient: MonitorClient = {
  captureException,
  captureMessage,
  setUser,
  setTags,
  setContext,
  setExtra,
  addBreadcrumb,
};

/**
 * Public context. `null` means "no provider above this consumer" — hooks
 * throw on `null` so a missing `<MonitorProvider>` is loud at dev-time.
 */
export const MonitorContext = createContext<MonitorClient | null>(null);

export interface MonitorProviderProps {
  /** DSN string (`nmk_<env>_<64hex>`). */
  dsn: string;
  /** Optional environment override (defaults to the DSN-derived env). */
  environment?: string;
  /** Optional release/version tag (commit SHA, semver, etc.). */
  release?: string;
  /** Optional tunnel origin — proxy ingest through your own backend. */
  tunnel?: string;
  /** Optional integrations to register at init time. */
  integrations?: ReadonlyArray<BrowserIntegration>;
  /**
   * Optional resolver pulled from the host auth context. Called on every
   * render; when the JSON snapshot of the returned user changes, the
   * provider re-applies `setUser`. Return `null` to clear.
   */
  userResolver?: () => MonitorUser | null;
  /**
   * Test seam: inject a custom client surface. When set, `init()` is NOT
   * called — the test owns lifecycle. Production callers leave this unset.
   */
  client?: MonitorClient;
  children: ReactNode;
}

function snapshotKey(user: MonitorUser | null): string {
  return user === null ? 'null' : JSON.stringify(user);
}

export function MonitorProvider(props: MonitorProviderProps): ReactNode {
  const {
    dsn,
    environment,
    release,
    tunnel,
    integrations,
    userResolver,
    client,
    children,
  } = props;

  // Init runs exactly once for the provider's lifetime. The SDK's `init()`
  // itself is idempotent, but we still guard with a ref so a re-render
  // (props change, StrictMode double-mount) doesn't try to re-init and
  // trip the "init() called more than once" console warning.
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (client !== undefined) {
      return;
    }
    if (initialisedRef.current) {
      return;
    }
    initialisedRef.current = true;
    const opts: Parameters<typeof init>[0] = { dsn };
    if (environment !== undefined) {
      opts.environment = environment;
    }
    if (release !== undefined) {
      opts.release = release;
    }
    if (tunnel !== undefined) {
      opts.tunnel = tunnel;
    }
    if (integrations !== undefined) {
      opts.integrations = integrations;
    }
    init(opts);
    // We intentionally do not list integrations in deps — re-applying it on
    // a hot-reload of the integrations array would re-trigger init and the
    // SDK warns + no-ops anyway.
  }, [client, dsn, environment, release, tunnel, integrations]);

  // Resolve the user on every render so prop changes (e.g. login) propagate.
  const resolvedUser: MonitorUser | null =
    userResolver !== undefined ? userResolver() : null;
  const userKey = userResolver !== undefined ? snapshotKey(resolvedUser) : '';
  const lastUserKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (userResolver === undefined) {
      return;
    }
    if (lastUserKeyRef.current === userKey) {
      return;
    }
    lastUserKeyRef.current = userKey;
    const c = client ?? defaultClient;
    c.setUser(resolvedUser);
  }, [client, userResolver, userKey, resolvedUser]);

  const value = useMemo<MonitorClient>(
    () => client ?? defaultClient,
    [client],
  );

  return (
    <MonitorContext.Provider value={value}>{children}</MonitorContext.Provider>
  );
}
