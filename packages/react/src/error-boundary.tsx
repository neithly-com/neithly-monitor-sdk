/**
 * `<NeithlyErrorBoundary>` — a React class component that catches render-phase
 * errors in its subtree, forwards them to a Neithly client (defaulting to the
 * `@neithly-com/monitor-browser` singleton), and renders a fallback UI. The
 * fallback can be a React node or a render function that receives the captured
 * error plus a `reset()` callback to clear the boundary.
 *
 * The client dependency is injected through a small `NeithlyClient` seam so
 * tests (and host apps that bring their own client) can stub it out without
 * pulling the real singleton.
 */

import { Component, type ReactNode } from 'react';

import { Neithly } from '@neithly-com/monitor-browser';

/**
 * Minimal Neithly client shape consumed by the error boundary. The Sentry-
 * shaped singleton exported from `@neithly-com/monitor-browser` satisfies this
 * structurally — we only depend on `captureException` and `setTags`.
 */
export interface NeithlyClient {
  captureException(err: Error, ctx?: unknown): string;
  setTags(tags: Record<string, string>): void;
}

/**
 * `componentDidCatch` info argument. Mirrors the subset of React's `ErrorInfo`
 * we rely on; declared locally so the boundary can be consumed by both React
 * 17/18 (where the type was `{ componentStack: string }`) and React 19 (where
 * `componentStack` was made nullable).
 */
export interface NeithlyErrorInfo {
  componentStack: string;
}

export type NeithlyErrorBoundaryFallback =
  | ReactNode
  | ((error: Error, reset: () => void) => ReactNode);

export interface NeithlyErrorBoundaryProps {
  children: ReactNode;
  fallback: NeithlyErrorBoundaryFallback;
  onError?: (error: Error, info: NeithlyErrorInfo) => void;
  /** Override the default Neithly client (`@neithly-com/monitor-browser`). */
  client?: NeithlyClient;
}

interface NeithlyErrorBoundaryState {
  error: Error | null;
}

/**
 * The default Neithly client used when `props.client` is not provided. We
 * grab the browser singleton at module load; tests can sidestep this by
 * passing their own `client` prop.
 */
const DEFAULT_CLIENT: NeithlyClient = Neithly;

export class NeithlyErrorBoundary extends Component<
  NeithlyErrorBoundaryProps,
  NeithlyErrorBoundaryState
> {
  override state: NeithlyErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): NeithlyErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: NeithlyErrorInfo): void {
    const client = this.props.client ?? DEFAULT_CLIENT;
    // Tag the scope so downstream events carry the React component stack as
    // context. We do this BEFORE the captureException call so the resulting
    // event picks up the tag.
    try {
      client.setTags({ 'react.componentStack': info.componentStack });
    } catch {
      // Tagging is best-effort — never let a setTags failure swallow the
      // original error.
    }
    try {
      client.captureException(error, { componentStack: info.componentStack });
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
