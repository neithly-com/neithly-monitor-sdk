/**
 * @vitest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import { type ReactElement } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Breadcrumb } from '@neithly-com/monitor-core';

import { useTrackRouter, type BreadcrumbClient } from './use-track-router.js';

/**
 * Test seam — a minimal client that captures every breadcrumb it sees. Used
 * in place of the real `Neithly` singleton so the spec asserts the exact
 * payload shape the hook produces.
 */
function makeFakeClient(): BreadcrumbClient & { crumbs: Breadcrumb[] } {
  const crumbs: Breadcrumb[] = [];
  return {
    crumbs,
    addBreadcrumb: (b) => crumbs.push(b),
  };
}

/**
 * Top-level harness component. Always renders the tracker so every route
 * change funnels through the hook, and exposes a `navigate` callback to the
 * test via a ref so the spec can drive transitions imperatively.
 */
function Harness({
  client,
  navRef,
}: {
  client: BreadcrumbClient;
  navRef: { current: ((to: string) => void) | null };
}): ReactElement {
  useTrackRouter(client);
  const navigate = useNavigate();
  navRef.current = (to: string): void => {
    void navigate(to);
  };
  return (
    <Routes>
      <Route path="/" element={<div>home</div>} />
      <Route path="/about" element={<div>about</div>} />
      <Route path="/contact" element={<div>contact</div>} />
    </Routes>
  );
}

describe('useTrackRouter', () => {
  it('does not emit a breadcrumb on initial mount', () => {
    const client = makeFakeClient();
    const navRef = { current: null as ((to: string) => void) | null };

    render(
      <MemoryRouter initialEntries={['/']}>
        <Harness client={client} navRef={navRef} />
      </MemoryRouter>,
    );

    expect(client.crumbs).toEqual([]);
  });

  it('emits one navigation breadcrumb per location change', () => {
    const client = makeFakeClient();
    const navRef = { current: null as ((to: string) => void) | null };

    render(
      <MemoryRouter initialEntries={['/']}>
        <Harness client={client} navRef={navRef} />
      </MemoryRouter>,
    );

    expect(navRef.current).not.toBeNull();

    act((): void => {
      navRef.current?.('/about?ref=test');
    });
    act((): void => {
      navRef.current?.('/contact');
    });

    expect(client.crumbs).toHaveLength(2);
    expect(client.crumbs[0]).toEqual({
      category: 'navigation',
      data: { from: '/', to: '/about', search: '?ref=test' },
    });
    expect(client.crumbs[1]).toEqual({
      category: 'navigation',
      data: { from: '/about', to: '/contact', search: '' },
    });
  });

  it('is a silent no-op when no client is passed', () => {
    const navRef = { current: null as ((to: string) => void) | null };

    function NoClientHarness(): ReactElement {
      useTrackRouter();
      const navigate = useNavigate();
      navRef.current = (to: string): void => {
        void navigate(to);
      };
      return <div>ok</div>;
    }

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      /* swallow react warnings, none expected */
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <NoClientHarness />
      </MemoryRouter>,
    );

    act((): void => {
      navRef.current?.('/somewhere');
    });

    // No throw, no console error. The presence of zero is the assertion.
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
