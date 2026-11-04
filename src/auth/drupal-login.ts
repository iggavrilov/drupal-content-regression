import type { Locator, Page } from '@playwright/test';

export interface DrupalCredentials {
  username: string;
  password: string;
}

export interface DrupalLoginResult {
  authenticated: true;
  finalUrl: string;
  authoringAccess?: DrupalAuthoringAccess;
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
  options: { verifyAuthoringAccess?: boolean } = {},
): Promise<DrupalLoginResult> {
  await page.goto('/user/login', { waitUntil: 'domcontentloaded' });

  const loginForm = page
    .locator('form#user-login-form, form.user-login-form, form[id*="user-login-form"], form[id*="login-form"]')
    .filter({ has: page.locator('input[name="name"][type="text"], input[name="name"], input[name="name"][type="email"]') })
    .first();

  const usernameField = loginForm.locator('input[name="name"]');
  const passwordField = loginForm.locator('input[name="pass"]');
  const submitButton = loginForm.locator(
    'input#edit-submit, input[name="op"][value*="Log in" i], input[name="op"][value*="Login" i], input[type="submit"][value*="Log in" i], input[type="submit"][value*="Login" i], button[type="submit"]',
  ).first();

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

  if (options.verifyAuthoringAccess || new URL(page.url()).origin === 'https://benefits-stage.leidos.com') {
    const access = await verifyDrupalAuthoringAccess(page);
    if (access.classification !== 'authenticated-and-authorized') throw new Error('Drupal authoring verification: ' + access.classification + '.');
    return { authenticated: true, finalUrl: page.url(), authoringAccess: access };
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


export interface DrupalAuthoringAccess {
  classification: 'authenticated-and-authorized' | 'authenticated-insufficient-permissions' | 'unauthenticated' | 'unknown';
  sessionCookiePresent: boolean;
  toolbarVisible: boolean;
  create: { status: number; path: string; contentTypeLinks: number; loginForm: boolean };
  administration: { status: number; path: string; contentViewPresent: boolean; loginForm: boolean };
}

/** Verify actual authoring UI; never expose cookies or require the toolbar. */
export async function verifyDrupalAuthoringAccess(page: Page): Promise<DrupalAuthoringAccess> {
  const origin = new URL(page.url()).origin;
  const cookies = await page.context().cookies(origin);
  const sessionCookiePresent = cookies.some(cookie => /^S?SESS/.test(cookie.name));
  const response = await page.goto('/node/add', { waitUntil: 'domcontentloaded' });
  const create = {
    status: response?.status() ?? 0, path: new URL(page.url()).pathname,
    contentTypeLinks: await page.locator('main a[href*="/node/add/"], .region-content a[href*="/node/add/"]').count(),
    loginForm: await page.locator('form#user-login-form').isVisible(),
  };
  const toolbarVisible = await page.locator('#toolbar-bar').isVisible()
    || await page.locator('#toolbar-administration, [data-drupal-toolbar], #gin-toolbar-bar').first().isVisible();
  const adminResponse = await page.goto('/admin/content', { waitUntil: 'domcontentloaded' });
  const administration = {
    status: adminResponse?.status() ?? 0, path: new URL(page.url()).pathname,
    contentViewPresent: await page.locator('form[id^="views-exposed-form-content-"], form[id^="views-form-content-"]').count() > 0,
    loginForm: await page.locator('form#user-login-form').isVisible(),
  };
  let classification: DrupalAuthoringAccess['classification'] = 'unknown';
  if (new URL(page.url()).origin === origin && sessionCookiePresent && create.status === 200 && create.path === '/node/add' && create.contentTypeLinks > 0 && !create.loginForm) classification = 'authenticated-and-authorized';
  else if (!sessionCookiePresent && (create.loginForm || administration.loginForm)) classification = 'unauthenticated';
  else if (sessionCookiePresent && (create.status === 403 || administration.status === 403)) classification = 'authenticated-insufficient-permissions';
  return { classification, sessionCookiePresent, toolbarVisible, create, administration };
}
