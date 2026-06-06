/**
 * Mock OTLP/HTTP collector for monitor SDK test suites.
 *
 * Spins up a `node:http` server on an ephemeral port that accepts the OTLP/HTTP
 * signal paths (`/v1/logs`, `/v1/traces`, `/v1/metrics`) and lets tests assert
 * on what the SDK actually wrote on the wire.
 *
 * Pure helper — no third-party HTTP libs, no Vitest plumbing.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { OtlpLogRecord, OtlpLogsRequest } from '@neithly-com/monitor-core';

const SIGNAL_PATHS = new Set(['/v1/logs', '/v1/traces', '/v1/metrics']);
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MiB
const DEFAULT_TIMEOUT_MS = 2000;

export interface RecordedRequest {
  path: string;
  method: string;
  headers: Record<string, string | undefined>;
  body: unknown;
  rawBody: string;
  receivedAt: number;
}

export interface LogRecordExceptionMatcher {
  type?: string | RegExp;
  message?: string | RegExp;
}

export interface LogRecordMatcher {
  exception?: LogRecordExceptionMatcher;
  attributes?: Record<string, string | RegExp>;
}

export interface MockCollector {
  readonly port: number;
  readonly endpoint: string;
  readonly received: ReadonlyArray<RecordedRequest>;
  /**
   * Returns the next unclaimed recorded request, in FIFO order.
   *
   * Semantics: each successful call claims a record and advances an internal
   * cursor; a chain of `await nextRequest()` calls walks the recorded queue
   * head-to-tail without ever returning the same record twice. If no
   * unclaimed record is currently available (or none matches `predicate`),
   * the call waits up to `opts.timeoutMs` (default `defaultTimeoutMs`) for a
   * new request to arrive.
   *
   * Note: this is FIFO consumption, NOT "next request after the call point".
   * Calling `nextRequest()` after N requests have already been recorded will
   * return record 0 (the first unclaimed one). To assert against an already-
   * recorded request without claiming it, use `assertLogRecord` or scan
   * `received` directly.
   */
  nextRequest(
    predicate?: (r: RecordedRequest) => boolean,
    opts?: { timeoutMs?: number },
  ): Promise<RecordedRequest>;
  waitForLogRecord(
    matcher: LogRecordMatcher,
    opts?: { timeoutMs?: number },
  ): Promise<OtlpLogRecord>;
  assertLogRecord(matcher: LogRecordMatcher): OtlpLogRecord;
  reset(): void;
  close(): Promise<void>;
}

export interface CreateMockCollectorOptions {
  defaultTimeoutMs?: number;
}

interface PendingWaiter {
  predicate: ((r: RecordedRequest) => boolean) | undefined;
  resolve: (r: RecordedRequest) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout | null;
  // Index in `received` up to which this waiter has scanned already.
  // Anything at or after this index is fair game.
  consumedIndex: number;
}

function matchString(value: string, matcher: string | RegExp): boolean {
  if (matcher instanceof RegExp) {
    // Reset lastIndex defensively when a caller passes a global/sticky regex.
    // Otherwise repeated .test() calls advance lastIndex and produce flaky
    // matches across log records or repeated assertions.
    if (matcher.global || matcher.sticky) {
      matcher.lastIndex = 0;
    }
    return matcher.test(value);
  }
  return value === matcher;
}

function getAttribute(
  record: OtlpLogRecord,
  key: string,
): string | undefined {
  for (const attr of record.attributes) {
    if (attr.key === key) {
      return attr.value.stringValue;
    }
  }
  return undefined;
}

function recordMatches(
  record: OtlpLogRecord,
  matcher: LogRecordMatcher,
): boolean {
  if (matcher.exception !== undefined) {
    if (matcher.exception.type !== undefined) {
      const type = getAttribute(record, 'exception.type');
      if (type === undefined || !matchString(type, matcher.exception.type)) {
        return false;
      }
    }
    if (matcher.exception.message !== undefined) {
      const message = getAttribute(record, 'exception.message');
      if (
        message === undefined ||
        !matchString(message, matcher.exception.message)
      ) {
        return false;
      }
    }
  }
  if (matcher.attributes !== undefined) {
    for (const [key, expected] of Object.entries(matcher.attributes)) {
      const value = getAttribute(record, key);
      if (value === undefined || !matchString(value, expected)) {
        return false;
      }
    }
  }
  return true;
}

function isOtlpLogsRequest(body: unknown): body is OtlpLogsRequest {
  if (body === null || typeof body !== 'object') {
    return false;
  }
  const resourceLogs = (body as { resourceLogs?: unknown }).resourceLogs;
  if (!Array.isArray(resourceLogs) || resourceLogs.length === 0) {
    return false;
  }
  return true;
}

