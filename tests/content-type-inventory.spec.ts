import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { inventoryContentTypeForm } from '../src/content/content-type-inventory';
import { discoverContentTypes } from '../src/content/discover-content-types';
import {
  getEnvironmentConfig,
  getRequiredEnvironmentVariable,
} from '../src/config/environments';
import {
  detectDrupalFatalPage,
  NetworkMonitor,
} from '../src/diagnostics/network-monitor';

test('All Drupal content-type forms can be inspected without server errors', async ({
  page,
}) => {
  test.setTimeout(180_000);
  expect(getEnvironmentConfig().name).not.toBe('production');
  getRequiredEnvironmentVariable('DRUPAL_BASE_URL');
  const username = getRequiredEnvironmentVariable('DRUPAL_USERNAME');
  const password = getRequiredEnvironmentVariable('DRUPAL_PASSWORD');
  await loginToDrupal(page, { username, password });

  const discoveryResponse = await page.goto('/node/add', {
    waitUntil: 'domcontentloaded',
  });
  expect(discoveryResponse?.status()).toBeLessThan(400);
  const contentTypes = await discoverContentTypes(page);
  expect(contentTypes.length, 'Expected at least one Drupal content type').toBeGreaterThan(0);

  const inventory = [];
  for (const contentType of contentTypes) {
    const monitor = new NetworkMonitor();
    monitor.start(page);

    try {
      const response = await page.goto(contentType.href, {
        waitUntil: 'domcontentloaded',
      });
      expect(
        response?.status(),
        `Expected ${contentType.href} to load successfully`,
      ).toBeLessThan(400);

      const fatalPage = await detectDrupalFatalPage(page);
      const serverErrors = monitor.getServerErrors();
      expect(
        serverErrors,
        `Expected no HTTP 500–505 responses for ${contentType.machineName}`,
      ).toHaveLength(0);
      expect(
        fatalPage.detected,
        `Expected no Drupal fatal page for ${contentType.machineName}`,
      ).toBe(false);

      inventory.push(
        await inventoryContentTypeForm(
          page,
          contentType,
          serverErrors,
          fatalPage.detected,
        ),
      );
    } finally {
      monitor.stop();
    }
  }

  const artifactDirectory = path.resolve(process.cwd(), 'test-results');
  const artifactPath = path.join(
    artifactDirectory,
    'content-type-inventory.json',
  );
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');

  console.log(
    `Content type inventory summary: ${JSON.stringify(
      inventory.map((item) => ({
        label: item.label,
        machineName: item.machineName,
        complexity: item.complexity,
        visibleRequiredFields: item.visibleRequiredFields.map(
          (field) => field.label ?? field.name,
        ),
        hiddenRequiredFields: item.hiddenRequiredFields.map((field) => ({
          field: field.label ?? field.name,
          hasValidSelectedDefault: field.hasValidSelectedDefault,
        })),
        ckeditorFields: item.editors
          .filter((editor) => editor.implementation === 'ckeditor5')
          .map((editor) => ({
            fieldName: editor.fieldName,
            ownedEditableResolved: editor.ownedEditableResolved,
          })),
        paragraphsDetected: item.paragraphs.detected,
        paragraphAddControls: item.paragraphs.addControls,
        mediaEntityReferenceFields: item.mediaEntityReferenceFields.map(
          (field) => ({
            field: field.label ?? field.name,
            widgetType: field.widgetType,
          }),
        ),
        moderationStates: item.moderationStates,
        nodeSaveControls: item.nodeSaveControls.map(
          (control) => control.label ?? control.name,
        ),
        serverErrors: item.serverErrors.length,
        fatalPageDetected: item.fatalPageDetected,
      })),
    )}`,
  );
  console.log(`Inventory artifact: ${artifactPath}`);
});
