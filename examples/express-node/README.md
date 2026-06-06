# express-example-node

Minimal Express app demonstrating the [`@neithly-com/monitor-node`](../../packages/node) integration end-to-end.

It wires:

- `Neithly.init({ dsn, release, environment })` from `NEITHLY_DSN` / `RELEASE` env vars.
- `expressRequestHandler()` as the first middleware — opens a per-request scope (forked from the active scope, bound via AsyncLocalStorage) and tags it with `method` / `url` / `requestId`.
- A deterministic `POST /api/order` route that throws.
- `expressErrorHandler()` as the last middleware — captures the thrown exception, then forwards to Express's default error renderer.

## Run

From the workspace root:

```bash
pnpm install
cp examples/express-node/.env.example examples/express-node/.env
# edit examples/express-node/.env and set NEITHLY_DSN=https://<publicKey>@<host>/<projectId>

pnpm --filter express-example-node dev
```

You should see:

```
[express-example-node] listening on http://localhost:3000 (release=...). Try: curl -X POST http://localhost:3000/api/order
```

## Trigger an error

```bash
curl -X POST http://localhost:3000/api/order
```

The server logs `Error: order failed: deterministic example error`, responds with Express's default 500 page, and ships the captured exception to the configured DSN.

## Health check

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Without a DSN

If `NEITHLY_DSN` is unset, the example exits immediately with a helpful message rather than booting a half-configured server:

```
missing DSN: set NEITHLY_DSN to a neithly-monitor DSN to run this example.
...
```
