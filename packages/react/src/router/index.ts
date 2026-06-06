/**
 * Public surface of the react-router instrumentation feature.
 *
 * Two entrypoints depending on how host code wires up react-router:
 *  - `useTrackRouter()` — hook called inside any component rendered by the
 *    router. Emits a `navigation` breadcrumb on every location change after
 *    the initial mount.
 *  - `wrapCreateBrowserRouter()` — factory wrapper for the data-router API
 *    (`createBrowserRouter`, `createMemoryRouter`, …) that injects a
 *    `<RouterTracker />` into every route element so host code does not have
 *    to thread the hook through its own layouts.
 */

export { useTrackRouter } from './use-track-router.js';
export type {
  BreadcrumbClient,
  NavigationBreadcrumbData,
} from './use-track-router.js';

export { RouterTracker, wrapCreateBrowserRouter } from './wrap-router.js';
export type { CreateRouterFn } from './wrap-router.js';
