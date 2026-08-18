import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { contentTypes } from '../src/config/content-types';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import { detectDrupalFatalPage, NetworkMonitor } from '../src/diagnostics/network-monitor';
import { loadPublishingSourceNodes } from '../src/publishing/source-nodes';

type Complexity = 'simple' | 'moderate' | 'complex' | 'blocked';

function widgetType(field: { tag: string; type?: string; classes: string; autocomplete: boolean; name: string }): string {
  if (field.classes.includes('media-library')) return 'media';
  if (field.name.endsWith('[uri]') || field.type === 'url') return 'url';
  if (field.autocomplete && field.name.includes('target_id')) return 'entity_reference_autocomplete';
  if (field.tag === 'textarea') return /code|embed/i.test(field.name) ? 'embed/code' : 'textarea';
  if (field.type === 'date') return 'date';
  if (field.type === 'time') return 'time';
  if (field.type === 'checkbox') return 'checkbox';
  if (field.type === 'radio') return 'radio';
  if (field.tag === 'select') return 'select';
  if (field.type === 'text' || field.tag === 'input') return 'text';
  return 'unknown/custom';
}

test('Paragraph component builders can be inventoried without saving content', async ({ page }) => {
  test.setTimeout(600_000);
  const startedAt = Date.now();
  const environment = assertExplicitNonProductionEnvironment();
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const source = loadPublishingSourceNodes().find((candidate) => candidate.machineName === 'insight_search');
  expect(source, 'Expected exact Insight Search manifest node').toBeDefined();
  const config = contentTypes.find((candidate) => candidate.machineName === source!.machineName);
  expect(config).toBeDefined();
  const fieldMachineName = 'field_landing_paragraphs';
  const fieldSelector = '.field--name-field-landing-paragraphs.field--widget-paragraphs';

  const openExactForm = async () => {
    const response = await page.goto(`/node/${source!.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
    const form = page.locator(config!.formSelector);
    expect(await form.locator(config!.titleField.selector).inputValue()).toBe(source!.title);
    const wrapper = form.locator(fieldSelector);
    expect(wrapper).toHaveCount(1);
    return { form, wrapper };
  };

  const initial = await openExactForm();
  const addControls = await initial.wrapper.locator(`input[name^="${fieldMachineName}_"][name$="_add_more"]`).evaluateAll((elements, prefix) => elements.map((element) => {
    const input = element as HTMLInputElement;
    const machineName = input.name.slice(`${prefix}_`.length, -'_add_more'.length);
    return { label: input.value.replace(/^Add\s+/, ''), machineName, selector: `input[name="${input.name}"]`, actionValue: input.value };
  }), fieldMachineName);
  expect(addControls.length).toBeGreaterThan(0);
  const components = [];
  for (const addControl of addControls) {
    const { wrapper } = await openExactForm();
    const beforeDeltas = await wrapper.locator(`[name^="${fieldMachineName}_"]`).evaluateAll((elements, prefix) => [...new Set(elements.map((element) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)_(?:edit|collapse|remove|duplicate)`).exec(element.getAttribute('name') ?? '')?.[1]).filter((delta): delta is string => Boolean(delta)))], fieldMachineName);
    const monitor = new NetworkMonitor();
    monitor.start(page);
    const targetAddControl = wrapper.locator(addControl.selector);
    if (!await targetAddControl.isVisible()) {
      const visiblePrimary = wrapper.locator(`input[name^="${fieldMachineName}_"][name$="_add_more"]:visible`);
      expect(await visiblePrimary.count(), 'Expected one visible primary Paragraph add control').toBe(1);
      const addToggle = wrapper.locator('.paragraphs-add-wrapper .dropbutton-toggle button');
      expect(await addToggle.count(), `${addControl.label} field-level add dropdown`).toBe(1);
      await addToggle.click({ timeout: 10_000 });
      await targetAddControl.waitFor({ state: 'visible', timeout: 10_000 });
    }
    const ajaxResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
    await targetAddControl.click({ timeout: 10_000 });
    const ajaxResponse = await ajaxResponsePromise;
    expect(ajaxResponse.status()).toBeLessThan(500);
    await expect.poll(async () => wrapper.locator(`[name^="${fieldMachineName}_"][name$="_collapse"], [name^="${fieldMachineName}_"][name$="_edit"]`).count(), { timeout: 30_000 }).toBeGreaterThan(beforeDeltas.length);
    monitor.assertNoServerErrors();
    expect((await detectDrupalFatalPage(page)).detected).toBe(false);
    const controls = await wrapper.locator(`[name*="[subform]"]`).evaluateAll((elements, args) => elements.map((element) => {
      const name = element.getAttribute('name') ?? '';
      const delta = new RegExp(`^${args.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(\\d+)\\]\\[subform\\]`).exec(name)?.[1];
      const html = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const id = element.id;
      const labelElement = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const wrapperElement = element.closest('.js-form-item, .form-item, [class*="field--name-"]');
      const classes = `${element.className || ''} ${wrapperElement?.className || ''}`;
      const label = (labelElement?.textContent ?? '').replace(/\s+/g, ' ').replace(/\*$/, '').trim();
      return {
        delta,
        name,
        label,
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') ?? undefined,
        classes,
        required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true' || Boolean(labelElement?.classList.contains('js-form-required') || labelElement?.classList.contains('form-required')),
        visible: Boolean((element as HTMLElement).offsetWidth || (element as HTMLElement).offsetHeight || (element as HTMLElement).getClientRects().length),
        autocomplete: element.hasAttribute('data-autocomplete-path'),
        autocompletePathPresent: element.hasAttribute('data-autocomplete-path'),
        selectedDefaultPresent: element instanceof HTMLSelectElement ? Boolean(element.value) : undefined,
        mediaLibraryTrigger: wrapperElement?.querySelector<HTMLElement>('[data-dialog-type="dialog"], .media-library-open-button')?.getAttribute('name') ?? undefined,
        hiddenTargetNames: Array.from(wrapperElement?.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]') ?? []).map((input) => input.name),
        ckeditorVisible: Boolean(wrapperElement?.querySelector('.ck-editor__editable[contenteditable="true"]')),
      };
    }), { prefix: fieldMachineName });
    const afterDeltas = await wrapper.locator(`[name^="${fieldMachineName}_"]`).evaluateAll((elements, prefix) => [...new Set(elements.map((element) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)_(?:edit|collapse|remove|duplicate)`).exec(element.getAttribute('name') ?? '')?.[1]).filter((delta): delta is string => Boolean(delta)))], fieldMachineName);
    const newDeltas = afterDeltas.filter((delta) => !beforeDeltas.includes(delta));
    expect(newDeltas, `${addControl.label} should add one unsaved Paragraph delta`).toHaveLength(1);
    const delta = newDeltas[0];
    const deltaControls = controls.filter((control) => control.delta === delta && !/_(remove|collapse|edit|duplicate)$/.test(control.name));
    const formatNames = new Set(deltaControls.filter((control) => control.name.endsWith('[format]')).map((control) => control.name));
    const fields = deltaControls.map((control) => ({
      name: control.name,
      label: control.label || undefined,
      selector: `[name="${control.name.replace(/(["\\])/g, '\\$1')}"]`,
      widgetType: control.name.endsWith('[value]') && formatNames.has(control.name.replace(/\[value\]$/, '[format]')) ? 'ckeditor' : widgetType(control),
      required: control.required,
      visible: control.visible,
      autocompletePathPresent: control.autocompletePathPresent,
      mediaLibraryTrigger: control.mediaLibraryTrigger,
      hiddenTargetNames: control.hiddenTargetNames,
      ckeditorVisible: control.ckeditorVisible,
    }));
    const requiredFields = fields.filter((field) => field.required);
    const mediaFields = fields.filter((field) => field.widgetType === 'media');
    const entityReferences = fields.filter((field) => field.widgetType === 'entity_reference_autocomplete');
    const ckeditorFields = fields.filter((field) => field.widgetType === 'ckeditor').map((field) => ({ backingTextareaName: field.name, selector: field.selector, immediatelyVisible: field.ckeditorVisible, handler: 'paragraph_ckeditor' }));
    const nestedFieldNames = [...new Set(fields.map((field) => new RegExp(`^${fieldMachineName}\\[${delta}\\]\\[subform\\]\\[(field_[^\\]]+)\\]\\[\\d+\\]\\[subform\\]`).exec(field.name)?.[1]).filter((name): name is string => Boolean(name)))];
    const dependencies = [
      ...mediaFields.map((field) => ({ field: field.label ?? field.name, dependency: /video/i.test(`${field.label} ${field.name}`) ? 'Video media' : 'Image media', requirement: field.required ? 'required' : 'optional', existingFixtureCompatible: !/video/i.test(`${field.label} ${field.name}`) })),
      ...entityReferences.map((field) => ({
        field: field.label ?? field.name,
        dependency: /tag|term|countr/i.test(`${field.label} ${field.name}`) ? 'Taxonomy term' : /personalization.block/i.test(`${field.label} ${field.name}`) ? 'Personalization block reference' : /insight/i.test(`${field.label} ${field.name}`) ? 'Insight reference' : 'Entity reference',
        requirement: field.required ? 'required' : 'optional',
        existingFixtureCompatible: false,
      })),
    ];
    let automationComplexity: Complexity = 'simple';
    let complexityReason = 'Only basic text, CKEditor, select, or URL controls were detected.';
    if (dependencies.some((dependency) => dependency.requirement === 'required' && !dependency.existingFixtureCompatible)) {
      automationComplexity = 'blocked';
      complexityReason = 'A required dependency lacks a proven compatible automation-owned fixture.';
    } else if (nestedFieldNames.length > 0) {
      automationComplexity = 'complex';
      complexityReason = 'Nested or repeated Paragraph controls require a separate child-item strategy.';
    } else if (dependencies.length > 0) {
      automationComplexity = 'moderate';
      complexityReason = 'Media or entity-reference resolution is required.';
    } else if (/embed/i.test(addControl.machineName) || fields.some((field) => field.widgetType === 'unknown/custom' || field.widgetType === 'embed/code')) {
      automationComplexity = 'complex';
      complexityReason = 'Custom/embed controls require component-specific handling.';
    }
    components.push({
      component: addControl.label,
      machineName: addControl.machineName,
      addControlSelector: addControl.selector,
      actionValue: addControl.actionValue,
      ajax: true,
      unsavedDelta: delta,
      fields,
      requiredFields,
      ckeditorFields,
      mediaFields,
      entityReferences,
      nestedParagraphs: nestedFieldNames.length > 0,
      nestedFields: nestedFieldNames.map((name) => ({ fieldMachineName: name, minimumObservedChildCount: 1, addControlPattern: `[name^="${fieldMachineName}[${delta}][subform][${name}]"][name*="[add_more]"]` })),
      dependencies,
      automationComplexity,
      complexityReason,
    });
    monitor.stop();
  }
  await page.goto(`/node/${source!.nodeId}`, { waitUntil: 'domcontentloaded' });
  const report = {
    environment,
    generatedAt: new Date().toISOString(),
    representativeNode: { nodeId: source!.nodeId, contentType: source!.label, machineName: source!.machineName, ownershipVerified: true },
    paragraphField: {
      machineName: fieldMachineName,
      wrapperSelector: fieldSelector,
      addControlPattern: `input[name^="${fieldMachineName}_"][name$="_add_more"]`,
      existingRows: { selector: `${fieldSelector} .paragraphs-subform`, editControlPattern: `input[name^="${fieldMachineName}_"][name$="_edit"]`, deltaPattern: `${fieldMachineName}[DELTA][subform]` },
      addRequiresAjax: true,
    },
    components,
    totalDurationMs: Date.now() - startedAt,
    persistentWrites: 0,
  };
  const outputDirectory = path.resolve(process.cwd(), 'test-results');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, 'paragraph-component-inventory.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const markdown = [
    '# Drupal Paragraph Component Inventory', '',
    `Representative: ${source!.label} node ${source!.nodeId}`, `Field: ${fieldMachineName}`, '',
    ...components.flatMap((component) => [
      `## ${component.component}`, '',
      `Machine name: ${component.machineName}`, `Complexity: ${component.automationComplexity}`, `Reason: ${component.complexityReason}`,
      `Required fields: ${component.requiredFields.map((field) => field.label ?? field.name).join(', ') || 'none detected'}`,
      `Dependencies: ${component.dependencies.map((dependency) => `${dependency.dependency} (${dependency.requirement})`).join(', ') || 'none'}`,
      `Nested Paragraphs: ${component.nestedParagraphs ? 'yes' : 'no'}`, '',
    ]),
    `Components: ${components.length}`, `Duration: ${(report.totalDurationMs / 1000).toFixed(1)}s`, 'Persistent Drupal writes: 0', '',
  ].join('\n');
  await writeFile(path.join(outputDirectory, 'paragraph-component-inventory.md'), markdown, 'utf8');
  console.log(`Paragraph component inventory: components=${components.length} persistentWrites=0 durationMs=${report.totalDurationMs}`);
  expect(components).toHaveLength(addControls.length);
});
