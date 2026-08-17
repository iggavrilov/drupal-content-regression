import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { ContentTypeRunner } from '../src/content/content-type-runner';
import {
  AUTOMATED_AUTHOR_NODE_ID,
  AUTOMATED_CONTENT_PREFIX,
  AUTOMATED_IMAGE_MEDIA_ID,
} from '../src/config/automation';
import { insightConfig } from '../src/config/content-types';
import {
  getEnvironmentConfig,
  getRequiredEnvironmentVariable,
} from '../src/config/environments';
import { generateConfiguredTestData } from '../src/data/test-data';
import { NetworkMonitor } from '../src/diagnostics/network-monitor';

test('Insight can be created and updated without server errors', async ({ page }) => {
  test.setTimeout(180_000);
  expect(
    getEnvironmentConfig().name,
    'Production execution is disabled for the Insight write test',
  ).not.toBe('production');
  const data = generateConfiguredTestData(insightConfig);
  expect(data.createValues.title.startsWith(AUTOMATED_CONTENT_PREFIX)).toBe(true);
  expect(data.updateValues.title.startsWith(AUTOMATED_CONTENT_PREFIX)).toBe(true);
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  try {
    const result = await new ContentTypeRunner().run({
      page,
      config: insightConfig,
      data,
      monitor,
    });
    expect(result.updated.nodeId).toBe(result.created.nodeId);
    expect(result.created.mediaId).toBe(AUTOMATED_IMAGE_MEDIA_ID);
    expect(result.updated.mediaId).toBe(AUTOMATED_IMAGE_MEDIA_ID);
    expect(result.created.referenceIds?.Author).toBe(AUTOMATED_AUTHOR_NODE_ID);
    expect(result.updated.referenceIds?.Author).toBe(AUTOMATED_AUTHOR_NODE_ID);
    expect(result.updated.title).toBe(data.updateValues.title);
    expect(result.updated.moderation?.moderationStateUsed).toMatch(/draft|unpublished/i);
    monitor.assertNoServerErrors();

    console.log(
      `Insight CRUD result: ${JSON.stringify({
        generatedTitle: data.createValues.title,
        generatedFormattedText: data.createValues.formattedText,
        moderationStateUsed: result.created.moderation?.moderationStateUsed,
        nodeId: result.created.nodeId,
        nodeUrl: result.created.nodeUrl,
        mediaId: result.created.mediaId,
        authorNodeId: result.created.referenceIds?.Author,
        updatedTitle: result.updated.title,
        updatedFormattedText: data.updateValues.formattedText,
        updatedNodeUrl: result.updated.nodeUrl,
        serverErrors: monitor.getServerErrors().length,
      })}`,
    );
  } finally {
    monitor.stop();
  }
});
