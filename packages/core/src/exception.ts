/**
 * Shape arbitrary thrown values into a flat OTLP-style exception attribute set.
 *
 * The output is intentionally narrow: three string attributes that match the
 * OpenTelemetry `exception.*` semantic conventions. The `stacktrace` field is
 * a single multi-line string that walks `err.cause` and `AggregateError.errors`
 * recursively so consumers get a single rendered chain without having to
 * traverse anything themselves.
 */

const MAX_CAUSE_DEPTH = 8;
const LF = '\n';

export interface ExceptionAttributes {
  'exception.type': string;
  'exception.message': string;
  'exception.stacktrace': string;
}

interface NormalisedError {
  type: string;
  message: string;
  stack: string;
  cause: unknown;
  aggregateErrors: readonly unknown[] | undefined;
}

function normaliseStack(stack: string | undefined): string {
  if (stack === undefined || stack === '') {
    return captureLocalStack();
  }
  return stack.replace(/\r\n/g, LF).replace(/\r/g, LF);
}

function captureLocalStack(): string {
  const local = new Error('<no stack>');
  if (local.stack === undefined || local.stack === '') {
    return '<no stack available>';
  }
  return local.stack.replace(/\r\n/g, LF).replace(/\r/g, LF);
}

function stringifyNonError(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  if (typeof value === 'function') {
    return `[Function: ${value.name === '' ? 'anonymous' : value.name}]`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function isAggregateError(err: Error): err is Error & { errors: readonly unknown[] } {
  const maybe = (err as { errors?: unknown }).errors;
  return Array.isArray(maybe);
}

function normalise(err: unknown): NormalisedError {
  if (err instanceof Error) {
    const type = err.constructor.name === '' ? 'Error' : err.constructor.name;
    const aggregateErrors = isAggregateError(err) ? err.errors : undefined;
    return {
      type,
      message: err.message,
      stack: normaliseStack(err.stack),
      cause: (err as { cause?: unknown }).cause,
      aggregateErrors,
    };
  }
  const synthetic = new Error(stringifyNonError(err));
  return {
    type: 'Error',
    message: synthetic.message,
    stack: normaliseStack(synthetic.stack),
    cause: undefined,
    aggregateErrors: undefined,
  };
}

function appendCauseChain(
  segments: string[],
  cause: unknown,
  depth: number,
  seen: WeakSet<object>,
): void {
  if (cause === undefined || cause === null) {
    return;
  }
  if (depth > MAX_CAUSE_DEPTH) {
    return;
  }
  if (typeof cause === 'object') {
    if (seen.has(cause)) {
      return;
    }
    seen.add(cause);
  }
  const n = normalise(cause);
  segments.push(`${LF}Caused by: ${n.type}: ${n.message}${LF}${n.stack}`);
  if (n.aggregateErrors !== undefined) {
    appendAggregateChain(segments, n.aggregateErrors, depth + 1, seen);
  }
  appendCauseChain(segments, n.cause, depth + 1, seen);
}

function appendAggregateChain(
  segments: string[],
  errors: readonly unknown[],
  depth: number,
  seen: WeakSet<object>,
): void {
  if (depth > MAX_CAUSE_DEPTH) {
    return;
  }
  for (let i = 0; i < errors.length; i += 1) {
    const sub = errors[i];
    if (sub === undefined) {
      continue;
    }
    if (typeof sub === 'object' && sub !== null) {
      if (seen.has(sub)) {
        continue;
      }
      seen.add(sub);
    }
    const n = normalise(sub);
    segments.push(`${LF}Aggregate error ${String(i)}: ${n.type}: ${n.message}${LF}${n.stack}`);
    if (n.aggregateErrors !== undefined) {
      appendAggregateChain(segments, n.aggregateErrors, depth + 1, seen);
    }
    appendCauseChain(segments, n.cause, depth + 1, seen);
  }
}

export function shapeException(err: unknown): ExceptionAttributes {
  const root = normalise(err);
  const seen = new WeakSet<object>();
  if (err !== null && typeof err === 'object') {
    seen.add(err);
  }
  const segments: string[] = [root.stack];
  if (root.aggregateErrors !== undefined) {
    appendAggregateChain(segments, root.aggregateErrors, 1, seen);
  }
  appendCauseChain(segments, root.cause, 1, seen);
  return {
    'exception.type': root.type,
    'exception.message': root.message,
    'exception.stacktrace': segments.join(''),
  };
}
