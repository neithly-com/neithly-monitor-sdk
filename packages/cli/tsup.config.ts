import { defineConfig } from 'tsup';
import { basePreset } from '../../tsup.config.base';

export default defineConfig([
  basePreset({
    entry: { index: 'src/index.ts' },
    target: 'node18',
  }),
  basePreset({
    entry: { cli: 'src/cli.ts' },
    target: 'node18',
    dts: false,
    format: ['cjs'],
    banner: { js: '#!/usr/bin/env node' },
  }),
]);
