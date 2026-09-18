import { defineConfig, devices } from '@playwright/test';
import { getEffectiveCredentials, getEnvironmentConfig } from './src/config/environments';
import { assertExplicitNonProductionEnvironment } from './src/config/write-safety';

assertExplicitNonProductionEnvironment();
const environment = getEnvironmentConfig();
const credentials = getEffectiveCredentials();

export default defineConfig({
  testDir: './tests',
  testMatch: 'paragraph-regression.spec.ts',
  outputDir: 'test-results/paragraph-regression-playwright',
  timeout: 300_000,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [['list'], ['./src/reporting/paragraph-regression-reporter.ts'], ['html', { open: 'never', outputFolder: 'playwright-report/paragraph-regression' }]],
  use: {
    baseURL: environment.baseUrl,
    httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
