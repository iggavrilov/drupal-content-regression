import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../../src/config/environments';

test('CMS HTTP Basic Auth exposes the Drupal login form', async ({ page }) => {
  const response = await page.goto('/user/login', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).not.toBe(401);
  expect(response?.status()).toBeLessThan(400);
  const form = page.locator('form#user-login-form, form.user-login-form').first();
  await expect(form).toBeVisible();
  await expect(form.locator('input[name="name"]')).toBeVisible();
  await expect(form.locator('input[name="pass"]')).toBeVisible();
  await expect(form.locator('input[type="submit"], button[type="submit"]')).toBeVisible();
  console.log(`CMS_BASIC_AUTH ${JSON.stringify({ status: response?.status(), loginFormRendered: true })}`);
});

test('CMS Drupal login establishes authenticated admin access', async ({ page }) => {
  const result = await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const response = await page.goto('/admin/content', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(400);
  expect(page.url()).not.toContain('/user/login');
  console.log(`CMS_DRUPAL_AUTH ${JSON.stringify({ authenticated: result.authenticated, finalUrl: page.url().replace(/[?#].*$/, ''), adminStatus: response?.status() })}`);
});
