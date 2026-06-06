import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Breadcrumb } from '@neithly-com/monitor-core';

import { installConsoleBreadcrumbs } from './console.js';

let originalLog: typeof console.log;
let originalInfo: typeof console.info;
let originalWarn: typeof console.warn;
let originalError: typeof console.error;

beforeEach(() => {
  originalLog = console.log;
  originalInfo = console.info;
  originalWarn = console.warn;
  originalError = console.error;
});

afterEach(() => {
  console.log = originalLog;
  console.info = originalInfo;
  console.warn = originalWarn;
  console.error = originalError;
});

describe('installConsoleBreadcrumbs', () => {
  it('pushes a breadcrumb with level "warning" for console.warn', () => {
    const calls: Breadcrumb[] = [];
    const addBreadcrumb = (b: Breadcrumb): void => {
      calls.push(b);
    };
    // Silence the real warn output during the test.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const uninstall = installConsoleBreadcrumbs(addBreadcrumb);
    console.warn('hello', 'world');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      category: 'console',
      level: 'warning',
      message: 'hello world',
    });

    uninstall();
    warnSpy.mockRestore();
  });

  it('maps log/info/warn/error to the right breadcrumb levels', () => {
    const calls: Breadcrumb[] = [];
    const addBreadcrumb = (b: Breadcrumb): void => {
      calls.push(b);
    };

    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];

    const uninstall = installConsoleBreadcrumbs(addBreadcrumb);
    console.log('l');
    console.info('i');
    console.warn('w');
    console.error('e');

    expect(calls.map((c) => c.level)).toEqual(['info', 'info', 'warning', 'error']);

    uninstall();
    for (const spy of spies) {
      spy.mockRestore();
    }
  });

  it('still calls the original console method', () => {
    const addBreadcrumb = vi.fn<(b: Breadcrumb) => void>();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const uninstall = installConsoleBreadcrumbs(addBreadcrumb);
    console.log('keep-original');

    expect(logSpy).toHaveBeenCalledWith('keep-original');

    uninstall();
    logSpy.mockRestore();
  });

  it('uninstaller restores the original method references', () => {
    const before = console.warn;
    const uninstall = installConsoleBreadcrumbs(() => {});
    expect(console.warn).not.toBe(before);
    uninstall();
    expect(console.warn).toBe(before);
  });
});
