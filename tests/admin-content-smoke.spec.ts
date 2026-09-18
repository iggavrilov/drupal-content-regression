import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../src/config/environments';

test('authenticated user can access Drupal content administration', async ({ page }) => {
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const response = await page.goto('/admin/content', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  expect(page.url()).not.toContain('/user/login');
});
