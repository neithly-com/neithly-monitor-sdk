/**
 * Patch `console.log/info/warn/error` to record a `console` breadcrumb that
 * captures the level and a stringified preview of the arguments. The original
 * console method is always invoked so dev-tools output is unchanged.
 */

import type { Breadcrumb, BreadcrumbLevel } from '@neithly-com/monitor-core';

export type AddBreadcrumbFn = (breadcrumb: Breadcrumb) => void;

export type ConsoleUninstaller = () => void;

type PatchedMethod = 'log' | 'info' | 'warn' | 'error';

const METHODS: readonly PatchedMethod[] = ['log', 'info', 'warn', 'error'];

const LEVEL_BY_METHOD: Readonly<Record<PatchedMethod, BreadcrumbLevel>> = {
  log: 'debug',
  info: 'info',
  warn: 'warning',
  error: 'error',
};

/**
 * Render an argument for the breadcrumb preview without throwing on cyclic or
 * exotic objects. We intentionally cap the per-arg size so a single chatty
 * `console.log(hugeBlob)` cannot blow the breadcrumb byte budget on its own —
 * the byte cap in `serialiseBreadcrumbs` is the second line of defence.
 */
function previewArg(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.message;
  }
  try {
    const s = JSON.stringify(arg);
    return s ?? String(arg);
  } catch {
    return String(arg);
  }
}

export function installConsoleBreadcrumbs(
  addBreadcrumb: AddBreadcrumbFn,
): ConsoleUninstaller {
  if (typeof console === 'undefined') {
    return (): void => {
      /* no-op */
    };
  }

  const originals: Partial<Record<PatchedMethod, (...args: unknown[]) => void>> = {};

  for (const method of METHODS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console method signatures vary; we treat them uniformly.
    const original = console[method] as any;
    if (typeof original !== 'function') {
      continue;
    }
    // Keep the original reference verbatim so the uninstaller restores
    // identity (`===`), not a bound clone.
    originals[method] = original;

    const patched = (...args: unknown[]): void => {
      try {
        addBreadcrumb({
          category: 'console',
          level: LEVEL_BY_METHOD[method],
          message: args.map(previewArg).join(' '),
        });
      } catch {
        // Breadcrumb sink must not break the host log call.
      }
      try {
        original.apply(console, args);
      } catch {
        // Some hosts wrap console; never let a downstream throw cascade.
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- assigning to console at the boundary.
    (console as any)[method] = patched;
  }

  return (): void => {
    for (const method of METHODS) {
      const original = originals[method];
      if (original !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restoring console at the boundary.
        (console as any)[method] = original;
      }
    }
  };
}
