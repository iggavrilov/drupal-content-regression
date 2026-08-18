import { expect, type Locator, type Page } from '@playwright/test';
import { assertNoDrupalFatalPage, type NetworkMonitor } from '../../diagnostics/network-monitor';
import type { ParagraphConfig, RadioOption } from './paragraph-types';
import { activateOwnedParagraphEdit, type ParagraphActivationResult } from './paragraph-safe-click';

export const PARAGRAPH_FIELD = 'field_landing_paragraphs';
export const PARAGRAPH_WRAPPER = '.field--name-field-landing-paragraphs.field--widget-paragraphs';

export function subformPrefix(delta: string): string {
  return `${PARAGRAPH_FIELD}[${delta}][subform]`;
}

async function deltas(wrapper: Locator): Promise<string[]> {
  return wrapper.locator(`[name^="${PARAGRAPH_FIELD}_"]`).evaluateAll((elements, prefix) => [
    ...new Set(elements.map((element) => new RegExp(`^${prefix}_(\\d+)_(?:edit|collapse|remove|duplicate)$`).exec(element.getAttribute('name') ?? '')?.[1]).filter((value): value is string => Boolean(value))),
  ], PARAGRAPH_FIELD);
}

export async function findParagraphDeltasByLabel(wrapper: Locator, label: string): Promise<string[]> {
  const matches: string[] = [];
  const pattern = new RegExp(`(?:^|\\s)${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i');
  for (const delta of await deltas(wrapper)) {
    const action = wrapper.locator(`[name="${PARAGRAPH_FIELD}_${delta}_edit"], [name="${PARAGRAPH_FIELD}_${delta}_collapse"]`);
    if ((await action.count()) !== 1) continue;
    const row = action.locator('xpath=ancestor::tr[1]');
    if ((await row.count()) === 1 && pattern.test((await row.innerText()).replace(/\s+/g, ' '))) matches.push(delta);
  }
  return matches;
}

export async function addParagraph(page: Page, wrapper: Locator, config: ParagraphConfig, monitor: NetworkMonitor): Promise<string> {
  const before = await deltas(wrapper);
  const selector = `input[name="${PARAGRAPH_FIELD}_${config.machineName}_add_more"]`;
  const add = wrapper.locator(selector);
  if ((await add.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} Add control was not unique.`);
  if (!(await add.isVisible())) {
    const toggle = wrapper.locator('.paragraphs-add-wrapper .dropbutton-toggle button');
    if ((await toggle.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} Add menu was ambiguous.`);
    await toggle.click();
    await add.waitFor({ state: 'visible', timeout: 10_000 });
  }
  const ajax = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/'), { timeout: 30_000 });
  await add.click();
  const response = await ajax;
  if (response.status() >= 500 && response.status() <= 505) throw new Error(`${config.label} Add operation returned HTTP ${response.status()}.`);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await assertNoDrupalFatalPage(page);
  monitor.assertNoServerErrors();
  await page.waitForFunction(({ field, prior }) => {
    const names = [...document.querySelectorAll(`[name^="${field}_"]`)].map((element) => element.getAttribute('name') ?? '');
    return names.some((name) => {
      const match = new RegExp(`^${field}_(\\d+)_(?:edit|collapse|remove|duplicate)$`).exec(name);
      return match && !prior.includes(match[1]);
    });
  }, { field: PARAGRAPH_FIELD, prior: before }, { timeout: 30_000 });
  const after = await deltas(wrapper);
  const added = after.filter((delta) => !before.includes(delta));
  if (added.length !== 1) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} did not produce one uniquely owned delta.`);
  return added[0];
}

export async function expandParagraph(wrapper: Locator, delta: string): Promise<void> {
  const owned = wrapper.locator(`[name^="${subformPrefix(delta)}"]`).filter({ visible: true });
  if (await owned.count()) return;
  const collapse = wrapper.locator(`[name="${PARAGRAPH_FIELD}_${delta}_collapse"]`);
  if ((await collapse.count()) === 1 && (await collapse.isVisible())) return;
  const edit = wrapper.locator(`[name="${PARAGRAPH_FIELD}_${delta}_edit"]`);
  if ((await edit.count()) !== 1 || !(await edit.isVisible())) throw new Error(`PARAGRAPH_BLOCKED: Paragraph delta ${delta} cannot be expanded uniquely.`);
  await activateOwnedParagraphEdit(edit);
  await expect.poll(() => wrapper.locator(`[name^="${subformPrefix(delta)}"]`).filter({ visible: true }).count(), { timeout: 20_000 }).toBeGreaterThan(0);
}

export async function expandParagraphForControl(wrapper: Locator, delta: string, controlSelector: string, state: 'visible' | 'attached' = 'visible'): Promise<ParagraphActivationResult | undefined> {
  const ready = async () => state === 'attached'
    ? wrapper.locator(controlSelector).count()
    : wrapper.locator(controlSelector).filter({ visible: true }).count();
  if (await ready()) return undefined;
  const edit = wrapper.locator(`[name="${PARAGRAPH_FIELD}_${delta}_edit"]`);
  if ((await edit.count()) !== 1 || !(await edit.isVisible()) || !(await edit.isEnabled())) throw new Error(`PARAGRAPH_BLOCKED: Paragraph delta ${delta} Edit control was not uniquely visible and enabled.`);
  const activation = await activateOwnedParagraphEdit(edit);
  await expect.poll(ready, { timeout: 20_000, message: `Expected delta ${delta} owned control to become ${state}.` }).toBeGreaterThan(0);
  return activation;
}

export async function identifyDeltas(wrapper: Locator, configs: readonly ParagraphConfig[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const config of configs) {
    const candidates = await findParagraphDeltasByLabel(wrapper, config.label);
    if (candidates.length !== 1) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} ownership was ambiguous after save.`);
    result.set(config.machineName, candidates[0]);
  }
  return result;
}

export function ownedField(wrapper: Locator, delta: string, fieldMachineName: string): Locator {
  return wrapper.locator(`[name^="${subformPrefix(delta)}[${fieldMachineName}]"]`);
}

export async function radioOptions(field: Locator): Promise<RadioOption[]> {
  const radios = field.locator('input[type="radio"]');
  const options = await radios.evaluateAll((elements) => elements.map((element) => {
    const input = element as HTMLInputElement;
    const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent : undefined;
    return { label: (label ?? input.value).replace(/\s+/g, ' ').trim(), value: input.value };
  }));
  if (options.length === 0 || options.some((option) => !option.value || !option.label)) throw new Error('PARAGRAPH_BLOCKED: Jump nav exposes no safe explicit radio option.');
  return options;
}
