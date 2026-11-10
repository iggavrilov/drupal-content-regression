import { expect, test } from '@playwright/test';
import { getRequiredEnvironmentVariable } from '../src/config/environments';

test('HTTP Basic Authentication layer is accessible', async ({ page }) => {
  const expectedOrigin = new URL(getRequiredEnvironmentVariable('DRUPAL_BASE_URL')).origin;
  const response = await page.goto('/user/login', { waitUntil: 'domcontentloaded' });

  expect(response, 'The Drupal login navigation must return a response.').not.toBeNull();
  expect(response!.status(), 'The HTTP authentication layer must allow the Drupal login page to load.').toBeLessThan(400);
  expect(new URL(page.url()).origin).toBe(expectedOrigin);
  expect(response!.headers()['www-authenticate'], 'The browser must not remain on an HTTP authentication challenge.').toBeUndefined();
  await expect(
    page.locator('form#user-login-form, form.user-login-form, form[id*="user-login-form"], form[id*="login-form"]').first(),
    'The real Drupal login form must render after HTTP authentication.',
  ).toBeVisible();
});
