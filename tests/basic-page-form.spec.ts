import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { inspectContentForm } from '../src/content/inspect-content-form';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import {
  assertNoDrupalFatalPage,
  NetworkMonitor,
} from '../src/diagnostics/network-monitor';

test('Basic page creation form can be inspected without server errors', async ({
  page,
}) => {
  getRequiredEnvironmentVariable('DRUPAL_BASE_URL');
  const username = getRequiredEnvironmentVariable('DRUPAL_USERNAME');
  const password = getRequiredEnvironmentVariable('DRUPAL_PASSWORD');
  await loginToDrupal(page, { username, password });

  const monitor = new NetworkMonitor();
  monitor.start(page);

  try {
    const response = await page.goto('/node/add/page', {
      waitUntil: 'domcontentloaded',
    });
    expect(response, 'Expected a response for /node/add/page').not.toBeNull();
    expect(
      response?.status(),
      'Expected /node/add/page to load without an HTTP error',
    ).toBeLessThan(400);

    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    const inspection = await inspectContentForm(page);
    const titleField = inspection.fields.find(
      (field) => field.name === 'title[0][value]',
    );
    expect(titleField, 'Expected the standard Drupal title field').toBeDefined();
    expect(titleField?.visible).toBe(true);
    expect(titleField?.editable).toBe(true);

    console.log(
      `Basic page form inspection: ${JSON.stringify({
        formSelector: inspection.formSelector,
        visibleEditableFields: inspection.fields
          .filter((field) => field.visible && field.editable)
          .map(({ name, kind, type, label, selector, required, drupalWidget, widgetClues }) => ({
            name,
            kind,
            type,
            label,
            selector,
            required,
            drupalWidget,
            widgetClues,
          })),
        requiredFields: inspection.fields
          .filter((field) => field.required)
          .map(({ name, label, selector, visible, editable }) => ({
            name,
            label,
            selector,
            visible,
            editable,
          })),
        editors: inspection.editors,
        submitControls: inspection.submitControls,
      })}`,
    );

    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
  } finally {
    monitor.stop();
  }
});
