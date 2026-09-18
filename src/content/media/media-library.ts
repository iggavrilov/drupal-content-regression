import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import {
  AUTOMATED_CONTENT_PREFIX,
  AUTOMATED_IMAGE_FIXTURE,
  AUTOMATED_IMAGE_MEDIA_NAME,
} from '../../config/automation';

const DIALOG_SELECTOR = '[role="dialog"], .ui-dialog';

export interface AutomationMediaMatch {
  id: string;
  name: string;
  checkboxName: string;
}

export interface MediaMetadataControl {
  label?: string;
  name?: string;
  type: string;
  required: boolean;
  valuePresent: boolean;
}

export interface CreatedMediaFixture {
  metadataControls: readonly MediaMetadataControl[];
  valuesPopulated: readonly string[];
  mediaId: string;
  mediaEditUrl: string;
  published: boolean | undefined;
}

export async function openImageMediaLibrary(page: Page): Promise<Locator> {
  const trigger = page.locator(
    'input[name="field_media_image-media-library-open-button"]',
  );
  if ((await trigger.count()) !== 1) {
    throw new Error('Image Media Library trigger was not found uniquely.');
  }
  await trigger.click();
  let dialog = await visibleMediaDialog(page);
  const skip = dialog.getByRole('link', { name: 'Skip', exact: true });
  if (await skip.isVisible()) {
    await skip.click();
    dialog = await visibleMediaDialog(page);
  }
  const source = dialog.locator('select:has(option[value="core"])').first();
  if ((await source.count()) === 1 && (await source.inputValue()) !== 'core') {
    await source.selectOption('core');
    dialog = await visibleMediaDialog(page);
  }
  const selectedSource = dialog.locator(
    'select:has(option[value="core"]):has(option:checked[value="core"])',
  );
  if ((await selectedSource.count()) !== 1) {
    throw new Error('Media Types/core could not be established as the Media Library source.');
  }
  return dialog;
}

export async function findAutomationMedia(
  page: Page,
  dialog: Locator,
  exactName: string,
): Promise<AutomationMediaMatch[]> {
  if (
    exactName !== AUTOMATED_IMAGE_MEDIA_NAME &&
    !exactName.startsWith(AUTOMATED_CONTENT_PREFIX)
  ) {
    throw new Error(`Refusing to resolve media without ${AUTOMATED_CONTENT_PREFIX} ownership.`);
  }
  return findExactMedia(page, dialog, exactName);
}

export async function findUploadedFixtureRecoveryMedia(
  page: Page,
  dialog: Locator,
): Promise<AutomationMediaMatch[]> {
  return findExactMedia(
    page,
    dialog,
    path.basename(AUTOMATED_IMAGE_FIXTURE),
  );
}

async function findExactMedia(
  page: Page,
  dialog: Locator,
  exactName: string,
): Promise<AutomationMediaMatch[]> {
  const filter = dialog
    .getByRole('textbox', { name: /^(?:Name|Search)$/ })
    .filter({ visible: true });
  if ((await filter.count()) !== 1 || !(await filter.isVisible())) {
    throw new Error('Media Library exact-name filter was not found uniquely.');
  }
  await filter.fill(exactName);
  await applyMediaFilters(page, dialog);

  const matches = new Map<string, AutomationMediaMatch>();
  const seenPageSignatures = new Set<string>();
  let pagesInspected = 0;
  for (;;) {
    pagesInspected += 1;
    if (pagesInspected > 20) {
      throw new Error('Media Library exact-name search exceeded the safe pagination limit.');
    }
    const currentDialog = await visibleMediaDialog(page);
    const checkboxes = currentDialog.locator(
      'input[type="checkbox"][name^="media_library_select_form["]',
    );
    const pageSignature = (await checkboxes.evaluateAll((elements) => elements.map((element) => element.getAttribute('name') ?? '').join('|')));
    if (seenPageSignatures.has(pageSignature)) break;
    seenPageSignatures.add(pageSignature);
    for (let index = 0; index < (await checkboxes.count()); index += 1) {
      const checkbox = checkboxes.nth(index);
      const checkboxName = await checkbox.getAttribute('name');
      const labelText = await checkboxAccessibleName(currentDialog, checkbox);
      const displayedName = labelText.replace(/^Select\s+/i, '').trim();
      const idMatch = checkboxName?.match(/^media_library_select_form\[(\d+)\]$/);
      if (displayedName === exactName && idMatch && checkboxName) {
        matches.set(idMatch[1], {
          id: idMatch[1],
          name: displayedName,
          checkboxName,
        });
      }
    }
    const next = currentDialog.getByRole('link', { name: /next page/i }).first();
    if (!(await next.isVisible())) break;
    const disabled = await next.evaluate((element) => element.getAttribute('aria-disabled') === 'true' || Boolean(element.closest('.is-disabled, [aria-disabled="true"]')));
    if (disabled) break;
    await next.click();
    await page.waitForTimeout(750);
  }
  return [...matches.values()];
}

