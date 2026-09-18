import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { AUTOMATED_CONTENT_PREFIX } from '../src/config/automation';
import { contentTypes } from '../src/config/content-types';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { readConfiguredField } from '../src/content/field-handlers';
import { inspectOwnedNodeModeration } from '../src/publishing/moderation-workflow';

test('verify exact updated current-run content without creating content', async ({ page }) => {
  test.setTimeout(180_000);
  assertExplicitNonProductionEnvironment();
  const machineName = getRequiredEnvironmentVariable('CURRENT_RUN_MACHINE_NAME');
  const nodeId = getRequiredEnvironmentVariable('CURRENT_RUN_NODE_ID');
  const runId = getRequiredEnvironmentVariable('CURRENT_RUN_ID');
  const config = contentTypes.find((candidate) => candidate.machineName === machineName);
  expect(config, `Supported content type ${machineName}`).toBeDefined();
  expect(nodeId).toMatch(/^\d+$/);
  const title = `${AUTOMATED_CONTENT_PREFIX}${config!.testData.titleSegment}-${runId}-UPDATED`;

  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const response = await page.goto(`/node/${nodeId}/edit`, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(400);
  const form = page.locator(config!.formSelector);
  expect(await form.count()).toBe(1);
  expect(await readConfiguredField(form, config!.titleField)).toBe(title);
  for (const field of config!.fields.filter(
    (candidate) => candidate.verifyPersisted && candidate.key !== config!.titleField.key,
  )) {
    const expected = config!.testData.values[field.key]?.update.replaceAll('{runId}', runId);
    expect(expected, `Expected update value for ${field.label}`).toBeDefined();
    expect(await readConfiguredField(form, field)).toBe(expected);
  }
  await inspectOwnedNodeModeration(
    page,
    config!,
    {
      machineName: config!.machineName,
      label: config!.label,
      nodeId: Number(nodeId),
      title,
      moderation: 'Draft',
    },
    'Draft',
  );
  console.log(`CURRENT_RUN_VERIFICATION ${JSON.stringify({ machineName, nodeId, title, updated: true, state: 'Draft', nodesCreated: 0 })}`);
});