function extractLogRecords(body: unknown): OtlpLogRecord[] {
  if (!isOtlpLogsRequest(body)) {
    return [];
  }
  const out: OtlpLogRecord[] = [];
  const resourceLogs = body.resourceLogs as unknown[];
  for (const rl of resourceLogs) {
    if (rl === null || typeof rl !== 'object') {
      continue;
    }
    const scopeLogs = (rl as { scopeLogs?: unknown }).scopeLogs;
    if (!Array.isArray(scopeLogs)) {
      continue;
    }
    for (const sl of scopeLogs) {
      if (sl === null || typeof sl !== 'object') {
        continue;
      }
      const logRecords = (sl as { logRecords?: unknown }).logRecords;
      if (!Array.isArray(logRecords)) {
        continue;
      }
      for (const lr of logRecords) {
        if (lr !== null && typeof lr === 'object') {
          out.push(lr as OtlpLogRecord);
        }
      }
    }
  }
  return out;
}

async function readBody(
  req: IncomingMessage,
): Promise<{ rawBody: string; tooLarge: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) {
        return;
      }
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const rawBody = tooLarge ? '' : Buffer.concat(chunks).toString('utf8');
      resolve({ rawBody, tooLarge });
    });
    req.on('error', (err) => reject(err));
  });
}

function parseBody(rawBody: string, contentType: string | undefined): unknown {
  if (
    contentType !== undefined &&
    contentType.toLowerCase().startsWith('application/json')
  ) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  }
  return null;
}

