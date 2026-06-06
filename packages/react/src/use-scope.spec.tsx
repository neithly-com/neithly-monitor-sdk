/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useNeithlyScope,
  type NeithlyScopeClient,
  type UseNeithlyScopeOptions,
} from './use-scope.js';

function makeClient(): NeithlyScopeClient & {
  setUser: ReturnType<typeof vi.fn>;
  setTags: ReturnType<typeof vi.fn>;
  setContext: ReturnType<typeof vi.fn>;
} {
  return {
    setUser: vi.fn(),
    setTags: vi.fn(),
    setContext: vi.fn(),
  };
}

function Host(props: UseNeithlyScopeOptions): ReactNode {
  useNeithlyScope(props);
  return <div data-testid="host">ok</div>;
}

afterEach(() => {
  cleanup();
});

describe('useNeithlyScope', () => {
  it('calls setTags on mount when tags prop is present', () => {
    const client = makeClient();
    render(<Host client={client} tags={{ feature: 'checkout' }} />);

    expect(client.setTags).toHaveBeenCalledTimes(1);
    const call = client.setTags.mock.calls[0];
    expect(call).toBeDefined();
    if (call === undefined) {
      return;
    }
    const [tags] = call as [Record<string, string>];
    expect(tags).toEqual({ feature: 'checkout' });
  });

  it('applies user and contexts on mount, restores on unmount', () => {
    const client = makeClient();
    const { unmount } = render(
      <Host
        client={client}
        user={{ id: 'u1', email: 'a@b.com' }}
        contexts={{ runtime: { name: 'react' } }}
      />,
    );

    expect(client.setUser).toHaveBeenCalledTimes(1);
    const mountUserCall = client.setUser.mock.calls[0];
    expect(mountUserCall).toBeDefined();
    if (mountUserCall === undefined) {
      return;
    }
    expect(mountUserCall[0]).toEqual({ id: 'u1', email: 'a@b.com' });

    expect(client.setContext).toHaveBeenCalledTimes(1);
    const mountCtxCall = client.setContext.mock.calls[0];
    expect(mountCtxCall).toBeDefined();
    if (mountCtxCall === undefined) {
      return;
    }
    expect(mountCtxCall[0]).toBe('runtime');
    expect(mountCtxCall[1]).toEqual({ name: 'react' });

    // Unmount triggers cleanup: setUser(null) + setContext('runtime', null).
    unmount();

    expect(client.setUser).toHaveBeenCalledTimes(2);
    expect(client.setUser.mock.calls[1]?.[0]).toBeNull();
    expect(client.setContext).toHaveBeenCalledTimes(2);
    expect(client.setContext.mock.calls[1]?.[0]).toBe('runtime');
    expect(client.setContext.mock.calls[1]?.[1]).toBeNull();
  });

  it('takes a defensive snapshot — mutating the prop after mount does not leak', () => {
    const client = makeClient();
    const user = { id: 'u1' };
    const tags: Record<string, string> = { initial: 'yes' };

    render(<Host client={client} user={user} tags={tags} />);

    // Mutate AFTER mount — the snapshot should already be frozen.
    user.id = 'mutated';
    tags['initial'] = 'changed';
    tags['new'] = 'leak?';

    const userArg = client.setUser.mock.calls[0]?.[0] as
      | { id: string }
      | null
      | undefined;
    expect(userArg).toEqual({ id: 'u1' });

    const tagsArg = client.setTags.mock.calls[0]?.[0] as
      | Record<string, string>
      | undefined;
    expect(tagsArg).toEqual({ initial: 'yes' });
  });

  it('does nothing for a key that is undefined', () => {
    const client = makeClient();
    render(<Host client={client} />);

    expect(client.setUser).not.toHaveBeenCalled();
    expect(client.setTags).not.toHaveBeenCalled();
    expect(client.setContext).not.toHaveBeenCalled();
  });
});
