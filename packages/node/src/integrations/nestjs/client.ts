/**
 * Runtime contract the NestJS binding relies on.
 *
 * The binding is decoupled from the concrete `init` / `captureException` /
 * `withScope` implementations that live in sibling features inside this same
 * package. Callers pass a {@link NeithlyClient} instance to
 * `NeithlyModule.forRoot`, which lets us keep the binding tree-shakeable,
 * unit-testable (a mock client is enough), and parallel-safe with the rest of
 * the package wiring.
 */

import type { Scope } from '@neithly-com/monitor-core';

/**
 * Configuration handed to {@link NeithlyClient.init}. Intentionally minimal —
 * the binding is agnostic of the actual init schema; the consumer of the
 * NestJS module supplies whatever options the underlying client understands.
 */
export interface NeithlyInitOptions {
  readonly dsn: string;
  readonly release?: string;
  readonly environment?: string;
  // Extension slot for future init knobs (sampling, integrations, etc.).
  readonly [key: string]: unknown;
}

/**
 * The minimum surface the NestJS binding needs from a Neithly client.
 *
 * In production this is satisfied by the top-level `init` / `captureException`
 * / `withScope` exports of `@neithly-com/monitor-node` (sibling features). In
 * tests, a hand-rolled object with spies is enough.
 */
export interface NeithlyClient {
  /**
   * Initialise the SDK. Called exactly once by the NestJS module on bootstrap.
   * Implementations must be idempotent enough to tolerate a second call (the
   * module will log and skip, but defensive impls help operators).
   */
  init(options: NeithlyInitOptions): void;

  /**
   * Capture an exception and return an event id (or any string identifier).
   * The filter rethrows after capture so Nest's default error handling still
   * shapes the HTTP response.
   */
  captureException(error: unknown): string;

  /**
   * Run `fn` with a freshly cloned, isolated scope. Tags applied inside `fn`
   * must not leak out. The binding uses this to attach request-scoped tags
   * (method, url, x-request-id, statusCode) around each HTTP exchange.
   */
  withScope<T>(fn: (scope: Scope) => T): T;
}
