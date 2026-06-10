# monitor-browser `/react` subpath

> Minimal React adapter shipped under `@neithly-com/monitor-browser/react` — `<MonitorProvider>`, `<MonitorErrorBoundary>`, `useMonitor()`, `useSetUserEffect()`. Lives on the browser SDK so SPA hosts don't need a second package dependency for the basics.
> **Status:** stable
> **Package:** `@neithly-com/monitor-browser` (subpath `./react`)
> **Source:** `packages/browser/src/react/`
> **Updated:** 2026-06-10

The `/react` subpath layers thin React ergonomics on top of the browser SDK's named exports (`init`, `captureException`, `setUser`, ...). It owns `init()` lifecycle, publishes a `MonitorClient` on context, and adds a class-component error boundary plus a hook for pulling the client out of context.

For richer React bindings (react-router navigation breadcrumbs, more granular scope hooks), use the standalone [`@neithly-com/monitor-react`](monitor-react.md) package. The two are designed to coexist — the standalone package can be layered on top of this subpath when needed.

## Quick reference

| What | How |
|---|---|
| Wire `init()` and publish client on context | `<MonitorProvider dsn={…}>` |
| Render-phase error capture | `<MonitorErrorBoundary fallback={…}>` |
| Pull the active client inside a component | `const monitor = useMonitor()` |
| Sync the scope user with an auth context | `useSetUserEffect(user)` *or* `<MonitorProvider userResolver={…}>` |

## Install

`react` and `react-dom` are optional peer dependencies (`^18 || ^19`). The subpath is only resolved when consumed; hosts that don't import from `/react` pay no React cost.

```bash
pnpm add @neithly-com/monitor-browser react react-dom
```

| Peer | Required | Notes |
|---|---|---|
| `react` | only if you import from `/react` | `^18 || ^19` |
| `react-dom` | only if you import from `/react` | `^18 || ^19` |

## Public API surface

Re-exported from `packages/browser/src/react/index.ts`.

### `<MonitorProvider>`

React context provider that calls `init()` on mount and publishes a `MonitorClient` on context for hooks to consume.

**Source:** `packages/browser/src/react/MonitorProvider.tsx`

**Signature:**

```tsx
export function MonitorProvider(props: MonitorProviderProps): ReactNode;

export interface MonitorProviderProps {
  dsn: string;
  environment?: string;
  release?: string;
  tunnel?: string;
  integrations?: ReadonlyArray<BrowserIntegration>;
  /**
   * Optional resolver pulled from your auth context. Called on every render;
   * when the JSON snapshot of the returned user changes, `setUser` is
   * re-applied. Return `null` to clear.
   */
  userResolver?: () => MonitorUser | null;
  /** Test seam: inject a custom client. Skips init() when set. */
  client?: MonitorClient;
  children: ReactNode;
}

export interface MonitorUser {
  id?: string;
  email?: string;
  username?: string;
  ip_address?: string;
  [key: string]: unknown;
}

export interface MonitorClient {
  captureException(err: unknown): string;
  captureMessage(message: string, options?: CaptureMessageOptions): string;
  setUser(user: MonitorUser | null): void;
  setTags(tags: Record<string, string>): void;
  setContext(namespace: string, ctx: Record<string, unknown> | null): void;
  setExtra(key: string, value: unknown): void;
  addBreadcrumb(crumb: Breadcrumb): void;
}
```

**Behaviour:**

| Step | Detail |
|---|---|
| Mount | `init({ dsn, environment?, release?, tunnel?, integrations? })`. Guarded by a ref so a hot-reload-driven re-render doesn't trip the SDK's "init() called more than once" console warning. |
| `userResolver` set | Called on every render. JSON snapshot used as effect dep — same user object → no `setUser` call. Different user object → `setUser(snap)`. `null` → `setUser(null)`. |
| `client` prop set | `init()` is **not** called — the test owns lifecycle. Production callers leave it unset. |
| Unmount | The provider does NOT call `shutdown()` — the SDK is a singleton and may be re-used across provider re-mounts. Call `shutdown()` yourself if needed (e.g. in a worker test harness). |

**Example:**

```tsx
import { MonitorProvider } from '@neithly-com/monitor-browser/react';
import { useAuth } from './auth';

function AuthAwareProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <MonitorProvider
      dsn={import.meta.env.VITE_NEITHLY_DSN}
      release={import.meta.env.VITE_GIT_SHA}
      userResolver={() => (user ? { id: user.id, email: user.email } : null)}
    >
      {children}
    </MonitorProvider>
  );
}
```

### `<MonitorErrorBoundary>`