export async function createMockCollector(
  opts: CreateMockCollectorOptions = {},
): Promise<MockCollector> {
  const defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  const received: RecordedRequest[] = [];
  const waiters: PendingWaiter[] = [];
  // Tracks indices in `received` that have already been resolved to a caller
  // of nextRequest(). Predicates may match earlier entries (e.g. assertLogRecord
  // scans the whole array), but a single resolved `nextRequest` call should
  // never resolve a second one with the same record.
  const claimed = new Set<number>();
  // FIFO cursor for nextRequest(). Each successful synchronous claim advances
  // this to (claimedIndex + 1), so chained `await nextRequest()` calls return
  // distinct, monotonically-progressing records. nextRequest() is a FIFO
  // consumer of recorded requests — see its JSDoc for the precise contract.
  let nextCursor = 0;
  let closed = false;

  function tryConsumeForWaiter(waiter: PendingWaiter): RecordedRequest | null {
    for (let i = waiter.consumedIndex; i < received.length; i++) {
      const entry = received[i];
      if (entry === undefined) {
        continue;
      }
      if (claimed.has(i)) {
        continue;
      }
      if (waiter.predicate === undefined || waiter.predicate(entry)) {
        waiter.consumedIndex = i + 1;
        claimed.add(i);
        // Keep the FIFO cursor in sync so a later synchronous nextRequest()
        // call never retroactively claims an entry the waiter just consumed.
        if (i + 1 > nextCursor) {
          nextCursor = i + 1;
        }
        return entry;
      }
    }
    waiter.consumedIndex = received.length;
    return null;
  }

  function dispatchToWaiters(): void {
    // Walk waiters in registration order; the FIRST waiter that hasn't yet
    // consumed a matching record gets the new request.
    for (let w = 0; w < waiters.length; w++) {
      const waiter = waiters[w];
      if (waiter === undefined) {
        continue;
      }
      const match = tryConsumeForWaiter(waiter);
      if (match !== null) {
        if (waiter.timer !== null) {
          clearTimeout(waiter.timer);
        }
        waiters.splice(w, 1);
        waiter.resolve(match);
        // A single new request can satisfy at most one waiter; the next
        // recorded request will trigger another dispatchToWaiters() call
        // which will hand it off to the next pending waiter in order.
        return;
      }
    }
  }

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const method = req.method ?? 'GET';
      const path = req.url ?? '/';

      // GET on any path → 405.
      if (method === 'GET') {
        res.statusCode = 405;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
      }

      // Only POST is exercised below.
      if (method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
      }

      const { rawBody, tooLarge } = await readBody(req);
      if (tooLarge) {
        res.statusCode = 413;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'payload_too_large' }));
        return;
      }

      // Non-signal paths: 404 and do NOT record.
      if (!SIGNAL_PATHS.has(path)) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }

      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) {
          headers[k] = v.join(', ');
        } else {
          headers[k] = v;
        }
      }
      const contentType = req.headers['content-type'];
      const body = parseBody(
        rawBody,
        Array.isArray(contentType) ? contentType[0] : contentType,
      );

      const entry: RecordedRequest = {
        path,
        method,
        headers,
        body,
        rawBody,
        receivedAt: Date.now(),
      };
      received.push(entry);
      dispatchToWaiters();

      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ partialSuccess: {} }));
    } catch {
      try {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'internal_error' }));
      } catch {
        // Response already started — nothing we can do.
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });

  // After listen() resolves the socket is bound — any throw past this point
  // would leak the FD. Wrap everything until the final return in try/catch
  // and force-close the server on failure.
  let port: number;
  let endpoint: string;
  try {
    const address = server.address() as AddressInfo | null;
    if (address === null || typeof address === 'string') {
      throw new Error('mock collector failed to bind to a port');
    }
    port = address.port;
    endpoint = `http://127.0.0.1:${port}`;
  } catch (err) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
    throw err;
  }

  function rejectPendingWaiters(message: string): void {
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      if (waiter === undefined) {
        continue;
      }
      if (waiter.timer !== null) {
        clearTimeout(waiter.timer);
      }
      waiter.reject(new Error(message));
    }
  }

  function nextRequest(
    predicate?: (r: RecordedRequest) => boolean,
    nextOpts: { timeoutMs?: number } = {},
  ): Promise<RecordedRequest> {
    if (closed) {
      return Promise.reject(new Error('mock collector closed'));
    }
    const timeoutMs = nextOpts.timeoutMs ?? defaultTimeoutMs;

    // nextRequest() is a FIFO consumer: it advances `nextCursor` past each
    // claimed entry, so a chain of `await nextRequest()` calls returns
    // distinct, monotonically-progressing records. The cursor also prevents
    // a fresh nextRequest() from retroactively claiming an entry that an
    // earlier call has already consumed (or skipped via predicate mismatch).
    for (let i = nextCursor; i < received.length; i++) {
      if (claimed.has(i)) {
        continue;
      }
      const entry = received[i];
      if (entry === undefined) {
        continue;
      }
      if (predicate === undefined || predicate(entry)) {
        claimed.add(i);
        nextCursor = i + 1;
        return Promise.resolve(entry);
      }
    }

    return new Promise<RecordedRequest>((resolve, reject) => {
      const waiter: PendingWaiter = {
        predicate,
        resolve,
        reject,
        timer: null,
        // Start the waiter's scan from the FIFO cursor — same floor the
        // synchronous fast-path uses — so dispatchToWaiters() never resolves
        // a waiter with a record that has already been claimed (or skipped)
        // by an earlier synchronous nextRequest() call.
        consumedIndex: nextCursor,
      };
      waiter.timer = setTimeout(() => {
        const idx = waiters.indexOf(waiter);
        if (idx >= 0) {
          waiters.splice(idx, 1);
        }
        const last =
          received.length > 0 ? received[received.length - 1] : undefined;
        const snippet =
          last !== undefined
            ? JSON.stringify({
                path: last.path,
                method: last.method,
                rawBody: last.rawBody.slice(0, 500),
              })
            : '<none>';
        reject(
          new Error(
            `mock collector nextRequest timed out after ${String(timeoutMs)}ms — received ${String(received.length)} request(s). Last: ${snippet}`,
          ),
        );
      }, timeoutMs);
      // Don't hold the event loop open with the timeout alone; if a test
      // forgets to await close(), the rejection still fires while other work
      // is pending but won't keep an otherwise idle process alive.
      waiter.timer.unref?.();
      waiters.push(waiter);
    });
  }

  function waitForLogRecord(
    matcher: LogRecordMatcher,
    waitOpts: { timeoutMs?: number } = {},
  ): Promise<OtlpLogRecord> {
    return nextRequest((r) => {
      if (r.path !== '/v1/logs') {
        return false;
      }
      const records = extractLogRecords(r.body);
      return records.some((rec) => recordMatches(rec, matcher));
    }, waitOpts).then((req) => {
      const records = extractLogRecords(req.body);
      const found = records.find((rec) => recordMatches(rec, matcher));
      if (found === undefined) {
        throw new Error(
          'mock collector internal error: predicate matched but no record found',
        );
      }
      return found;
    });
  }

  function assertLogRecord(matcher: LogRecordMatcher): OtlpLogRecord {
    const searched: string[] = [];
    for (const req of received) {
      if (req.path !== '/v1/logs') {
        continue;
      }
      const records = extractLogRecords(req.body);
      for (const rec of records) {
        if (recordMatches(rec, matcher)) {
          return rec;
        }
        const type = getAttribute(rec, 'exception.type') ?? '<none>';
        const message = getAttribute(rec, 'exception.message') ?? '<none>';
        searched.push(`{exception.type=${type}, exception.message=${message}}`);
      }
    }
    throw new Error(
      `mock collector assertLogRecord: no log record matched. Searched ${String(searched.length)} record(s) across ${String(received.length)} request(s): [${searched.join(', ')}]`,
    );
  }

  function reset(): void {
    if (closed) {
      throw new Error('mock collector reset: collector is already closed');
    }
    received.length = 0;
    claimed.clear();
    nextCursor = 0;
    rejectPendingWaiters('mock collector reset');
  }

  async function close(): Promise<void> {
    if (closed) {
      return;
    }
    closed = true;
    rejectPendingWaiters('mock collector closed');
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err !== undefined && err !== null) {
          reject(err);
        } else {
          resolve();
        }
      });
      // Closes idle connections so we don't hang on keep-alive.
      server.closeAllConnections?.();
    });
  }

  return {
    port,
    endpoint,
    received,
    nextRequest,
    waitForLogRecord,
    assertLogRecord,
    reset,
    close,
  };
}
