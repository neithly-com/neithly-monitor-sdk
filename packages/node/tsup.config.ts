import { defineConfig } from 'tsup';
import { basePreset } from '../../tsup.config.base';

export default defineConfig(
  basePreset({
    // The package now ships THREE entry points:
    //   - `.`              → main barrel (Sentry-shaped surface + Express /
    //                        Fastify / NestJS classic bindings)
    //   - `./nestjs`       → opinionated NestJS adoption (MonitorModule.forRoot)
    //   - `./nestjs/preload` → side-effect-only preload to import FIRST in main.ts
    //
    // tsup emits each entry as a dual ESM/CJS pair + .d.ts under the named key.
    // The `nestjs/preload` key compiles to `dist/nestjs/preload.{mjs,cjs,d.ts}`.
    entry: {
      index: 'src/index.ts',
      'nestjs/index': 'src/nestjs/index.ts',
      'nestjs/preload': 'src/nestjs/preload-entry.ts',
    },
    target: 'node18',
    platform: 'node',
    // Keep every runtime dep external so the dual ESM/CJS bundle never
    // wraps Node builtins (async_hooks, fs, …) in tsup's __require shim.
    // The ESM shim breaks when transitively re-required from a real ESM
    // host — manifests as `Dynamic require of "async_hooks" is not supported`.
    external: [
      '@neithly-com/monitor-core',
      '@opentelemetry/api',
      '@opentelemetry/api-logs',
      '@opentelemetry/exporter-logs-otlp-http',
      '@opentelemetry/exporter-metrics-otlp-http',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/instrumentation',
      '@opentelemetry/instrumentation-http',
      '@opentelemetry/resources',
      '@opentelemetry/sdk-logs',
      '@opentelemetry/sdk-metrics',
      '@opentelemetry/sdk-node',
      '@opentelemetry/sdk-trace-base',
      '@opentelemetry/semantic-conventions',
      '@nestjs/common',
      '@nestjs/core',
      'reflect-metadata',
      'rxjs',
      'express',
      'fastify',
      'fastify-plugin',
    ],
  }),
);
