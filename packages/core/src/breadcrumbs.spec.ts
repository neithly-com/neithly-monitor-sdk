import { describe, expect, it, vi, afterEach } from 'vitest';
import fc from 'fast-check';

import {
  BreadcrumbRing,
  serialiseBreadcrumbs,
  type Breadcrumb,
  type SerialisedBreadcrumb,
} from './breadcrumbs.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('BreadcrumbRing', () => {
  it('keeps every entry while under capacity', () => {
    const ring = new BreadcrumbRing(5);
    for (let i = 0; i < 3; i++) {
      ring.push({ category: 'nav', message: `step-${i}`, timestamp: i });
    }
    expect(ring.size).toBe(3);
    const snap = ring.snapshot();
    expect(snap.map((b) => b.message)).toEqual(['step-0', 'step-1', 'step-2']);
  });

  it('drops the oldest entry FIFO when at capacity', () => {
    const ring = new BreadcrumbRing(3);
    for (let i = 0; i < 5; i++) {
      ring.push({ category: 'nav', message: `step-${i}`, timestamp: i });
    }
    expect(ring.size).toBe(3);
    const snap = ring.snapshot();
    expect(snap.map((b) => b.message)).toEqual(['step-2', 'step-3', 'step-4']);
  });

  it('snapshot returns a defensive copy that does not mutate the ring', () => {
    const ring = new BreadcrumbRing(4);
    ring.push({ category: 'nav', message: 'a', timestamp: 1 });
    ring.push({ category: 'nav', message: 'b', timestamp: 2 });
    const snap = ring.snapshot();
    snap.length = 0;
    snap.push({ category: 'mutated', message: 'X', timestamp: 999 });
    const fresh = ring.snapshot();
    expect(fresh.map((b) => b.message)).toEqual(['a', 'b']);
    // Mutating a single entry must not affect the ring either.
    const second = ring.snapshot();
    const first = second[0];
    expect(first).toBeDefined();
    if (first !== undefined) {
      first.message = 'tampered';
    }
    const third = ring.snapshot();
    expect(third[0]?.message).toBe('a');
  });

  it('auto-stamps timestamp from the system clock when not provided', () => {
    vi.useFakeTimers();
    const fixed = new Date('2026-06-06T12:00:00.000Z').getTime();
    vi.setSystemTime(fixed);

    const ring = new BreadcrumbRing(2);
    ring.push({ category: 'nav', message: 'now' });
    const [entry] = ring.snapshot();
    expect(entry).toBeDefined();
    expect(entry?.timestamp).toBe(fixed);
  });

  it('preserves an explicit timestamp when provided', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));

    const ring = new BreadcrumbRing(2);
    ring.push({ category: 'nav', message: 'pinned', timestamp: 42 });
    expect(ring.snapshot()[0]?.timestamp).toBe(42);
  });

  it('clear() empties the ring', () => {
    const ring = new BreadcrumbRing(4);
    ring.push({ category: 'nav', message: 'a', timestamp: 1 });
    ring.push({ category: 'nav', message: 'b', timestamp: 2 });
    expect(ring.size).toBe(2);
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.snapshot()).toEqual([]);
  });

  it('rejects non-positive or non-integer capacity', () => {
    expect(() => new BreadcrumbRing(0)).toThrow(RangeError);
    expect(() => new BreadcrumbRing(-1)).toThrow(RangeError);
    expect(() => new BreadcrumbRing(1.5)).toThrow(RangeError);
  });

  it('eviction property: ring never exceeds capacity, retains the last N pushes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 32 }),
        fc.array(
          fc.record({
            category: fc.string({ minLength: 1, maxLength: 8 }),
            message: fc.string({ maxLength: 8 }),
            timestamp: fc.integer({ min: 0, max: 1_000_000 }),
          }),
          { maxLength: 200 },
        ),
        (capacity, pushes) => {
          const ring = new BreadcrumbRing(capacity);
          for (const p of pushes) {
            ring.push(p);
          }
          const snap = ring.snapshot();
          expect(snap.length).toBeLessThanOrEqual(capacity);
          expect(snap.length).toBe(Math.min(capacity, pushes.length));
          // The tail of the input must match the snapshot.
          const expectedTail = pushes.slice(-capacity);
          expect(snap.map((b) => b.message)).toEqual(
            expectedTail.map((b) => b.message),
          );
        },
      ),
    );
  });
});

