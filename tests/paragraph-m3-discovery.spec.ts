import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import { detectDrupalFatalPage, NetworkMonitor } from '../src/diagnostics/network-monitor';

const PARAGRAPH_FIELD = 'field_landing_paragraphs';
const PARAGRAPH_WRAPPER = '.field--name-field-landing-paragraphs.field--widget-paragraphs';
const HOST_FORM = 'form.node-insight-search-form, form[id^="node-insight-search-form"]';
const TARGETS = [
  { expectedLabel: 'Blockquote', expectedMachineName: 'blockquote' },
  { expectedLabel: 'Featured banner', expectedMachineName: 'featured_banner' },
] as const;

type FieldInventory = {
  name: string;
  fieldMachineName?: string;
  label?: string;
  tag: string;
  type?: string;
  widgetType: string;
  required: boolean;
  visible: boolean;
  disabled: boolean;
  currentValue?: string | boolean;
  defaultValid?: boolean;
  options?: { label: string; value: string; selected: boolean }[];
  fieldWrapperClasses?: string;
  ckeditorVisible?: boolean;
  mediaTriggerNames?: string[];
  hiddenFieldNames?: string[];
  autocompletePathPresent: boolean;
};

function widgetType(field: { tag: string; type?: string; classes: string; name: string; autocompletePathPresent: boolean }): string {
  if (field.classes.includes('media-library')) return 'media';
  if (field.autocompletePathPresent && field.name.includes('target_id')) return 'entity_reference_autocomplete';
  if (field.tag === 'textarea') return 'textarea';
  if (field.tag === 'select') return 'select';
  if (field.type === 'radio') return 'radio';
  if (field.type === 'checkbox') return 'checkbox';
  if (field.type === 'hidden') return 'hidden';
  if (field.type === 'url' || field.name.endsWith('[uri]')) return 'url';
  if (field.type === 'submit') return 'submit';
  if (field.tag === 'input') return 'text';
  return 'unknown/custom';
}

async function paragraphDeltas(wrapper: Locator): Promise<string[]> {
  return wrapper.locator(`[name^="${PARAGRAPH_FIELD}_"]`).evaluateAll((elements, prefix) => [...new Set(elements.map((element) => {
    return new RegExp(`^${prefix}_(\\d+)_(?:edit|collapse|remove|duplicate)$`).exec(element.getAttribute('name') ?? '')?.[1];
  }).filter((delta): delta is string => Boolean(delta)))], PARAGRAPH_FIELD);
}

async function openUnsavedHost(page: Page): Promise<Locator> {
  const response = await page.goto('/node/add/insight_search', { waitUntil: 'domcontentloaded' });
  expect(response?.status(), 'Unsaved Insight Search host response status').toBeLessThan(400);
  const form = page.locator(HOST_FORM);
  await expect(form).toHaveCount(1);
  await expect(form.locator(PARAGRAPH_WRAPPER)).toHaveCount(1);
  return form.locator(PARAGRAPH_WRAPPER);
}

