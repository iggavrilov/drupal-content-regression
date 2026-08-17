import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { discoverContentTypes } from '../src/content/discover-content-types';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import {
  assertNoDrupalFatalPage,
  NetworkMonitor,
} from '../src/diagnostics/network-monitor';

test('Authenticated user can access Drupal content administration without server errors', async ({
  page,
}) => {
  getRequiredEnvironmentVariable('DRUPAL_BASE_URL');
  const username = getRequiredEnvironmentVariable('DRUPAL_USERNAME');
  const password = getRequiredEnvironmentVariable('DRUPAL_PASSWORD');
  await loginToDrupal(page, { username, password });

  const monitor = new NetworkMonitor();
  monitor.start(page);

  try {
    for (const path of ['/admin/content', '/node/add'] as const) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

      expect(response, `Expected a navigation response for ${path}`).not.toBeNull();
      expect(
        response?.status(),
        `Expected ${path} to load without an HTTP client or server error`,
      ).toBeLessThan(400);
      monitor.assertNoServerErrors();
      await assertNoDrupalFatalPage(page);
    }

    const contentTypes = await discoverContentTypes(page);
    console.log(
      `Discovered content types: ${JSON.stringify(
        contentTypes.map(({ label, machineName }) => ({ label, machineName })),
      )}`,
    );
  } finally {
    monitor.stop();
  }
});
