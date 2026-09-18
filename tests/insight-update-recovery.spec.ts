import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { ContentTypeRunner } from '../src/content/content-type-runner';
import { verifyEntityReferenceFixture } from '../src/content/field-handlers/entity-reference-field';
import { verifyAutomationImageFixture } from '../src/content/media/media-library';
import {
  AUTOMATED_AUTHOR_NODE_ID,
  AUTOMATED_CONTENT_PREFIX,
  AUTOMATED_IMAGE_MEDIA_ID,
  AUTOMATED_IMAGE_MEDIA_NAME,
} from '../src/config/automation';
import { insightConfig } from '../src/config/content-types';
import {
  getEnvironmentConfig,
  getRequiredEnvironmentVariable,
} from '../src/config/environments';
import type { ContentTypeTestData } from '../src/data/test-data';
import {
  assertNoDrupalFatalPage,
  NetworkMonitor,
} from '../src/diagnostics/network-monitor';

const NODE_ID = '24961';
const RUN_ID = '20260817-142458-f67e';
const ORIGINAL_TITLE = `${AUTOMATED_CONTENT_PREFIX}Insight-${RUN_ID}`;
const UPDATED_TITLE = `${ORIGINAL_TITLE}-UPDATED`;
const ORIGINAL_TEXT = `Automated Drupal Insight regression content. Run: ${RUN_ID}`;
const UPDATED_TEXT = `Automated Drupal Insight regression content updated. Run: ${RUN_ID}`;

const recoveryData: ContentTypeTestData = {
  runId: RUN_ID,
  createValues: {
    title: ORIGINAL_TITLE,
    formattedText: ORIGINAL_TEXT,
  },
  updateValues: {
    title: UPDATED_TITLE,
    formattedText: UPDATED_TEXT,
  },
};

test('existing Insight 24961 can be updated without creating content', async ({ page }) => {
  test.skip(true, 'Historical recovery target 24961 is no longer automation-owned on DEVV.');
  test.setTimeout(180_000);
  expect(
    getEnvironmentConfig().name,
    'Production execution is disabled for the Insight recovery update',
  ).not.toBe('production');

  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  try {
    await verifyAutomationImageFixture(
      page,
      AUTOMATED_IMAGE_MEDIA_ID,
      AUTOMATED_IMAGE_MEDIA_NAME,
    );
    for (const reference of insightConfig.requiredEntityReferences ?? []) {
      await verifyEntityReferenceFixture(page, reference);
    }
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    const updated = await new ContentTypeRunner().update(
      {
        page,
        config: insightConfig,
        data: recoveryData,
        monitor,
      },
      NODE_ID,
    );

    expect(updated.nodeId).toBe(NODE_ID);
    expect(updated.title).toBe(UPDATED_TITLE);
    expect(updated.mediaId).toBe(AUTOMATED_IMAGE_MEDIA_ID);
    expect(updated.referenceIds?.Author).toBe(AUTOMATED_AUTHOR_NODE_ID);
    expect(updated.moderation?.moderationStateUsed).toMatch(/draft|unpublished/i);
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    console.log(
      `Insight update recovery result: ${JSON.stringify({
        nodeId: updated.nodeId,
        originalTitleVerified: true,
        originalFormattedTextVerified: true,
        updatedTitle: updated.title,
        formattedTextUpdatedAndPersisted: true,
        mediaId: updated.mediaId,
        authorNodeId: updated.referenceIds?.Author,
        moderationStateUsed: updated.moderation?.moderationStateUsed,
        serverErrors: monitor.getServerErrors().length,
        fatalPageDetected: false,
        nodesCreated: 0,
      })}`,
    );
  } finally {
    monitor.stop();
  }
});