export async function resolveAutomationImageFixture(
  page: Page,
  dialog: Locator,
): Promise<AutomationMediaMatch> {
  const matches = await findAutomationMedia(
    page,
    dialog,
    AUTOMATED_IMAGE_MEDIA_NAME,
  );
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? 'Automation Image fixture is missing. Run npm run setup:media.'
        : `Automation Image fixture is ambiguous: found ${matches.length} exact matches.`,
    );
  }
  return matches[0];
}

export async function selectAutomationImageFixture(
  page: Page,
  expectedId: string,
): Promise<AutomationMediaMatch> {
  const dialog = await openImageMediaLibrary(page);
  const media = await resolveAutomationImageFixture(page, dialog);
  if (media.id !== expectedId) {
    throw new Error(
      `Automation Image fixture resolved to media ${media.id}, expected ${expectedId}.`,
    );
  }
  const checkbox = dialog.locator(`input[name="${media.checkboxName}"]`);
  if ((await checkbox.count()) !== 1) {
    throw new Error(`Automation media ${media.id} checkbox was not found uniquely.`);
  }
  await checkbox.check();
  const insert = dialog
    .getByRole('button', { name: 'Insert selected', exact: true })
    .filter({ visible: true });
  if ((await insert.count()) !== 1) {
    throw new Error('Media Library Insert selected control was not found uniquely.');
  }
  await insert.click();
  await page.locator(DIALOG_SELECTOR).filter({ visible: true }).waitFor({
    state: 'hidden',
  }).catch(() => undefined);
  return media;
}

export async function selectAutomationImageFixtureFromTrigger(
  page: Page,
  trigger: Locator,
  expectedId: string,
): Promise<AutomationMediaMatch> {
  if ((await trigger.count()) !== 1 || !(await trigger.isVisible()) || !(await trigger.isEnabled())) {
    throw new Error('Paragraph Image Media Library trigger was not uniquely visible and enabled.');
  }
  await trigger.click();
  const dialog = await visibleMediaDialog(page);
  const media = await resolveAutomationImageFixture(page, dialog);
  if (media.id !== expectedId) {
    throw new Error(`Automation Image fixture resolved to media ${media.id}, expected ${expectedId}.`);
  }
  const checkbox = dialog.locator(`input[name="${media.checkboxName}"]`);
  if ((await checkbox.count()) !== 1) throw new Error(`Automation media ${media.id} checkbox was not found uniquely.`);
  await checkbox.check();
  const insert = dialog.getByRole('button', { name: 'Insert selected', exact: true }).filter({ visible: true });
  if ((await insert.count()) !== 1) throw new Error('Media Library Insert selected control was not found uniquely.');
  await insert.click();
  await expect(page.locator(DIALOG_SELECTOR).filter({ visible: true })).toHaveCount(0, { timeout: 15_000 });
  return media;
}

