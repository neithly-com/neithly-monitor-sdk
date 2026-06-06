/**
 * Bounded, drop-oldest breadcrumb ring buffer with a size-capped serialiser.
 *
 * Pure logic: no HTTP, no DOM, no Node-only globals beyond `Date.now()`.
 */

export type BreadcrumbLevel = 'debug' | 'info' | 'warning' | 'error';

export interface Breadcrumb {
  category: string;
  message?: string;
  data?: Record<string, unknown>;
  level?: BreadcrumbLevel;
  /** ms epoch */
  timestamp?: number;
}

export interface SerialisedBreadcrumb extends Breadcrumb {
  timestamp: number;
}

const DEFAULT_CAPACITY = 100;
const DEFAULT_BYTE_CAP = 16_384;

/**
 * Capture the ms-epoch now at call time. Kept as a module-private function so
 * tests can drive it via `vi.useFakeTimers()`.
 */
function nowMs(): number {
  return Date.now();
}

/**
 * Bounded FIFO ring of breadcrumbs. When full, pushing drops the oldest entry.
 */
export class BreadcrumbRing {
  readonly #capacity: number;
  #buffer: SerialisedBreadcrumb[] = [];

  constructor(capacity: number = DEFAULT_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(
        `BreadcrumbRing capacity must be a positive integer, received ${String(capacity)}`,
      );
    }
    this.#capacity = capacity;
  }

  get size(): number {
    return this.#buffer.length;
  }

  push(breadcrumb: Breadcrumb): void {
    const stamped: SerialisedBreadcrumb = {
      ...breadcrumb,
      timestamp: breadcrumb.timestamp ?? nowMs(),
    };
    if (this.#buffer.length >= this.#capacity) {
      this.#buffer.shift();
    }
    this.#buffer.push(stamped);
  }

  /** Returns a defensive shallow copy of the current buffer. */
  snapshot(): SerialisedBreadcrumb[] {
    return this.#buffer.map((b) => ({ ...b }));
  }

  clear(): void {
    this.#buffer = [];
  }
}

/**
 * Snapshot the ring and JSON-stringify it. If the serialised form exceeds
 * `byteCap`, drop oldest entries until it fits. If a single breadcrumb's
 * `data` alone blows the cap, replace that breadcrumb's `data` with the
 * sentinel string `'[truncated]'`.
 */
export function serialiseBreadcrumbs(
  ring: BreadcrumbRing,
  byteCap: number = DEFAULT_BYTE_CAP,
): SerialisedBreadcrumb[] {
  if (!Number.isFinite(byteCap) || byteCap <= 0) {
    throw new RangeError(
      `serialiseBreadcrumbs byteCap must be a positive number, received ${String(byteCap)}`,
    );
  }

  const snapshot = ring.snapshot();
  const measure = (entries: readonly SerialisedBreadcrumb[]): number =>
    byteLength(JSON.stringify(entries));

  // Step 1: replace data of any single breadcrumb whose own data exceeds the cap.
  const truncated: SerialisedBreadcrumb[] = snapshot.map((entry) => {
    if (entry.data === undefined) {
      return entry;
    }
    const dataBytes = byteLength(JSON.stringify(entry.data));
    if (dataBytes > byteCap) {
      // Replace data with sentinel. We model `data` as Record<string,unknown>
      // so the sentinel lives under a fixed key.
      return {
        ...entry,
        data: { __truncated__: '[truncated]' } satisfies Record<string, unknown>,
      };
    }
    return entry;
  });

  // Step 2: drop oldest until the array fits under the byteCap.
  const working = truncated.slice();
  while (working.length > 0 && measure(working) > byteCap) {
    working.shift();
  }
  return working;
}

function byteLength(s: string): number {
  // Prefer the standard global if available; fall back to a manual count.
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(s).length;
  }
  // Fallback: UTF-8 byte count (rare path — modern runtimes always have TextEncoder).
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
