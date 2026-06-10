/**
 * `<MonitorErrorBoundary>` — class component error boundary that catches
 * render-phase errors in its subtree, ships them through the active
 * `MonitorClient` (browser SDK by default, or a test stub via context),
 * and renders a fallback UI.
 *
 * Distinct from the standalone `<NeithlyErrorBoundary>` in
 * `@neithly-com/monitor-react`: this boundary lives on the `/react` subpath
 * of `monitor-browser` so SPA hosts don't need to take a second package
 * dependency for the bare essentials (provider + boundary + hook). The
 * standalone package layers extra wiring (react-router breadcrumbs, etc.)
 * on top.
 */

import { Component, type ReactNode } from 'react';

import {
  MonitorContext,
  type MonitorClient,
} from './MonitorProvider.js';
import {
  captureException as defaultCapture,
  setTags as defaultSetTags,
} from '../api/index.js';

/**
 * Subset of React's `ErrorInfo` we depend on. Declared locally so the
 * boundary stays usable across React 17 (string `componentStack`) and
 * React 19 (nullable `componentStack`).
 */
export interface MonitorErrorInfo {
  componentStack: string;
}

export type MonitorErrorBoundaryFallback =
  | ReactNode
  | ((error: Error, reset: () => void) => ReactNode);

export interface MonitorErrorBoundaryProps {
  children: ReactNode;
  fallback: MonitorErrorBoundaryFallback;
  onError?: (error: Error, info: MonitorErrorInfo) => void;
  /**
   * Override the client used to ship the error. Falls back to the active
   * `MonitorContext` value, then to the SDK's named exports.
   */
  client?: MonitorClient;
}

interface MonitorErrorBoundaryState {
  error: Error | null;
}

const FALLBACK_CLIENT: Pick<MonitorClient, 'captureException' | 'setTags'> = {
  captureException: defaultCapture,
  setTags: defaultSetTags,
};

export class MonitorErrorBoundary extends Component<
  MonitorErrorBoundaryProps,
  MonitorErrorBoundaryState
> {
  // Bind the class to the React context so we can pull the active
  // MonitorClient down without making the boundary a function component.
  // `contextType` gives `this.context: MonitorClient | null`.
  static override contextType = MonitorContext;
  declare context: React.ContextType<typeof MonitorContext>;

  override state: MonitorErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): MonitorErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: MonitorErrorInfo): void {
    const client: Pick<MonitorClient, 'captureException' | 'setTags'> =
      this.props.client ?? this.context ?? FALLBACK_CLIENT;
    try {
      client.setTags({ 'react.componentStack': info.componentStack });
    } catch {
      // Tagging is best-effort — never let a setTags failure swallow the
      // original error.
    }
    try {
      client.captureException(error);
    } catch {
      // Same defensive posture as setTags above.
    }
    if (this.props.onError !== undefined) {
      this.props.onError(error, info);
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback(error, this.reset);
      }
      return fallback;
    }
    return this.props.children;
  }
}
