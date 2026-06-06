import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Minimal Vite config for the react-spa example. The example deliberately
 * stays framework-light so it can be diffed against the docs without noise.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
  },
});
