/**
 * `wrapCreateBrowserRouter` — instrument react-router v6/v7's data-router API
 * with navigation breadcrumbs. The wrapper preserves the original signature
 * `(routes, opts?) => Router` and injects a `<RouterTracker />` element at the
 * top of every route's `element` (recursively into `children`). The tracker
 * is the component that actually calls `useTrackRouter`, which means hooks
 * fire inside the router context as react-router requires.
 *
 * If a route uses `Component` instead of `element` we leave it alone — that
 * code-path is rarer and rewriting it would force us to render the host
 * component ourselves. Host apps that need it can render `<RouterTracker />`
 * themselves at the root of their layout.
 */

import { createElement, type ReactElement, type ReactNode } from 'react';

import { useTrackRouter, type BreadcrumbClient } from './use-track-router.js';

/**
 * Minimal shape of a react-router v6/v7 route object that we touch. We
 * intentionally keep it structural (no import from `react-router-dom`) so
 * the wrapper does not pull the optional peer into type-check graphs that
 * have not added it.
 */
export interface MinimalRoute {
  element?: ReactNode | null;
  children?: MinimalRoute[];
}

/**
 * Signature of `createBrowserRouter` (and `createMemoryRouter`,
 * `createHashRouter`) from react-router. We keep it generic so the wrapper
 * does not lock callers to a specific router flavour.
 */
export type CreateRouterFn<TRouter, TRoute = MinimalRoute, TOpts = unknown> = (
  routes: TRoute[],
  opts?: TOpts,
) => TRouter;

/**
 * Props passed to `RouterTracker`. The `client` slot is exact-optional: omit
 * it entirely rather than passing `undefined` to satisfy
 * `exactOptionalPropertyTypes`.
 */
interface RouterTrackerProps {
  client?: BreadcrumbClient;
}

/**
 * The tracker component. Rendered once per route, it calls `useTrackRouter`
 * with the captured `client` and renders nothing. Exported so host code can
 * drop it anywhere inside a router context without going through the wrapper.
 */
export function RouterTracker({
  client,
}: RouterTrackerProps): ReactElement | null {
  useTrackRouter(client);
  return null;
}

/**
 * Build the props object for `RouterTracker` without ever assigning
 * `undefined` to the `client` slot. `exactOptionalPropertyTypes: true` makes
 * `{ client: undefined }` invalid against `{ client?: BreadcrumbClient }`,
 * so we branch.
 */
function trackerProps(
  client: BreadcrumbClient | undefined,
): RouterTrackerProps {
  return client === undefined ? {} : { client };
}

/**
 * Recursively decorate every route's `element` by prepending a
 * `<RouterTracker />`. The original element is preserved; the tracker simply
 * mounts alongside it as the first child of a wrapping `<div>`.
 *
 * We intentionally type the input as `MinimalRoute[]` (the smallest shape we
 * actually touch) so callers can hand us route arrays of any concrete
 * `RouteObject` variant — react-router v6, v7, framework-mode, etc. The
 * result is the same array shape after mutation through a structural clone.
 */
function decorateRoutes(
  routes: readonly MinimalRoute[],
  client: BreadcrumbClient | undefined,
): MinimalRoute[] {
  return routes.map((route) => {
    const next: MinimalRoute = { ...route };
    if (next.element !== undefined && next.element !== null) {
      next.element = createElement(
        'div',
        // A plain wrapping <div> means callers do not have to opt into
        // <Fragment> support in their renderer (jsdom, RSC, etc).
        { 'data-neithly-router-tracker': true },
        createElement(RouterTracker, trackerProps(client)),
        next.element,
      );
    }
    if (Array.isArray(next.children) && next.children.length > 0) {
      next.children = decorateRoutes(next.children, client);
    }
    return next;
  });
}

/**
 * Wrap a react-router `createBrowserRouter`-shaped factory so that every
 * route element renders a `<RouterTracker />` alongside the user element.
 * The returned factory has the same signature as the input.
 *
 * @param createRouter The original factory (`createBrowserRouter`,
 *   `createMemoryRouter`, `createHashRouter`, …).
 * @param client Optional breadcrumb client to forward to every tracker. When
 *   omitted the tracker is a silent no-op — host code is expected to pass
 *   the singleton from `@neithly-com/monitor-browser`.
 */
export function wrapCreateBrowserRouter<TRouter, TRoute, TOpts>(
  createRouter: CreateRouterFn<TRouter, TRoute, TOpts>,
  client?: BreadcrumbClient,
): CreateRouterFn<TRouter, TRoute, TOpts> {
  return function wrappedCreateRouter(
    routes: TRoute[],
    opts?: TOpts,
  ): TRouter {
    // The cast bridges the host's specific `RouteObject` type to our minimal
    // structural shape. The bridge is safe because `decorateRoutes` only
    // reads/writes `element` and `children` and otherwise structurally
    // clones each entry through the spread; every other field passes through
    // unchanged.
    const decorated = decorateRoutes(
      routes as readonly MinimalRoute[],
      client,
    ) as unknown as TRoute[];
    return createRouter(decorated, opts);
  };
}
