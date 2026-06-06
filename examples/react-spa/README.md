# react-spa example

Minimal Vite + react-router SPA wired to:

- `@neithly-com/monitor-browser` — `Neithly.init()` boots the browser SDK.
- `@neithly-com/monitor-react` — `<NeithlyErrorBoundary>` catches render
  errors and `useTrackRouter` adds navigation breadcrumbs.

## Run it

From the monorepo root:

```sh
pnpm install
pnpm --filter react-spa-example dev
```

Then open the printed URL (default `http://localhost:5180`) and:

1. Navigate between `/`, `/about`, `/crash` — each click pushes a
   `navigation` breadcrumb onto the active scope.
2. On `/crash`, click **Crash the app**. The component throws during
   render, the error bubbles up to `<NeithlyErrorBoundary>`, and the
   fallback UI is shown. The error is forwarded to `captureException`
   and queued for the next OTLP flush.

## Configuration

`src/main.tsx` uses a placeholder DSN. Replace it with a real DSN from
your neithly-monitor project before pointing at a live ingest endpoint.
