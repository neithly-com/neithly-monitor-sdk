// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installPagehideFlush } from './pagehide.js';
import { InMemoryEnvelopeQueue, type QueuedEnvelope } from './queue.js';

function makeEnvelope(url: string, body: string): QueuedEnvelope {
  return {
    url,
    body,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer pk_test',
    },
  };
}

describe('installPagehideFlush', () => {
  let sendBeaconMock: ReturnType<typeof vi.fn>;
  let originalSendBeacon: typeof navigator.sendBeacon | undefined;

  beforeEach(() => {
    sendBeaconMock = vi.fn().mockReturnValue(true);
    originalSendBeacon = (
      navigator as Navigator & {
        sendBeacon?: typeof navigator.sendBeacon;
      }
    ).sendBeacon;
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: sendBeaconMock,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: originalSendBeacon,
    });
    vi.unstubAllGlobals();
  });

  it('drains queue via sendBeacon on pagehide — one beacon per envelope', () => {
    const queue = new InMemoryEnvelopeQueue();
    queue.push(makeEnvelope('https://x/v1/logs', '{"a":1}'));
    queue.push(makeEnvelope('https://x/v1/traces', '{"b":2}'));

    const uninstall = installPagehideFlush(queue);

    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeaconMock).toHaveBeenCalledTimes(2);
    expect(sendBeaconMock.mock.calls[0]?.[0]).toBe('https://x/v1/logs');
    expect(sendBeaconMock.mock.calls[1]?.[0]).toBe('https://x/v1/traces');

    // First arg URL + second arg Blob.
    const firstBlob = sendBeaconMock.mock.calls[0]?.[1] as Blob;
    expect(firstBlob).toBeInstanceOf(Blob);
    expect(firstBlob.type).toBe('application/json');

    // Queue must be empty afterwards.
    expect(queue.size).toBe(0);

    uninstall();
  });

  it('is a no-op when the queue is empty', () => {
    const queue = new InMemoryEnvelopeQueue();
    const uninstall = installPagehideFlush(queue);

    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeaconMock).not.toHaveBeenCalled();
    uninstall();
  });

  it('also flushes on visibilitychange=hidden', () => {
    const queue = new InMemoryEnvelopeQueue();
    queue.push(makeEnvelope('https://x/v1/logs', '{"a":1}'));

    const uninstall = installPagehideFlush(queue);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it('falls back to fetch keepalive when sendBeacon refuses', () => {
    sendBeaconMock.mockReturnValue(false);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 202 }));

    const queue = new InMemoryEnvelopeQueue();
    queue.push(makeEnvelope('https://x/v1/logs', '{"a":1}'));

    const uninstall = installPagehideFlush(queue, {
      fetch: fetchMock as unknown as typeof fetch,
    });

    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const [calledUrl, init] = call;
    expect(calledUrl).toBe('https://x/v1/logs');
    expect(init).toMatchObject({
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pk_test',
      },
      body: '{"a":1}',
    });

    uninstall();
  });

  it('uninstaller removes the listeners', () => {
    const queue = new InMemoryEnvelopeQueue();
    const uninstall = installPagehideFlush(queue);
    uninstall();

    queue.push(makeEnvelope('https://x/v1/logs', '{"a":1}'));
    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeaconMock).not.toHaveBeenCalled();
  });
});
