/**
 * Dependency-injection tokens used by the NestJS binding.
 *
 * Kept in their own module so the filter and the interceptor can `@Inject`
 * them without pulling in the heavier `module.ts` (which references
 * `APP_FILTER` / `APP_INTERCEPTOR` from `@nestjs/core` at import time).
 */

export const NEITHLY_CLIENT: unique symbol = Symbol.for('@neithly-com/monitor-node:client');
export type NEITHLY_CLIENT = typeof NEITHLY_CLIENT;

/**
 * Symbol-keyed property the interceptor stamps onto the active request so the
 * exception filter can grab the matching scope. Using a symbol avoids
 * polluting the request shape and prevents accidental serialisation.
 */
export const NEITHLY_REQUEST_SCOPE_KEY: unique symbol = Symbol.for(
  '@neithly-com/monitor-node:request-scope',
);
export type NEITHLY_REQUEST_SCOPE_KEY = typeof NEITHLY_REQUEST_SCOPE_KEY;
