/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMonitor } from './useMonitor.js';
import { useSetUserEffect } from './setUserEffect.js';
import { MonitorProvider, type MonitorClient } from './MonitorProvider.js';

function makeStubClient(): MonitorClient & {
  setUser: ReturnType<typeof vi.fn>;
  captureMessage: ReturnType<typeof vi.fn>;
} {
  return {
    captureException: vi.fn(() => 'evt-id'),
    captureMessage: vi.fn(() => 'evt-id'),
    setUser: vi.fn(),
    setTags: vi.fn(),
    setContext: vi.fn(),
    setExtra: vi.fn(),
    addBreadcrumb: vi.fn(),
  };
}

function silenceConsoleError(): () => void {
  const original = console.error;
  console.error = vi.fn();
  return () => {
    console.error = original;
  };
}

afterEach(() => {
  cleanup();
});

const VALID_DSN = `nmk_live_${'a'.repeat(64)}`;

describe('useMonitor', () => {
  it('returns the active client from context', () => {
    const client = makeStubClient();
    function Consumer(): ReactNode {
      const m = useMonitor();
      m.captureMessage('hello');
      return <div data-testid="ok">ok</div>;
    }
    render(
      <MonitorProvider dsn={VALID_DSN} client={client}>
        <Consumer />
      </MonitorProvider>,
    );
    expect(screen.getByTestId('ok').textContent).toBe('ok');
    expect(client.captureMessage).toHaveBeenCalledTimes(1);
    expect(client.captureMessage.mock.calls[0]?.[0]).toBe('hello');
  });

  it('throws when called outside <MonitorProvider>', () => {
    const restore = silenceConsoleError();
    try {
      function Consumer(): ReactNode {
        useMonitor();
        return null;
      }
      expect(() => render(<Consumer />)).toThrow(/must be called inside/);
    } finally {
      restore();
    }
  });
});

describe('useSetUserEffect', () => {
  it('applies setUser on mount and clears on unmount', () => {
    const client = makeStubClient();
    function Consumer({ uid }: { uid: string }): ReactNode {
      useSetUserEffect({ id: uid });
      return null;
    }
    const { rerender, unmount } = render(
      <MonitorProvider dsn={VALID_DSN} client={client}>
        <Consumer uid="u1" />
      </MonitorProvider>,
    );
    // First effect: setUser({id:'u1'}).
    expect(client.setUser).toHaveBeenCalledTimes(1);
    expect(client.setUser.mock.calls[0]?.[0]).toEqual({ id: 'u1' });

    // Rerender with same id — JSON snapshot unchanged, no new effect run.
    rerender(
      <MonitorProvider dsn={VALID_DSN} client={client}>
        <Consumer uid="u1" />
      </MonitorProvider>,
    );
    expect(client.setUser).toHaveBeenCalledTimes(1);

    // Rerender with new id — cleanup runs (setUser(null)) THEN the new
    // effect runs (setUser({id:'u2'})). That's 2 additional calls.
    rerender(
      <MonitorProvider dsn={VALID_DSN} client={client}>
        <Consumer uid="u2" />
      </MonitorProvider>,
    );
    expect(client.setUser).toHaveBeenCalledTimes(3);
    expect(client.setUser.mock.calls[1]?.[0]).toBeNull();
    expect(client.setUser.mock.calls[2]?.[0]).toEqual({ id: 'u2' });

    // Unmount → final setUser(null) from cleanup.
    unmount();
    expect(client.setUser).toHaveBeenCalledTimes(4);
    expect(client.setUser.mock.calls[3]?.[0]).toBeNull();
  });
});
