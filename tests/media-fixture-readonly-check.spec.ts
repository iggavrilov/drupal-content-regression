import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { insightExternalConfig } from '../src/config/content-types';
import { AUTOMATED_IMAGE_MEDIA_NAME } from '../src/config/automation';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import {
  closeMediaLibrary,
  findAutomationMedia,
  openImageMediaLibrary,
} from '../src/content/media/media-library';

test('resolve exact QA image fixture without creating media or content', async ({ page }) => {
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const response = await page.goto(`/node/add/${insightExternalConfig.machineName}`, {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(400);
  const dialog = await openImageMediaLibrary(page);
  const matches = await findAutomationMedia(page, dialog, AUTOMATED_IMAGE_MEDIA_NAME);
  await closeMediaLibrary(page);
  expect(matches).toHaveLength(1);
  console.log(`MEDIA_FIXTURE_READONLY ${JSON.stringify({ mediaId: matches[0].id, exactMatches: matches.length, mediaCreated: 0, nodesCreated: 0 })}`);
});
