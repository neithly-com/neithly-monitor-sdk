import { beforeEach, describe, expect, it, vi } from 'vitest';

import { captureException, captureMessage } from './capture.js';
import { init } from './init.js';
import { addBreadcrumb, setTags, setUser } from './scope-api.js';
import {
  _resetStateForTest,
  _setSenderForTest,
  type SendPayload,
} from './state.js';

const VALID_DSN = `nmk_dev_${'b'.repeat(64)}`;

function collectingSender(): {
  sender: (payload: SendPayload) => void;
  payloads: SendPayload[];
} {
  const payloads: SendPayload[] = [];
  return {
    sender(payload) {
      payloads.push(payload);
    },
    payloads,
  };
}

function attrValue(
  payload: SendPayload,
  key: string,
): string | undefined {
  return payload.record.attributes.find((kv) => kv.key === key)?.value.stringValue;
}

describe('captureException', () => {
  beforeEach(() => {
    _resetStateForTest();
    init({ dsn: VALID_DSN, release: '9.9.9' });
  });

  it('returns a 32-character event id', () => {
    const { sender } = collectingSender();
    _setSenderForTest(sender);

    const id = captureException(new Error('boom'));
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('emits an OTLP log record with exception attributes', () => {
    const { sender, payloads } = collectingSender();
    _setSenderForTest(sender);

    captureException(new TypeError('nope'));

    expect(payloads).toHaveLength(1);
    const payload = payloads[0];
    expect(payload).toBeDefined();
    if (payload === undefined) {
      return;
    }
    expect(payload.record.severityText).toBe('ERROR');
    expect(attrValue(payload, 'exception.type')).toBe('TypeError');
    expect(attrValue(payload, 'exception.message')).toBe('nope');
    expect(attrValue(payload, 'exception.stacktrace')).toBeDefined();
  });

  it('flows breadcrumbs, tags, and user through into the record attributes', () => {
    const { sender, payloads } = collectingSender();
    _setSenderForTest(sender);

    setUser({ id: 'user-42', email: 'user@example.test' });
    setTags({ feature: 'checkout' });
    addBreadcrumb({ category: 'ui.click', message: 'pay button' });

    captureException(new Error('post-breadcrumbs'));
    const payload = payloads[0];
    expect(payload).toBeDefined();
    if (payload === undefined) {
      return;
    }

    expect(attrValue(payload, 'user.id')).toBe('user-42');
    expect(attrValue(payload, 'user.email')).toBe('user@example.test');
    expect(attrValue(payload, 'tag.feature')).toBe('checkout');

    const breadcrumbs = attrValue(payload, 'neithly.breadcrumbs');
    expect(breadcrumbs).toBeDefined();
    expect(breadcrumbs).toContain('ui.click');
    expect(breadcrumbs).toContain('pay button');
  });
});

describe('captureMessage', () => {
  beforeEach(() => {
    _resetStateForTest();
    init({ dsn: VALID_DSN });
  });

  it('defaults to info severity', () => {
    const { sender, payloads } = collectingSender();
    _setSenderForTest(sender);

    captureMessage('hello world');
    const payload = payloads[0];
    expect(payload).toBeDefined();
    if (payload === undefined) {
      return;
    }
    expect(payload.record.severityText).toBe('INFO');
    expect(payload.record.body.stringValue).toBe('hello world');
  });

  it('respects an explicit severity level', () => {
    const { sender, payloads } = collectingSender();
    _setSenderForTest(sender);

    captureMessage('warn me', { level: 'warning' });
    const payload = payloads[0];
    expect(payload).toBeDefined();
    if (payload === undefined) {
      return;
    }
    expect(payload.record.severityText).toBe('WARNING');
  });

  it('returns a 32-character event id', () => {
    _setSenderForTest(() => undefined);
    const id = captureMessage('hi');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('does not throw when the sender returns a rejected promise', async () => {
    const sender = vi.fn(() => Promise.reject(new Error('network down')));
    _setSenderForTest(sender);

    expect(() => captureMessage('hi')).not.toThrow();
    expect(sender).toHaveBeenCalledTimes(1);
    // Silence the unhandled rejection by awaiting a microtask flush.
    await Promise.resolve();
  });
});
