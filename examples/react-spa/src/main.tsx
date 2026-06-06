/**
 * Boot entry for the react-spa example.
 *
 * Wires `Neithly.init()` from `@neithly-com/monitor-browser` BEFORE React
 * mounts so the global `window.onerror` / `unhandledrejection` integrations
 * (installed inside `init()`) are in place by the time `<App />` renders.
 *
 * The whole tree is wrapped in `<NeithlyErrorBoundary>` from
 * `@neithly-com/monitor-react` so any render-time throw inside a route
 * component is forwarded to `captureException` and shown as a fallback UI.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Neithly } from '@neithly-com/monitor-browser';
import { NeithlyErrorBoundary } from '@neithly-com/monitor-react';

import { App } from './App.js';

Neithly.init({
  // Replace with a real DSN from your neithly-monitor project.
  dsn: 'https://public@ingest.neithly.com/1',
  environment: 'development',
  release: 'react-spa-example@0.0.0',
});

const rootEl = document.getElementById('root');
if (rootEl === null) {
  throw new Error('react-spa: #root element not found in index.html');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <NeithlyErrorBoundary
      fallback={
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h1>Something went wrong</h1>
          <p>
            The error was forwarded to neithly-monitor. Reload the page to try
            again.
          </p>
        </div>
      }
    >
      <App />
    </NeithlyErrorBoundary>
  </React.StrictMode>,
);
