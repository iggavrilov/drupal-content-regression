import { defineConfig, devices } from '@playwright/test';
import { getEnvironmentConfig } from './src/config/environments';
import { assertExplicitNonProductionEnvironment } from './src/config/write-safety';

assertExplicitNonProductionEnvironment();
const environment = getEnvironmentConfig();
const basicAuthUsername = process.env.BASIC_AUTH_USERNAME;
const basicAuthPassword = process.env.BASIC_AUTH_PASSWORD;
const httpCredentials =
  basicAuthUsername && basicAuthPassword
    ? { username: basicAuthUsername, password: basicAuthPassword }
    : undefined;

const orderedProjects = [
  ['01-basic-page', 'basic-page-crud.spec.ts'],
  ['02-landing-page', 'landing-page-crud.spec.ts'],
  ['03-statistic', 'statistic-crud.spec.ts'],
  ['04-author', 'author-crud.spec.ts'],
  ['05-insight-external', 'insight-external-crud.spec.ts'],
  ['06-insight', 'insight-crud.spec.ts'],
  ['07-insight-search', 'insight-search-crud.spec.ts'],
] as const;

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/content-regression-playwright',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['./src/reporting/content-regression-reporter.ts'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: environment.baseUrl,
    httpCredentials,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: orderedProjects.map(([name, testFile]) => ({
    name,
    testMatch: testFile,
    use: { ...devices['Desktop Chrome'] },
  })),
});
