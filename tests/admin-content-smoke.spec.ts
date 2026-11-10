import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../src/config/environments';

test('authenticated user can access Drupal content administration', async ({ page }) => {
  const expectedOrigin = new URL(getRequiredEnvironmentVariable('DRUPAL_BASE_URL')).origin;
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const response = await page.goto('/admin/content', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(expectedOrigin);
  expect(new URL(page.url()).pathname).toBe('/admin/content');
  expect(page.url()).not.toContain('/user/login');
  await expect(page.locator('form#user-login-form')).toHaveCount(0);
  await expect(
    page.locator('form[id^="views-exposed-form-content-"], form[id^="views-form-content-"], main a[href*="/node/add"]').first(),
    'Authenticated Drupal content administration UI must be present.',
  ).toBeVisible();
});
