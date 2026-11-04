import { defineConfig, devices } from '@playwright/test';
import { getEffectiveCredentials, getEnvironmentConfig } from './src/config/environments';
import { assertPublishingAllowed } from './src/config/write-safety';

assertPublishingAllowed();
const environment = getEnvironmentConfig();
if (environment.target !== 'benefits' || environment.tier !== 'stage' || environment.baseUrl !== 'https://benefits-stage.leidos.com') throw new Error('Benefits STAGE exact target required.');
const credentials = getEffectiveCredentials();
export default defineConfig({
  testDir: './tests', testMatch: 'benefits-stage-insights.spec.ts',
  outputDir: 'test-results/benefits-stage-insights', timeout: 900_000,
  workers: 1, retries: 0, fullyParallel: false, reporter: [['list']],
  use: {
    baseURL: environment.baseUrl,
    httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword, origin: environment.baseUrl },
    trace: 'off', video: 'off', screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
