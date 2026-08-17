import type { Locator } from '@playwright/test';
import type { CkEditorFieldConfig } from '../../config/content-types';
import { fillOwnedEditor, hasOwnedEditor, readOwnedEditor } from '../node-form';

export async function hasCkEditorField(
  form: Locator,
  field: CkEditorFieldConfig,
): Promise<boolean> {
  return hasOwnedEditor(form, field.selector);
}

export async function fillCkEditorField(
  form: Locator,
  field: CkEditorFieldConfig,
  value: string,
): Promise<void> {
  await fillOwnedEditor(form, field.selector, value, field.label);
}

export async function readCkEditorField(
  form: Locator,
  field: CkEditorFieldConfig,
): Promise<string> {
  return readOwnedEditor(form, field.selector, field.label);
}
