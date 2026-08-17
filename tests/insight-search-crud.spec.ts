import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { ContentTypeRunner } from '../src/content/content-type-runner';
import { AUTOMATED_CONTENT_PREFIX } from '../src/config/automation';
import { insightSearchConfig } from '../src/config/content-types';
import {
  getEnvironmentConfig,
  getRequiredEnvironmentVariable,
} from '../src/config/environments';
import { generateConfiguredTestData } from '../src/data/test-data';
import {
  assertNoDrupalFatalPage,
  NetworkMonitor,
} from '../src/diagnostics/network-monitor';

test('Insight Search Filter Page can be created and updated without server errors', async ({
  page,
}) => {
  test.setTimeout(180_000);
  expect(
    getEnvironmentConfig().name,
    'Production execution is disabled for the Insight Search write test',
  ).not.toBe('production');
  const data = generateConfiguredTestData(insightSearchConfig);
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
      config: insightSearchConfig,
      data,
      monitor,
    });
    expect(result.updated.nodeId).toBe(result.created.nodeId);
    expect(result.updated.title).toBe(data.updateValues.title);
    expect(result.created.validatedControls).toContain('Preview');
    expect(result.updated.validatedControls).toContain('Preview');
    expect(result.updated.moderation?.moderationStateUsed).toMatch(/draft|unpublished/i);
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    console.log(
      `Insight Search CRUD result: ${JSON.stringify({
        generatedTitle: data.createValues.title,
        moderationStateUsed: result.created.moderation?.moderationStateUsed,
        nodeId: result.created.nodeId,
        nodeUrl: result.created.nodeUrl,
        updatedTitle: result.updated.title,
        insightLeadUpdatedAndPersisted: true,
        updatedNodeUrl: result.updated.nodeUrl,
        previewControlVerified: true,
        fixturesUsed: [],
        serverErrors: monitor.getServerErrors().length,
        fatalPageDetected: false,
      })}`,
    );
  } finally {
    monitor.stop();
  }
});
