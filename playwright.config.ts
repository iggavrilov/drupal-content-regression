import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import path from 'node:path';
import { getEffectiveCredentials, getEnvironmentConfig } from './src/config/environments';

const environment = getEnvironmentConfig();
const credentials = getEffectiveCredentials();
const httpCredentials = { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword, origin: environment.baseUrl };
const reporters: ReporterDescription[] = [['html']];
if (process.env.SMOKE_JSON_OUTPUT_PATH) {
  reporters.unshift(['list']);
  reporters.push([path.resolve('src/reporting/smoke-json-reporter.cjs')]);
}

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/default-playwright',
  timeout: 60_000,
  retries: 0,
  reporter: reporters,
  use: {
    baseURL: environment.baseUrl,
    httpCredentials,
    trace: environment.tier === 'stage' ? 'off' : 'retain-on-failure',
    screenshot: environment.tier === 'stage' ? 'off' : 'only-on-failure',
    video: environment.tier === 'stage' ? 'off' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
