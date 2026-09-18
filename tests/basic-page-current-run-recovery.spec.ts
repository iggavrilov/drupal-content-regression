import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { AUTOMATED_CONTENT_PREFIX } from '../src/config/automation';
import { basicPageConfig } from '../src/config/content-types';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { readConfiguredField } from '../src/content/field-handlers';
import { ContentTypeRunner } from '../src/content/content-type-runner';
import { NetworkMonitor } from '../src/diagnostics/network-monitor';
import { inspectOwnedNodeModeration } from '../src/publishing/moderation-workflow';

test('recover exact current-run Basic page update without creating content', async ({ page }) => {
  test.setTimeout(180_000);
  assertExplicitNonProductionEnvironment();
  const nodeId = getRequiredEnvironmentVariable('CURRENT_RUN_BASIC_NODE_ID');
  const runId = getRequiredEnvironmentVariable('CURRENT_RUN_BASIC_RUN_ID');
  expect(nodeId).toMatch(/^\d+$/);
  const originalTitle = `${AUTOMATED_CONTENT_PREFIX}Basic-Page-${runId}`;
  const updatedTitle = `${originalTitle}-UPDATED`;
  const originalBody = `Automated Drupal regression test content. Run: ${runId}`;
  const updatedBody = `Automated Drupal regression test content updated. Run: ${runId}`;
  const data = {
    runId,
    createValues: { title: originalTitle, body: originalBody },
    updateValues: { title: updatedTitle, body: updatedBody },
  };

  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  try {
    const response = await page.goto(`/node/${nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
    const form = page.locator(basicPageConfig.formSelector);
    expect(await form.count()).toBe(1);
    const currentTitle = await readConfiguredField(form, basicPageConfig.titleField);
    const currentBody = await readConfiguredField(form, basicPageConfig.fields[1]);

    if (currentTitle === originalTitle && currentBody === originalBody) {
      const updated = await new ContentTypeRunner().update(
        { page, config: basicPageConfig, data, monitor },
        nodeId,
      );
      expect(updated.nodeId).toBe(nodeId);
      expect(updated.title).toBe(updatedTitle);
    } else {
      expect(currentTitle).toBe(updatedTitle);
      expect(currentBody).toBe(updatedBody);
    }

    await inspectOwnedNodeModeration(
      page,
      basicPageConfig,
      {
        machineName: basicPageConfig.machineName,
        label: basicPageConfig.label,
        nodeId: Number(nodeId),
        title: updatedTitle,
        moderation: 'Draft',
      },
      'Draft',
    );
    monitor.assertNoServerErrors();
    console.log(`BASIC_PAGE_RECOVERY ${JSON.stringify({ nodeId, title: updatedTitle, updated: true, state: 'Draft', nodesCreated: 0 })}`);
  } finally {
    monitor.stop();
  }
});
