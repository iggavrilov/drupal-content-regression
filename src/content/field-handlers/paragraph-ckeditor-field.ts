import type { Page } from '@playwright/test';
import type { ParagraphCkEditorFieldConfig } from '../../config/content-types';
import { fillOwnedEditor, hasOwnedEditor, readOwnedEditor } from '../node-form';

async function expandCollapsedParagraph(
  page: Page,
  field: ParagraphCkEditorFieldConfig,
): Promise<void> {
  const form = page.locator('form.node-form').first();
  if (await hasOwnedEditor(form, field.selector)) return;
  if (!field.collapsedEditSelector) return;

  const edit = form.locator(field.collapsedEditSelector);
  if ((await edit.count()) !== 1 || !(await edit.isVisible())) {
    throw new Error(
      `${field.label} is collapsed, but its configured Edit control was not found uniquely.`,
    );
  }
  await edit.click();
  await form.locator(field.selector).waitFor({
    state: 'attached',
    timeout: 15_000,
  });
  if (!(await hasOwnedEditor(form, field.selector))) {
    throw new Error(`${field.label} did not expose its configured editor after Edit.`);
  }
}

export async function hasParagraphCkEditorField(
  page: Page,
  field: ParagraphCkEditorFieldConfig,
): Promise<boolean> {
  const form = page.locator('form.node-form').first();
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
  const form = page.locator('form.node-form').first();
  await fillOwnedEditor(form, field.selector, value, field.label);
}

export async function readParagraphCkEditorField(
  page: Page,
  field: ParagraphCkEditorFieldConfig,
): Promise<string> {
  await expandCollapsedParagraph(page, field);
  const form = page.locator('form.node-form').first();
  return readOwnedEditor(form, field.selector, field.label);
}
