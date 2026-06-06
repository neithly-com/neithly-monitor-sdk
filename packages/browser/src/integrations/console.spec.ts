/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Breadcrumb } from '@neithly-com/monitor-core';

import { installConsoleBreadcrumbs } from './console.js';

describe('installConsoleBreadcrumbs', () => {
  let crumbs: Breadcrumb[];
  const realLog = console.log;
  const realInfo = console.info;
  const realWarn = console.warn;
  const realError = console.error;

  beforeEach(() => {
    crumbs = [];
    // Swap the originals for spies so the patch wraps a stub (no terminal noise).
    console.log = vi.fn();
    console.info = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.log = realLog;
    console.info = realInfo;
    console.warn = realWarn;
    console.error = realError;
  });

  it('records a console breadcrumb for each patched method with the right level', () => {
    const uninstall = installConsoleBreadcrumbs((c) => crumbs.push(c));

    console.log('hello', 'world');
    console.info('info-msg');
    console.warn('warn-msg');
    console.error('err-msg');

    expect(crumbs).toHaveLength(4);
    expect(crumbs[0]).toMatchObject({
      category: 'console',
      level: 'debug',
      message: 'hello world',
    });
    expect(crumbs[1]).toMatchObject({ category: 'console', level: 'info', message: 'info-msg' });
    expect(crumbs[2]).toMatchObject({ category: 'console', level: 'warning', message: 'warn-msg' });
    expect(crumbs[3]).toMatchObject({ category: 'console', level: 'error', message: 'err-msg' });

    uninstall();
  });

  it('still invokes the original console method', () => {
    const stub = vi.fn();
    console.log = stub;

    const uninstall = installConsoleBreadcrumbs((c) => crumbs.push(c));
    console.log('passthrough');

    expect(stub).toHaveBeenCalledWith('passthrough');
    expect(crumbs).toHaveLength(1);
    uninstall();
  });

  it('serialises non-string arguments without throwing', () => {
    const uninstall = installConsoleBreadcrumbs((c) => crumbs.push(c));

    console.log({ a: 1 }, 42, new Error('e'));

    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]?.message).toContain('{"a":1}');
    expect(crumbs[0]?.message).toContain('42');
    expect(crumbs[0]?.message).toContain('e');
    uninstall();
  });

  it('handles cyclic objects without throwing', () => {
    const uninstall = installConsoleBreadcrumbs((c) => crumbs.push(c));

    interface Cyclic {
      self?: Cyclic;
    }
    const cyclic: Cyclic = {};
    cyclic.self = cyclic;

    expect(() => console.log(cyclic)).not.toThrow();
    expect(crumbs).toHaveLength(1);
    uninstall();
  });

  it('uninstaller restores the original methods', () => {
    const beforeLog = console.log;
    const beforeError = console.error;

    const uninstall = installConsoleBreadcrumbs(() => undefined);
    expect(console.log).not.toBe(beforeLog);

    uninstall();
    expect(console.log).toBe(beforeLog);
    expect(console.error).toBe(beforeError);
  });

  it('does not throw when the breadcrumb sink throws', () => {
    const uninstall = installConsoleBreadcrumbs(() => {
      throw new Error('sink-failure');
    });

    expect(() => console.log('x')).not.toThrow();
    uninstall();
  });
});
