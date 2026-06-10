/**
 * `useMonitor()` — hook returning the active `MonitorClient` for the
 * subtree. Throws if called outside `<MonitorProvider>` so a missing
 * provider is a loud, immediate failure at dev-time.
 *
 * The returned client surface is a stable subset of the browser SDK's
 * named exports (`captureException`, `captureMessage`, `setUser`,
 * `setTags`, `setContext`, `setExtra`, `addBreadcrumb`).
 */

import { useContext } from 'react';

import {
  MonitorContext,
  type MonitorClient,
} from './MonitorProvider.js';

const NO_PROVIDER_MESSAGE =
  'useMonitor() must be called inside <MonitorProvider>. ' +
  'Wrap your app at the root with `<MonitorProvider dsn={...}>`.';

export function useMonitor(): MonitorClient {
  const client = useContext(MonitorContext);
  if (client === null) {
    throw new Error(NO_PROVIDER_MESSAGE);
  }
  return client;
}
