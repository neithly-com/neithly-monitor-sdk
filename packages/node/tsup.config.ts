import { defineConfig } from 'tsup';
import { basePreset } from '../../tsup.config.base';

export default defineConfig(
  basePreset({
    entry: { index: 'src/index.ts' },
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
