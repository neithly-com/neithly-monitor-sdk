/**
 * @vitest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import { type ReactElement } from 'react';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useNavigate,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Breadcrumb } from '@neithly-com/monitor-core';

import { wrapCreateBrowserRouter } from './wrap-router.js';
import type { BreadcrumbClient } from './use-track-router.js';

function makeFakeClient(): BreadcrumbClient & { crumbs: Breadcrumb[] } {
  const crumbs: Breadcrumb[] = [];
  return {
    crumbs,
    addBreadcrumb: (b) => crumbs.push(b),
  };
}

/**
 * Captures the navigate handle for the test. We render this inside the home
 * route element so the wrapper's injected tracker also sees the location
 * changes triggered by `act(() => navigate('/about'))`.
 */
function NavCapture({
  navRef,
}: {
  navRef: { current: ((to: string) => void) | null };
}): ReactElement {
  const navigate = useNavigate();
  navRef.current = (to: string): void => {
    void navigate(to);
  };
  return <Link to="/about">about</Link>;
}

describe('wrapCreateBrowserRouter', () => {
  it('emits one navigation breadcrumb per programmatic navigation across a 3-route app', () => {
    const client = makeFakeClient();
    const navRef = { current: null as ((to: string) => void) | null };

    const wrapped = wrapCreateBrowserRouter(createMemoryRouter, client);

    const router = wrapped(
      [
        { path: '/', element: <NavCapture navRef={navRef} /> },
        { path: '/about', element: <NavCapture navRef={navRef} /> },
        { path: '/contact', element: <NavCapture navRef={navRef} /> },
      ],
      { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    expect(client.crumbs).toEqual([]);

    act((): void => {
      navRef.current?.('/about');
    });
    act((): void => {
      navRef.current?.('/contact');
    });

    expect(client.crumbs).toHaveLength(2);
    expect(client.crumbs[0]).toMatchObject({
      category: 'navigation',
      data: { from: '/', to: '/about', search: '' },
    });
    expect(client.crumbs[1]).toMatchObject({
      category: 'navigation',
      data: { from: '/about', to: '/contact', search: '' },
    });
  });

  it('does not emit on the initial render', () => {
    const client = makeFakeClient();
    const navRef = { current: null as ((to: string) => void) | null };

    const wrapped = wrapCreateBrowserRouter(createMemoryRouter, client);
    const router = wrapped(
      [
        { path: '/', element: <NavCapture navRef={navRef} /> },
        { path: '/about', element: <div>about</div> },
        { path: '/contact', element: <div>contact</div> },
      ],
      { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    expect(client.crumbs).toEqual([]);
  });
});
