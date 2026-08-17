import type { Locator, Page } from '@playwright/test';
import type { FieldConfig } from '../../config/content-types';
import {
  fillCkEditorField,
  hasCkEditorField,
  readCkEditorField,
} from './ckeditor-field';
import {
  fillParagraphCkEditorField,
  hasParagraphCkEditorField,
  readParagraphCkEditorField,
} from './paragraph-ckeditor-field';
import { fillTextField, readTextField } from './text-field';
import { fillUrlField, readUrlField } from './url-field';

export async function canPopulateField(
  page: Page,
  form: Locator,
  field: FieldConfig,
): Promise<boolean> {
  switch (field.type) {
    case 'text':
      return (await form.locator(field.selector).count()) === 1;
    case 'url':
      return (await form.locator(field.selector).count()) === 1;
    case 'ckeditor':
      return hasCkEditorField(form, field);
    case 'paragraph_ckeditor':
      return hasParagraphCkEditorField(page, field);
  }
}

export async function populateField(
  page: Page,
  form: Locator,
  field: FieldConfig,
  value: string,
): Promise<void> {
  switch (field.type) {
    case 'text':
      await fillTextField(form, field, value);
      return;
    case 'url':
      await fillUrlField(form, field, value);
      return;
    case 'ckeditor':
      await fillCkEditorField(form, field, value);
      return;
    case 'paragraph_ckeditor':
      await fillParagraphCkEditorField(page, field, value);
  }
}

export async function readConfiguredField(
  form: Locator,
  field: FieldConfig,
): Promise<string | undefined> {
  switch (field.type) {
    case 'text':
      return readTextField(form, field);
    case 'url':
      return readUrlField(form, field);
    case 'ckeditor':
      return readCkEditorField(form, field);
    case 'paragraph_ckeditor':
      return readParagraphCkEditorField(form.page(), field);
  }
}