export async function assertSelectedMediaFixture(
  form: Locator,
  selectionSelector: string,
  expectedId: string,
  label: string,
): Promise<void> {
  const selection = form.locator(selectionSelector);
  await selection.first().waitFor({ state: 'attached', timeout: 15_000 });
  if ((await selection.count()) !== 1) {
    throw new Error(`${label} media selection was not found uniquely.`);
  }
  const value = await selection.inputValue();
  const ids = value.match(/\d+/g) ?? [];
  if (ids.length !== 1 || ids[0] !== expectedId) {
    throw new Error(
      `${label} media selection did not reference exact media ${expectedId}.`,
    );
  }
}

export async function verifyAutomationImageFixture(
  page: Page,
  expectedId: string,
  expectedName: string,
): Promise<void> {
  if (
    expectedName !== AUTOMATED_IMAGE_MEDIA_NAME ||
    !/^\d+$/.test(expectedId)
  ) {
    throw new Error('Refusing to verify an unrecognized Image media fixture.');
  }
  const response = await page.goto(`/media/${expectedId}/edit`, {
    waitUntil: 'domcontentloaded',
  });
  if (!response || response.status() >= 400) {
    throw new Error(
      `Image media fixture ${expectedId} failed to load with HTTP ${response?.status() ?? 'unknown'}.`,
    );
  }
  const exactHeadings = page
    .locator('h1')
    .filter({ hasText: expectedName });
  const headingMatches = await exactHeadings.evaluateAll(
    (elements, expected) =>
      elements.filter(
        (element) =>
          element.textContent?.replace(/\s+/g, ' ').trim() === expected,
      ).length,
    `Edit Image ${expectedName}`,
  );
  if (headingMatches !== 1) {
    throw new Error(
      `Image media fixture ${expectedId} ownership could not be proven exactly.`,
    );
  }
}

export async function uploadAutomationImageFixture(
  page: Page,
  dialog: Locator,
): Promise<CreatedMediaFixture> {
  const upload = dialog.locator('input[name="files[upload]"]');
  if ((await upload.count()) !== 1) {
    throw new Error('Image upload control was not found uniquely.');
  }
  await upload.setInputFiles(
    path.resolve(process.cwd(), AUTOMATED_IMAGE_FIXTURE),
  );
  await page.waitForTimeout(1_500);
  const uploadDialog = await visibleMediaDialog(page);
  const metadataControls = await inspectMetadataControls(uploadDialog);
  const valuesPopulated: string[] = [];

  for (const metadata of metadataControls) {
    if (!metadata.name || metadata.valuePresent) continue;
    const control = uploadDialog.locator(
      `[name="${cssAttributeEscape(metadata.name)}"]`,
    );
    if (/\b(name|media name)\b/i.test(metadata.label ?? '') && metadata.type === 'text') {
      await control.fill(AUTOMATED_IMAGE_MEDIA_NAME);
      valuesPopulated.push(metadata.label ?? metadata.name);
      continue;
    }
    if (/\b(alt|alternative text)\b/i.test(metadata.label ?? '') && metadata.type === 'text') {
      await control.fill('QA automated regression test image');
      valuesPopulated.push(metadata.label ?? metadata.name);
      continue;
    }
    if (metadata.required && ['text', 'textarea'].includes(metadata.type)) {
      await control.fill('QA automated regression test image');
      valuesPopulated.push(metadata.label ?? metadata.name);
      continue;
    }
    if (metadata.required) {
      throw new Error(
        `Cannot safely create automation media: required ${metadata.label ?? metadata.name} has no proven safe value.`,
      );
    }
  }

  const save = uploadDialog.getByRole('button', { name: 'Save', exact: true }).or(
    uploadDialog.locator('input[type="submit"][value*="Save" i]'),
  ).filter({ visible: true });
  if ((await save.count()) === 0) {
    const autoSelected = uploadDialog.locator(
      'input[type="checkbox"][name^="media_library_select_form["]:checked',
    );
    if ((await autoSelected.count()) === 1) {
      const checkbox = autoSelected.first();
      const label = (await checkboxAccessibleName(uploadDialog, checkbox))
        .replace(/^Select\s+/i, '')
        .trim();
      const checkboxName = await checkbox.getAttribute('name');
      const idMatch = checkboxName?.match(/^media_library_select_form\[(\d+)\]$/);
      if (label === AUTOMATED_IMAGE_MEDIA_NAME && idMatch) {
        return {
          metadataControls,
          valuesPopulated,
          mediaId: idMatch[1],
          mediaEditUrl: `/media/${idMatch[1]}/edit`,
          published: true,
        };
      }
    }
  }
  if ((await save.count()) !== 1 || !(await save.isVisible())) {
    throw new Error('Media creation Save control was not found uniquely.');
  }
  await save.click();
  await page.waitForTimeout(1_500);
  const createdDialog = await visibleMediaDialog(page);
  const selected = createdDialog.locator(
    'input[type="checkbox"][name^="media_library_select_form["]:checked',
  );
  if ((await selected.count()) !== 1) {
    throw new Error(
      'Media may have been created, but its selected checkbox could not be recovered uniquely.',
    );
  }
  const checkboxName = await selected.getAttribute('name');
  const idMatch = checkboxName?.match(/^media_library_select_form\[(\d+)\]$/);
  if (!idMatch) {
    throw new Error('Created media ID could not be recovered safely.');
  }
  const mediaId = idMatch[1];
  return {
    metadataControls,
    valuesPopulated,
    mediaId,
    mediaEditUrl: `/media/${mediaId}/edit`,
    published: true,
  };
}

