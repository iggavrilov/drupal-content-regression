import type { Locator } from '@playwright/test';
import type { TextFieldConfig } from '../../config/content-types';

export async function fillTextField(
  form: Locator,
  field: TextFieldConfig,
  value: string,
): Promise<void> {
  const locator = form.locator(field.selector);
  if ((await locator.count()) !== 1) {
    throw new Error(`${field.label} was not found uniquely.`);
  }
  await locator.fill(value);
  if ((await locator.inputValue()) !== value) {
    throw new Error(`${field.label} did not retain the configured value.`);
  }
}

export async function readTextField(
  form: Locator,
  field: TextFieldConfig,
): Promise<string> {
  const locator = form.locator(field.selector);
  if ((await locator.count()) !== 1) {
    throw new Error(`${field.label} was not found uniquely.`);
  }
  return locator.inputValue();
}
