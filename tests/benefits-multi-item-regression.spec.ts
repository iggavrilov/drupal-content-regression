import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { basicPageConfig } from '../src/config/content-types';
import { getEffectiveCredentials, getEnvironmentConfig } from '../src/config/environments';
import { assertPublishingAllowed } from '../src/config/write-safety';
import { activateOwnedParagraphEdit } from '../src/content/paragraphs/paragraph-safe-click';
import { fillOwnedEditor, submitNodeForm, validateSafeModerationState } from '../src/content/node-form';
import { NetworkMonitor } from '../src/diagnostics/network-monitor';
import { runPublishingWorkflow } from '../src/publishing/moderation-workflow';

const host = {
  nodeId: '616',
  title: 'QA-AUTOMATED-Basic-Page-20261003-071529-9f8e-UPDATED',
  publicPath: '/content/qa-automated-basic-page-20261003-071529-9f8e-updated',
};
const paragraphField = 'field_page_paragraphs';
const artifactDirectory = path.resolve('artifacts', 'component-functional', 'benefits-node-616');

async function login(page: Page): Promise<void> {
  const environment = getEnvironmentConfig();
  expect(environment.target).toBe('benefits');
  expect(environment.baseUrl).toBe('https://benefits-dev.leidos.com');
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
}

