import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'core',
      include: ['packages/core/**/*.spec.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'node',
      include: ['packages/node/**/*.spec.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'browser',
      include: ['packages/browser/**/*.spec.ts'],
      environment: 'jsdom',
    },
  },
  {
    test: {
      name: 'react',
      include: ['packages/react/**/*.spec.{ts,tsx}'],
      environment: 'jsdom',
    },
  },
  {
    test: {
      name: 'cli',
      include: ['packages/cli/**/*.spec.ts'],
      environment: 'node',
    },
  },
]);
