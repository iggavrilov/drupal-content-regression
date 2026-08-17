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
  outputDir: 'test-results/default-playwright',
  timeout: 60_000,
  retries: 0,
  reporter: [['html']],
  use: {
    baseURL: environment.baseUrl,
    httpCredentials,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