async function openEdit(page: Page): Promise<{ form: Locator; wrapper: Locator }> {
  const response = await page.goto(`/node/${host.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(400);
  const form = page.locator('form.node-page-edit-form, form[id^="node-page-edit-form"]').filter({ visible: true }).first();
  await expect(form.locator('[name="title[0][value]"]')).toHaveValue(host.title);
  return { form, wrapper: form.locator('.field--name-field-page-paragraphs.field--widget-paragraphs') };
}

async function expandRow(row: Locator): Promise<void> {
  const edit = row.getByRole('button', { name: 'Edit', exact: true });
  if (await edit.isVisible()) {
    await activateOwnedParagraphEdit(edit);
    await row.getByRole('button', { name: 'Collapse', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
  }
}

function field(wrapper: Locator, delta: string, suffix: string): Locator {
  return wrapper.locator(`[name="${paragraphField}[${delta}][subform]${suffix}"]`);
}

async function setEditor(form: Locator, delta: string, suffix: string, value: string, label: string): Promise<void> {
  await fillOwnedEditor(form, `textarea[name="${paragraphField}[${delta}][subform]${suffix}"]`, value, label);
}

async function addNested(_page: Page, parent: Locator, add: Locator, childClass: string): Promise<void> {
  const before = await parent.locator(`tr.paragraph-type--${childClass}`).count();
  await activateOwnedParagraphEdit(add);
  await expect.poll(() => parent.locator(`tr.paragraph-type--${childClass}`).count(), { timeout: 30_000 }).toBe(before + 1);
}

async function saveAndPublish(page: Page, form: Locator, monitor: NetworkMonitor): Promise<void> {
  await validateSafeModerationState(form, basicPageConfig.label);
  await submitNodeForm(page, form, basicPageConfig.label);
  const messages = (await page.locator('.messages--error, [role="alert"]').allInnerTexts()).join(' | ');
  if (/error|required|invalid/i.test(messages)) throw new Error(`Drupal validation: ${messages.slice(0, 500)}`);
  const publishPage = await page.context().newPage();
  const publishMonitor = new NetworkMonitor(); publishMonitor.start(publishPage);
  try {
    const publishing = await runPublishingWorkflow(publishPage, publishMonitor, basicPageConfig, {
      nodeId: Number(host.nodeId), title: host.title, machineName: basicPageConfig.machineName, label: basicPageConfig.label, moderation: 'Draft',
    });
    expect(publishing.status).toBe('passed');
    expect(publishing.finalState).toBe('Published');
  } finally {
    publishMonitor.stop(); await publishPage.close();
  }
}

test('Benefits read-only 29-type repeatable nested-item audit', async ({ page }) => {
  test.setTimeout(1_800_000);
  await login(page);
  const opened = await openEdit(page);
  const addControls = await opened.wrapper.locator(`input[name^="${paragraphField}_"][name$="_add_more"]`).evaluateAll((controls) => controls.map((control) => ({
    machineName: control.getAttribute('name')?.replace(/^field_page_paragraphs_/, '').replace(/_add_more$/, '') ?? '',
    label: (control.getAttribute('value') ?? '').replace(/^Add\s+/, ''),
  })));
  expect(addControls).toHaveLength(29);
  const audit: Array<Record<string, unknown>> = [];

  for (const component of addControls) {
    const current = await openEdit(page);
    let row = current.wrapper.locator(`tr.paragraph-type--${component.machineName.replaceAll('_', '-')}`).first();
    let source = 'existing';
    if ((await row.count()) === 0) {
      source = 'unsaved-add-form';
      const add = current.wrapper.locator(`input[name="${paragraphField}_${component.machineName}_add_more"]`);
      if (!(await add.isVisible())) {
        await current.wrapper.locator('.paragraphs-add-wrapper .dropbutton-toggle button').click();
        await add.waitFor({ state: 'visible', timeout: 10_000 });
      }
      const before = await current.wrapper.locator('tr.draggable').count();
      await add.click();
      await expect.poll(() => current.wrapper.locator('tr.draggable').count(), { timeout: 30_000 }).toBeGreaterThan(before);
      row = current.wrapper.locator(`tr.paragraph-type--${component.machineName.replaceAll('_', '-')}`).last();
    }
    await expandRow(row);
    const nestedAddControls = await row.locator('input[name$="_add_more"], button[name$="_add_more"]').evaluateAll((controls) => controls.map((control) => ({
      name: (control as HTMLInputElement).name,
      label: ((control as HTMLInputElement).value || control.textContent || '').replace(/\s+/g, ' ').trim(),
      visible: Boolean((control as HTMLElement).offsetWidth || (control as HTMLElement).offsetHeight || (control as HTMLElement).getClientRects().length),
    })));
    const nestedRows = await row.locator('tr[class*="paragraph-type--"]').evaluateAll((rows) => rows.map((nested) => ({
      classes: (nested as HTMLElement).className,
      text: (nested.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
    })));
    audit.push({ ...component, source, repeatable: nestedAddControls.length > 0, nestedAddControls, nestedRows });
  }

  await mkdir(artifactDirectory, { recursive: true });
  const output = { target: 'https://benefits-dev.leidos.com', nodeId: host.nodeId, persistentWrites: 0, audit };
  await writeFile(path.join(artifactDirectory, 'multi-item-audit.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`BENEFITS_MULTI_ITEM_AUDIT ${JSON.stringify(audit.map(({ label, machineName, repeatable, nestedAddControls, nestedRows }) => ({ label, machineName, repeatable, addControls: (nestedAddControls as unknown[]).length, nestedRows: (nestedRows as unknown[]).length })))}`);
});

test('Benefits expands existing repeatable fixtures to meaningful counts', async ({ page }) => {
  test.setTimeout(3_600_000);
  page.setDefaultTimeout(45_000);
  await login(page);
  assertPublishingAllowed();
  const monitor = new NetworkMonitor(); monitor.start(page);
  const opened = await openEdit(page);
  let added = 0;
  let populatedExisting = 0;
  let reordered = 0;

  const findParent = (type: string, marker: string) => opened.wrapper.locator(`tr.paragraph-type--${type}`).filter({ hasText: marker });
  const deltaFor = async (row: Locator) => {
    const name = await row.locator('input[name$="_edit"], input[name$="_collapse"]').first().getAttribute('name') ?? '';
    const delta = /field_page_paragraphs_(\d+)_(?:edit|collapse)/.exec(name)?.[1];
    if (!delta) throw new Error(`Could not resolve parent delta from ${name}.`);
    return delta;
  };

  const showRowWeights = page.getByRole('button', { name: 'Show row weights', exact: true });
  if (await showRowWeights.isVisible()) await showRowWeights.click();
  for (const fixture of [
    { marker: 'QA-AUTOMATED-LIST-20261003-remaining-ITEM-1', prefix: 'QA List Left' },
    { marker: 'QA-AUTOMATED-LIST-RIGHT-20261004-final-variants', prefix: 'QA List Right' },
  ]) {
    const parent = findParent('list', fixture.marker); await expect(parent).toHaveCount(1); await expandRow(parent);
    const delta = await deltaFor(parent); const children = () => parent.locator('tr.paragraph-type--list-item-text');
    while (await children().count() < 4) {
      await addNested(page, parent, parent.locator(`[name="${paragraphField}_${delta}_subform_field_list_items_list_item_text_add_more"]`).filter({ visible: true }), 'list-item-text');
      const input = parent.locator(`[name^="${paragraphField}[${delta}][subform][field_list_items]"][name$="[field_list_item_text][0][value]"]`).filter({ visible: true });
      const name = await input.getAttribute('name') ?? ''; const index = /\[field_list_items\]\[(\d+)\]/.exec(name)?.[1];
      await input.fill(`${fixture.prefix} Item ${await children().count()}`); added += 1;
      if (!index) throw new Error('List item index was not resolved.');
    }
  }

  for (const fixture of [
    { marker: 'QA-AUTOMATED-TABS-HEADING-20261003-remaining', prefix: 'QA Horizontal Tab' },
    { marker: 'QA-AUTOMATED-TABS-accordion-20261004-final-variants', prefix: 'QA Accordion Tab' },
    { marker: 'QA-AUTOMATED-TABS-none-20261004-final-variants', prefix: 'QA None Tab' },
  ]) {
    const parent = findParent('tabs', fixture.marker); await expect(parent).toHaveCount(1); await expandRow(parent);
    const delta = await deltaFor(parent); const children = () => parent.locator('tr.paragraph-type--tabs-item-text');
    while (await children().count() < 4) {
      await addNested(page, parent, parent.locator(`[name="${paragraphField}_${delta}_subform_field_tabs_items_tabs_item_text_add_more"]`).filter({ visible: true }), 'tabs-item-text');
      const label = parent.locator(`[name^="${paragraphField}[${delta}][subform][field_tabs_items]"][name$="[field_tabs_item_name][0][value]"]`).filter({ visible: true });
      const name = await label.getAttribute('name') ?? ''; const index = /\[field_tabs_items\]\[(\d+)\]/.exec(name)?.[1];
      if (!index) throw new Error('Tabs item index was not resolved.');
      const ordinal = await children().count(); await label.fill(`${fixture.prefix} ${ordinal}`);
      await setEditor(opened.form, delta, `[field_tabs_items][${index}][subform][field_tabs_item_text][0][value]`, `${fixture.prefix} Content ${ordinal}`, `${fixture.prefix} ${ordinal}`);
      added += 1;
    }
  }

  {
    const parent = findParent('grid', 'QA-AUTOMATED-CARD-GRID-HEADING-20261003-REMAINING'); await expect(parent).toHaveCount(1); await expandRow(parent);
    const delta = await deltaFor(parent); const children = () => parent.locator('tr.paragraph-type--profile-card');
    while (await children().count() < 4) {
      await addNested(page, parent, parent.locator(`[name="${paragraphField}_${delta}_subform_field_grid_items_profile_card_add_more"]`).filter({ visible: true }), 'profile-card');
      const nameField = parent.locator(`[name^="${paragraphField}[${delta}][subform][field_grid_items]"][name$="[field_profile_card_name][0][value]"]`).filter({ visible: true });
      const name = await nameField.getAttribute('name') ?? ''; const index = /\[field_grid_items\]\[(\d+)\]/.exec(name)?.[1];
      if (!index) throw new Error('Grid card index was not resolved.');
      const ordinal = await children().count(); await nameField.fill(`QA Grid Card ${ordinal}`);
      await field(opened.wrapper, delta, `[field_grid_items][${index}][subform][field_profile_card_title][0][value]`).fill(`QA Grid Title ${ordinal}`);
      await field(opened.wrapper, delta, `[field_grid_items][${index}][subform][field_profile_card_link][0][uri]`).fill(`/node/${host.nodeId}`);
      added += 1;
    }
  }

  const partnerFixtures = [
    { marker: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20261003-REMAINING', prefix: 'QA Collection White Light' },
    { marker: 'QA Collection Light', prefix: 'QA Collection Light White' },
    { marker: 'QA Collection Purple', prefix: 'QA Collection White Purple' },
    { marker: 'QA Collection Dark', prefix: 'QA Collection Dark White' },
  ];
  for (const fixture of partnerFixtures) {
    const parent = findParent('partners', fixture.marker); await expect(parent).toHaveCount(1); await expandRow(parent);
    const delta = await deltaFor(parent); const children = () => parent.locator('tr.paragraph-type--partners-logo');
    const fillVisible = async (ordinal: number) => {
      const heading = parent.locator(`[name^="${paragraphField}[${delta}][subform][field_partners_items]"][name$="[field_partners_logo_head][0][value]"]`).filter({ visible: true });
      const name = await heading.getAttribute('name') ?? ''; const index = /\[field_partners_items\]\[(\d+)\]/.exec(name)?.[1];
      if (!index) throw new Error('Collection item index was not resolved.');
      await heading.fill(`${fixture.prefix} Card ${ordinal}`);
      await field(opened.wrapper, delta, `[field_partners_items][${index}][subform][field_partners_logo_text][0][value]`).fill(`${fixture.prefix} Text ${ordinal}`);
      await field(opened.wrapper, delta, `[field_partners_items][${index}][subform][field_partners_logo_link][0][uri]`).fill(`/node/${host.nodeId}`);
      await field(opened.wrapper, delta, `[field_partners_items][${index}][subform][field_partners_logo_link][0][title]`).fill(`View ${fixture.prefix} ${ordinal}`);
    };
    for (let index = 0; index < await children().count(); index += 1) {
      const child = children().nth(index); if ((await child.innerText()).replace(/\s+/g, ' ').match(/QA-|QA /)) continue;
      const edit = child.getByRole('button', { name: 'Edit', exact: true }); if (await edit.isVisible()) await activateOwnedParagraphEdit(edit);
      await fillVisible(index + 1); populatedExisting += 1;
    }
    while (await children().count() < 4) {
      await addNested(page, parent, parent.locator(`[name="${paragraphField}_${delta}_subform_field_partners_items_partners_logo_add_more"]`).filter({ visible: true }), 'partners-logo');
      await fillVisible(await children().count()); added += 1;
    }
  }

  for (const fixture of [
    { marker: 'QA-AUTOMATED-COLLECTION-V2-TWO-HEADER-20261003-REMAINING', display: '2', expected: ['QA-AUTOMATED-COLLECTION-V2-CARD-1-20261003-remaining', 'QA-AUTOMATED-COLLECTION-V2-CARD-2-20261003-remaining', 'QA V2 2 Card 3', 'QA V2 2 Card 4', 'QA V2 2 Card 5'] },
    { marker: 'QA-AUTOMATED-COLLECTION-V2-3-20261004-final-variants', display: '3', expected: ['QA 3 card 1', 'QA 3 card 2', 'QA 3 card 3', 'QA V2 3 Card 4', 'QA V2 3 Card 5'] },
    { marker: 'QA-AUTOMATED-COLLECTION-V2-4-20261004-final-variants', display: '4', expected: ['QA 4 card 1', 'QA 4 card 2', 'QA 4 card 3', 'QA 4 card 4', 'QA V2 4 Card 5'] },
    { marker: 'QA-AUTOMATED-COLLECTION-V2-carousel-20261004-final-variants', display: 'Carousel', expected: ['QA carousel card 1', 'QA carousel card 2', 'QA carousel card 3', 'QA carousel card 4', 'QA carousel card 5'] },
  ]) {
    const parent = findParent('card-collection', fixture.marker); await expect(parent).toHaveCount(1); await expandRow(parent);
    const delta = await deltaFor(parent); const children = () => parent.locator('tr.paragraph-type--card');
    while (await children().count() < 5) {
      await addNested(page, parent, parent.locator(`[name="${paragraphField}_${delta}_subform_field_cards_card_add_more"]`).filter({ visible: true }), 'card');
      const header = parent.locator(`[name^="${paragraphField}[${delta}][subform][field_cards]"][name$="[field_header][0][value]"]`).filter({ visible: true });
      const name = await header.getAttribute('name') ?? ''; const index = /\[field_cards\]\[(\d+)\]/.exec(name)?.[1];
      if (!index) throw new Error('Collection v2 card index was not resolved.');
      const ordinal = await children().count(); await header.fill(`QA V2 ${fixture.display} Card ${ordinal}`);
      await setEditor(opened.form, delta, `[field_cards][${index}][subform][field_text_plain][0][value]`, `QA V2 ${fixture.display} Text ${ordinal}`, `Collection v2 ${fixture.display} ${ordinal}`);
      await field(opened.wrapper, delta, `[field_cards][${index}][subform][field_cta][0][uri]`).fill(`/node/${host.nodeId}`);
      await field(opened.wrapper, delta, `[field_cards][${index}][subform][field_cta][0][title]`).fill(`View V2 ${fixture.display} ${ordinal}`);
      added += 1;
    }
    for (let index = 0; index < fixture.expected.length; index += 1) {
      const child = children().filter({ hasText: fixture.expected[index] }); await expect(child).toHaveCount(1);
      const weight = child.locator('select[name$="[_weight]"]'); const expectedWeight = String(index - 5);
      if (await weight.inputValue() !== expectedWeight) { await weight.selectOption(expectedWeight); reordered += 1; }
    }
  }

  {
    const parent = findParent('tabs-card', 'QA-AUTOMATED-TABS-CARD-20261003-REMAINING'); await expect(parent).toHaveCount(1); await expandRow(parent);
    const delta = await deltaFor(parent); const children = () => parent.locator('tr.paragraph-type--tabs-card-item');
    while (await children().count() < 4) {
      await addNested(page, parent, parent.locator(`[name="${paragraphField}_${delta}_subform_field_tabs_tabs_card_item_add_more"]`).filter({ visible: true }), 'tabs-card-item');
      const label = parent.locator(`[name^="${paragraphField}[${delta}][subform][field_tabs]"][name$="[field_tab_label][0][value]"]`).filter({ visible: true });
      const name = await label.getAttribute('name') ?? ''; const index = /\[field_tabs\]\[(\d+)\]/.exec(name)?.[1];
      if (!index) throw new Error('Tabs Card item index was not resolved.');
      const ordinal = await children().count(); await label.fill(`QA Card Tab ${ordinal}`);
      await field(opened.wrapper, delta, `[field_tabs][${index}][subform][field_title][0][value]`).fill(`QA Card Tab Title ${ordinal}`);
      await setEditor(opened.form, delta, `[field_tabs][${index}][subform][field_body][0][value]`, `QA Card Tab Body ${ordinal}`, `Tabs Card ${ordinal}`);
      await field(opened.wrapper, delta, `[field_tabs][${index}][subform][field_link][0][uri]`).fill(`/node/${host.nodeId}`);
      await field(opened.wrapper, delta, `[field_tabs][${index}][subform][field_link][0][title]`).fill(`View Card Tab ${ordinal}`);
      added += 1;
    }
  }

  if (added || populatedExisting || reordered) await saveAndPublish(page, opened.form, monitor);
  console.log(`BENEFITS_MULTI_ITEM_UPDATE ${JSON.stringify({ added, populatedExisting, reordered, expectedAddedFromBaseline: 32 })}`);
  monitor.stop();
});

test('Benefits repeatable fixtures persist exact counts and order after fresh reload', async ({ page }) => {
  test.setTimeout(1_200_000);
  await login(page);
  const opened = await openEdit(page);
  const results: Array<Record<string, unknown>> = [];
  const mismatches: Array<Record<string, unknown>> = [];
  const verify = async (component: string, type: string, marker: string, childClass: string, expected: string[], option?: { suffix: string; value: string }) => {
    const parent = opened.wrapper.locator(`tr.paragraph-type--${type}`).filter({ hasText: marker });
    await expect(parent).toHaveCount(1); await expandRow(parent);
    const children = parent.locator(`tr.paragraph-type--${childClass}`); await expect(children).toHaveCount(expected.length);
    const actual = (await children.allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
    for (let index = 0; index < expected.length; index += 1) if (!actual[index]?.includes(expected[index])) mismatches.push({ component, index, expected: expected[index], actual: actual[index] });
    if (option) await expect(parent.locator(`[name$="${option.suffix}"]`)).toHaveValue(option.value);
    results.push({ component, marker, count: expected.length, order: expected, option: option?.value });
  };

  await verify('List left', 'list', 'QA-AUTOMATED-LIST-20261003-remaining-ITEM-1', 'list-item-text', [
    'QA-AUTOMATED-LIST-20261003-remaining-ITEM-1', 'QA-AUTOMATED-LIST-20261003-remaining-ITEM-2', 'QA-AUTOMATED-LIST-20261003-remaining-ITEM-3', 'QA List Left Item 4',
  ]);
  await verify('List right', 'list', 'QA-AUTOMATED-LIST-RIGHT-20261004-final-variants', 'list-item-text', [
    'QA-AUTOMATED-LIST-RIGHT-20261004-final-variants', 'QA List Right Item 2', 'QA List Right Item 3', 'QA List Right Item 4',
  ]);
  await verify('Tabs horizontal', 'tabs', 'QA-AUTOMATED-TABS-HEADING-20261003-remaining', 'tabs-item-text', [
    'QA-AUTOMATED-TAB-1-20261003-remaining', 'QA-AUTOMATED-TAB-2-20261003-remaining', 'QA-AUTOMATED-TAB-3-20261003-remaining', 'QA Horizontal Tab 4',
  ], { suffix: '[field_tabs_style]', value: 'horizontal' });
  await verify('Tabs accordion', 'tabs', 'QA-AUTOMATED-TABS-accordion-20261004-final-variants', 'tabs-item-text', [
    'QA accordion tab', 'QA Accordion Tab 2', 'QA Accordion Tab 3', 'QA Accordion Tab 4',
  ], { suffix: '[field_tabs_style]', value: 'accordion' });
  await verify('Tabs none', 'tabs', 'QA-AUTOMATED-TABS-none-20261004-final-variants', 'tabs-item-text', [
    'QA _none tab', 'QA None Tab 2', 'QA None Tab 3', 'QA None Tab 4',
  ], { suffix: '[field_tabs_style]', value: '_none' });
  await verify('Card Grid', 'grid', 'QA-AUTOMATED-CARD-GRID-HEADING-20261003-REMAINING', 'profile-card', [
    'QA-AUTOMATED-CARD-NAME-1-20261003-remaining', 'QA-AUTOMATED-CARD-NAME-2-20261003-remaining', 'QA-AUTOMATED-CARD-NAME-3-20261003-remaining', 'QA Grid Card 4',
  ]);

  for (const fixture of [
    { component: 'Collection white/light', marker: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20261003-REMAINING', style: 'white__attenuate_3_light_cards', expected: ['QA-AUTOMATED-COLLECTION-CARD-1-20261003-remaining', 'QA Collection White Light Card 2', 'QA Collection White Light Card 3', 'QA Collection White Light Card 4'] },
    { component: 'Collection light/white', marker: 'QA Collection Light', style: 'attenuate_3_light__white_cards', expected: ['QA card attenuate_3_light__white_cards', 'QA Collection Light White Card 2', 'QA Collection Light White Card 3', 'QA Collection Light White Card 4'] },
    { component: 'Collection white/purple', marker: 'QA Collection Purple', style: 'white__purple_cards', expected: ['QA card white__purple_cards', 'QA Collection White Purple Card 2', 'QA Collection White Purple Card 3', 'QA Collection White Purple Card 4'] },
    { component: 'Collection dark/white', marker: 'QA Collection Dark', style: 'attenuate_1_dark__white_cards', expected: ['QA card attenuate_1_dark__white_cards', 'QA Collection Dark White Card 2', 'QA Collection Dark White Card 3', 'QA Collection Dark White Card 4'] },
  ]) await verify(fixture.component, 'partners', fixture.marker, 'partners-logo', fixture.expected, { suffix: '[field_background_style]', value: fixture.style });

  for (const fixture of [
    { component: 'Collection v2 Display 2', marker: 'QA-AUTOMATED-COLLECTION-V2-TWO-HEADER-20261003-REMAINING', display: '2', expected: ['QA-AUTOMATED-COLLECTION-V2-CARD-1-20261003-remaining', 'QA-AUTOMATED-COLLECTION-V2-CARD-2-20261003-remaining', 'QA V2 2 Card 3', 'QA V2 2 Card 4', 'QA V2 2 Card 5'] },
    { component: 'Collection v2 Display 3', marker: 'QA-AUTOMATED-COLLECTION-V2-3-20261004-final-variants', display: '3', expected: ['QA 3 card 1', 'QA 3 card 2', 'QA 3 card 3', 'QA V2 3 Card 4', 'QA V2 3 Card 5'] },
    { component: 'Collection v2 Display 4', marker: 'QA-AUTOMATED-COLLECTION-V2-4-20261004-final-variants', display: '4', expected: ['QA 4 card 1', 'QA 4 card 2', 'QA 4 card 3', 'QA 4 card 4', 'QA V2 4 Card 5'] },
    { component: 'Collection v2 Carousel', marker: 'QA-AUTOMATED-COLLECTION-V2-carousel-20261004-final-variants', display: 'carousel', expected: ['QA carousel card 1', 'QA carousel card 2', 'QA carousel card 3', 'QA carousel card 4', 'QA carousel card 5'] },
  ]) await verify(fixture.component, 'card-collection', fixture.marker, 'card', fixture.expected, { suffix: '[field_card_display]', value: fixture.display });

  for (const marker of ['QA-AUTOMATED-CAROUSEL-HEADING-20261003-REMAINING', 'QA-AUTOMATED-CARD-CAROUSEL-20261004-063700']) {
    const parent = opened.wrapper.locator('tr.paragraph-type--subsidiaries').filter({ hasText: marker }); await expect(parent).toHaveCount(1); await expandRow(parent);
    await expect(parent.locator('tr.paragraph-type--subsidiaries-item')).toHaveCount(5); results.push({ component: 'Card Carousel', marker, count: 5 });
  }
  await verify('Tabs Card', 'tabs-card', 'QA-AUTOMATED-TABS-CARD-20261003-REMAINING', 'tabs-card-item', ['QA Tab', 'QA Card Tab 2', 'QA Card Tab 3', 'QA Card Tab 4']);
  console.log(`BENEFITS_MULTI_ITEM_PERSISTENCE ${JSON.stringify({ results, mismatches })}`);
  expect(mismatches).toEqual([]);
});

test('Benefits repeatable fixtures render and interact on desktop and mobile', async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  const response = await page.goto(host.publicPath, { waitUntil: 'networkidle' }); expect(response?.status()).toBe(200);
  const componentFor = (marker: string) => page.getByText(marker, { exact: false }).first().locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(@class,"paragraph--type--")][1]');
  const results: Array<Record<string, unknown>> = [];
  const verifyTexts = async (component: string, marker: string, expected: string[]) => {
    const parent = componentFor(marker); await expect(parent).toBeVisible();
    for (const text of expected) await expect(parent.getByText(text, { exact: false }).first()).toBeVisible();
    results.push({ component, marker, count: expected.length, desktopOverflow: await parent.evaluate((element) => element.scrollWidth > element.clientWidth + 1) });
    return parent;
  };
  await verifyTexts('List left', 'QA-AUTOMATED-LIST-20261003-remaining-ITEM-1', ['QA-AUTOMATED-LIST-20261003-remaining-ITEM-1', 'QA-AUTOMATED-LIST-20261003-remaining-ITEM-2', 'QA-AUTOMATED-LIST-20261003-remaining-ITEM-3', 'QA List Left Item 4']);
  await verifyTexts('List right', 'QA-AUTOMATED-LIST-RIGHT-20261004-final-variants', ['QA-AUTOMATED-LIST-RIGHT-20261004-final-variants', 'QA List Right Item 2', 'QA List Right Item 3', 'QA List Right Item 4']);
  await verifyTexts('Card Grid', 'QA-AUTOMATED-CARD-GRID-HEADING-20261003-REMAINING', ['QA-AUTOMATED-CARD-NAME-1-20261003-remaining', 'QA-AUTOMATED-CARD-NAME-2-20261003-remaining', 'QA-AUTOMATED-CARD-NAME-3-20261003-remaining', 'QA Grid Card 4']);
  for (const fixture of [
    ['QA-AUTOMATED-CARD-COLLECTION-HEADING-20261003-REMAINING', ['QA-AUTOMATED-COLLECTION-CARD-1-20261003-remaining', 'QA Collection White Light Card 2', 'QA Collection White Light Card 3', 'QA Collection White Light Card 4']],
    ['QA Collection Light', ['QA card attenuate_3_light__white_cards', 'QA Collection Light White Card 2', 'QA Collection Light White Card 3', 'QA Collection Light White Card 4']],
    ['QA Collection Purple', ['QA card white__purple_cards', 'QA Collection White Purple Card 2', 'QA Collection White Purple Card 3', 'QA Collection White Purple Card 4']],
    ['QA Collection Dark', ['QA card attenuate_1_dark__white_cards', 'QA Collection Dark White Card 2', 'QA Collection Dark White Card 3', 'QA Collection Dark White Card 4']],
  ] as const) await verifyTexts('Card Collection', fixture[0], [...fixture[1]]);
  for (const fixture of [
    ['QA-AUTOMATED-COLLECTION-V2-TWO-HEADER-20261003-REMAINING', ['QA-AUTOMATED-COLLECTION-V2-CARD-1-20261003-remaining', 'QA-AUTOMATED-COLLECTION-V2-CARD-2-20261003-remaining', 'QA V2 2 Card 3', 'QA V2 2 Card 4', 'QA V2 2 Card 5']],
    ['QA-AUTOMATED-COLLECTION-V2-3-20261004-final-variants', ['QA 3 card 1', 'QA 3 card 2', 'QA 3 card 3', 'QA V2 3 Card 4', 'QA V2 3 Card 5']],
    ['QA-AUTOMATED-COLLECTION-V2-4-20261004-final-variants', ['QA 4 card 1', 'QA 4 card 2', 'QA 4 card 3', 'QA 4 card 4', 'QA V2 4 Card 5']],
    ['QA-AUTOMATED-COLLECTION-V2-carousel-20261004-final-variants', ['QA carousel card 1', 'QA carousel card 2', 'QA carousel card 3', 'QA carousel card 4', 'QA carousel card 5']],
  ] as const) await verifyTexts('Card Collection v2', fixture[0], [...fixture[1]]);

  for (const fixture of [
    { marker: 'QA-AUTOMATED-TABS-HEADING-20261003-remaining', labels: ['QA-AUTOMATED-TAB-1-20261003-remaining', 'QA-AUTOMATED-TAB-2-20261003-remaining', 'QA-AUTOMATED-TAB-3-20261003-remaining', 'QA Horizontal Tab 4'] },
    { marker: 'QA-AUTOMATED-TABS-accordion-20261004-final-variants', labels: ['QA accordion tab', 'QA Accordion Tab 2', 'QA Accordion Tab 3', 'QA Accordion Tab 4'] },
    { marker: 'QA-AUTOMATED-TABS-none-20261004-final-variants', labels: ['QA _none tab', 'QA None Tab 2', 'QA None Tab 3', 'QA None Tab 4'] },
  ]) {
    const component = componentFor(fixture.marker); await expect(component).toBeVisible();
    for (const label of fixture.labels) await expect(component.getByRole('button', { name: label, exact: true })).toBeVisible();
    const target = component.getByRole('button', { name: fixture.labels[3], exact: true }); const initial = await target.getAttribute('aria-expanded');
    await target.click(); await expect(target).not.toHaveAttribute('aria-expanded', initial ?? '');
    await target.focus(); await target.press('Enter');
    if (await target.getAttribute('aria-disabled') === 'true') {
      await expect(target).toHaveAttribute('aria-expanded', 'true');
      const first = component.getByRole('button', { name: fixture.labels[0], exact: true });
      await first.focus(); await first.press('Enter');
      await expect(first).toHaveAttribute('aria-expanded', 'true');
      await expect(target).toHaveAttribute('aria-expanded', 'false');
    } else {
      await expect(target).toHaveAttribute('aria-expanded', initial ?? '');
    }
    results.push({ component: `Tabs ${fixture.marker}`, count: 4, mouse: true, keyboard: true });
  }
  await verifyTexts('Tabs Card', 'QA-AUTOMATED-TABS-CARD-20261003-REMAINING', ['QA Tab', 'QA Card Tab 2', 'QA Card Tab 3', 'QA Card Tab 4']);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(mobileOverflow).toBe(false);
  console.log(`BENEFITS_MULTI_ITEM_FRONTEND ${JSON.stringify({ results, mobileOverflow })}`);
});
