import { defineConfig, devices } from '@playwright/test';
import { getEffectiveCredentials, getEnvironmentConfig } from './src/config/environments';
import { assertExplicitNonProductionEnvironment, assertPublishingAllowed } from './src/config/write-safety';

assertExplicitNonProductionEnvironment();
assertPublishingAllowed();
const environment = getEnvironmentConfig();
const credentials = getEffectiveCredentials();
if (environment.target !== 'leidos' || environment.tier !== 'stage' || environment.baseUrl !== 'https://stage.leidos.com') throw new Error('COMPONENT_DEMO_BLOCKED: Demo config requires exact Leidos STAGE.');

export default defineConfig({
  testDir: './tests',
  testMatch: 'pm-basic-page-component-demo.spec.ts',
  outputDir: 'test-results/component-demo-playwright',
  timeout: 900_000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'artifacts/basic-page-demo/leidos-stage/report' }]],
  use: {
    baseURL: environment.baseUrl,
    httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    headless: false,
    launchOptions: { slowMo: 150 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
