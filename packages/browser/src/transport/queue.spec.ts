import { describe, expect, it } from 'vitest';

import { InMemoryEnvelopeQueue, type QueuedEnvelope } from './queue.js';

function makeEnvelope(url: string): QueuedEnvelope {
  return {
    url,
    body: JSON.stringify({ resourceLogs: [] }),
    headers: { 'Content-Type': 'application/json' },
  };
}

describe('InMemoryEnvelopeQueue', () => {
  it('is empty on construction', () => {
    const q = new InMemoryEnvelopeQueue();
    expect(q.size).toBe(0);
    expect(q.flush()).toEqual([]);
  });

  it('push appends in FIFO order', () => {
    const q = new InMemoryEnvelopeQueue();
    const a = makeEnvelope('https://x/v1/logs');
    const b = makeEnvelope('https://x/v1/traces');
    q.push(a);
    q.push(b);

    expect(q.size).toBe(2);
    const drained = q.flush();
    expect(drained).toEqual([a, b]);
  });

  it('flush clears the queue', () => {
    const q = new InMemoryEnvelopeQueue();
    q.push(makeEnvelope('https://x/v1/logs'));
    q.flush();
    expect(q.size).toBe(0);
    expect(q.flush()).toEqual([]);
  });

  it('flush returns a defensive copy', () => {
    const q = new InMemoryEnvelopeQueue();
    const a = makeEnvelope('https://x/v1/logs');
    q.push(a);

    const drained = q.flush();
    drained.length = 0;

    // Mutating the drained snapshot must not resurrect entries in the queue.
    expect(q.size).toBe(0);
    q.push(a);
    expect(q.flush()).toEqual([a]);
  });
});
