import { defineConfig, devices } from '@playwright/test';
import { getEffectiveCredentials, getEnvironmentConfig } from './src/config/environments';

const environment = getEnvironmentConfig();
const credentials = getEffectiveCredentials();
const httpCredentials = { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword };

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
