/**
 * Minimal Express + `@neithly-com/monitor-node` integration example.
 *
 * Boots an Express app that:
 *   - Calls `Neithly.init({ dsn })` with the DSN from `NEITHLY_DSN` and an
 *     optional `RELEASE` tag from the environment.
 *   - Wires `expressRequestHandler()` first so every request runs under its
 *     own scope (forked from the active scope, bound via AsyncLocalStorage).
 *   - Exposes a `POST /api/order` route that deterministically throws — so
 *     `curl -X POST` produces a captured exception out of the box.
 *   - Wires `expressErrorHandler()` last so unhandled errors are shipped to
 *     the configured DSN before Express renders its default 500 page.
 *
 * The script intentionally fails fast with a helpful message when
 * `NEITHLY_DSN` is missing, so `pnpm dev` without a `.env` prints actionable
 * guidance instead of a cryptic parse error.
 */

import {
  Neithly,
  expressErrorHandler,
  expressRequestHandler,
} from '@neithly-com/monitor-node';
import express, { type NextFunction, type Request, type Response } from 'express';

const DSN = process.env['NEITHLY_DSN'];
const RELEASE = process.env['RELEASE'];
const PORT = Number.parseInt(process.env['PORT'] ?? '3000', 10);

if (DSN === undefined || DSN === '') {
  // Fail fast with a helpful message so the verify step can boot the server
  // without a DSN and still get a clean exit + actionable error.

  console.error(
    [
      'missing DSN: set NEITHLY_DSN to a neithly-monitor DSN to run this example.',
      '',
      'Example:',
      '  cp .env.example .env',
      '  # then edit .env to set NEITHLY_DSN=https://<publicKey>@<host>/<projectId>',
      '  pnpm dev',
    ].join('\n'),
  );
  process.exit(1);
}

Neithly.init({
  dsn: DSN,
  ...(RELEASE !== undefined && RELEASE !== '' ? { release: RELEASE } : {}),
  environment: process.env['NODE_ENV'] ?? 'development',
});

const app = express();

// Request handler MUST be registered before any route so every request runs
// inside its own scope (forked + bound via AsyncLocalStorage).
app.use(expressRequestHandler());
app.use(express.json());

app.get('/health', (_req: Request, res: Response): void => {
  res.json({ status: 'ok' });
});

/**
 * Deterministic failure: every POST throws so the example demonstrates the
 * error-capture path. Pair with `curl -X POST http://localhost:3000/api/order`.
 */
app.post('/api/order', (_req: Request, _res: Response, _next: NextFunction): void => {
  throw new Error('order failed: deterministic example error');
});

// Error handler MUST be registered last so it sees unhandled errors from
// routes registered above.
app.use(expressErrorHandler());

const server = app.listen(PORT, (): void => {

  console.log(
    `[express-example-node] listening on http://localhost:${String(PORT)} ` +
      `(release=${RELEASE ?? 'unset'}). Try: curl -X POST http://localhost:${String(PORT)}/api/order`,
  );
});

/**
 * Flush the SDK on SIGINT/SIGTERM so in-flight log records reach the
 * collector before the process exits.
 */
async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {

  console.log(`[express-example-node] received ${signal}, shutting down...`);
  server.close();
  await Neithly.shutdown();
  process.exit(0);
}

process.on('SIGINT', (signal) => {
  void gracefulShutdown(signal);
});
process.on('SIGTERM', (signal) => {
  void gracefulShutdown(signal);
});
