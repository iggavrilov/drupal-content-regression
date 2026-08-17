import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { ContentTypeRunner } from '../src/content/content-type-runner';
import {
  AUTOMATED_CONTENT_PREFIX,
  AUTOMATED_IMAGE_MEDIA_ID,
} from '../src/config/automation';
import { insightExternalConfig } from '../src/config/content-types';
import {
  getEnvironmentConfig,
  getRequiredEnvironmentVariable,
} from '../src/config/environments';
import { generateConfiguredTestData } from '../src/data/test-data';
import { NetworkMonitor } from '../src/diagnostics/network-monitor';

test('Insight external can be created and updated without server errors', async ({ page }) => {
  test.setTimeout(180_000);
  expect(
    getEnvironmentConfig().name,
    'Production execution is disabled for the Insight external write test',
  ).not.toBe('production');
  getRequiredEnvironmentVariable('DRUPAL_BASE_URL');
  const username = getRequiredEnvironmentVariable('DRUPAL_USERNAME');
  const password = getRequiredEnvironmentVariable('DRUPAL_PASSWORD');
  const data = generateConfiguredTestData(insightExternalConfig);
  expect(data.createValues.title.startsWith(AUTOMATED_CONTENT_PREFIX)).toBe(true);
  expect(data.updateValues.title.startsWith(AUTOMATED_CONTENT_PREFIX)).toBe(true);

  await loginToDrupal(page, { username, password });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  try {
    const result = await new ContentTypeRunner().run({
      page,
      config: insightExternalConfig,
      data,
      monitor,
    });
    expect(result.updated.nodeId).toBe(result.created.nodeId);
    expect(result.created.mediaId).toBe(AUTOMATED_IMAGE_MEDIA_ID);
    expect(result.updated.mediaId).toBe(AUTOMATED_IMAGE_MEDIA_ID);
    expect(result.updated.title).toBe(data.updateValues.title);
    expect(result.updated.moderation?.moderationStateUsed).toMatch(/draft|unpublished/i);
    monitor.assertNoServerErrors();

    console.log(
      `Insight external CRUD result: ${JSON.stringify({
        generatedTitle: data.createValues.title,
        generatedExternalLink: data.createValues.externalLink,
        moderationStateUsed: result.created.moderation?.moderationStateUsed,
        nodeId: result.created.nodeId,
        nodeUrl: result.created.nodeUrl,
        mediaId: result.created.mediaId,
        updatedTitle: result.updated.title,
        updatedExternalLink: data.updateValues.externalLink,
        updatedNodeUrl: result.updated.nodeUrl,
        serverErrors: monitor.getServerErrors().length,
      })}`,
    );
  } finally {
    monitor.stop();
  }
});
