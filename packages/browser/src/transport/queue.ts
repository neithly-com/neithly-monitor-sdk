/**
 * A single payload destined for the monitor ingest backend. Carries everything
 * the page-hide flush path needs to retry the request via `navigator.sendBeacon`
 * or `fetch({ keepalive: true })` — URL, JSON body, and headers.
 */
export interface QueuedEnvelope {
  /** Absolute URL of the ingest endpoint (e.g. `https://ingest.../v1/logs`). */
  url: string;
  /** Pre-stringified JSON body (already serialised by the exporter). */
  body: string;
  /** HTTP headers to send. Must include `Content-Type` and `Authorization`. */
  headers: Record<string, string>;
}

/**
 * Tiny in-memory FIFO queue for unsent OTLP envelopes.
 *
 * Used by the page-hide flush path: exporters that fail (or are deferred) push
 * their envelope onto the queue; on `pagehide` / `visibilitychange=hidden`,
 * `installPagehideFlush` drains it via `navigator.sendBeacon`.
 *
 * Not thread-safe by design — the browser event loop is single-threaded.
 */
export class InMemoryEnvelopeQueue {
  private readonly entries: QueuedEnvelope[] = [];

  /** Append a new envelope to the tail of the queue. */
  push(envelope: QueuedEnvelope): void {
    this.entries.push(envelope);
  }

  /**
   * Return every queued envelope and clear the queue atomically.
   * Returns a fresh array — mutating it does not affect the queue.
   */
  flush(): QueuedEnvelope[] {
    const drained = this.entries.slice();
    this.entries.length = 0;
    return drained;
  }

  /** Number of envelopes currently waiting. */
  get size(): number {
    return this.entries.length;
  }
}
