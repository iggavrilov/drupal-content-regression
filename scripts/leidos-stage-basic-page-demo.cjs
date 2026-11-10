const { spawnSync } = require('node:child_process');
const path = require('node:path');

const env = {
  ...process.env,
  DRUPAL_TARGET: 'leidos',
  DRUPAL_TIER: 'stage',
  DRUPAL_BASE_URL: 'https://stage.leidos.com',
  DRUPAL_ENVIRONMENT: 'develop',
  DRUPAL_ALLOW_PUBLISH: 'true',
  DRUPAL_EXPECT_PUBLISH_PERMISSION: 'true',
  LEIDOS_STAGE_BASIC_PAGE_DEMO: 'CREATE_ONE_PUBLISHED_PAGE',
};

const result = spawnSync(process.execPath, [
  path.resolve(__dirname, '../node_modules/playwright/cli.js'),
  'test', '--config=playwright.component-demo.config.ts', '--project=chromium', '--workers=1',
], { cwd: process.cwd(), env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
