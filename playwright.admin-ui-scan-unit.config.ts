import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: './tests', testMatch: 'admin-ui-scan-unit.spec.ts', outputDir: 'test-results/admin-ui-scan-unit-playwright', timeout: 30_000, retries: 0, workers: 1, reporter: [['line']] });
