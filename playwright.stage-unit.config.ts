import { defineConfig } from '@playwright/test';

/** Only offline configuration tests and browser routes fulfilled by unit fixtures. */
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'benefits-auth-verification.spec.ts',
    'stage-content-ui.spec.ts',
    'card-collection-fixture.spec.ts',
    'environment-config.spec.ts',
    'write-safety.spec.ts',
    'workflow-assignee-guard.spec.ts',
  ],
  workers: 1,
  retries: 0,
  outputDir: 'test-results/stage-unit',
  reporter: [['list']],
  use: { baseURL: 'https://benefits-stage.leidos.com', trace: 'off', video: 'off', screenshot: 'off' },
});
