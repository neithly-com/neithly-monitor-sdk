# monitor-react

> React bindings for neithly-monitor — `<NeithlyErrorBoundary>`, `useNeithlyScope`, react-router v6 navigation breadcrumbs.
> **Status:** stable
> **Package:** `@neithly-com/monitor-react`
> **Source:** `packages/react/src/`
> **Updated:** 2026-06-08

Layers React ergonomics on top of `@neithly-com/monitor-browser`. The browser SDK still owns initialisation and transport; this package adds React-specific glue.

## Quick reference

| What | How |
|---|---|
| Render-phase error capture | `<NeithlyErrorBoundary fallback={...}>` |
| Per-component scope tags | `const { setTag, setExtra } = useNeithlyScope()` |
| Track react-router v6 navigations | `wrapCreateBrowserRouter(createBrowserRouter)` or `useTrackRouter()` |

## Install

```bash
pnpm add @neithly-com/monitor-react @neithly-com/monitor-browser
```

`react-router-dom` is an optional peer — install it only if you want the router breadcrumb integration.

## Public API

| Export | Purpose |
|---|---|
| `<NeithlyErrorBoundary fallback={...}>` | Class boundary; captures render-phase errors via `captureException` with `react.componentStack` attached. |
| `useNeithlyScope()` | Hook returning `{ setUser, setTag, setTags, setContext, setExtra, addBreadcrumb }` scoped to the component's lifetime. |
| `wrapCreateBrowserRouter(createBrowserRouter)` | Wraps the react-router v6 `createBrowserRouter` factory to push a `navigation` breadcrumb on every location change. |
| `useTrackRouter()` | Hook variant; mount once in the route shell. |

Full types: `packages/react/src/index.ts`.

## Quickstart

```tsx
import { init } from '@neithly-com/monitor-browser';
import { NeithlyErrorBoundary } from '@neithly-com/monitor-react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

init({ dsn: import.meta.env.VITE_NEITHLY_DSN, serviceName: 'apollo' });

createRoot(document.getElementById('root')!).render(
  <NeithlyErrorBoundary fallback={<p>Something went wrong.</p>}>
    <App />
  </NeithlyErrorBoundary>,
);
```

## Patterns

### ErrorBoundary with reset

```tsx
import { NeithlyErrorBoundary } from '@neithly-com/monitor-react';

function Fallback({ error, reset }: { error: Error; reset: () => void }) {
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

### react-router v6 navigation breadcrumbs

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { wrapCreateBrowserRouter } from '@neithly-com/monitor-react';

const router = wrapCreateBrowserRouter(createBrowserRouter)([
  { path: '/', element: <App /> },
]);

export function Root() {
  return <RouterProvider router={router} />;
}
```

### Per-component scope

```tsx
import { useNeithlyScope } from '@neithly-com/monitor-react';

export function CheckoutPage() {
  const { setTag } = useNeithlyScope();
  setTag('flow', 'checkout');
  return <Cart />;
}
```

## See also

- [reference/monitor-browser.md](monitor-browser.md) — underlying runtime
- [reference/monitor-core.md](monitor-core.md) — shared core
- [guides/consumer-integration.md](../guides/consumer-integration.md) — embed in a React app
- `examples/react-spa/` — full Vite + react-router example
