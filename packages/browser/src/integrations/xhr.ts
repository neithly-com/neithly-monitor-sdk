/**
 * Patch `XMLHttpRequest.prototype.open` and `.send` to record an `http`
 * breadcrumb when each request reaches `readyState === DONE`. Shape mirrors
 * the `fetch` instrumentation so consumers can dedupe by category alone.
 */

import type { Breadcrumb } from '@neithly-com/monitor-core';

export type AddBreadcrumbFn = (breadcrumb: Breadcrumb) => void;

export type XhrUninstaller = () => void;

interface XhrBreadcrumbData extends Record<string, unknown> {
  method: string;
  url: string;
  status_code: number;
  duration_ms: number;
}

/**
 * Per-request scratch space attached to each patched XHR instance. We use a
 * WeakMap rather than expando properties so we don't leak metadata onto the
 * host's own XHR objects.
 */
interface XhrMeta {
  method: string;
  url: string;
  startedAt?: number;
}

export function installXhrInstrumentation(
  addBreadcrumb: AddBreadcrumbFn,
): XhrUninstaller {
  if (typeof XMLHttpRequest === 'undefined') {
    return (): void => {
      /* no-op */
    };
  }

  const proto = XMLHttpRequest.prototype;
  const originalOpen = proto.open;
  const originalSend = proto.send;

  const meta = new WeakMap<XMLHttpRequest, XhrMeta>();

  // We patch with explicit (...args) signatures and cast through unknown at the
  // assignment boundary — XHR's overloaded `open`/`send` signatures don't
  // compose cleanly with a single TS function type.
  function patchedOpen(this: XMLHttpRequest, ...args: unknown[]): void {
    const method = String(args[0] ?? 'GET').toUpperCase();
    const rawUrl = args[1];
    const url =
      typeof rawUrl === 'string'
        ? rawUrl
        : rawUrl instanceof URL
          ? rawUrl.toString()
          : String(rawUrl ?? '');
    meta.set(this, { method, url });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- XHR.open has 5 overloads; spreading through any is the documented bridge.
    return (originalOpen as any).apply(this, args);
  }

  function patchedSend(this: XMLHttpRequest, ...args: unknown[]): void {
    const entry = meta.get(this);
    if (entry !== undefined) {
      entry.startedAt = Date.now();
    }

    const onStateChange = (): void => {
      if (this.readyState !== XMLHttpRequest.DONE) {
        return;
      }
      const tracked = meta.get(this);
      if (tracked === undefined) {
        return;
      }
      const duration = tracked.startedAt !== undefined ? Date.now() - tracked.startedAt : 0;
      const data: XhrBreadcrumbData = {
        method: tracked.method,
        url: tracked.url,
        status_code: this.status,
        duration_ms: duration,
      };
      const level: Breadcrumb['level'] =
        this.status === 0 ? 'error' : this.status >= 400 ? 'warning' : 'info';
      try {
        addBreadcrumb({ category: 'http', level, data });
      } catch {
        // Breadcrumb sink must not break the host request.
      }
      this.removeEventListener('readystatechange', onStateChange);
    };

    this.addEventListener('readystatechange', onStateChange);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- XHR.send has 2 overloads; spreading through any is the documented bridge.
    return (originalSend as any).apply(this, args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional cast at the assignment boundary; types verified above.
  proto.open = patchedOpen as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional cast at the assignment boundary; types verified above.
  proto.send = patchedSend as any;

  return (): void => {
    if ((proto.open as unknown) === patchedOpen) {
      proto.open = originalOpen;
    }
    if ((proto.send as unknown) === patchedSend) {
      proto.send = originalSend;
    }
  };
}
