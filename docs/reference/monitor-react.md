# monitor-react

> React bindings for neithly-monitor — `<NeithlyErrorBoundary>`, `useNeithlyScope`, plus react-router v6/v7 navigation breadcrumbs via `useTrackRouter` / `RouterTracker` / `wrapCreateBrowserRouter`.
> **Status:** stable
> **Package:** `@neithly-com/monitor-react`
> **Source:** `packages/react/src/`
> **Updated:** 2026-06-09

Layers React ergonomics on top of `@neithly-com/monitor-browser`. The browser SDK still owns initialisation and transport; this package adds the React-specific glue.

## Quick reference

| What | How |
|---|---|
| Render-phase error capture | `<NeithlyErrorBoundary fallback={…}>` |
| Per-component scope (user / tags / contexts) | `useNeithlyScope({ user, tags, contexts })` |
| Track react-router navigations (hook) | `useTrackRouter(client)` |
| Track react-router navigations (component) | `<RouterTracker client={…} />` |
| Wrap the data-router factory | `wrapCreateBrowserRouter(createBrowserRouter, client?)` |

## Install

```bash
pnpm add @neithly-com/monitor-react @neithly-com/monitor-browser
```

| Peer | Required | Notes |
|---|---|---|
| `react` | yes (>=17) | Standard React peer |
| `react-dom` | yes (^19.2.7) | Standard React peer |
| `react-router-dom` | optional (>=6) | Only required for `useTrackRouter` / `RouterTracker` / `wrapCreateBrowserRouter` |

## Public API surface

Re-exported from `packages/react/src/index.ts`.

### `SDK_NAME`

**Source:** `packages/react/src/index.ts`

```ts
export const SDK_NAME = '@neithly-com/monitor-react';
```

### `<NeithlyErrorBoundary>`

Class component that catches render-phase errors in its subtree, tags the scope with `react.componentStack`, forwards the error to a Neithly client (defaulting to the `@neithly-com/monitor-browser` `Neithly` singleton), and renders a fallback.

**Source:** `packages/react/src/error-boundary.tsx`

**Signature:**

```tsx
export class NeithlyErrorBoundary extends Component<
  NeithlyErrorBoundaryProps,
  { error: Error | null }
> {
  reset(): void;
}

export interface NeithlyErrorBoundaryProps {
  children: ReactNode;
  fallback: NeithlyErrorBoundaryFallback;
  onError?: (error: Error, info: NeithlyErrorInfo) => void;
  /** Override the default Neithly client (`@neithly-com/monitor-browser`). */
  client?: NeithlyClient;
}

export type NeithlyErrorBoundaryFallback =
  | ReactNode
  | ((error: Error, reset: () => void) => ReactNode);

export interface NeithlyErrorInfo {
  componentStack: string;
}

export interface NeithlyClient {
  captureException(err: Error, ctx?: unknown): string;
  setTags(tags: Record<string, string>): void;
}
```

**Behaviour:**

| Step | Action |
|---|---|
| `componentDidCatch(error, info)` | 1. `client.setTags({ 'react.componentStack': info.componentStack })` 2. `client.captureException(error, { componentStack: info.componentStack })` 3. `props.onError?.(error, info)` |
| `render` | When `state.error` is set, renders `fallback` (function form gets `(error, reset)`, node form is rendered as-is). Otherwise renders `children`. |
| `reset()` | Clears `state.error`, allowing the boundary to re-render `children`. Wired up in the function-form fallback's second argument. |

Both `setTags` and `captureException` calls are wrapped in `try/catch` so a client failure cannot mask the original error.

**Example:**

```tsx
import { NeithlyErrorBoundary } from '@neithly-com/monitor-react';

function Fallback(error: Error, reset: () => void) {
  return (
    <div role="alert">
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <NeithlyErrorBoundary fallback={Fallback}>{children}</NeithlyErrorBoundary>;
}
```

### `useNeithlyScope(options)`

Apply `user` / `tags` / `contexts` to the active Neithly scope while the host component is mounted, restoring the previous values on unmount. Re-applies whenever a JSON snapshot of the options changes.

**Source:** `packages/react/src/use-scope.ts`

**Signature:**

```ts
export function useNeithlyScope(options: UseNeithlyScopeOptions): void;

export interface UseNeithlyScopeOptions {
  user?: NeithlyUserContext | null;
  tags?: Record<string, string>;
  contexts?: Record<string, Record<string, unknown> | null>;
  /** Override the default Neithly client (the browser singleton's scope mutators). */
  client?: NeithlyScopeClient;
}

export interface NeithlyUserContext {
  id?: string;
  email?: string;
  username?: string;
  ip_address?: string;
  [key: string]: unknown;
}

export interface NeithlyScopeClient {
  setUser(user: NeithlyUserContext | null): void;
  setTags(tags: Record<string, string>): void;
  setContext(namespace: string, ctx: Record<string, unknown> | null): void;
}
```

**Behaviour matrix:**

