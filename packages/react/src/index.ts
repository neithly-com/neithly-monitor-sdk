/**
 * Public surface of `@neithly-com/monitor-react`.
 *
 * Three building blocks that snap onto the `@neithly-com/monitor-browser`
 * singleton:
 *  - `<NeithlyErrorBoundary>` — catch render-phase errors and report them.
 *  - `useNeithlyScope()` — bind `user` / `tags` / `contexts` to the active
 *    scope while a component is mounted.
 *  - `useTrackRouter()` / `wrapCreateBrowserRouter()` — emit `navigation`
 *    breadcrumbs from react-router-dom.
 */

export const SDK_NAME = '@neithly-com/monitor-react';

export { NeithlyErrorBoundary } from './error-boundary.js';
export type {
  NeithlyClient,
  NeithlyErrorBoundaryFallback,
  NeithlyErrorBoundaryProps,
  NeithlyErrorInfo,
} from './error-boundary.js';

export { useNeithlyScope } from './use-scope.js';
export type {
  NeithlyScopeClient,
  NeithlyUserContext,
  UseNeithlyScopeOptions,
} from './use-scope.js';

export {
  RouterTracker,
  useTrackRouter,
  wrapCreateBrowserRouter,
} from './router/index.js';
export type {
  BreadcrumbClient,
  CreateRouterFn,
  NavigationBreadcrumbData,
} from './router/index.js';
