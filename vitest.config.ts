import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      'src/**/*.integration.test.ts',
      'tests/**/*.integration.test.ts',
    ],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 80,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
