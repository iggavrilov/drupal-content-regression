import type { Locator } from '@playwright/test';
import type { UrlFieldConfig } from '../../config/content-types';

export async function fillUrlField(
  form: Locator,
  field: UrlFieldConfig,
  value: string,
): Promise<void> {
  const locator = form.locator(field.selector);
  if ((await locator.count()) !== 1) {
    throw new Error(`${field.label} URL input was not found uniquely.`);
  }
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${field.label} must use an HTTP or HTTPS URL.`);
  }
  await locator.fill(value);
  if ((await locator.inputValue()) !== value) {
    throw new Error(`${field.label} did not retain the configured URL.`);
  }
}

export async function readUrlField(
  form: Locator,
  field: UrlFieldConfig,
): Promise<string> {
  const locator = form.locator(field.selector);
  if ((await locator.count()) !== 1) {
    throw new Error(`${field.label} URL input was not found uniquely.`);
  }
  return locator.inputValue();
}
