import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { contentTypes } from '../src/config/content-types';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import {
  assertNoDrupalFatalPage,
  NetworkMonitor,
} from '../src/diagnostics/network-monitor';
import { runPublishingWorkflow } from '../src/publishing/moderation-workflow';
import { loadPublishingSourceNodes } from '../src/publishing/source-nodes';

for (const config of contentTypes) {
  test(`[${config.machineName}] ${config.label} exact regression node can complete publishing workflow`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const source = loadPublishingSourceNodes().find(
      (candidate) => candidate.machineName === config.machineName,
    );
    expect(source, `Expected source node for ${config.machineName}`).toBeDefined();
    await loginToDrupal(page, {
      username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
      password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
    });
    const monitor = new NetworkMonitor();
    monitor.start(page);
    try {
      const result = await runPublishingWorkflow(
        page,
        monitor,
        config,
        source!,
      );
      if (result.status === 'blocked') {
        test.skip(true, result.blockedReason);
      }
      expect(result.finalState).toBe('Published');
      expect(result.publicPageLoaded).toBe(true);
      monitor.assertNoServerErrors();
      await assertNoDrupalFatalPage(page);
    } finally {
      monitor.stop();
    }
  });
}
