import { defineConfig, type Options } from 'tsup';

/**
 * Shared tsup config — every package extends this with its own entry,
 * format (cjs/esm), and target. Dual ESM + CJS + .d.ts is the v0.1
 * publish invariant.
 */
export function basePreset(overrides: Options = {}): Options {
  return {
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.mjs' };
    },
    ...overrides,
  };
}

export default defineConfig(basePreset());
