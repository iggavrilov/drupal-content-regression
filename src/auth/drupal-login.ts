import type { Locator, Page } from '@playwright/test';

export interface DrupalCredentials {
  username: string;
  password: string;
}

export interface DrupalLoginResult {
  authenticated: true;
  finalUrl: string;
}

async function firstVisible(locator: Locator): Promise<Locator | undefined> {
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) {
      return candidate;
    }
  }

  return undefined;
}

/** Authenticate through Drupal's standard username/password login form. */
export async function loginToDrupal(
  page: Page,
  credentials: DrupalCredentials,
): Promise<DrupalLoginResult> {
  await page.goto('/user/login', { waitUntil: 'domcontentloaded' });

  const loginForm = page.locator('form#user-login-form, form.user-login-form').first();
  const usernameField = loginForm.locator('input[name="name"]');
  const passwordField = loginForm.locator('input[name="pass"]');
  const submitButton = loginForm.locator(
    'input[type="submit"], button[type="submit"]',
  );

  try {
    await loginForm.waitFor({ state: 'visible' });
    await usernameField.fill(credentials.username);
    await passwordField.fill(credentials.password);

    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.request().isNavigationRequest(),
    );

    await submitButton.click();
    const loginResponse = await loginResponsePromise;
    await page.waitForLoadState('domcontentloaded');

    if (loginResponse.status() >= 400) {
      throw new Error(
        `Drupal login request failed with HTTP status ${loginResponse.status()}.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Drupal login request')) {
      throw error;
    }

    throw new Error(
      'Drupal login could not be completed using the standard login form.',
      { cause: error },
    );
  }

  const errorMessage = await firstVisible(
    page.locator(
      '[data-drupal-messages] .messages--error, .messages.messages--error, [role="alert"].messages--error',
    ),
  );

  if (errorMessage) {
    throw new Error(
      'Drupal rejected the login and displayed an authentication error message.',
    );
  }

  const toolbarVisible = await page
    .locator('#toolbar-administration, [data-drupal-toolbar]')
    .first()
    .isVisible();
  const logoutLinkVisible = await page
    .locator('a[href$="/user/logout"], a[href*="/user/logout?"]')
    .first()
    .isVisible();
  const loginFormVisible = await loginForm.isVisible();
  const authenticated = toolbarVisible || logoutLinkVisible || !loginFormVisible;

  if (!authenticated) {
    throw new Error(
      'Drupal login did not produce an authenticated-session indicator.',
    );
  }

  return {
    authenticated: true,
    finalUrl: page.url(),
  };
}
