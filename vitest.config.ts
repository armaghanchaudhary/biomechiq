import { defineConfig } from 'vitest/config';

// Resolve the "@/..." path alias (mirrors tsconfig paths) for the pure-TS test run.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: new URL('./src/', import.meta.url).pathname },
    ],
  },
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
