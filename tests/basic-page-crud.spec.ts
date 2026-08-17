import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { ContentTypeRunner } from '../src/content/content-type-runner';
import { AUTOMATED_CONTENT_PREFIX } from '../src/config/automation';
import { basicPageConfig } from '../src/config/content-types';
import {
  getEnvironmentConfig,
  getRequiredEnvironmentVariable,
} from '../src/config/environments';
import { generateConfiguredTestData } from '../src/data/test-data';
import { NetworkMonitor } from '../src/diagnostics/network-monitor';

test('Basic page can be created and updated without server errors', async ({
  page,
}) => {
  const environment = getEnvironmentConfig();
  expect(
    environment.name,
    'Production execution is disabled for the Basic page write test',
  ).not.toBe('production');
  getRequiredEnvironmentVariable('DRUPAL_BASE_URL');
  const username = getRequiredEnvironmentVariable('DRUPAL_USERNAME');
  const password = getRequiredEnvironmentVariable('DRUPAL_PASSWORD');
  const data = generateConfiguredTestData(basicPageConfig);
  expect(data.createValues.title.startsWith(AUTOMATED_CONTENT_PREFIX)).toBe(true);
  expect(data.updateValues.title.startsWith(AUTOMATED_CONTENT_PREFIX)).toBe(true);

  await loginToDrupal(page, { username, password });
  const monitor = new NetworkMonitor();
  monitor.start(page);

  try {
    const result = await new ContentTypeRunner().run({
      page,
      config: basicPageConfig,
      data,
      monitor,
    });

    expect(result.updated.nodeId).toBe(result.created.nodeId);
    expect(result.updated.title).toBe(data.updateValues.title);
    monitor.assertNoServerErrors();

    console.log(
      `Basic page CRUD result: ${JSON.stringify({
        generatedTitle: data.createValues.title,
        validatedDefaults: result.created.validatedDefaults,
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
