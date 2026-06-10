/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MonitorContext,
  MonitorProvider,
  type MonitorClient,
  type MonitorUser,
} from './MonitorProvider.js';
import { _resetStateForTest, isInitialised } from '../api/state.js';
import { getResolvedConfig } from '../api/init.js';

const VALID_DSN = `nmk_live_${'a'.repeat(64)}`;

function makeStubClient(): MonitorClient & {
  setUser: ReturnType<typeof vi.fn>;
  captureException: ReturnType<typeof vi.fn>;
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

afterEach(() => {
  cleanup();
});

describe('MonitorProvider', () => {
  beforeEach(() => {
    _resetStateForTest();
  });

  it('calls init() on mount with the resolved options', () => {
    render(
      <MonitorProvider dsn={VALID_DSN} environment="qa" release="abc123">
        <div>child</div>
      </MonitorProvider>,
    );

    expect(isInitialised()).toBe(true);
    const config = getResolvedConfig();
    expect(config?.environment).toBe('qa');
    expect(config?.release).toBe('abc123');
  });

  it('does NOT call init() when a custom client is injected', () => {
    const client = makeStubClient();
    render(
      <MonitorProvider dsn={VALID_DSN} client={client}>
        <div>child</div>
      </MonitorProvider>,
    );
    expect(isInitialised()).toBe(false);
  });

  it('publishes the injected client on context', () => {
    const client = makeStubClient();
    let captured: MonitorClient | null = null;
    function Consumer(): ReactNode {
      captured = useContext(MonitorContext);
      return null;
    }
    render(
      <MonitorProvider dsn={VALID_DSN} client={client}>
        <Consumer />
      </MonitorProvider>,
    );
    expect(captured).toBe(client);
  });

  it('calls userResolver and applies setUser when the user changes', () => {
    const client = makeStubClient();
    let currentUser: MonitorUser | null = { id: 'u1' };
    const { rerender } = render(
      <MonitorProvider
        dsn={VALID_DSN}
        client={client}
        userResolver={() => currentUser}
      >
        <div>child</div>
      </MonitorProvider>,
    );
    expect(client.setUser).toHaveBeenCalledTimes(1);
    expect(client.setUser.mock.calls[0]?.[0]).toEqual({ id: 'u1' });

    // Same user — no new setUser call.
    rerender(
      <MonitorProvider
        dsn={VALID_DSN}
        client={client}
        userResolver={() => currentUser}
      >
        <div>child</div>
      </MonitorProvider>,
    );
    expect(client.setUser).toHaveBeenCalledTimes(1);

    // User changes — new setUser call.
    currentUser = { id: 'u2', email: 'a@b.c' };
    rerender(
      <MonitorProvider
        dsn={VALID_DSN}
        client={client}
        userResolver={() => currentUser}
      >
        <div>child</div>
      </MonitorProvider>,
    );
    expect(client.setUser).toHaveBeenCalledTimes(2);
    expect(client.setUser.mock.calls[1]?.[0]).toEqual({
      id: 'u2',
      email: 'a@b.c',
    });

    // User clears — setUser(null).
    currentUser = null;
    rerender(
      <MonitorProvider
        dsn={VALID_DSN}
        client={client}
        userResolver={() => currentUser}
      >
        <div>child</div>
      </MonitorProvider>,
    );
    expect(client.setUser).toHaveBeenCalledTimes(3);
    expect(client.setUser.mock.calls[2]?.[0]).toBeNull();
  });
});
