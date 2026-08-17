import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { ContentTypeRunner } from '../src/content/content-type-runner';
import { AUTOMATED_CONTENT_PREFIX } from '../src/config/automation';
import { authorConfig } from '../src/config/content-types';
import {
  getEnvironmentConfig,
  getRequiredEnvironmentVariable,
} from '../src/config/environments';
import { generateConfiguredTestData } from '../src/data/test-data';
import { NetworkMonitor } from '../src/diagnostics/network-monitor';

test('Author can be created and updated without server errors', async ({ page }) => {
  expect(
    getEnvironmentConfig().name,
    'Production execution is disabled for the Author write test',
  ).not.toBe('production');
  getRequiredEnvironmentVariable('DRUPAL_BASE_URL');
  const username = getRequiredEnvironmentVariable('DRUPAL_USERNAME');
  const password = getRequiredEnvironmentVariable('DRUPAL_PASSWORD');
  const data = generateConfiguredTestData(authorConfig);
  expect(data.createValues.title.startsWith(AUTOMATED_CONTENT_PREFIX)).toBe(true);
  expect(data.updateValues.title.startsWith(AUTOMATED_CONTENT_PREFIX)).toBe(true);

  await loginToDrupal(page, { username, password });
  const monitor = new NetworkMonitor();
  monitor.start(page);

  try {
    const result = await new ContentTypeRunner().run({
      page,
      config: authorConfig,
      data,
      monitor,
    });

    expect(result.updated.nodeId).toBe(result.created.nodeId);
    expect(result.updated.title).toBe(data.updateValues.title);
    expect(result.updated.skippedOptionalFields).not.toContain('Biography');
    expect(result.updated.moderation?.moderationStateUsed).toMatch(/draft|unpublished/i);
    monitor.assertNoServerErrors();

    console.log(
      `Author CRUD result: ${JSON.stringify({
        titleSelector: authorConfig.titleField.selector,
        biographySelector: authorConfig.fields.find(
          (field) => field.key === 'biography',
        )?.selector,
        mediaSelector: authorConfig.untouchedOptionalFields?.[0]?.selector,
        generatedAdministrativeTitle: data.createValues.title,
        generatedBiography: data.createValues.biography,
        imageMediaRequired: false,
        moderationStates: result.created.moderation?.moderationStates,
        moderationStateUsed: result.created.moderation?.moderationStateUsed,
        nodeId: result.created.nodeId,
        nodeUrl: result.created.nodeUrl,
        updatedAdministrativeTitle: result.updated.title,
        updatedBiography: data.updateValues.biography,
        biographyUpdatedAndVerified: true,
        updatedNodeUrl: result.updated.nodeUrl,
        serverErrors: monitor.getServerErrors().length,
      })}`,
    );
  } finally {
    monitor.stop();
  }
});
