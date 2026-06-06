import { describe, it, expect } from 'vitest';
import { shapeException } from './exception';

/**
 * Replace anything that looks like an absolute file path / URL with a stable
 * placeholder so snapshots are stable across machines and OSes. Also strips
 * line:column suffixes since stack frames include them and they shift between
 * runs.
 */
function scrubStack(stack: string): string {
  return stack
    .replace(/\r\n/g, '\n')
    .replace(/file:\/\/\/[^\s)]+/g, '<path>')
    .replace(/[A-Za-z]:\\[^\s)]+/g, '<path>')
    .replace(/\/[^\s)]+\.(?:ts|js|mjs|cjs)(?::\d+:\d+)?/g, '<path>')
    .replace(/<path>:\d+:\d+/g, '<path>')
    .replace(/\s+at\s+[^\n]+/g, '\n    at <frame>');
}

class CustomBoom extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CustomBoom';
  }
}

describe('shapeException', () => {
  it('shapes a plain Error', () => {
    const err = new Error('boom');
    const out = shapeException(err);
    expect(out['exception.type']).toBe('Error');
    expect(out['exception.message']).toBe('boom');
    expect(out['exception.stacktrace']).toContain('boom');
  });

  it('shapes a TypeError', () => {
    const err = new TypeError('not callable');
    const out = shapeException(err);
    expect(out['exception.type']).toBe('TypeError');
    expect(out['exception.message']).toBe('not callable');
    expect(out['exception.stacktrace']).toContain('not callable');
  });

  it('shapes a RangeError', () => {
    const err = new RangeError('out of range');
    const out = shapeException(err);
    expect(out['exception.type']).toBe('RangeError');
    expect(out['exception.message']).toBe('out of range');
  });

  it('preserves the constructor name of a user subclass', () => {
    const err = new CustomBoom('custom');
    const out = shapeException(err);
    expect(out['exception.type']).toBe('CustomBoom');
    expect(out['exception.message']).toBe('custom');
  });

  it('wraps a string throw into a synthetic Error', () => {
    const out = shapeException('oops');
    expect(out['exception.type']).toBe('Error');
    expect(out['exception.message']).toBe('oops');
    expect(out['exception.stacktrace']).not.toBe('');
  });

  it('wraps a number throw into a synthetic Error', () => {
    const out = shapeException(42);
    expect(out['exception.type']).toBe('Error');
    expect(out['exception.message']).toBe('42');
  });

  it('wraps a plain object throw into a synthetic Error', () => {
    const out = shapeException({ code: 'E_FAIL', reason: 'nope' });
    expect(out['exception.type']).toBe('Error');
    expect(out['exception.message']).toBe('{"code":"E_FAIL","reason":"nope"}');
  });

  it('wraps a null throw into a synthetic Error', () => {
    const out = shapeException(null);
    expect(out['exception.type']).toBe('Error');
    expect(out['exception.message']).toBe('null');
    expect(out['exception.stacktrace']).not.toBe('');
  });

  it('wraps an undefined throw into a synthetic Error', () => {
    const out = shapeException(undefined);
    expect(out['exception.type']).toBe('Error');
    expect(out['exception.message']).toBe('undefined');
    expect(out['exception.stacktrace']).not.toBe('');
  });

  it('walks a 2-deep cause chain', () => {
    const root = new Error('root');
    const middle = new Error('middle', { cause: root });
    const top = new Error('top', { cause: middle });
    const out = shapeException(top);
    expect(out['exception.type']).toBe('Error');
    expect(out['exception.message']).toBe('top');
    expect(out['exception.stacktrace']).toContain('Caused by: Error: middle');
    expect(out['exception.stacktrace']).toContain('Caused by: Error: root');
  });

  it('walks a 3-deep cause chain with mixed types', () => {
    const root = new RangeError('bad index');
    const middle = new TypeError('bad type', { cause: root });
    const top = new CustomBoom('custom boom');
    (top as { cause?: unknown }).cause = middle;
    const out = shapeException(top);
    expect(out['exception.type']).toBe('CustomBoom');
    expect(out['exception.stacktrace']).toContain('Caused by: TypeError: bad type');
    expect(out['exception.stacktrace']).toContain('Caused by: RangeError: bad index');

    const scrubbed = scrubStack(out['exception.stacktrace']);
    expect(scrubbed).toMatchSnapshot();
  });

  it('handles a cyclic cause chain without infinite looping', () => {
    const a = new Error('a');
    const b = new Error('b');
    (a as { cause?: unknown }).cause = b;
    (b as { cause?: unknown }).cause = a;
    const out = shapeException(a);
    // Either error appears at most once in the cause chain (root + one cause
    // entry is fine, but no infinite expansion).
    const causedByMatches = out['exception.stacktrace'].match(/Caused by:/g) ?? [];
    expect(causedByMatches.length).toBeLessThanOrEqual(MAX_EXPECTED_CAUSE_LINES);
    expect(out['exception.message']).toBe('a');
  });

  it('caps a deeply nested cause chain at depth 8', () => {
    let current: Error = new Error('lvl-0');
    for (let i = 1; i <= 20; i += 1) {
      const next = new Error(`lvl-${String(i)}`, { cause: current });
      current = next;
    }
    const out = shapeException(current);
    const causedByMatches = out['exception.stacktrace'].match(/Caused by:/g) ?? [];
    // depth budget is MAX_CAUSE_DEPTH=8 so at most 8 "Caused by" entries appear.
    expect(causedByMatches.length).toBeLessThanOrEqual(8);
    expect(causedByMatches.length).toBeGreaterThan(0);
  });

  it('walks AggregateError.errors with index labels', () => {
    const a = new Error('first');
    const b = new TypeError('second');
    const agg = new AggregateError([a, b], 'all failed');
    const out = shapeException(agg);
    expect(out['exception.type']).toBe('AggregateError');
    expect(out['exception.message']).toBe('all failed');
    expect(out['exception.stacktrace']).toContain('Aggregate error 0: Error: first');
    expect(out['exception.stacktrace']).toContain('Aggregate error 1: TypeError: second');
  });

  it('falls back to a locally captured stack when err.stack is missing', () => {
    const stackless = new Error('no stack here');
    delete (stackless as { stack?: string }).stack;
    const out = shapeException(stackless);
    expect(out['exception.type']).toBe('Error');
    expect(out['exception.message']).toBe('no stack here');
    expect(out['exception.stacktrace']).not.toBe('');
  });

  it('normalises CRLF stack line endings to LF', () => {
    const err = new Error('crlf');
    err.stack = 'Error: crlf\r\n    at foo\r\n    at bar';
    const out = shapeException(err);
    expect(out['exception.stacktrace']).not.toContain('\r');
    expect(out['exception.stacktrace']).toContain('Error: crlf\n    at foo');
  });
});

// A cyclic 2-node graph could in principle yield up to depth-8 worth of "Caused
// by" lines before the WeakSet shuts it down. We just want to guarantee it is
// bounded.
const MAX_EXPECTED_CAUSE_LINES = 8;