Class component that catches render-phase errors in its subtree, tags the scope with `react.componentStack`, and ships the error through the active `MonitorClient`.

**Source:** `packages/browser/src/react/MonitorErrorBoundary.tsx`

**Signature:**

```tsx
export class MonitorErrorBoundary extends Component<
  MonitorErrorBoundaryProps,
  { error: Error | null }
> {
  reset(): void;
}

export interface MonitorErrorBoundaryProps {
  children: ReactNode;
  fallback: MonitorErrorBoundaryFallback;
  onError?: (error: Error, info: MonitorErrorInfo) => void;
  /** Override the active context client. Otherwise reads MonitorContext. */
  client?: MonitorClient;
}

export type MonitorErrorBoundaryFallback =
  | ReactNode
  | ((error: Error, reset: () => void) => ReactNode);

export interface MonitorErrorInfo {
  componentStack: string;
}
```

**Client resolution order:**

1. `props.client` if set.
2. The `MonitorContext` value if a `<MonitorProvider>` is above the boundary.
3. The browser SDK's named exports (`captureException`, `setTags`) as a last-resort fallback so the boundary still works without a provider.

**Behaviour:**

| Step | Action |
|---|---|
| `componentDidCatch(error, info)` | `client.setTags({ 'react.componentStack': info.componentStack })`, then `client.captureException(error)`, then `props.onError?.(error, info)`. Both client calls wrapped in `try/catch` — a client failure cannot mask the original error. |
| `render` (no error) | Renders `children`. |
| `render` (with error) | Renders `fallback` — function form gets `(error, reset)`, node form renders as-is. |
| `reset()` | Clears `state.error`, allowing the boundary to re-render `children`. Wired as the second arg of the function-form fallback. |

**Example:**

```tsx
import { MonitorErrorBoundary } from '@neithly-com/monitor-browser/react';

function Fallback(error: Error, reset: () => void) {
  return (
    <div role="alert">
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <MonitorErrorBoundary fallback={Fallback}>{children}</MonitorErrorBoundary>;
}
```

### `useMonitor()`

Hook returning the active `MonitorClient` for the subtree. Throws if no `<MonitorProvider>` is mounted above the consumer.

**Source:** `packages/browser/src/react/useMonitor.ts`

**Signature:**

```ts
export function useMonitor(): MonitorClient;
```

**Throws:** `Error('useMonitor() must be called inside <MonitorProvider>. …')` when called outside a provider. This is intentional — a silent fallback to the singleton would hide bootstrapping bugs.

**Example:**

```tsx
import { useMonitor } from '@neithly-com/monitor-browser/react';

export function Checkout({ cart }: { cart: Cart }) {
  const monitor = useMonitor();
  const onPay = async () => {
    try {
      await pay(cart);
    } catch (err) {
      monitor.captureException(err);
      throw err;
    }
  };
  return <button onClick={onPay}>Pay</button>;
}
```

### `useSetUserEffect(user)`

Apply `setUser(user)` on mount and whenever `user` changes (deep-compared via JSON snapshot). Clears (`setUser(null)`) on unmount.

**Source:** `packages/browser/src/react/setUserEffect.ts`

**Signature:**

```ts
export function useSetUserEffect(user: MonitorUser | null | undefined): void;
```

| Slot | On mount | On change | On unmount |
|---|---|---|---|
| `user` (object) | `setUser(defensiveCopy)` | `setUser(null)` then `setUser(newCopy)` | `setUser(null)` |
| `user === null` | `setUser(null)` | — | `setUser(null)` |
| `user === undefined` | No-op | No-op | No-op |

The defensive copy ensures caller mutations after the hook call do not affect the value restored on unmount.

If you'd rather not own this wiring, pass `userResolver` to `<MonitorProvider>` — same end state, less manual.

**Example:**

```tsx
import { useSetUserEffect } from '@neithly-com/monitor-browser/react';
import { useAuth } from './auth';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  useSetUserEffect(user ? { id: user.id, email: user.email } : null);
  return <>{children}</>;
}
```

### `MonitorContext`

The raw React context (`createContext<MonitorClient | null>(null)`). Exposed for advanced wiring — e.g. consuming the client from a class component via `static contextType` or from a non-`useMonitor()` hook.

```ts
import { MonitorContext } from '@neithly-com/monitor-browser/react';
```

## See also

- [reference/monitor-browser.md](monitor-browser.md) — the underlying browser SDK (DSN, transport, integrations)
- [reference/monitor-react.md](monitor-react.md) — standalone React package with react-router breadcrumbs + `useNeithlyScope`
- [reference/monitor-core.md](monitor-core.md) — shared shaping helpers