async function discoverComponent(page: Page, target: typeof TARGETS[number]) {
  const wrapper = await openUnsavedHost(page);
  const addControls = await wrapper.locator(`input[name^="${PARAGRAPH_FIELD}_"][name$="_add_more"], button[name^="${PARAGRAPH_FIELD}_"][name$="_add_more"]`).evaluateAll((elements, prefix) => elements.map((element) => {
    const control = element as HTMLInputElement | HTMLButtonElement;
    const name = control.name;
    const label = ((control instanceof HTMLInputElement ? control.value : control.textContent) ?? '').replace(/^Add\s+/, '').replace(/\s+/g, ' ').trim();
    const machineName = name.slice(`${prefix}_`.length, -'_add_more'.length);
    return { label, machineName, name, tag: control.tagName.toLowerCase(), type: control.getAttribute('type') ?? undefined };
  }), PARAGRAPH_FIELD);
  const addControl = addControls.find((control) => control.machineName === target.expectedMachineName);
  expect(addControl, `${target.expectedLabel} exact Add control`).toBeDefined();
  expect(addControl!.label).toBe(target.expectedLabel);

  const before = await paragraphDeltas(wrapper);
  const add = wrapper.locator(`[name="${addControl!.name}"]`);
  if (!(await add.isVisible())) {
    const toggle = wrapper.locator('.paragraphs-add-wrapper .dropbutton-toggle button');
    await expect(toggle).toHaveCount(1);
    await toggle.click();
    await add.waitFor({ state: 'visible', timeout: 10_000 });
  }
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const ajaxResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
  await add.click();
  const ajaxResponse = await ajaxResponsePromise;
  expect(ajaxResponse.status()).toBeLessThan(500);
  await expect.poll(async () => (await paragraphDeltas(wrapper)).length, { timeout: 30_000 }).toBeGreaterThan(before.length);
  monitor.assertNoServerErrors();
  const fatal = await detectDrupalFatalPage(page);
  expect(fatal.detected, fatal.indicator).toBe(false);

  const after = await paragraphDeltas(wrapper);
  const added = after.filter((delta) => !before.includes(delta));
  expect(added, `${target.expectedLabel} unique unsaved runtime delta`).toHaveLength(1);
  const delta = added[0];
  const prefix = `${PARAGRAPH_FIELD}[${delta}][subform]`;
  const action = wrapper.locator(`[name="${PARAGRAPH_FIELD}_${delta}_collapse"], [name="${PARAGRAPH_FIELD}_${delta}_edit"]`);
  await expect(action).toHaveCount(1);
  const actionInventory = await action.evaluate((element) => ({
    name: (element as HTMLInputElement | HTMLButtonElement).name,
    tag: element.tagName.toLowerCase(),
    type: element.getAttribute('type') ?? undefined,
    value: ((element as HTMLInputElement).value || element.textContent || '').replace(/\s+/g, ' ').trim(),
  }));
  const row = action.locator('xpath=ancestor::tr[1]');
  await expect(row).toHaveCount(1);
  const subform = row.locator('.paragraphs-subform');
  await expect(subform).toHaveCount(1);

  const rawFields = await subform.locator(`[name^="${prefix}"]`).evaluateAll((elements, fieldPrefix) => elements.map((element) => {
    const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const name = control.name;
    const id = control.id;
    const fieldWrapper = element.closest<HTMLElement>('[class*="field--name-field-"], .js-form-item, .form-item');
    const labelElement = id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`) : null;
    const legend = element.closest('fieldset')?.querySelector<HTMLElement>(':scope > legend .fieldset-legend, :scope > legend');
    const label = (labelElement?.textContent ?? legend?.textContent ?? '').replace(/\s+/g, ' ').replace(/\*$/, '').trim();
    const required = element.hasAttribute('required') || element.getAttribute('aria-required') === 'true'
      || Boolean(labelElement?.classList.contains('form-required') || legend?.classList.contains('form-required'));
    const classes = `${element.className || ''} ${fieldWrapper?.className || ''}`;
    const options = element instanceof HTMLSelectElement
      ? Array.from(element.options).map((option) => ({ label: option.text.replace(/\s+/g, ' ').trim(), value: option.value, selected: option.selected }))
      : control instanceof HTMLInputElement && control.type === 'radio'
        ? [{ label: (labelElement?.textContent ?? control.value).replace(/\s+/g, ' ').trim(), value: control.value, selected: control.checked }]
        : undefined;
    const currentValue = control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type) ? control.checked : control.value;
    return {
      name,
      fieldMachineName: new RegExp(`^${fieldPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(field_[^\\]]+)\\]`).exec(name)?.[1],
      label: label || undefined,
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute('type') ?? undefined,
      classes,
      required,
      visible: Boolean((element as HTMLElement).offsetWidth || (element as HTMLElement).offsetHeight || (element as HTMLElement).getClientRects().length),
      disabled: control.disabled,
      currentValue,
      options,
      fieldWrapperClasses: fieldWrapper?.className,
      ckeditorVisible: Boolean(fieldWrapper?.querySelector('.ck-editor__editable[contenteditable="true"]')),
      mediaTriggerNames: Array.from(fieldWrapper?.querySelectorAll<HTMLInputElement | HTMLButtonElement>('.media-library-open-button[name], [data-dialog-type="dialog"][name]') ?? []).map((item) => item.name),
      hiddenFieldNames: Array.from(fieldWrapper?.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]') ?? []).map((item) => item.name),
      autocompletePathPresent: element.hasAttribute('data-autocomplete-path'),
    };
  }), prefix);

  const formatNames = new Set(rawFields.filter((field) => field.name.endsWith('[format]')).map((field) => field.name));
  const fields: FieldInventory[] = rawFields.map((field) => ({
    ...field,
    widgetType: field.name.endsWith('[value]') && formatNames.has(field.name.replace(/\[value\]$/, '[format]')) ? 'ckeditor' : widgetType(field),
    defaultValid: field.required && (field.tag === 'select' || field.type === 'radio')
      ? typeof field.currentValue === 'string' && !['', '_none'].includes(field.currentValue)
      : undefined,
  }));
  const nestedFieldMachineNames = [...new Set(fields.map((field) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(field_[^\\]]+)\\]\\[\\d+\\]\\[subform\\]`).exec(field.name)?.[1]).filter((value): value is string => Boolean(value)))];
  monitor.stop();
  await page.goto('/user', { waitUntil: 'domcontentloaded' });

  return {
    label: addControl!.label,
    machineName: addControl!.machineName,
    runtimeDelta: delta,
    addControl: { name: addControl!.name, tag: addControl!.tag, type: addControl!.type },
    rowAction: actionInventory,
    subform: { prefix, selector: `${PARAGRAPH_WRAPPER} .paragraphs-subform` },
    fields,
    ckeditorOwnership: fields.filter((field) => field.widgetType === 'ckeditor').map((field) => ({
      paragraphDelta: delta,
      subformPrefix: prefix,
      fieldMachineName: field.fieldMachineName,
      fieldWrapperClasses: field.fieldWrapperClasses,
      backingTextareaName: field.name,
      visibleEditablePresent: field.ckeditorVisible,
    })),
    mediaFields: fields.filter((field) => field.widgetType === 'media' || field.mediaTriggerNames?.length),
    entityReferenceFields: fields.filter((field) => field.widgetType === 'entity_reference_autocomplete'),
    nestedFieldMachineNames,
    ajax: { addResponseStatus: ajaxResponse.status(), deltasBefore: before, deltasAfter: after, rowRediscoveredAfterAjax: true },
    serverErrors500To505: monitor.getServerErrors(),
    drupalFatalPage: fatal,
  };
}

test('Milestone 3 Paragraph structures are discovered on unsaved forms only', async ({ page }) => {
  test.setTimeout(300_000);
  const environment = assertExplicitNonProductionEnvironment();
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const components = [];
  for (const target of TARGETS) components.push(await discoverComponent(page, target));
  const report = {
    environment,
    host: { contentType: 'Insight Search Filter Page', machineName: 'insight_search', formPath: '/node/add/insight_search', saved: false },
    components,
    persistentWrites: { nodesCreated: 0, nodesUpdated: 0, nodeSaves: 0, paragraphsPersisted: 0, mediaSelectionsPersisted: 0, mediaUploads: 0, mediaCreations: 0, mediaEdits: 0, moderationTransitions: 0 },
  };
  const outputDirectory = path.resolve(process.cwd(), 'test-results');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, 'paragraph-m3-discovery.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Paragraph M3 discovery: components=${components.length} persistentWrites=0`);
  expect(components).toHaveLength(TARGETS.length);
});
