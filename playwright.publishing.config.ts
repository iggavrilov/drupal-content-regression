import { defineConfig, devices } from '@playwright/test';
import { getEnvironmentConfig } from './src/config/environments';

const environment = getEnvironmentConfig();
const basicAuthUsername = process.env.BASIC_AUTH_USERNAME;
const basicAuthPassword = process.env.BASIC_AUTH_PASSWORD;
const httpCredentials =
  basicAuthUsername && basicAuthPassword
    ? { username: basicAuthUsername, password: basicAuthPassword }
    : undefined;

export default defineConfig({
  testDir: './tests',
  testMatch: 'publishing-regression.spec.ts',
  outputDir: 'test-results/publishing-playwright',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  globalSetup: './src/publishing/global-setup.ts',
  reporter: [
    ['list'],
    ['./src/reporting/publishing-regression-reporter.ts'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: environment.baseUrl,
    httpCredentials,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'publishing-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