export async function closeMediaLibrary(page: Page): Promise<void> {
  const dialog = await visibleMediaDialog(page);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
}

async function visibleMediaDialog(page: Page): Promise<Locator> {
  const dialog = page.locator(DIALOG_SELECTOR).filter({ visible: true }).last();
  await dialog.waitFor({ state: 'visible' });
  return dialog;
}

async function applyMediaFilters(page: Page, dialog: Locator): Promise<void> {
  const apply = dialog.getByRole('button', { name: /^(?:Apply filters|Apply)$/ }).or(
    dialog.locator('input[type="submit"][value="Apply filters"], input[type="submit"][value="Apply"]'),
  ).filter({ visible: true });
  if ((await apply.count()) !== 1) {
    throw new Error('Media Library Apply filters control was not found uniquely.');
  }
  await apply.click();
  await page.waitForTimeout(750);
}

async function checkboxAccessibleName(
  _dialog: Locator,
  checkbox: Locator,
): Promise<string> {
  return checkbox.evaluate((element) => {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    const id = element.getAttribute('id');
    if (!id) return '';
    return element.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent ?? '';
  });
}

async function inspectMetadataControls(
  dialog: Locator,
): Promise<MediaMetadataControl[]> {
  return dialog.locator('input, textarea, select').evaluateAll((elements) =>
    elements.filter((element) => {
      const input = element as HTMLInputElement;
      return (
        Boolean(input.offsetWidth || input.offsetHeight) &&
        !['hidden', 'file', 'submit', 'button'].includes(input.type)
      );
    }).map((element) => {
      const input = element as HTMLInputElement;
      const label =
        element.getAttribute('aria-label') ||
        (element.id
          ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
              ?.textContent
          : undefined) ||
        element.closest('.form-item, .form-wrapper')?.querySelector('label')
          ?.textContent ||
        undefined;
      const required =
        element.hasAttribute('required') ||
        element.getAttribute('aria-required') === 'true' ||
        Boolean(
          element
            .closest('.form-item, .form-wrapper')
            ?.querySelector('label.form-required, label.js-form-required'),
        );
      const valuePresent =
        element instanceof HTMLSelectElement
          ? Boolean(element.value && element.value !== '_none')
          : ['checkbox', 'radio'].includes(input.type)
            ? input.checked
            : Boolean(input.value.trim());
      return {
        label: label?.replace(/\s+/g, ' ').trim(),
        name: input.name || undefined,
        type:
          element instanceof HTMLTextAreaElement ? 'textarea' : input.type,
        required,
        valuePresent,
      };
    }),
  );
}

function cssAttributeEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
