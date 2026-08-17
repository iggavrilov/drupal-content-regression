import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { contentTypes } from '../src/config/content-types';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import {
  assertNoDrupalFatalPage,
  NetworkMonitor,
} from '../src/diagnostics/network-monitor';
import { inspectOwnedNodeModeration } from '../src/publishing/moderation-workflow';
import { loadPublishingSourceNodes } from '../src/publishing/source-nodes';

test('publishing transitions can be inspected without changing moderation', async ({
  page,
}) => {
  test.setTimeout(180_000);
  assertExplicitNonProductionEnvironment();
  const sources = loadPublishingSourceNodes();
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  try {
    const results = [];
    for (const source of sources) {
      const config = contentTypes.find(
        (candidate) => candidate.machineName === source.machineName,
      );
      expect(config, `Expected configuration for ${source.machineName}`).toBeDefined();
      const inspection = await inspectOwnedNodeModeration(
        page,
        config!,
        source,
        'Draft',
      );
      monitor.assertNoServerErrors();
      await assertNoDrupalFatalPage(page);
      results.push({
        machineName: source.machineName,
        label: source.label,
        nodeId: source.nodeId,
        currentState: inspection.currentState,
        availableTransitions: inspection.options
          .filter((option) => !option.disabled && !option.selected)
          .map(({ label, value }) => ({ label, value })),
      });
    }
    console.log(`Publishing workflow discovery: ${JSON.stringify(results)}`);
  } finally {
    monitor.stop();
  }
});
