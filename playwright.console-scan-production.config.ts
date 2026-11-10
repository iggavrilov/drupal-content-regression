import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'console-scanner-production.spec.ts',
  outputDir: 'test-results/console-scan-production-playwright',
  timeout: 1_800_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
