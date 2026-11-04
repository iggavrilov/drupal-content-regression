import { activateOwnedParagraphEdit } from '../paragraphs/paragraph-safe-click';
import type { Page } from '@playwright/test';
import type { ParagraphCkEditorFieldConfig } from '../../config/content-types';
import { fillOwnedEditor, hasOwnedEditor, readOwnedEditor } from '../node-form';

function resolveParagraphEditorForm(page: Page) {
  return page.locator(
    'form.node-page-edit-form, form.node-page-form, form.node-form, form[id^="node-page-edit-form"], form[id^="node-page-form"], form[id^="node-form"], form[id^="node-"][id$="-form"]',
  ).filter({ visible: true }).first();
}

async function expandCollapsedParagraph(
  page: Page,
  field: ParagraphCkEditorFieldConfig,
): Promise<void> {
  const form = resolveParagraphEditorForm(page);
  if (await hasOwnedEditor(form, field.selector)) return;
  if (!field.collapsedEditSelector) return;

  const edit = form.locator(field.collapsedEditSelector);
  if ((await edit.count()) !== 1 || !(await edit.isVisible())) {
    throw new Error(
      `${field.label} is collapsed, but its configured Edit control was not found uniquely.`,
    );
  }
  await page.waitForFunction(name => Object.values((window as unknown as { Drupal?: { ajax?: { instances?: Record<string, { element?: HTMLElement }> } } }).Drupal?.ajax?.instances ?? {}).some(ajax => ajax?.element?.getAttribute('name') === name), await edit.getAttribute('name'), { timeout: 45_000 });
  await activateOwnedParagraphEdit(edit);
  await form.locator(field.selector).waitFor({
    state: 'attached',
    timeout: 45_000,
  });
  if (!(await hasOwnedEditor(form, field.selector))) {
    throw new Error(`${field.label} did not expose its configured editor after Edit.`);
  }
}

export async function hasParagraphCkEditorField(
  page: Page,
  field: ParagraphCkEditorFieldConfig,
): Promise<boolean> {
  const form = resolveParagraphEditorForm(page);
  if (await hasOwnedEditor(form, field.selector)) return true;
  if (!field.collapsedEditSelector) return false;
  const edit = form.locator(field.collapsedEditSelector);
  return (await edit.count()) === 1 && edit.isVisible();
}

export async function fillParagraphCkEditorField(
  page: Page,
  field: ParagraphCkEditorFieldConfig,
  value: string,
): Promise<void> {
  await expandCollapsedParagraph(page, field);
  const form = resolveParagraphEditorForm(page);
  await fillOwnedEditor(form, field.selector, value, field.label);
}

export async function readParagraphCkEditorField(
  page: Page,
  field: ParagraphCkEditorFieldConfig,
): Promise<string> {
  await expandCollapsedParagraph(page, field);
  const form = resolveParagraphEditorForm(page);
  return readOwnedEditor(form, field.selector, field.label);
}