| Slot | On mount | On unmount |
|---|---|---|
| `user` | `setUser(defensiveCopy)` | `setUser(null)` |
| `tags` | `setTags(defensiveCopy)` | No-op — tags are additive; the underlying `Scope` has no "remove" primitive |
| `contexts` | For each namespace: `setContext(namespace, defensiveCopy)` | For each namespace: `setContext(namespace, null)` |

Defensive copies are taken before the apply so caller mutations after the call do not affect the restore.

**Example:**

```tsx
import { useNeithlyScope } from '@neithly-com/monitor-react';

export function CheckoutPage({ userId }: { userId: string }) {
  useNeithlyScope({
    user: { id: userId },
    tags: { flow: 'checkout' },
    contexts: { cart: { items: 3 } },
  });
  return <Cart />;
}
```

### `useTrackRouter(client?)`

Hook that subscribes to react-router's `useLocation` and emits a `navigation` breadcrumb on every transition. The initial render is the baseline and does not emit. Silent no-op when `client` is `undefined`.

**Source:** `packages/react/src/router/use-track-router.ts`

**Signature:**

```ts
export function useTrackRouter(client?: BreadcrumbClient): void;

export interface BreadcrumbClient {
  addBreadcrumb: (breadcrumb: Breadcrumb) => void;
}

export interface NavigationBreadcrumbData {
  from: string;
  to: string;
  search: string;
}
```

Breadcrumb shape:

```ts
{
  category: 'navigation',
  data: { from, to, search },
}
```

**Example:**

```tsx
import { useTrackRouter } from '@neithly-com/monitor-react';
import { Neithly } from '@neithly-com/monitor-browser';

export function RootLayout() {
  useTrackRouter(Neithly);
  return <Outlet />;
}
```

### `RouterTracker`

Render-only component that calls `useTrackRouter(client)` and returns `null`. Used by `wrapCreateBrowserRouter` but also exported so you can drop it anywhere inside a router context (e.g. at the root of a hand-written layout).

**Source:** `packages/react/src/router/wrap-router.ts`

**Signature:**

```tsx
export function RouterTracker(props: { client?: BreadcrumbClient }): ReactElement | null;
```

### `wrapCreateBrowserRouter(createRouter, client?)`

Wrap a react-router data-router factory (`createBrowserRouter`, `createMemoryRouter`, `createHashRouter`) so every route's `element` is rendered alongside a `<RouterTracker />` — meaning navigation breadcrumbs fire without you having to thread `useTrackRouter` through your layouts.

**Source:** `packages/react/src/router/wrap-router.ts`

**Signature:**

```ts
export function wrapCreateBrowserRouter<TRouter, TRoute, TOpts>(
  createRouter: CreateRouterFn<TRouter, TRoute, TOpts>,
  client?: BreadcrumbClient,
): CreateRouterFn<TRouter, TRoute, TOpts>;

export type CreateRouterFn<TRouter, TRoute = MinimalRoute, TOpts = unknown> = (
  routes: TRoute[],
  opts?: TOpts,
) => TRouter;
```

| Behaviour | Detail |
|---|---|
| Element wrapping | Each route's `element` is replaced with `<div data-neithly-router-tracker><RouterTracker client={client} />{originalElement}</div>` |
| Recursive | Descends into `children` arrays |
| `Component` form | Routes using `Component` instead of `element` are left untouched — render `<RouterTracker />` yourself in that subtree |
| Type-bridge | `MinimalRoute` is the structural shape touched (`{ element?, children? }`); cast through your specific `RouteObject` is safe |

**Example:**

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { wrapCreateBrowserRouter } from '@neithly-com/monitor-react';
import { Neithly } from '@neithly-com/monitor-browser';

const router = wrapCreateBrowserRouter(createBrowserRouter, Neithly)([
  { path: '/', element: <App /> },
  { path: '/checkout', element: <Checkout /> },
]);

export function Root() {
  return <RouterProvider router={router} />;
}
```

## Quickstart (full app)

```tsx
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Neithly } from '@neithly-com/monitor-browser';
import { NeithlyErrorBoundary, wrapCreateBrowserRouter } from '@neithly-com/monitor-react';

Neithly.init({ dsn: import.meta.env.VITE_NEITHLY_DSN });

const router = wrapCreateBrowserRouter(createBrowserRouter, Neithly)([
  { path: '/', element: <App /> },
]);

createRoot(document.getElementById('root')!).render(
  <NeithlyErrorBoundary fallback={(err, reset) => (
    <div role="alert">
      <p>{err.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}>
    <RouterProvider router={router} />
  </NeithlyErrorBoundary>,
);
```

## See also

- [reference/monitor-browser.md](monitor-browser.md) — underlying runtime (the `Neithly` singleton)
- [reference/monitor-core.md](monitor-core.md) — shared shaping helpers
- [guides/consumer-integration.md](../guides/consumer-integration.md) — embed in a React app
- `examples/react-spa/` — full Vite + react-router example