describe('serialiseBreadcrumbs', () => {
  it('returns the full snapshot when under the byte cap', () => {
    const ring = new BreadcrumbRing(4);
    ring.push({ category: 'nav', message: 'a', timestamp: 1 });
    ring.push({ category: 'nav', message: 'b', timestamp: 2 });

    const out = serialiseBreadcrumbs(ring, 16_384);
    expect(out.map((b) => b.message)).toEqual(['a', 'b']);
    // Confirm it actually fits.
    expect(JSON.stringify(out).length).toBeLessThan(16_384);
  });

  it('drops the oldest entries until the serialised form fits the byte cap', () => {
    const ring = new BreadcrumbRing(10);
    // Each breadcrumb carries a chunky payload so we exceed a tiny cap.
    const big = 'x'.repeat(200);
    for (let i = 0; i < 10; i++) {
      ring.push({
        category: 'nav',
        message: `m-${i}`,
        timestamp: i,
        data: { blob: big },
      });
    }
    const cap = 600;
    const out = serialiseBreadcrumbs(ring, cap);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(10);
    // Oldest entries dropped — the last one must still be present.
    const last: SerialisedBreadcrumb | undefined = out[out.length - 1];
    expect(last?.message).toBe('m-9');
    // The serialised output respects the cap.
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(cap);
  });

  it('replaces oversized single-breadcrumb data with a truncated sentinel', () => {
    const ring = new BreadcrumbRing(2);
    const huge = 'y'.repeat(20_000);
    ring.push({
      category: 'nav',
      message: 'fat',
      timestamp: 1,
      data: { blob: huge },
    });
    const out = serialiseBreadcrumbs(ring, 16_384);
    // We may end up with 0 or 1 entries — but the one we kept (if any) must
    // carry the sentinel rather than the huge blob.
    if (out.length === 1) {
      const entry = out[0];
      expect(entry).toBeDefined();
      // sentinel marker present, original blob gone
      expect(JSON.stringify(entry?.data)).not.toContain(huge);
      expect(JSON.stringify(entry?.data)).toContain('[truncated]');
    }
    // Whatever the outcome, the serialised form respects the cap.
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(16_384);
  });

  it('keeps smaller siblings when one breadcrumb is individually truncated', () => {
    const ring = new BreadcrumbRing(3);
    const huge = 'z'.repeat(20_000);
    ring.push({ category: 'nav', message: 'small-1', timestamp: 1 });
    ring.push({
      category: 'nav',
      message: 'fat',
      timestamp: 2,
      data: { blob: huge },
    });
    ring.push({ category: 'nav', message: 'small-2', timestamp: 3 });

    const out = serialiseBreadcrumbs(ring, 16_384);
    const messages = out.map((b) => b.message);
    expect(messages).toContain('small-1');
    expect(messages).toContain('fat');
    expect(messages).toContain('small-2');
    // The fat entry's data must be the sentinel, not the original blob.
    const fat = out.find((b) => b.message === 'fat');
    expect(JSON.stringify(fat?.data)).toContain('[truncated]');
    expect(JSON.stringify(fat?.data)).not.toContain(huge);
  });

  it('rejects a non-positive byte cap', () => {
    const ring = new BreadcrumbRing(2);
    ring.push({ category: 'nav', message: 'a', timestamp: 1 });
    expect(() => serialiseBreadcrumbs(ring, 0)).toThrow(RangeError);
    expect(() => serialiseBreadcrumbs(ring, -10)).toThrow(RangeError);
  });

  it('returns an empty array for an empty ring', () => {
    const ring = new BreadcrumbRing(4);
    expect(serialiseBreadcrumbs(ring)).toEqual([]);
  });

  it('compiles with strict optional property typing', () => {
    // Type-check guardrail: this just needs to compile under
    // exactOptionalPropertyTypes; the runtime assertion is trivial.
    const crumb: Breadcrumb = { category: 'ui' };
    expect(crumb.category).toBe('ui');
  });
});
