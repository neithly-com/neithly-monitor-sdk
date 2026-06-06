# @neithly-com/monitor-react

React bindings for neithly-monitor. Ships `<NeithlyErrorBoundary>`, a
`useNeithlyScope` hook, and react-router v6 navigation breadcrumb
instrumentation.

## What

`monitor-react` layers React ergonomics on top of
`@neithly-com/monitor-browser`. The browser SDK still owns
initialisation and transport; this package just adds the React-specific
glue: a class-based error boundary that captures render-phase errors
with the component stack, a hook for setting per-component scope tags
or extras, and an integration that pushes a `navigation` breadcrumb on
every react-router v6 location change.

## Install

```bash
pnpm add @neithly-com/monitor-react @neithly-com/monitor-browser
```

`react-router-dom` is an optional peer — install it only if you want
the router breadcrumb integration.

## Quickstart

```tsx
import { init } from '@neithly-com/monitor-browser';
import { NeithlyErrorBoundary } from '@neithly-com/monitor-react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

init({ dsn: import.meta.env.VITE_NEITHLY_DSN });

createRoot(document.getElementById('root')!).render(
  <NeithlyErrorBoundary fallback={<p>Something went wrong.</p>}>
    <App />
  </NeithlyErrorBoundary>,
);
```

## API

| Export | Purpose |
| --- | --- |
| `<NeithlyErrorBoundary>` | Class boundary; captures render errors via `captureException` with `react.componentStack` attached. |
| `useNeithlyScope()` | Hook returning helpers to set tags / extras / contexts scoped to the component's lifetime. |
| `withNeithlyRouter(router)` | react-router v6 wrapper that pushes a `navigation` breadcrumb on every location change. |

Full types: `packages/react/src/index.ts`.

## Examples

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
  return (
    <NeithlyErrorBoundary fallback={Fallback}>{children}</NeithlyErrorBoundary>
  );
}
```

### react-router v6 navigation breadcrumbs

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { withNeithlyRouter } from '@neithly-com/monitor-react';

const router = withNeithlyRouter(
  createBrowserRouter([{ path: '/', element: <App /> }]),
);

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
