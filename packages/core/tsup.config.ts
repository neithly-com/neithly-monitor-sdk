import { defineConfig } from 'tsup';
import { basePreset } from '../../tsup.config.base';

export default defineConfig(
  basePreset({
    entry: { index: 'src/index.ts' },
    target: 'es2022',
  }),
);
