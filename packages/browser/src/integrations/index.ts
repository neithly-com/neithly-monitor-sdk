// Auto-instrumentation installers for the browser SDK.

export { installOnerror } from './onerror.js';
export type { CaptureFn as OnerrorCaptureFn, OnErrorUninstaller } from './onerror.js';

export { installUnhandledRejection } from './unhandledrejection.js';
export type {
  CaptureFn as UnhandledRejectionCaptureFn,
  UnhandledRejectionUninstaller,
} from './unhandledrejection.js';

export { installFetchInstrumentation } from './fetch.js';
export type { AddBreadcrumbFn as FetchAddBreadcrumbFn, FetchUninstaller } from './fetch.js';

export { installXhrInstrumentation } from './xhr.js';
export type { AddBreadcrumbFn as XhrAddBreadcrumbFn, XhrUninstaller } from './xhr.js';

export { installConsoleBreadcrumbs } from './console.js';
export type {
  AddBreadcrumbFn as ConsoleAddBreadcrumbFn,
  ConsoleUninstaller,
} from './console.js';
