import { expect, test, type Page } from '@playwright/test';
import { verifyDrupalAuthoringAccess } from '../src/auth/drupal-login';
function fakePage(input: { cookie: boolean; links?: number; denied?: boolean; login?: boolean; admin?: boolean }): Page {
  let current = 'https://benefits-stage.leidos.com/';
  return {
    url: () => current,
    context: () => ({ cookies: async () => input.cookie ? [{ name: 'SESSsynthetic', value: 'test-only' }] : [] }),
    goto: async (route: string) => { current = 'https://benefits-stage.leidos.com' + (input.login ? '/user/login' : route); return { status: () => input.denied ? 403 : 200 }; },
    locator: (selector: string) => ({
      count: async () => selector.includes('/node/add/') ? input.links ?? 0 : input.admin ? 1 : 0,
      isVisible: async () => selector.includes('user-login-form') ? !!input.login : false,
      first: () => ({ isVisible: async () => false }),
    }),
  } as unknown as Page;
}
for (const [label, input, expected] of [
  ['authoring access is valid without a toolbar', { cookie: true, links: 7, admin: true }, 'authenticated-and-authorized'],
  ['session plus forbidden pages means insufficient permissions', { cookie: true, denied: true }, 'authenticated-insufficient-permissions'],
  ['login redirect without session is unauthenticated', { cookie: false, login: true }, 'unauthenticated'],
  ['HTTP 200 without authoring UI is unknown', { cookie: true }, 'unknown'],
  ['links without Drupal session are not proof', { cookie: false, links: 7 }, 'unknown'],
  ['a login form never proves authorization', { cookie: true, links: 7, login: true }, 'unknown'],
] as const) test(label, async () => {
  const result = await verifyDrupalAuthoringAccess(fakePage(input));
  expect(result.classification).toBe(expected);
  expect(result.toolbarVisible).toBe(false);
});
