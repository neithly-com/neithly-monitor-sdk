/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NeithlyErrorBoundary,
  type NeithlyClient,
} from './error-boundary.js';

function makeClient(): NeithlyClient & {
  captureException: ReturnType<typeof vi.fn>;
  setTags: ReturnType<typeof vi.fn>;
} {
  return {
    captureException: vi.fn(() => 'evt-id'),
    setTags: vi.fn(),
  };
}

function Bomb({ message = 'kaboom' }: { message?: string }): ReactNode {
  throw new Error(message);
}

/**
 * Silence the React-thrown error logging the runtime emits when a child
 * component throws. Without this, the test output is flooded with the
 * expected stack trace for the caught error.
 */
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

describe('NeithlyErrorBoundary', () => {
  it('catches a thrown error in a child and renders the fallback', () => {
    const restore = silenceConsoleError();
    const client = makeClient();
    try {
      render(
        <NeithlyErrorBoundary
          client={client}
          fallback={<div data-testid="fallback">boom-fallback</div>}
        >
          <Bomb message="render-fail" />
        </NeithlyErrorBoundary>,
      );

      expect(screen.getByTestId('fallback').textContent).toBe('boom-fallback');
      expect(client.captureException).toHaveBeenCalledTimes(1);
      const firstCall = client.captureException.mock.calls[0];
      expect(firstCall).toBeDefined();
      if (firstCall === undefined) {
        return;
      }
      const [err] = firstCall as [Error, unknown];
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('render-fail');

      // The componentStack tag is set on the scope so subsequent events carry
      // the React component chain.
      expect(client.setTags).toHaveBeenCalledTimes(1);
      const tagCall = client.setTags.mock.calls[0];
      expect(tagCall).toBeDefined();
      if (tagCall === undefined) {
        return;
      }
      const [tags] = tagCall as [Record<string, string>];
      expect(typeof tags['react.componentStack']).toBe('string');
      expect(tags['react.componentStack']).toContain('Bomb');
    } finally {
      restore();
    }
  });

  it('invokes onError with the same error + info', () => {
    const restore = silenceConsoleError();
    const client = makeClient();
    const onError = vi.fn();
    try {
      render(
        <NeithlyErrorBoundary
          client={client}
          onError={onError}
          fallback={<div>fb</div>}
        >
          <Bomb message="oops" />
        </NeithlyErrorBoundary>,
      );

      expect(onError).toHaveBeenCalledTimes(1);
      const call = onError.mock.calls[0];
      expect(call).toBeDefined();
      if (call === undefined) {
        return;
      }
      const [err, info] = call as [Error, { componentStack: string }];
      expect(err.message).toBe('oops');
      expect(typeof info.componentStack).toBe('string');
    } finally {
      restore();
    }
  });

  it('accepts a render-function fallback and reset() returns to children', () => {
    const restore = silenceConsoleError();
    const client = makeClient();
    try {
      const renderFallback = vi.fn(
        (err: Error, reset: () => void): ReactNode => (
          <button data-testid="reset" type="button" onClick={reset}>
            {err.message}
          </button>
        ),
      );

      // Module-scoped crash flag flipped between renders. After reset(), the
      // boundary attempts to render its children again; we want that retry to
      // succeed, so we flip the flag before clicking reset.
      let shouldCrash = true;
      function MaybeBomb(): ReactNode {
        if (shouldCrash) {
          throw new Error('kaboom');
        }
        return <div data-testid="safe">safe-now</div>;
      }

      render(
        <NeithlyErrorBoundary client={client} fallback={renderFallback}>
          <MaybeBomb />
        </NeithlyErrorBoundary>,
      );

      // Initial render: MaybeBomb threw, fallback rendered with the error.
      expect(renderFallback).toHaveBeenCalled();
      const lastFallbackCall =
        renderFallback.mock.calls[renderFallback.mock.calls.length - 1];
      expect(lastFallbackCall).toBeDefined();
      if (lastFallbackCall === undefined) {
        return;
      }
      const [errArg, resetArg] = lastFallbackCall as [Error, () => void];
      expect(errArg).toBeInstanceOf(Error);
      expect(errArg.message).toBe('kaboom');
      expect(typeof resetArg).toBe('function');
      expect(screen.getByTestId('reset').textContent).toBe('kaboom');

      // Flip the child to its non-crashing state THEN click reset.
      shouldCrash = false;
      fireEvent.click(screen.getByTestId('reset'));

      expect(screen.getByTestId('safe').textContent).toBe('safe-now');
    } finally {
      restore();
    }
  });
});
