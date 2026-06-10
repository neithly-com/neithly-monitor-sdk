/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MonitorErrorBoundary } from './MonitorErrorBoundary.js';
import { MonitorProvider, type MonitorClient } from './MonitorProvider.js';

function makeStubClient(): MonitorClient & {
  captureException: ReturnType<typeof vi.fn>;
  setTags: ReturnType<typeof vi.fn>;
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

function Bomb({ message = 'kaboom' }: { message?: string }): ReactNode {
  throw new Error(message);
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

describe('MonitorErrorBoundary', () => {
  it('renders the fallback when a child throws and forwards to the client prop', () => {
    const restore = silenceConsoleError();
    const client = makeStubClient();
    try {
      render(
        <MonitorErrorBoundary
          client={client}
          fallback={<div data-testid="fb">boom</div>}
        >
          <Bomb message="render-fail" />
        </MonitorErrorBoundary>,
      );
      expect(screen.getByTestId('fb').textContent).toBe('boom');
      expect(client.captureException).toHaveBeenCalledTimes(1);
      const [err] = client.captureException.mock.calls[0] as [Error];
      expect(err.message).toBe('render-fail');
      expect(client.setTags).toHaveBeenCalledTimes(1);
      const [tags] = client.setTags.mock.calls[0] as [Record<string, string>];
      expect(typeof tags['react.componentStack']).toBe('string');
      expect(tags['react.componentStack']).toContain('Bomb');
    } finally {
      restore();
    }
  });

  it('falls back to the active provider client when no client prop is passed', () => {
    const restore = silenceConsoleError();
    const client = makeStubClient();
    try {
      render(
        <MonitorProvider dsn={VALID_DSN} client={client}>
          <MonitorErrorBoundary fallback={<div data-testid="fb">boom</div>}>
            <Bomb message="ctx-fail" />
          </MonitorErrorBoundary>
        </MonitorProvider>,
      );
      expect(screen.getByTestId('fb').textContent).toBe('boom');
      expect(client.captureException).toHaveBeenCalledTimes(1);
      const [err] = client.captureException.mock.calls[0] as [Error];
      expect(err.message).toBe('ctx-fail');
    } finally {
      restore();
    }
  });

  it('accepts a render-function fallback and reset() returns to children', () => {
    const restore = silenceConsoleError();
    const client = makeStubClient();
    try {
      let shouldCrash = true;
      function MaybeBomb(): ReactNode {
        if (shouldCrash) {
          throw new Error('kaboom');
        }
        return <div data-testid="safe">safe-now</div>;
      }

      render(
        <MonitorErrorBoundary
          client={client}
          fallback={(err, reset) => (
            <button data-testid="reset" type="button" onClick={reset}>
              {err.message}
            </button>
          )}
        >
          <MaybeBomb />
        </MonitorErrorBoundary>,
      );

      expect(screen.getByTestId('reset').textContent).toBe('kaboom');
      shouldCrash = false;
      fireEvent.click(screen.getByTestId('reset'));
      expect(screen.getByTestId('safe').textContent).toBe('safe-now');
    } finally {
      restore();
    }
  });

  it('invokes onError with the same error + info', () => {
    const restore = silenceConsoleError();
    const client = makeStubClient();
    const onError = vi.fn();
    try {
      render(
        <MonitorErrorBoundary
          client={client}
          onError={onError}
          fallback={<div>fb</div>}
        >
          <Bomb message="oops" />
        </MonitorErrorBoundary>,
      );
      expect(onError).toHaveBeenCalledTimes(1);
      const [err, info] = onError.mock.calls[0] as [
        Error,
        { componentStack: string },
      ];
      expect(err.message).toBe('oops');
      expect(typeof info.componentStack).toBe('string');
    } finally {
      restore();
    }
  });

  it('does not let a client.setTags throw mask the original error capture', () => {
    const restore = silenceConsoleError();
    const client = makeStubClient();
    client.setTags.mockImplementationOnce(() => {
      throw new Error('tag-failure');
    });
    try {
      render(
        <MonitorErrorBoundary client={client} fallback={<div>fb</div>}>
          <Bomb message="oops" />
        </MonitorErrorBoundary>,
      );
      // captureException still ran despite setTags throwing.
      expect(client.captureException).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});
