/**
 * `MonitorService` — Injectable wrapper around the SDK capture surface.
 *
 * Providers and controllers depend on this rather than importing the SDK
 * directly so:
 *   - tests can stub the wrapper via Nest's DI;
 *   - the underlying SDK shape (Sentry-compatible today, may evolve) stays
 *     swappable behind a stable in-app interface;
 *   - every call is wrapped in a try/catch so a misbehaving collector cannot
 *     break a request path.
 *
 * Safe to call before {@link preloadMonitor} or {@link MonitorModule.forRoot}
 * ran — the SDK's default no-op processor silently drops records, so
 * consumers never need to null-check.
 */

import { Injectable, Logger } from '@nestjs/common';

import {
  captureException as sdkCaptureException,
  captureMessage as sdkCaptureMessage,
  setUser as sdkSetUser,
  setTags as sdkSetTags,
} from '../api/index.js';

export type MonitorLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface MonitorUser {
  readonly id: string;
  readonly email?: string;
  readonly ip_address?: string;
}

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  /**
   * Capture a thrown value with optional extra context. Errors raised by the
   * SDK itself are swallowed and logged so the host code path is never
   * disrupted by observability.
   */
  captureException(err: unknown, ctx?: Record<string, unknown>): void {
    try {
      sdkCaptureException(err, ctx !== undefined ? { extras: ctx } : undefined);
    } catch (sdkErr) {
      this.logger.error(
        `monitor SDK threw while capturing exception: ${
          sdkErr instanceof Error ? sdkErr.message : String(sdkErr)
        }`,
      );
    }
  }

  /** Capture a freeform message. `level` defaults to `'info'`. */
  captureMessage(message: string, level: MonitorLevel = 'info'): void {
    try {
      sdkCaptureMessage(message, level);
    } catch (sdkErr) {
      this.logger.error(
        `monitor SDK threw while capturing message: ${
          sdkErr instanceof Error ? sdkErr.message : String(sdkErr)
        }`,
      );
    }
  }

  /** Attach a user identity to the active scope. Pass `null` to clear. */
  setUser(user: MonitorUser | null): void {
    try {
      sdkSetUser(user);
    } catch (sdkErr) {
      this.logger.error(
        `monitor SDK threw while setting user: ${
          sdkErr instanceof Error ? sdkErr.message : String(sdkErr)
        }`,
      );
    }
  }

  /** Merge tags onto the active scope. Each value must be a string per the SDK. */
  setTags(tags: Record<string, string>): void {
    try {
      sdkSetTags(tags);
    } catch (sdkErr) {
      this.logger.error(
        `monitor SDK threw while setting tags: ${
          sdkErr instanceof Error ? sdkErr.message : String(sdkErr)
        }`,
      );
    }
  }
}
