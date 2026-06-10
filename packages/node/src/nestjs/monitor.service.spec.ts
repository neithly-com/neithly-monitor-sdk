/**
 * Unit tests for {@link MonitorService}.
 *
 * The wrapper exists for two reasons we explicitly verify here:
 *  1. it forwards each call to the underlying SDK with the right argument shape;
 *  2. it swallows SDK-side errors so a misbehaving collector never breaks a
 *     request path.
 *
 * We stub the SDK by spying on the named exports rather than mocking the whole
 * module — that keeps the test honest about the real import path while still
 * giving us call-arg assertions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api/index.js';
import { MonitorService } from './monitor.service.js';

describe('MonitorService', () => {
  let svc: MonitorService;

  beforeEach(() => {
    vi.restoreAllMocks();
    svc = new MonitorService();
  });

  describe('captureException', () => {
    it('forwards the error to the SDK with no context when none provided', () => {
      const spy = vi.spyOn(api, 'captureException').mockReturnValue('evt');
      svc.captureException(new Error('boom'));
      expect(spy).toHaveBeenCalledTimes(1);
      const [err, ctx] = spy.mock.calls[0]!;
      expect((err as Error).message).toBe('boom');
      expect(ctx).toBeUndefined();
    });

    it('wraps the extras context bag when provided', () => {
      const spy = vi.spyOn(api, 'captureException').mockReturnValue('evt');
      svc.captureException(new Error('boom'), { foo: 'bar' });
      expect(spy).toHaveBeenCalledWith(expect.any(Error), { extras: { foo: 'bar' } });
    });

    it('swallows SDK errors so the host code path is never disrupted', () => {
      vi.spyOn(api, 'captureException').mockImplementation(() => {
        throw new Error('collector down');
      });
      expect(() => svc.captureException(new Error('boom'))).not.toThrow();
    });
  });

  describe('captureMessage', () => {
    it('forwards the message with default info level', () => {
      const spy = vi.spyOn(api, 'captureMessage').mockReturnValue('evt');
      svc.captureMessage('hello');
      expect(spy).toHaveBeenCalledWith('hello', 'info');
    });

    it('honours an explicit level', () => {
      const spy = vi.spyOn(api, 'captureMessage').mockReturnValue('evt');
      svc.captureMessage('warn-msg', 'warning');
      expect(spy).toHaveBeenCalledWith('warn-msg', 'warning');
    });

    it('swallows SDK errors', () => {
      vi.spyOn(api, 'captureMessage').mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => svc.captureMessage('x')).not.toThrow();
    });
  });

  describe('setUser', () => {
    it('forwards the user object', () => {
      const spy = vi.spyOn(api, 'setUser').mockReturnValue();
      svc.setUser({ id: 'u_1', email: 'a@b.c' });
      expect(spy).toHaveBeenCalledWith({ id: 'u_1', email: 'a@b.c' });
    });

    it('forwards null to clear the active user', () => {
      const spy = vi.spyOn(api, 'setUser').mockReturnValue();
      svc.setUser(null);
      expect(spy).toHaveBeenCalledWith(null);
    });

    it('swallows SDK errors', () => {
      vi.spyOn(api, 'setUser').mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => svc.setUser({ id: 'u_1' })).not.toThrow();
    });
  });

  describe('setTags', () => {
    it('forwards the tag bag verbatim', () => {
      const spy = vi.spyOn(api, 'setTags').mockReturnValue();
      svc.setTags({ a: '1', b: '2' });
      expect(spy).toHaveBeenCalledWith({ a: '1', b: '2' });
    });

    it('swallows SDK errors', () => {
      vi.spyOn(api, 'setTags').mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => svc.setTags({ a: '1' })).not.toThrow();
    });
  });
});
