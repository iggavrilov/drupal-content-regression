import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'console-scanner-production-full.spec.ts',
  outputDir: 'test-results/console-scan-production-full-playwright',
  timeout: 3_600_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
