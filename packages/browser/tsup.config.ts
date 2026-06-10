import { defineConfig } from 'tsup';
import { basePreset } from '../../tsup.config.base';

export default defineConfig(
  basePreset({
    entry: {
      index: 'src/index.ts',
      react: 'src/react/index.ts',
    },
    target: 'es2020',
    platform: 'browser',
    // React + react-dom stay external — every consumer brings their own
    // React runtime, and bundling ours would double-up the renderer.
    external: ['react', 'react-dom'],
  }),
);
