import { defineConfig, devices } from '@playwright/test';
import { getEnvironmentConfig } from './src/config/environments';
import { assertExplicitNonProductionEnvironment } from './src/config/write-safety';

assertExplicitNonProductionEnvironment();
const environment = getEnvironmentConfig();
const username = process.env.BASIC_AUTH_USERNAME;
const password = process.env.BASIC_AUTH_PASSWORD;

export default defineConfig({
  testDir: './tests',
  testMatch: 'paragraph-m3-discovery.spec.ts',
  outputDir: 'test-results/paragraph-m3-discovery-playwright',
  timeout: 300_000,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/paragraph-m3-discovery' }]],
  use: {
    baseURL: environment.baseUrl,
    httpCredentials: username && password ? { username, password } : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
