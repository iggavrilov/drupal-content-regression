import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'admin-ui-scan.spec.ts',
  outputDir: 'test-results/admin-ui-scan-playwright',
  timeout: 7_200_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
