/**
 * Public surface of `@neithly-com/monitor-browser/react`.
 *
 * Three minimal building blocks for SPA hosts:
 *  - `<MonitorProvider>` — call `init()` on mount + publish a `MonitorClient`
 *    on context. Optional `userResolver` keeps the scope user in sync with
 *    your auth context.
 *  - `<MonitorErrorBoundary>` — catch render-phase errors and ship them
 *    through the active client (provider context or the SDK's named
 *    exports).
 *  - `useMonitor()` — pull the client out of context; throws if no
 *    provider is mounted.
 *  - `useSetUserEffect(user)` — opt-in hook for hosts that prefer to wire
 *    `setUser` themselves from an auth context.
 *
 * The standalone `@neithly-com/monitor-react` package layers extra
 * primitives on top (react-router breadcrumbs, finer-grained scope hooks).
 * This subpath is the "batteries included" option for hosts that already
 * depend on `@neithly-com/monitor-browser` and don't want a second package.
 */

export const REACT_SUBPATH_VERSION = '0.2.0';

export { MonitorContext, MonitorProvider } from './MonitorProvider.js';
export type {
  MonitorClient,
  MonitorProviderProps,
  MonitorUser,
} from './MonitorProvider.js';

export { MonitorErrorBoundary } from './MonitorErrorBoundary.js';
export type {
  MonitorErrorBoundaryFallback,
  MonitorErrorBoundaryProps,
  MonitorErrorInfo,
} from './MonitorErrorBoundary.js';

export { useMonitor } from './useMonitor.js';

export { useSetUserEffect } from './setUserEffect.js';
