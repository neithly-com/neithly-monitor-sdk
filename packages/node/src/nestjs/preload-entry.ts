/**
 * Side-effect-only entry point — calling this file's *import* (no symbols to
 * read) auto-runs {@link preloadMonitor} against `process.env`.
 *
 * Wired in `package.json` exports under `./nestjs/preload`, so consumers do:
 *
 * ```ts
 * // main.ts — must be the very first import
 * import '@neithly-com/monitor-node/nestjs/preload';
 * ```
 *
 * For programmatic control (e.g. when you want to pass a `serviceName` or a
 * non-default env bag), import {@link preloadMonitor} from
 * `@neithly-com/monitor-node/nestjs` and call it explicitly instead.
 */

import { preloadMonitor } from './preload.js';

preloadMonitor();
