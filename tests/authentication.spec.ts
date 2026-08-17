import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../src/config/environments';

test('Drupal user can authenticate', async ({ page }) => {
  getRequiredEnvironmentVariable('DRUPAL_BASE_URL');
  const username = getRequiredEnvironmentVariable('DRUPAL_USERNAME');
  const password = getRequiredEnvironmentVariable('DRUPAL_PASSWORD');

  const result = await loginToDrupal(page, { username, password });

  expect(result.authenticated).toBe(true);
  expect(result.finalUrl).toBe(page.url());
});
