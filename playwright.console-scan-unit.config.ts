import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['console-scanner-unit.spec.ts', 'console-scanner-production-unit.spec.ts'],
  outputDir: 'test-results/console-scanner-unit-playwright',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
});
