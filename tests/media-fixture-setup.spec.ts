import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import {
  findAutomationMedia,
  openImageMediaLibrary,
  resolveAutomationImageFixture,
  uploadAutomationImageFixture,
  type CreatedMediaFixture,
} from '../src/content/media/media-library';
import {
  AUTOMATED_IMAGE_MEDIA_ID,
  AUTOMATED_IMAGE_MEDIA_NAME,
} from '../src/config/automation';
import {
  getEnvironmentConfig,
  getRequiredEnvironmentVariable,
} from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import {
  assertNoDrupalFatalPage,
  NetworkMonitor,
} from '../src/diagnostics/network-monitor';

test('QA automated Image media fixture exists and can be resolved', async ({ page }) => {
  test.setTimeout(180_000);
  expect(assertExplicitNonProductionEnvironment()).toBe('develop');
  expect(getEnvironmentConfig().name).not.toBe('production');
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  try {
    const response = await page.goto('/node/add/insight_external', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBeLessThan(400);
    let dialog = await openImageMediaLibrary(page);
    const before = await findAutomationMedia(
      page,
      dialog,
      AUTOMATED_IMAGE_MEDIA_NAME,
    );
    expect(
      before.length,
      'Refusing ambiguous automation media fixtures',
    ).toBeLessThanOrEqual(1);

    let created = false;
    let creationDetails: CreatedMediaFixture | undefined;
    if (before.length === 0) {
      creationDetails = await uploadAutomationImageFixture(page, dialog);
      created = true;
      await page.goto('/node/add/insight_external', {
        waitUntil: 'domcontentloaded',
      });
      dialog = await openImageMediaLibrary(page);
    }

    const resolved = await resolveAutomationImageFixture(page, dialog);
    if (created) {
      expect(created).toBe(true);
      expect(resolved.id).toBe(creationDetails?.mediaId);
    } else {
      expect(AUTOMATED_IMAGE_MEDIA_ID).not.toBe('');
      expect(resolved.id).toBe(AUTOMATED_IMAGE_MEDIA_ID);
    }
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
    console.log(
      `Media fixture setup result: ${JSON.stringify({
        mediaName: AUTOMATED_IMAGE_MEDIA_NAME,
        existedBeforeSetup: before.length === 1,
        created,
        mediaId: resolved.id,
        checkboxName: resolved.checkboxName,
        duplicateCount: 0,
        metadataControls: creationDetails?.metadataControls,
        valuesPopulated: creationDetails?.valuesPopulated,
        mediaEditUrl: creationDetails?.mediaEditUrl,
        published: creationDetails?.published,
        serverErrors: monitor.getServerErrors().length,
        fatalPageDetected: false,
      })}`,
    );
  } finally {
    monitor.stop();
  }
});
