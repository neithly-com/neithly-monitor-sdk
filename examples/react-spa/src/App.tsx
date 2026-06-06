/**
 * react-spa example app.
 *
 * Three routes mounted under a `BrowserRouter`:
 *   - `/`        — home page.
 *   - `/about`   — static text.
 *   - `/crash`   — renders a button that throws on click. The throw bubbles
 *                  up to the `<NeithlyErrorBoundary>` installed in main.tsx,
 *                  which forwards the error to `captureException`.
 *
 * `useTrackRouter` from `@neithly-com/monitor-react` is mounted inside the
 * router context so each navigation pushes a `navigation` breadcrumb onto
 * the active scope.
 */

import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { useTrackRouter } from '@neithly-com/monitor-react';

function Nav(): ReactElement {
  return (
    <nav style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>
      <Link to="/crash">Crash</Link>
    </nav>
  );
}

function Home(): ReactElement {
  return (
    <section>
      <h1>react-spa example</h1>
      <p>
        This app boots <code>@neithly-com/monitor-browser</code> and wraps the
        tree in <code>NeithlyErrorBoundary</code>. Navigate to{' '}
        <Link to="/crash">/crash</Link> and click the button to trigger a
        captured exception.
      </p>
    </section>
  );
}

function About(): ReactElement {
  return (
    <section>
      <h1>About</h1>
      <p>
        Minimal Vite + react-router demo for the neithly-monitor JS SDK
        family.
      </p>
    </section>
  );
}

function Boom(): ReactElement {
  // Throwing in render is the cleanest way to exercise the error boundary;
  // a click handler throw would only end up on `window.onerror`.
  throw new Error('react-spa: intentional crash from /crash route');
}

function Crash(): ReactElement {
  const [boom, setBoom] = useState(false);
  if (boom) {
    return <Boom />;
  }
  return (
    <section>
      <h1>Crash</h1>
      <p>Click the button to throw inside render and trigger the boundary.</p>
      <button
        type="button"
        onClick={(): void => {
          setBoom(true);
        }}
      >
        Crash the app
      </button>
    </section>
  );
}

/**
 * Mounts inside the router context so `useTrackRouter` (which reads
 * `useLocation`) has the location it needs. Also surfaces the current
 * pathname for debugging.
 */
function RouterShell(): ReactElement {
  useTrackRouter();
  const location = useLocation();
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <Nav />
      <p style={{ color: '#666', marginTop: 0 }}>
        Current path: <code>{location.pathname}</code>
      </p>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/crash" element={<Crash />} />
      </Routes>
    </main>
  );
}

export function App(): ReactElement {
  return (
    <BrowserRouter>
      <RouterShell />
    </BrowserRouter>
  );
}
