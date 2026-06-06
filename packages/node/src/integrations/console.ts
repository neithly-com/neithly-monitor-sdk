/**
 * Console breadcrumb integration.
 *
 * Monkey-patches `console.log`, `console.info`, `console.warn`, and
 * `console.error` to forward each call as a breadcrumb of category
 * `'console'`. The original implementation is still called so application
 * logging behaviour is preserved.
 *
 * The returned uninstaller restores the original method references.
 */

import type { Breadcrumb, BreadcrumbLevel } from '@neithly-com/monitor-core';

export type AddBreadcrumbFn = (breadcrumb: Breadcrumb) => void;

export type Uninstaller = () => void;

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error';

const METHOD_LEVELS: ReadonlyArray<readonly [ConsoleMethod, BreadcrumbLevel]> = [
  ['log', 'info'],
  ['info', 'info'],
  ['warn', 'warning'],
  ['error', 'error'],
];

function formatArg(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserialisable]';
  }
}

function joinArgs(args: readonly unknown[]): string {
  return args.map(formatArg).join(' ');
}

/**
 * Install console → breadcrumb forwarding. The provided `addBreadcrumb` is
 * invoked synchronously for each patched call. Errors thrown by it are
 * swallowed so they cannot break the host application's logging pipeline.
 */
export function installConsoleBreadcrumbs(addBreadcrumb: AddBreadcrumbFn): Uninstaller {
  const originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();

  for (const [method, level] of METHOD_LEVELS) {
    // Keep the exact original reference so the uninstaller can restore
    // strict identity (no `.bind` wrapper).
    const original = console[method] as (...args: unknown[]) => void;
    originals.set(method, original);

    const patched = (...args: unknown[]): void => {
      try {
        addBreadcrumb({
          category: 'console',
          level,
          message: joinArgs(args),
        });
      } catch {
        // Never let breadcrumb capture break console output.
      }
      original.apply(console, args);
    };

    console[method] = patched as Console[ConsoleMethod];
  }

  return (): void => {
    for (const [method] of METHOD_LEVELS) {
      const original = originals.get(method);
      if (original !== undefined) {
        console[method] = original as Console[ConsoleMethod];
      }
    }
  };
}
