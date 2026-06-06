import { describe, expect, it, vi } from 'vitest';

import type { Breadcrumb } from '@neithly-com/monitor-core';

import { installHttpInstrumentation } from './http.js';

describe('installHttpInstrumentation', () => {
  it('wires without throwing and returns a callable uninstaller', () => {
    const addBreadcrumb = vi.fn<(b: Breadcrumb) => void>();
    const uninstall = installHttpInstrumentation(addBreadcrumb);

    expect(typeof uninstall).toBe('function');
    expect(() => {
      uninstall();
    }).not.toThrow();
  });

  it('returns a no-op uninstaller (no breadcrumbs pushed at install time)', () => {
    const addBreadcrumb = vi.fn<(b: Breadcrumb) => void>();
    const uninstall = installHttpInstrumentation(addBreadcrumb);

    expect(addBreadcrumb).not.toHaveBeenCalled();
    uninstall();
  });
});
