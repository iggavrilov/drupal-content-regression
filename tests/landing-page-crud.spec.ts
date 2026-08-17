import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { ContentTypeRunner } from '../src/content/content-type-runner';
import { AUTOMATED_CONTENT_PREFIX } from '../src/config/automation';
import { landingPageConfig } from '../src/config/content-types';
import {
  getEnvironmentConfig,
  getRequiredEnvironmentVariable,
} from '../src/config/environments';
import { generateConfiguredTestData } from '../src/data/test-data';
import { NetworkMonitor } from '../src/diagnostics/network-monitor';

test('Landing page can be created and updated without server errors', async ({
  page,
}) => {
  expect(
    getEnvironmentConfig().name,
    'Production execution is disabled for the Landing page write test',
  ).not.toBe('production');
  getRequiredEnvironmentVariable('DRUPAL_BASE_URL');
  const username = getRequiredEnvironmentVariable('DRUPAL_USERNAME');
  const password = getRequiredEnvironmentVariable('DRUPAL_PASSWORD');
  const data = generateConfiguredTestData(landingPageConfig);
  expect(data.createValues.title.startsWith(AUTOMATED_CONTENT_PREFIX)).toBe(true);
  expect(data.updateValues.title.startsWith(AUTOMATED_CONTENT_PREFIX)).toBe(true);

  await loginToDrupal(page, { username, password });
  const monitor = new NetworkMonitor();
  monitor.start(page);

  try {
    const result = await new ContentTypeRunner().run({
      page,
      config: landingPageConfig,
      data,
      monitor,
    });

    expect(result.updated.nodeId).toBe(result.created.nodeId);
    expect(result.updated.title).toBe(data.updateValues.title);
    expect(result.updated.moderation?.moderationStateUsed).toMatch(/draft|unpublished/i);
    monitor.assertNoServerErrors();

    console.log(
      `Landing page CRUD result: ${JSON.stringify({
        generatedTitle: data.createValues.title,
        moderationStates: result.created.moderation?.moderationStates,
        moderationStateUsed: result.created.moderation?.moderationStateUsed,
        nodeId: result.created.nodeId,
        nodeUrl: result.created.nodeUrl,
        updatedTitle: result.updated.title,
        updatedNodeUrl: result.updated.nodeUrl,
        skippedOptionalFields: result.updated.skippedOptionalFields,
        serverErrors: monitor.getServerErrors().length,
      })}`,
    );
  } finally {
    monitor.stop();
  }
});
