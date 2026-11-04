import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { AUTOMATED_IMAGE_MEDIA_ID } from '../src/config/automation';
import { basicPageConfig } from '../src/config/content-types';
import { getEffectiveCredentials, getEnvironmentConfig } from '../src/config/environments';
import { assertPublishingAllowed } from '../src/config/write-safety';
import { selectAutomationImageFixtureFromTrigger, selectExactExistingMediaFromTrigger } from '../src/content/media/media-library';
import { selectEntityReferenceFixture, verifyEntityReferenceFixture } from '../src/content/field-handlers/entity-reference-field';
import { fillOwnedEditor, submitNodeForm, validateSafeModerationState } from '../src/content/node-form';
import { NetworkMonitor } from '../src/diagnostics/network-monitor';
import { runPublishingWorkflow } from '../src/publishing/moderation-workflow';
import { activateOwnedParagraphEdit } from '../src/content/paragraphs/paragraph-safe-click';
import { buildCardCollectionFixture } from '../src/content/components/card-collection-fixture';

const target = process.env.DRUPAL_TARGET?.trim().toLowerCase() || 'devv';
const tier = process.env.DRUPAL_TIER?.trim().toLowerCase() || 'development';
const site = target === 'leidos' && tier === 'stage'
  ? { target: 'leidos', baseUrl: 'https://stage.leidos.com', nodeId: '25351', title: 'QA-AUTOMATED-STAGE-Basic-Page-20261103-142545-194d-UPDATED', relatedInsightId: '25366', statisticId: '25361', statisticTitle: 'QA-AUTOMATED-STAGE-Statistic-20261103-142646-224b-UPDATED', videoMediaId: '44536', videoMediaName: 'Leidos Australia Sea Archer Animation July 2026.mp4', artifactName: 'stage-node-25351' }
  : target === 'benefits'
  ? { target: 'benefits', baseUrl: 'https://benefits-dev.leidos.com', nodeId: '616', title: 'QA-AUTOMATED-Basic-Page-20261003-071529-9f8e-UPDATED', relatedInsightId: '636', artifactName: 'benefits-node-616' }
  : { target: 'devv', baseUrl: 'https://devv.leidos.com', nodeId: '25191', title: 'QA-AUTOMATED-Basic-Page-20261002-081641-8b7c-UPDATED', relatedInsightId: '25211', artifactName: 'node-25191' };
const host = { nodeId: site.nodeId, title: site.title };
const paragraphField = 'field_page_paragraphs';
const runId = process.env.COMPONENT_RUN_ID?.trim() || new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '');

type Result = { component: string; machineName: string; status: 'PASS' | 'BLOCKED' | 'FAIL'; delta?: string; marker?: string; reason?: string; published?: boolean; publicStatus?: number };

async function openOwnedEdit(page: Page): Promise<{ form: Locator; wrapper: Locator }> {
  if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log('COMPONENT_DIAG openOwnedEdit goto:start');
  const response = await page.goto(`/node/${host.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
  if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log(`COMPONENT_DIAG openOwnedEdit goto:done ${response?.status()}`);
  if (!response || response.status() >= 400) throw new Error(`Edit route returned HTTP ${response?.status() ?? 'unknown'}.`);
  const form = page.locator('form.node-page-edit-form, form[id^="node-page-edit-form"]').filter({ visible: true }).first();
  if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log('COMPONENT_DIAG openOwnedEdit title:start');
  if ((await form.locator('[name="title[0][value]"]').inputValue()) !== host.title) throw new Error('Exact QA node ownership check failed.');
  if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log('COMPONENT_DIAG openOwnedEdit title:done');
  return { form, wrapper: form.locator('.field--name-field-page-paragraphs.field--widget-paragraphs') };
}

async function deltas(wrapper: Locator, machineName: string): Promise<string[]> {
  if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log(`COMPONENT_DIAG deltas:${machineName}:all:start`);
  const rows = await wrapper.locator(`tr.paragraph-type--${machineName.replaceAll('_', '-')}`).all();
  if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log(`COMPONENT_DIAG deltas:${machineName}:all:done ${rows.length}`);
  const values: string[] = [];
  for (const row of rows) {
    if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log(`COMPONENT_DIAG deltas:${machineName}:attribute:start`);
    const name = await row.locator('[name^="field_page_paragraphs_"]').first().getAttribute('name');
    if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log(`COMPONENT_DIAG deltas:${machineName}:attribute:done`);
    const delta = /^field_page_paragraphs_(\d+)_/.exec(name ?? '')?.[1];
    if (delta) values.push(delta);
  }
  return values;
}

async function add(page: Page, wrapper: Locator, machineName: string): Promise<string> {
  const before = await deltas(wrapper, machineName);
  const control = wrapper.locator(`input[name="${paragraphField}_${machineName}_add_more"]`);
  if ((await control.count()) !== 1) throw new Error('Add control is not unique.');
  if (!await control.isVisible()) {
    const toggle = wrapper.locator('.paragraphs-add-wrapper .dropbutton-toggle button');
    if ((await toggle.count()) !== 1) throw new Error('Add dropdown is not unique.');
    await toggle.click();
    await control.waitFor({ state: 'visible', timeout: 10_000 });
  }
  const ajax = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
  await control.click();
  const response = await ajax;
  if (response.status() >= 500) throw new Error(`Add AJAX returned HTTP ${response.status()}.`);
  await expect.poll(async () => deltas(wrapper, machineName), { timeout: 30_000 }).not.toEqual(before);
  const after = await deltas(wrapper, machineName);
  const fresh = after.filter((delta) => !before.includes(delta));
  if (fresh.length !== 1) throw new Error(`Expected one new ${machineName} row, found ${fresh.length}.`);
  return fresh[0];
}

function field(wrapper: Locator, delta: string, suffix: string): Locator {
  return wrapper.locator(`[name="${paragraphField}[${delta}][subform]${suffix}"]`);
}

async function setEditor(form: Locator, delta: string, suffix: string, value: string, label: string): Promise<void> {
  await fillOwnedEditor(form, `textarea[name="${paragraphField}[${delta}][subform]${suffix}"]`, value, label);
}

async function saveAndPublish(page: Page, form: Locator, monitor: NetworkMonitor): Promise<void> {
  await validateSafeModerationState(form, basicPageConfig.label);
  await submitNodeForm(page, form, basicPageConfig.label);
  const messages = (await page.locator('.messages--error, [role="alert"]').allInnerTexts()).join(' | ');
  if (/error|required|invalid/i.test(messages)) throw new Error(`Drupal validation: ${messages.slice(0, 500)}`);
  const publishPage = await page.context().newPage();
  const publishMonitor = new NetworkMonitor();
  publishMonitor.start(publishPage);
  try {
    const publishing = await runPublishingWorkflow(publishPage, publishMonitor, basicPageConfig, {
      nodeId: Number(host.nodeId), title: host.title, machineName: basicPageConfig.machineName, label: basicPageConfig.label, moderation: 'Draft',
    });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published') throw new Error(`Publishing ended in ${publishing.finalState}: ${publishing.blockedReason ?? 'unknown reason'}`);
  } finally {
    publishMonitor.stop();
    await publishPage.close();
  }
}

async function assertStageManualCollectionPreserved(wrapper: Locator): Promise<void> {
  if (site.target !== 'leidos' || tier !== 'stage') return;
  const rows = wrapper.locator('tr.paragraph-type--partners');
  await expect(rows, 'The manual Stage Card: Collection must remain present.').toHaveCount(1);
  expect((await rows.first().innerText()).replace(/\s+/g, ' '), 'The manual Stage Card: Collection must retain four nested items.').toMatch(/Card: Collection\s+4\b/);
}

test('add, publish, and verify the remaining supported components on exact QA node', async ({ page }) => {
  test.setTimeout(process.env.COMPONENT_ONLY ? 600_000 : 3_600_000);
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(60_000);
  await page.context().route(/siteimprove|monsido/i, (route) => route.abort());
  const environment = getEnvironmentConfig();
  expect(environment.target).toBe(site.target);
  expect(environment.baseUrl).toBe(site.baseUrl);
  assertPublishingAllowed();
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const results: Result[] = [];

  const attempts: Array<{ component: string; machineName: string; marker?: string; populate: (page: Page, form: Locator, wrapper: Locator, delta: string) => Promise<void> }> = [
    { component: 'Video', machineName: 'video', marker: `QA-AUTOMATED-VIDEO-${runId}`, populate: async (currentPage, _form, wrapper, delta) => {
      await field(wrapper, delta, '[field_video_title][0][value]').fill(`QA-AUTOMATED-VIDEO-${runId}`);
      await field(wrapper, delta, '[field_video_caption][0][value]').fill('QA automated video caption.');
      await field(wrapper, delta, '[field_paragraph_border]').selectOption('padding');
      const trigger = wrapper.locator(`[name="field_video_media-media-library-open-button-${paragraphField}-${delta}-subform"]`).filter({ visible: true });
      const videoMediaId = ('videoMediaId' in site ? site.videoMediaId : undefined) ?? '3736';
      const videoMediaName = ('videoMediaName' in site ? site.videoMediaName : undefined) ?? 'Introducing the Next Level of Leidos';
      await selectExactExistingMediaFromTrigger(currentPage, trigger, videoMediaId, videoMediaName);
      const selectedMedia = wrapper.locator(`input[type="hidden"][name="${paragraphField}[${delta}][subform][field_video_media][selection][0][target_id]"]`);
      await expect(selectedMedia).toHaveValue(videoMediaId, { timeout: 30_000 });
      await expect(wrapper.locator('.ajax-progress, .throbber').filter({ visible: true })).toHaveCount(0, { timeout: 30_000 });
    } },
    { component: 'Formatted text (w/ image background)', machineName: 'formatted_text_with_img_bg', marker: `QA-AUTOMATED-IMAGE-BACKGROUND-${runId}`, populate: async (currentPage, form, wrapper, delta) => {
      await setEditor(form, delta, '[field_formatted_text][0][value]', `QA-AUTOMATED-IMAGE-BACKGROUND-${runId}`, 'Formatted text with image background');
      const row = wrapper.locator(`[name="${paragraphField}_${delta}_collapse"]`).locator('xpath=ancestor::tr[1]');
      await selectAutomationImageFixtureFromTrigger(currentPage, row.getByRole('button', { name: 'Add media', exact: true }), AUTOMATED_IMAGE_MEDIA_ID);
      await expect(row.locator('input[type="hidden"][name$="[selection][0][target_id]"]')).toHaveValue(AUTOMATED_IMAGE_MEDIA_ID, { timeout: 30_000 });
      await field(wrapper, delta, '[field_paragraph_border]').selectOption('padding');
      await expect(wrapper.locator('.ajax-progress, .throbber').filter({ visible: true })).toHaveCount(0, { timeout: 30_000 });
    } },
    { component: 'Blockquote', machineName: 'blockquote', marker: `QA-AUTOMATED-BLOCKQUOTE-${runId}`, populate: async (_page, form, _wrapper, delta) => {
      await setEditor(form, delta, '[field_blockquote_text][0][value]', `QA-AUTOMATED-BLOCKQUOTE-${runId}`, 'Blockquote');
    } },
    { component: 'List', machineName: 'list', marker: `QA-AUTOMATED-LIST-${runId}-ITEM-1`, populate: async (currentPage, _form, wrapper, delta) => {
      const addItem = wrapper.locator(`[name="${paragraphField}_${delta}_subform_field_list_items_list_item_text_add_more"]`);
      for (let index = 0; index < 3; index += 1) {
        const ajax = currentPage.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
        await addItem.click();
        if ((await ajax).status() >= 500) throw new Error('List item AJAX failed.');
        await wrapper.locator(`[name="${paragraphField}[${delta}][subform][field_list_items][${index}][subform][field_list_item_text][0][value]"]`).fill(`QA-AUTOMATED-LIST-${runId}-ITEM-${index + 1}`);
      }
    } },
    { component: 'Tabs', machineName: 'tabs', marker: `QA-AUTOMATED-TABS-HEADING-${runId}`, populate: async (currentPage, form, wrapper, delta) => {
      await field(wrapper, delta, '[field_tabs_style]').selectOption('horizontal');
      await field(wrapper, delta, '[field_tabs_head][0][value]').fill(`QA-AUTOMATED-TABS-HEADING-${runId}`);
      await field(wrapper, delta, '[field_paragraph_border]').selectOption('padding');
      for (let index = 0; index < 3; index += 1) {
        if (index > 0) {
          const addItem = wrapper.getByRole('button', { name: 'Add Tabs item - text', exact: true }).filter({ visible: true });
          const ajax = currentPage.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
          await addItem.click();
          if ((await ajax).status() >= 500) throw new Error('Tabs item AJAX failed.');
        }
        await field(wrapper, delta, `[field_tabs_items][${index}][subform][field_tabs_item_name][0][value]`).fill(`QA-AUTOMATED-TAB-${index + 1}-${runId}`);
        await setEditor(form, delta, `[field_tabs_items][${index}][subform][field_tabs_item_text][0][value]`, `QA-AUTOMATED-TAB-CONTENT-${index + 1}-${runId}`, `Tabs item ${index + 1}`);
      }
    } },
    { component: 'Card: Grid', machineName: 'grid', marker: `QA-AUTOMATED-CARD-GRID-HEADING-${runId}`, populate: async (currentPage, form, wrapper, delta) => {
      await field(wrapper, delta, '[field_grid_head][0][value]').fill(`QA-AUTOMATED-CARD-GRID-HEADING-${runId}`);
      await setEditor(form, delta, '[field_grid_text][0][value]', 'QA automated card grid text.', 'Card Grid text');
      await field(wrapper, delta, '[field_paragraph_border]').selectOption('padding');
      for (let index = 0; index < 3; index += 1) {
        if (index > 0) {
          const nestedRows = wrapper.locator('tr.paragraph-type--profile-card');
          const priorRows = await nestedRows.count();
          const addItem = wrapper.locator(`[name="${paragraphField}_${delta}_subform_field_grid_items_profile_card_add_more"]`).filter({ visible: true });
          await expect(addItem).toBeEnabled();
          await activateOwnedParagraphEdit(addItem);
          await expect.poll(() => nestedRows.count(), { timeout: 30_000 }).toBe(priorRows + 1);
        }
        const activeName = wrapper.locator(`[name^="${paragraphField}[${delta}][subform][field_grid_items]"][name$="[field_profile_card_name][0][value]"]`).filter({ visible: true });
        await expect(activeName).toHaveCount(1);
        const activeNameAttribute = await activeName.getAttribute('name') ?? '';
        const actualIndex = Number(/\[field_grid_items\]\[(\d+)\]/.exec(activeNameAttribute)?.[1] ?? -1);
        if (actualIndex < 0) throw new Error('Active Profile Card nested index could not be recovered.');
        const nameField = field(wrapper, delta, `[field_grid_items][${actualIndex}][subform][field_profile_card_name][0][value]`);
        await nameField.fill(`QA-AUTOMATED-CARD-NAME-${index + 1}-${runId}`);
        await field(wrapper, delta, `[field_grid_items][${actualIndex}][subform][field_profile_card_title][0][value]`).fill(`QA-AUTOMATED-CARD-${index + 1}-${runId}`);
        await field(wrapper, delta, `[field_grid_items][${actualIndex}][subform][field_profile_card_link][0][uri]`).fill(`/node/${host.nodeId}`);
        if (index === 0) {
          const trigger = wrapper.locator(`[name="field_media_image-media-library-open-button-${paragraphField}-${delta}-subform-field_grid_items-${actualIndex}-subform"]`).filter({ visible: true });
          await selectAutomationImageFixtureFromTrigger(currentPage, trigger, AUTOMATED_IMAGE_MEDIA_ID);
        }
      }
    } },
    { component: 'Card: Collection', machineName: 'partners', marker: `QA-AUTOMATED-CARD-COLLECTION-HEADING-${runId}`, populate: async (currentPage, _form, wrapper, delta) => {
      const fixture = buildCardCollectionFixture(host.nodeId, runId);
      await field(wrapper, delta, '[field_background_style]').selectOption(fixture.backgroundStyle);
      await field(wrapper, delta, '[field_paragraph_border]').selectOption(fixture.padding);
      await field(wrapper, delta, '[field_partners_head][0][value]').fill(fixture.heading);
      await field(wrapper, delta, '[field_partners_text][0][value]').fill(fixture.text);
      await field(wrapper, delta, '[field_partners_cta][0][uri]').fill(fixture.ctaUri);
      await field(wrapper, delta, '[field_partners_cta][0][title]').fill(fixture.ctaText);
      const addItem = wrapper.locator(`[name="${paragraphField}_${delta}_subform_field_partners_items_partners_logo_add_more"]`).filter({ visible: true });
      for (const [position, item] of fixture.items.entries()) {
        const before = await wrapper.locator(`tr.paragraph-type--partners-logo`).count();
        const ajax = currentPage.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
        await addItem.click();
        if ((await ajax).status() >= 500) throw new Error(`Partner logo ${position + 1} AJAX failed.`);
        await expect.poll(() => wrapper.locator('tr.paragraph-type--partners-logo').count(), { timeout: 30_000 }).toBe(before + 1);
        const activeHeading = wrapper.locator(`[name^="${paragraphField}[${delta}][subform][field_partners_items]"][name$="[field_partners_logo_head][0][value]"]`).filter({ visible: true });
        await expect(activeHeading).toHaveCount(1);
        const name = await activeHeading.getAttribute('name') ?? '';
        const itemIndex = Number(/\[field_partners_items\]\[(\d+)\]/.exec(name)?.[1] ?? -1);
        if (itemIndex < 0) throw new Error(`Partner logo ${position + 1} index could not be recovered.`);
        await activeHeading.fill(item.heading);
        await field(wrapper, delta, `[field_partners_items][${itemIndex}][subform][field_partners_logo_text][0][value]`).fill(item.text);
        await field(wrapper, delta, `[field_partners_items][${itemIndex}][subform][field_partners_logo_link][0][uri]`).fill(item.uri);
        await field(wrapper, delta, `[field_partners_items][${itemIndex}][subform][field_partners_logo_link][0][title]`).fill(item.linkText);
        const trigger = wrapper.locator(`[name="field_media_image-media-library-open-button-${paragraphField}-${delta}-subform-field_partners_items-${itemIndex}-subform"]`).filter({ visible: true });
        await selectAutomationImageFixtureFromTrigger(currentPage, trigger, AUTOMATED_IMAGE_MEDIA_ID);
        await expect(field(wrapper, delta, `[field_partners_items][${itemIndex}][subform][field_media_image][selection][0][target_id]`)).toHaveValue(AUTOMATED_IMAGE_MEDIA_ID, { timeout: 30_000 });
        await expect(wrapper.locator('.ajax-progress, .throbber').filter({ visible: true })).toHaveCount(0, { timeout: 30_000 });
        const collapse = wrapper.locator(`[name="${paragraphField}_${delta}_subform_field_partners_items_${itemIndex}_collapse"]`).filter({ visible: true });
        if (await collapse.count()) await activateOwnedParagraphEdit(collapse);
      }
    } },
    { component: 'Card: Collection (v2.0)', machineName: 'card_collection', marker: `QA-AUTOMATED-COLLECTION-V2-TWO-HEADER-${runId}`, populate: async (currentPage, form, wrapper, delta) => {
      await field(wrapper, delta, '[field_card_display]').selectOption('2');
      await field(wrapper, delta, '[field_intro_header][0][value]').fill(`QA-AUTOMATED-COLLECTION-V2-TWO-HEADER-${runId}`);
      await setEditor(form, delta, '[field_intro_text][0][value]', 'QA automated collection v2 intro.', 'Collection v2 intro');
      await field(wrapper, delta, '[field_cta][0][uri]').fill(`/node/${host.nodeId}`);
      await field(wrapper, delta, '[field_cta][0][title]').fill('View QA page');
      const addItem = wrapper.locator('[name*="field_cards"][name*="add_more"]').filter({ visible: true }).first();
      for (let index = 0; index < 2; index += 1) {
        if ((await field(wrapper, delta, `[field_cards][${index}][subform][field_header][0][value]`).count()) === 0) {
          const ajax = currentPage.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
          await addItem.click();
          if ((await ajax).status() >= 500) throw new Error('Collection v2 card AJAX failed.');
        }
        await field(wrapper, delta, `[field_cards][${index}][subform][field_header][0][value]`).fill(`QA-AUTOMATED-COLLECTION-V2-CARD-${index + 1}-${runId}`);
        await setEditor(form, delta, `[field_cards][${index}][subform][field_text_plain][0][value]`, `QA automated collection v2 card ${index + 1}.`, `Collection v2 card ${index + 1}`);
        await field(wrapper, delta, `[field_cards][${index}][subform][field_cta][0][uri]`).fill(`/node/${host.nodeId}`);
        await field(wrapper, delta, `[field_cards][${index}][subform][field_cta][0][title]`).fill('View QA page');
      }
    } },
    { component: 'Stat callout', machineName: 'stat_callout', marker: '200', populate: async (currentPage, _form, wrapper, delta) => {
      const fixture = {
        label: 'Statistic', selector: `[name="${paragraphField}[${delta}][subform][field_stat_callout_ref][0][target_id]"]`,
        expectedId: ('statisticId' in site ? site.statisticId : undefined) ?? '626', expectedLabel: ('statisticTitle' in site ? site.statisticTitle : undefined) ?? 'QA-AUTOMATED-Statistic-20261003-071721-4588-UPDATED',
        fixtureEditPath: `/node/${('statisticId' in site ? site.statisticId : undefined) ?? '626'}/edit`, fixtureTitleSelector: 'input[name="title[0][value]"]',
      } as const;
      const verifier = await currentPage.context().newPage();
      try { await verifyEntityReferenceFixture(verifier, fixture); } finally { await verifier.close(); }
      await selectEntityReferenceFixture(currentPage, wrapper, fixture);
      await field(wrapper, delta, '[field_paragraph_alignment]').selectOption('left');
      await field(wrapper, delta, '[field_paragraph_border]').selectOption('padding');
      await field(wrapper, delta, '[field_paragraph_color]').selectOption('purple');
    } },
    { component: 'Banner', machineName: 'featured_person', marker: `QA-AUTOMATED-BANNER-HEADING-${runId}`, populate: async (currentPage, _form, wrapper, delta) => {
      await field(wrapper, delta, '[field_featured_person_head][0][value]').fill('QA AUTOMATED');
      await field(wrapper, delta, '[field_featured_person_name][0][value]').fill(`QA-AUTOMATED-BANNER-HEADING-${runId}`);
      await field(wrapper, delta, '[field_featured_person_position][0][value]').fill('QA automated position');
      await field(wrapper, delta, '[field_featured_person_text][0][value]').fill('QA automated banner text.');
      await field(wrapper, delta, '[field_featured_person_cta][0][uri]').fill(`/node/${host.nodeId}`);
      await field(wrapper, delta, '[field_featured_person_cta][0][title]').fill('View QA page');
      await field(wrapper, delta, '[field_paragraph_border]').selectOption('padding');
      const trigger = wrapper.locator(`[name="field_media_image-media-library-open-button-${paragraphField}-${delta}-subform"]`).filter({ visible: true });
      await selectAutomationImageFixtureFromTrigger(currentPage, trigger, AUTOMATED_IMAGE_MEDIA_ID);
    } },
    { component: 'Card: Carousel', machineName: 'subsidiaries', marker: `QA-AUTOMATED-CARD-CAROUSEL-${runId}`, populate: async (currentPage, _form, wrapper, delta) => {
      await field(wrapper, delta, '[field_subsidiaries_head][0][value]').fill(`QA-AUTOMATED-CARD-CAROUSEL-${runId}`);
      await field(wrapper, delta, '[field_paragraph_border]').selectOption('padding');
      const carouselUri = field(wrapper, delta, '[field_subsidiaries_cta][0][uri]');
      if (site.target === 'leidos') await carouselUri.fill(`/node/${host.nodeId}`);
      else {
        await carouselUri.fill('Medical Plans');
        const carouselMenu = currentPage.locator('.ui-autocomplete:visible').last();
        await carouselMenu.waitFor({ state: 'visible', timeout: 20_000 });
        const carouselOption = carouselMenu.getByText(/Medical Plans and Prescription Drugs/).first();
        await expect(carouselOption).toBeVisible(); await carouselOption.click();
        await expect(carouselUri).toHaveValue(/Medical Plans and Prescription Drugs \(31\)/);
      }
      await field(wrapper, delta, '[field_subsidiaries_cta][0][title]').fill('QA Carousel Link');
      const addItem = wrapper.locator(`[name="${paragraphField}_${delta}_subform_field_subsidiaries_items_subsidiaries_item_add_more"]`).filter({ visible: true });
      for (let index = 0; index < 5; index += 1) {
        const ajax = currentPage.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
        await addItem.click();
        if ((await ajax).status() >= 500) throw new Error('Carousel item AJAX failed.');
        await field(wrapper, delta, `[field_subsidiaries_items][${index}][subform][field_subsidiaries_item_head][0][value]`).fill(`QA-AUTOMATED-CAROUSEL-CARD-${index + 1}-${runId}`);
        await field(wrapper, delta, `[field_subsidiaries_items][${index}][subform][field_subsidiaries_item_text][0][value]`).fill(`QA-AUTOMATED-CAROUSEL-TEXT-${index + 1}-${runId}`);
      }
    } },
    { component: 'Anchor', machineName: 'anchor', marker: `QA-AUTOMATED-ANCHOR-LABEL-${runId}`, populate: async (_page, _form, wrapper, delta) => {
      await field(wrapper, delta, '[field_anchor_id][0][value]').fill(`qa-automated-anchor-${runId}`);
      await field(wrapper, delta, '[field_anchor_label][0][value]').fill(`QA-AUTOMATED-ANCHOR-LABEL-${runId}`);
    } },
    { component: 'Jump nav', machineName: 'jump_nav', populate: async (_page, _form, wrapper, delta) => {
      await wrapper.locator(`input[name="${paragraphField}[${delta}][subform][field_jump_nav_type]"][value="inline"]`).check();
    } },
    { component: 'Embed Code', machineName: 'embed_code', marker: 'QA AUTOMATED EMBED CODE PLACEHOLDER', populate: async (currentPage, form, wrapper, delta) => {
      const type = field(wrapper, delta, '[field_embed_type]');
      await type.selectOption({ label: 'Placeholder' });
      await currentPage.waitForTimeout(1_500);
      await setEditor(form, delta, '[field_embed_placeholder][0][value]', 'QA AUTOMATED EMBED CODE PLACEHOLDER', 'Embed Code placeholder');
      await field(wrapper, delta, '[field_paragraph_border]').selectOption({ label: 'Padding' });
    } },
    { component: 'Formatted text w/color background', machineName: 'formatted_text_with_color_bg', marker: `QA-AUTOMATED-COLOR-BACKGROUND-${runId}`, populate: async (_page, form, wrapper, delta) => {
      await setEditor(form, delta, '[field_formatted_text][0][value]', `QA-AUTOMATED-COLOR-BACKGROUND-${runId}`, 'Formatted text with color background');
      await field(wrapper, delta, '[field_paragraph_color]').selectOption('bg-ang-indigo');
      await field(wrapper, delta, '[field_paragraph_border]').selectOption('padding');
    } },
    { component: 'Featured banner', machineName: 'featured_banner', marker: `QA-AUTOMATED-FEATURED-BANNER-${runId}`, populate: async (currentPage, form, wrapper, delta) => {
      await field(wrapper, delta, '[field_featured_banner_eyebrow][0][value]').fill('QA AUTOMATED');
      await field(wrapper, delta, '[field_featured_banner_head][0][value]').fill(`QA-AUTOMATED-FEATURED-BANNER-${runId}`);
      await setEditor(form, delta, '[field_featured_banner_text][0][value]', 'QA automated featured banner text.', 'Featured banner text');
      await field(wrapper, delta, '[field_featured_banner_cta][0][uri]').fill(`/node/${host.nodeId}`);
      await field(wrapper, delta, '[field_featured_banner_cta][0][title]').fill('View QA page');
      const action = wrapper.locator(`[name="${paragraphField}_${delta}_collapse"]`);
      const row = action.locator('xpath=ancestor::tr[1]');
      await selectAutomationImageFixtureFromTrigger(currentPage, row.getByRole('button', { name: 'Add media', exact: true }), AUTOMATED_IMAGE_MEDIA_ID);
    } },
    { component: 'Related insights', machineName: 'related_insights', marker: `QA-AUTOMATED-RELATED-INSIGHTS-${runId}`, populate: async (_page, _form, wrapper, delta) => {
      if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log('COMPONENT_DIAG related:view-mode:start');
      await field(wrapper, delta, '[field_related_insights_view_mode]').selectOption('block_8_cards_reskin');
      if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log('COMPONENT_DIAG related:view-mode:done');
      await field(wrapper, delta, '[field_related_insights_head][0][value]').fill(`QA-AUTOMATED-RELATED-INSIGHTS-${runId}`);
      if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log('COMPONENT_DIAG related:heading:done');
      const reference = field(wrapper, delta, '[field_related_insights_more_url]');
      if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log(`COMPONENT_DIAG related:reference:${await reference.evaluate((element) => JSON.stringify({ tag: element.tagName, type: element.getAttribute('type'), options: element instanceof HTMLSelectElement ? Array.from(element.options).map((option) => ({ value: option.value, text: option.text })) : [] }))}`);
      await reference.selectOption(site.relatedInsightId);
      if (process.env.COMPONENT_DIAGNOSTIC === '1') console.log('COMPONENT_DIAG related:reference:done');
    } },
    { component: 'Social feed', machineName: 'social_feed', marker: `QA-AUTOMATED-SOCIAL-FEED-${runId}`, populate: async (_page, form, wrapper, delta) => {
      await field(wrapper, delta, '[field_social_feed_head][0][value]').fill(`QA-AUTOMATED-SOCIAL-FEED-${runId}`);
      await setEditor(form, delta, '[field_social_feed_text][0][value]', 'QA automated social feed shell. No external submission.', 'Social feed text');
    } },
    { component: 'Marketo form', machineName: 'marketo', marker: `QA-AUTOMATED-MARKETO-${runId}`, populate: async (_page, _form, wrapper, delta) => {
      await field(wrapper, delta, '[field_marketo_head][0][value]').fill(`QA-AUTOMATED-MARKETO-${runId}`);
      await field(wrapper, delta, '[field_marketo_text][0][value]').fill('QA automated Marketo shell.');
      await field(wrapper, delta, '[field_marketo_form][0][form_id]').fill('1231231234');
    } },
    { component: 'Marketo form modal', machineName: 'marketo_modal', marker: `qa-automated-marketo-modal-${runId}`, populate: async (_page, _form, wrapper, delta) => {
      await field(wrapper, delta, '[field_marketo_anchorid][0][value]').fill(`qa-automated-marketo-modal-${runId}`);
      await field(wrapper, delta, '[field_marketo_head][0][value]').fill(`QA-AUTOMATED-MARKETO-MODAL-${runId}`);
      await field(wrapper, delta, '[field_marketo_text][0][value]').fill('QA automated modal shell.');
      await field(wrapper, delta, '[field_marketo_form][0][form_id]').fill('1231231234');
    } },
    { component: 'Employee lookup', machineName: 'employee_lookup', populate: async () => undefined },
    { component: 'Sticky Footer', machineName: 'sticky_footer', marker: `QA-AUTOMATED-STICKY-FOOTER-${runId}`, populate: async (_page, form, _wrapper, delta) => {
      await setEditor(form, delta, '[field_sticky_footer_text][0][value]', `QA-AUTOMATED-STICKY-FOOTER-${runId}`, 'Sticky Footer text');
    } },
    { component: 'Job search', machineName: 'job_search', marker: `QA-AUTOMATED-JOB-SEARCH-${runId}`, populate: async (_page, _form, wrapper, delta) => {
      await field(wrapper, delta, '[field_job_search_head][0][value]').fill(`QA-AUTOMATED-JOB-SEARCH-${runId}`);
      await field(wrapper, delta, '[field_job_search_text][0][value]').fill('QA automated job search text.');
    } },
    { component: 'Ceros embed', machineName: 'ceros_embed', marker: site.target === 'benefits' ? 'experience-5ef0b29321fa4' : `QA-AUTOMATED-CEROS-${runId}`, populate: async (_page, _form, wrapper, delta) => {
      const value = site.target === 'benefits'
        ? '<div style="position: relative;width: auto;padding: 0 0 56.33%;height: 0;top: 0;left: 0;bottom: 0;right: 0;margin: 0;border: 0 none" id="experience-5ef0b29321fa4" data-aspectRatio="1.77531207"><iframe allowfullscreen src="//view.ceros.com/leidos/redirect-test?heightOverride=721" style="position: absolute;top: 0;left: 0;bottom: 0;right: 0;margin: 0;padding: 0;border: 0 none;height: 1px;width: 1px;min-height: 100%;min-width: 100%" frameborder="0" class="ceros-experience" scrolling="no"></iframe></div><script type="text/javascript" src="//view.ceros.com/scroll-proxy.min.js" data-ceros-origin-domains="view.ceros.com"></script>'
        : `<div class="qa-automated-ceros-placeholder">QA-AUTOMATED-CEROS-${runId}</div>`;
      await field(wrapper, delta, '[field_ceros_embed_code][0][value]').fill(value);
    } },
    { component: 'Full Width Image', machineName: 'full_width_image', populate: async (currentPage, _form, wrapper, delta) => {
      const action = wrapper.locator(`[name="${paragraphField}_${delta}_collapse"]`);
      const row = action.locator('xpath=ancestor::tr[1]');
      await selectAutomationImageFixtureFromTrigger(currentPage, row.getByRole('button', { name: 'Add media', exact: true }), AUTOMATED_IMAGE_MEDIA_ID);
    } },
    { component: 'HubSpot Form', machineName: 'hubspot_form', marker: `qa-automated-hubspot-${runId}`, populate: async (_page, _form, wrapper, delta) => {
      await field(wrapper, delta, '[field_anchor_id][0][value]').fill(`qa-automated-hubspot-${runId}`);
      await field(wrapper, delta, '[field_header][0][value]').fill(`QA-AUTOMATED-HUBSPOT-${runId}`);
      await field(wrapper, delta, '[field_text_plain][0][value]').fill('QA automated HubSpot shell.');
      await field(wrapper, delta, '[field_form_id][0][form_id]').fill('00000000-0000-4000-8000-000000000000');
    } },
    { component: 'Tabs Card', machineName: 'tabs_card', marker: `QA-AUTOMATED-TABS-CARD-${runId}`, populate: async (_page, form, wrapper, delta) => {
      await field(wrapper, delta, '[field_intro_header][0][value]').fill(`QA-AUTOMATED-TABS-CARD-${runId}`);
      await setEditor(form, delta, '[field_intro_text][0][value]', 'QA automated tabs card intro.', 'Tabs Card intro');
      await field(wrapper, delta, '[field_tabs][0][subform][field_tab_label][0][value]').fill('QA Tab');
      await field(wrapper, delta, '[field_tabs][0][subform][field_title][0][value]').fill('QA Automated Tab Card');
      await setEditor(form, delta, '[field_tabs][0][subform][field_body][0][value]', 'QA automated tab card body.', 'Tabs Card body');
      await field(wrapper, delta, '[field_tabs][0][subform][field_link][0][uri]').fill(`/node/${host.nodeId}`);
      await field(wrapper, delta, '[field_tabs][0][subform][field_link][0][title]').fill('View QA page');
    } },
  ];

  const only = process.env.COMPONENT_ONLY?.trim();
  const stageBlocked = new Set(['marketo', 'marketo_modal', 'hubspot_form']);
  const applicableAttempts = site.target === 'leidos' ? attempts.filter((attempt) => !stageBlocked.has(attempt.machineName)) : attempts;
  const selectedAttempts = only ? applicableAttempts.filter((attempt) => attempt.machineName === only) : applicableAttempts;
  if (only && selectedAttempts.length !== 1 && only !== 'personalization') throw new Error(`Unknown COMPONENT_ONLY value: ${only}`);
  for (const attempt of selectedAttempts) {
    try {
      const opened = await openOwnedEdit(page);
      const existing = await deltas(opened.wrapper, attempt.machineName);
      const existingExact = attempt.machineName === 'video'
        ? (await Promise.all(existing.map(async (candidate) => ({ candidate, text: await opened.wrapper.locator('tr.paragraph-type--video').filter({ has: opened.wrapper.locator(`[name^="${paragraphField}_${candidate}_"]`) }).first().innerText().catch(() => '') })))).filter((entry) => entry.text.includes(('videoMediaName' in site ? site.videoMediaName : '') ?? '')).map((entry) => entry.candidate)
        : existing;
      if (existingExact.length > 0) {
        if (attempt.machineName === 'hubspot_form') {
          const publishPage = await page.context().newPage();
          const publishMonitor = new NetworkMonitor();
          publishMonitor.start(publishPage);
          try {
            const publishing = await runPublishingWorkflow(publishPage, publishMonitor, basicPageConfig, {
              nodeId: Number(host.nodeId), title: host.title, machineName: basicPageConfig.machineName, label: basicPageConfig.label, moderation: 'Draft',
            });
            if (publishing.status !== 'passed' || publishing.finalState !== 'Published') throw new Error(`Recovered HubSpot draft could not publish: ${publishing.blockedReason ?? publishing.finalState}`);
          } finally {
            publishMonitor.stop();
            await publishPage.close();
          }
        }
        results.push({ component: attempt.component, machineName: attempt.machineName, status: 'PASS', delta: existingExact[0], marker: attempt.marker, reason: 'Recovered existing persisted component; no duplicate created.', published: true });
        continue;
      }
      const delta = await add(page, opened.wrapper, attempt.machineName);
      await attempt.populate(page, opened.form, opened.wrapper, delta);
      await assertStageManualCollectionPreserved(opened.wrapper);
      await saveAndPublish(page, opened.form, monitor);
      const reopened = await openOwnedEdit(page);
      await assertStageManualCollectionPreserved(reopened.wrapper);
      const persisted = await deltas(reopened.wrapper, attempt.machineName);
      const exactPersisted = attempt.machineName === 'video'
        ? (await Promise.all(persisted.map(async (candidate) => ({ candidate, text: await reopened.wrapper.locator('tr.paragraph-type--video').filter({ has: reopened.wrapper.locator(`[name^="${paragraphField}_${candidate}_"]`) }).first().innerText().catch(() => '') })))).filter((entry) => entry.text.includes(('videoMediaName' in site ? site.videoMediaName : '') ?? '')).map((entry) => entry.candidate)
        : persisted;
      if (attempt.machineName === 'subsidiaries' ? exactPersisted.length < 1 : exactPersisted.length !== 1) throw new Error(`Exact persisted row count is ${exactPersisted.length}, expected ${attempt.machineName === 'subsidiaries' ? 'at least 1' : '1'} (all rows: ${persisted.length}).`);
      const publicResponse = await page.goto(`/node/${host.nodeId}`, { waitUntil: 'domcontentloaded' });
      if (!publicResponse || publicResponse.status() !== 200) throw new Error(`Public node returned HTTP ${publicResponse?.status() ?? 'unknown'}.`);
      if (attempt.machineName === 'related_insights') {
        await expect(page.locator('.paragraph--type--related-insights, [class*="related-insights"]').first()).toBeVisible();
        expect(await page.locator('.paragraph--type--related-insights a[href], [class*="related-insights"] a[href]').count()).toBeGreaterThan(0);
      } else if (attempt.machineName === 'video') {
        const videoComponent = page.locator('.paragraph--type--video').last();
        await expect(videoComponent).toBeVisible();
        expect(await videoComponent.locator('iframe, video, button, [class*="video"]').count()).toBeGreaterThan(0);
      } else if (attempt.marker && !(await page.locator('body').innerText()).includes(attempt.marker)) throw new Error('Public marker was not rendered.');
      results.push({ component: attempt.component, machineName: attempt.machineName, status: 'PASS', delta: exactPersisted[0], marker: attempt.marker, published: true, publicStatus: 200 });
    } catch (error) {
      results.push({ component: attempt.component, machineName: attempt.machineName, status: 'FAIL', marker: attempt.marker, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!only || only === 'personalization') results.push({ component: 'Personalization', machineName: 'personalization', status: 'BLOCKED', reason: 'Required Personalization Block autocomplete has no exact automation-owned entity reference; no configuration entity was created or modified.' });
  if (site.target === 'leidos' && !only) for (const machineName of stageBlocked) results.push({ component: machineName, machineName, status: 'BLOCKED', reason: 'No approved Stage external-form fixture identifier; no external form was submitted.' });
  monitor.stop();
  const directory = path.resolve('artifacts', 'component-functional', site.artifactName);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'remaining-component-results.json'), `${JSON.stringify({ nodeId: host.nodeId, target: environment.baseUrl, results }, null, 2)}\n`, 'utf8');
  console.log(`REMAINING_COMPONENT_RESULTS ${JSON.stringify(results)}`);
  expect(results.filter((result) => result.status === 'FAIL'), 'Unexpected component failures').toEqual([]);
});

test('Benefits external form color variants persist and render', async ({ page }) => {
  test.setTimeout(1_800_000);
  const environment = getEnvironmentConfig();
  expect(environment.target).toBe('benefits');
  expect(environment.baseUrl).toBe('https://benefits-dev.leidos.com');
  assertPublishingAllowed();
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const opened = await openOwnedEdit(page);
  const run = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '');
  const firstMarketo = await add(page, opened.wrapper, 'marketo');
  const color = field(opened.wrapper, firstMarketo, '[field_color_scheme]');
  const schemes = await color.locator('option').evaluateAll((options) => options.map((option, index) => ({ index, label: option.textContent?.trim() ?? '', value: (option as HTMLOptionElement).value })));
  const results: Array<Record<string, unknown>> = [];
  const populateMarketo = async (delta: string, scheme: { index: number; label: string; value: string }, ordinal: number) => {
    const slug = scheme.value === '_none' ? 'none' : scheme.value;
    const header = `QA-AUTOMATED-MARKETO-${slug}-${run}`;
    const text = `QA automated Marketo ${scheme.label} ${run}`;
    const formId = String(9100000000 + ordinal);
    await field(opened.wrapper, delta, '[field_marketo_head][0][value]').fill(header);
    await field(opened.wrapper, delta, '[field_marketo_text][0][value]').fill(text);
    await field(opened.wrapper, delta, '[field_marketo_form][0][form_id]').fill(formId);
    await field(opened.wrapper, delta, '[field_paragraph_border]').selectOption('padding');
    await field(opened.wrapper, delta, '[field_color_scheme]').selectOption(scheme.value);
    results.push({ component: 'marketo', ...scheme, header, text, formId, delta });
  };
  await populateMarketo(firstMarketo, schemes[0], 1);
  for (let index = 1; index < schemes.length; index += 1) await populateMarketo(await add(page, opened.wrapper, 'marketo'), schemes[index], index + 1);

  const modalDelta = await add(page, opened.wrapper, 'marketo_modal');
  const modalAnchor = `qa-marketo-modal-${run.toLowerCase()}`;
  const modalHeader = `QA-AUTOMATED-MARKETO-MODAL-${run}`;
  const modalText = `QA automated Marketo modal ${run}`;
  const modalFormId = '9200000001';
  await field(opened.wrapper, modalDelta, '[field_marketo_anchorid][0][value]').fill(modalAnchor);
  await field(opened.wrapper, modalDelta, '[field_marketo_head][0][value]').fill(modalHeader);
  await field(opened.wrapper, modalDelta, '[field_marketo_text][0][value]').fill(modalText);
  await field(opened.wrapper, modalDelta, '[field_marketo_form][0][form_id]').fill(modalFormId);

  const firstHubspot = await add(page, opened.wrapper, 'hubspot_form');
  const hubspotSchemes = await field(opened.wrapper, firstHubspot, '[field_color_scheme]').locator('option').evaluateAll((options) => options.map((option, index) => ({ index, label: option.textContent?.trim() ?? '', value: (option as HTMLOptionElement).value })));
  const displays = await field(opened.wrapper, firstHubspot, '[field_form_display]').locator('option').evaluateAll((options) => options.map((option) => ({ label: option.textContent?.trim() ?? '', value: (option as HTMLOptionElement).value })));
  const populateHubspot = async (delta: string, scheme: { index: number; label: string; value: string }, ordinal: number, display = 'inline') => {
    const slug = scheme.value === '_none' ? 'none' : scheme.value;
    const anchor = `qa-hubspot-${slug}-${ordinal}-${run.toLowerCase()}`;
    const header = `QA-AUTOMATED-HUBSPOT-${slug}-${run}`;
    const text = `QA automated HubSpot ${scheme.label} ${run}`;
    const formId = String(9300000000 + ordinal);
    await field(opened.wrapper, delta, '[field_form_display]').selectOption(display);
    await field(opened.wrapper, delta, '[field_anchor_id][0][value]').fill(anchor);
    await field(opened.wrapper, delta, '[field_header][0][value]').fill(header);
    await field(opened.wrapper, delta, '[field_text_plain][0][value]').fill(text);
    await field(opened.wrapper, delta, '[field_form_id][0][form_id]').fill(formId);
    await field(opened.wrapper, delta, '[field_color_scheme]').selectOption(scheme.value);
    await field(opened.wrapper, delta, '[field_paragraph_border]').selectOption('padding');
    results.push({ component: 'hubspot', display, ...scheme, anchor, header, text, formId, delta });
  };
  await populateHubspot(firstHubspot, hubspotSchemes[0], 1);
  for (let index = 1; index < hubspotSchemes.length; index += 1) await populateHubspot(await add(page, opened.wrapper, 'hubspot_form'), hubspotSchemes[index], index + 1);
  if (displays.some((display) => display.value === 'modal')) await populateHubspot(await add(page, opened.wrapper, 'hubspot_form'), hubspotSchemes[0], 99, 'modal');

  await saveAndPublish(page, opened.form, monitor);
  const fresh = await page.context().newPage();
  try {
    await fresh.goto(`/node/${host.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    const editText = (await fresh.locator('.field--name-field-page-paragraphs').innerText()).replace(/\s+/g, ' ');
    for (const result of results) {
      expect(editText).toContain(String(result.header));
      expect(editText).toContain(String(result.formId));
    }
    expect(editText).toContain(modalHeader);
    expect(editText).toContain(modalAnchor);
    const response = await fresh.goto(`/node/${host.nodeId}`, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    const publicText = (await fresh.locator('body').innerText()).replace(/\s+/g, ' ');
    for (const result of results) {
      expect(publicText).toContain(String(result.header));
      expect(publicText).toContain(String(result.text));
    }
    const wrappers = await fresh.locator('.paragraph--type--marketo, .paragraph--type--marketo-modal, .paragraph--type--hubspot-form').evaluateAll((elements) => elements.map((element) => ({ classes: element.className, text: (element.textContent ?? '').replace(/\s+/g, ' ').trim() })));
    console.log(`BENEFITS_EXTERNAL_FORM_RESULTS ${JSON.stringify({ run, schemes, displays, modal: { anchor: modalAnchor, header: modalHeader, text: modalText, formId: modalFormId }, results, wrappers })}`);
  } finally {
    await fresh.close();
    monitor.stop();
  }
});

test('Benefits final material component variants persist, publish, and render', async ({ page }) => {
  test.setTimeout(3_600_000);
  expect(['benefits', 'leidos']).toContain(site.target);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  assertPublishingAllowed();
  const monitor = new NetworkMonitor(); monitor.start(page);
  const opened = await openOwnedEdit(page);
  const run = site.target === 'leidos' ? '20261005-stage-variants' : '20261004-final-variants';
  const created: Array<{ component: string; value: string; marker: string; delta: string }> = [];
  const addRecord = (component: string, value: string, marker: string, delta: string) => created.push({ component, value, marker, delta });
  const featuredColors = ['white', 'gray', 'dark-gray', 'purple', 'dark-purple', 'green'];
  const existingFixture = await opened.form.getByText(`QA-AUTOMATED-FEATURED-white-right-${run}`, { exact: false }).count() > 0;

  if (existingFixture) {
    featuredColors.forEach((color, index) => addRecord('featured_banner', `${index === 0 ? 'right' : 'left'}:${color}`, `QA-AUTOMATED-FEATURED-${color}-${index === 0 ? 'right' : 'left'}-${run}`, 'existing'));
    for (const style of ['accordion', '_none']) addRecord('tabs', style, `QA-AUTOMATED-TABS-${style === '_none' ? 'none' : style}-${run}`, 'existing');
    addRecord('jump_nav', 'sticky', `QA-AUTOMATED-JUMP-STICKY-${run}`, 'existing');
    for (const style of ['attenuate_3_light__white_cards', 'white__purple_cards', 'attenuate_1_dark__white_cards']) addRecord('partners', style, `QA-AUTOMATED-COLLECTION-${style}-${run}`, 'existing');
    for (const display of ['3', '4', 'carousel']) addRecord('card_collection', display, `QA-AUTOMATED-COLLECTION-V2-${display}-${run}`, 'existing');
    for (const color of ['bg-ang-purple', 'bg-ang-green', 'bg-ang-teal']) addRecord('formatted_text_with_color_bg', color, `QA-AUTOMATED-COLOR-${color}-${run}`, 'existing');
    addRecord('list', 'right', `QA-AUTOMATED-LIST-RIGHT-${run}`, 'existing');
    for (const color of ['_none', 'blue', 'green', 'white']) addRecord('blockquote', color, `QA-AUTOMATED-BLOCKQUOTE-${color}-${run}`, 'existing');
    ['_none', 'blue', 'green'].forEach((color, index) => addRecord('stat_callout', `${index === 0 ? 'right' : 'left'}:${color}`, `QA-AUTOMATED-STAT-${color}-${run}`, 'existing'));
  } else {

  const populateFeatured = async (color: string, alignment: string, ordinal: number) => {
    const delta = await add(page, opened.wrapper, 'featured_banner');
    const marker = `QA-AUTOMATED-FEATURED-${color}-${alignment}-${run}`;
    await field(opened.wrapper, delta, '[field_featured_banner_eyebrow][0][value]').fill('QA AUTOMATED');
    await field(opened.wrapper, delta, '[field_featured_banner_head][0][value]').fill(marker);
    await setEditor(opened.form, delta, '[field_featured_banner_text][0][value]', `QA variant ${ordinal}`, 'Featured banner variant');
    await field(opened.wrapper, delta, '[field_featured_banner_cta][0][uri]').fill(`/node/${host.nodeId}`);
    await field(opened.wrapper, delta, '[field_featured_banner_cta][0][title]').fill('View QA page');
    await field(opened.wrapper, delta, '[field_paragraph_alignment]').selectOption(alignment);
    await field(opened.wrapper, delta, '[field_paragraph_color]').selectOption(color);
    const row = opened.wrapper.locator(`[name="${paragraphField}_${delta}_collapse"]`).locator('xpath=ancestor::tr[1]');
    await selectAutomationImageFixtureFromTrigger(page, row.getByRole('button', { name: 'Add media', exact: true }), AUTOMATED_IMAGE_MEDIA_ID);
    addRecord('featured_banner', `${alignment}:${color}`, marker, delta);
  };
  for (let index = 0; index < featuredColors.length; index += 1) await populateFeatured(featuredColors[index], index === 0 ? 'right' : 'left', index + 1);

  for (const style of ['accordion', '_none']) {
    const delta = await add(page, opened.wrapper, 'tabs');
    const marker = `QA-AUTOMATED-TABS-${style === '_none' ? 'none' : style}-${run}`;
    await field(opened.wrapper, delta, '[field_tabs_style]').selectOption(style);
    await field(opened.wrapper, delta, '[field_tabs_head][0][value]').fill(marker);
    await field(opened.wrapper, delta, '[field_tabs_items][0][subform][field_tabs_item_name][0][value]').fill(`QA ${style} tab`);
    await setEditor(opened.form, delta, '[field_tabs_items][0][subform][field_tabs_item_text][0][value]', `QA ${style} tab content`, `Tabs ${style}`);
    addRecord('tabs', style, marker, delta);
  }

  {
    const delta = await add(page, opened.wrapper, 'jump_nav');
    const marker = `QA-AUTOMATED-JUMP-STICKY-${run}`;
    await opened.wrapper.locator(`input[name="${paragraphField}[${delta}][subform][field_jump_nav_type]"][value="sticky"]`).check();
    addRecord('jump_nav', 'sticky', marker, delta);
  }

  const partnerStyles = ['attenuate_3_light__white_cards', 'white__purple_cards', 'attenuate_1_dark__white_cards'];
  for (const style of partnerStyles) {
    const delta = await add(page, opened.wrapper, 'partners');
    const marker = `QA-AUTOMATED-COLLECTION-${style}-${run}`;
    await field(opened.wrapper, delta, '[field_background_style]').selectOption(style);
    await field(opened.wrapper, delta, '[field_partners_head][0][value]').fill(marker);
    await field(opened.wrapper, delta, '[field_partners_text][0][value]').fill('QA collection variant');
    let heading = opened.wrapper.locator(`[name^="${paragraphField}[${delta}][subform][field_partners_items]"][name$="[field_partners_logo_head][0][value]"]`).filter({ visible: true });
    if ((await heading.count()) === 0) {
      await opened.wrapper.locator(`[name="${paragraphField}_${delta}_subform_field_partners_items_partners_logo_add_more"]`).filter({ visible: true }).click();
      heading = opened.wrapper.locator(`[name^="${paragraphField}[${delta}][subform][field_partners_items]"][name$="[field_partners_logo_head][0][value]"]`).filter({ visible: true });
      await heading.waitFor({ state: 'visible', timeout: 30_000 });
    }
    await expect(heading).toHaveCount(1);
    const headingName = await heading.getAttribute('name') ?? '';
    const itemIndex = Number(/\[field_partners_items\]\[(\d+)\]/.exec(headingName)?.[1] ?? -1);
    expect(itemIndex).toBeGreaterThanOrEqual(0);
    await heading.fill(`QA card ${style}`);
    await field(opened.wrapper, delta, `[field_partners_items][${itemIndex}][subform][field_partners_logo_text][0][value]`).fill('QA collection card');
    await field(opened.wrapper, delta, `[field_partners_items][${itemIndex}][subform][field_partners_logo_link][0][uri]`).fill(`/node/${host.nodeId}`);
    await field(opened.wrapper, delta, `[field_partners_items][${itemIndex}][subform][field_partners_logo_link][0][title]`).fill('View QA page');
    addRecord('partners', style, marker, delta);
  }

  for (const display of ['3', '4', 'carousel']) {
    const delta = await add(page, opened.wrapper, 'card_collection');
    const marker = `QA-AUTOMATED-COLLECTION-V2-${display}-${run}`;
    await field(opened.wrapper, delta, '[field_card_display]').selectOption(display);
    await field(opened.wrapper, delta, '[field_intro_header][0][value]').fill(marker);
    await setEditor(opened.form, delta, '[field_intro_text][0][value]', `QA display ${display}`, `Collection v2 ${display}`);
    const cardCount = display === 'carousel' ? 5 : Number(display);
    const addItem = opened.wrapper.locator(`[name="${paragraphField}_${delta}_subform_field_cards_card_add_more"]`).filter({ visible: true });
    for (let index = 0; index < cardCount; index += 1) {
      if (index > 0) await activateOwnedParagraphEdit(addItem);
      let cardHeader = opened.wrapper.locator(`[name^="${paragraphField}[${delta}][subform][field_cards]"][name$="[field_header][0][value]"]`).filter({ visible: true });
      if ((await cardHeader.count()) === 0) {
        const editControls = opened.wrapper.locator(`input[name^="${paragraphField}_${delta}_subform_field_cards_"][name$="_edit"]`).filter({ visible: true });
        await activateOwnedParagraphEdit(editControls.last());
        cardHeader = opened.wrapper.locator(`[name^="${paragraphField}[${delta}][subform][field_cards]"][name$="[field_header][0][value]"]`).filter({ visible: true });
      }
      await cardHeader.waitFor({ state: 'visible', timeout: 30_000 });
      await expect(cardHeader).toHaveCount(1);
      const cardName = await cardHeader.getAttribute('name') ?? '';
      const actualIndex = Number(/\[field_cards\]\[(\d+)\]/.exec(cardName)?.[1] ?? -1);
      expect(actualIndex).toBeGreaterThanOrEqual(0);
      await cardHeader.fill(`QA ${display} card ${index + 1}`);
      await field(opened.wrapper, delta, `[field_cards][${actualIndex}][subform][field_cta][0][uri]`).fill(`/node/${host.nodeId}`);
      await field(opened.wrapper, delta, `[field_cards][${actualIndex}][subform][field_cta][0][title]`).fill('View QA page');
      await activateOwnedParagraphEdit(opened.wrapper.locator(`[name="${paragraphField}_${delta}_subform_field_cards_${actualIndex}_collapse"]`));
    }
    addRecord('card_collection', display, marker, delta);
  }

  for (const color of ['bg-ang-purple', 'bg-ang-green', 'bg-ang-teal']) {
    const delta = await add(page, opened.wrapper, 'formatted_text_with_color_bg');
    const marker = `QA-AUTOMATED-COLOR-${color}-${run}`;
    await setEditor(opened.form, delta, '[field_formatted_text][0][value]', marker, `Color background ${color}`);
    await field(opened.wrapper, delta, '[field_paragraph_color]').selectOption(color);
    addRecord('formatted_text_with_color_bg', color, marker, delta);
  }

  {
    const delta = await add(page, opened.wrapper, 'list'); const marker = `QA-AUTOMATED-LIST-RIGHT-${run}`;
    await field(opened.wrapper, delta, '[field_paragraph_alignment]').selectOption('right');
    await opened.wrapper.locator(`[name="${paragraphField}_${delta}_subform_field_list_items_list_item_text_add_more"]`).click();
    await field(opened.wrapper, delta, '[field_list_items][0][subform][field_list_item_text][0][value]').fill(marker);
    addRecord('list', 'right', marker, delta);
  }

  for (const color of ['_none', 'blue', 'green', 'white']) {
    const delta = await add(page, opened.wrapper, 'blockquote'); const marker = `QA-AUTOMATED-BLOCKQUOTE-${color}-${run}`;
    await setEditor(opened.form, delta, '[field_blockquote_text][0][value]', marker, `Blockquote ${color}`);
    await field(opened.wrapper, delta, '[field_paragraph_color]').selectOption(color);
    addRecord('blockquote', color, marker, delta);
  }

  const existingStat = opened.wrapper.locator('tr.paragraph-type--stat-callout').first();
  const statEdit = existingStat.getByRole('button', { name: 'Edit', exact: true });
  if (await statEdit.isVisible()) await activateOwnedParagraphEdit(statEdit);
  const statReference = await existingStat.locator('[name$="[field_stat_callout_ref][0][target_id]"]').inputValue();
  for (const [index, color] of ['_none', 'blue', 'green'].entries()) {
    const delta = await add(page, opened.wrapper, 'stat_callout'); const marker = `QA-AUTOMATED-STAT-${color}-${run}`;
    await field(opened.wrapper, delta, '[field_stat_callout_ref][0][target_id]').fill(statReference);
    await field(opened.wrapper, delta, '[field_paragraph_alignment]').selectOption(index === 0 ? 'right' : 'left');
    await field(opened.wrapper, delta, '[field_paragraph_color]').selectOption(color);
    addRecord('stat_callout', `${index === 0 ? 'right' : 'left'}:${color}`, marker, delta);
  }

  await saveAndPublish(page, opened.form, monitor);
  }
  const reopened = await openOwnedEdit(page);
  for (const item of created) {
    const partnerHeading: Record<string, string> = { attenuate_3_light__white_cards: 'QA Collection Light', white__purple_cards: 'QA Collection Purple', attenuate_1_dark__white_cards: 'QA Collection Dark' };
    const rowMarker = item.component === 'partners' ? partnerHeading[item.value] : item.marker;
    const row = reopened.wrapper.locator(`tr.paragraph-type--${item.component.replaceAll('_', '-')}`).filter({ hasText: rowMarker });
    if (item.component !== 'jump_nav' && item.component !== 'stat_callout') await expect(row).toHaveCount(1);
  }
  const response = await page.goto(`/node/${host.nodeId}`, { waitUntil: 'networkidle' }); expect(response?.status()).toBe(200);
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const item of created.filter((entry) => entry.marker.includes('QA-AUTOMATED') && !['jump_nav', 'stat_callout'].includes(entry.component))) expect(body).toContain(item.marker.toLowerCase());
  console.log(`BENEFITS_FINAL_VARIANTS ${JSON.stringify({ created, sprinklr: 'BLOCKED_NO_APPROVED_SAFE_FIXTURE' })}`);
  monitor.stop();
});

test('Benefits final material component variants expose frontend behavior', async ({ page }) => {
  const run = site.target === 'leidos' ? '20261005-stage-variants' : '20261004-final-variants';
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const response = await page.goto(`/node/${host.nodeId}`, { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  const componentFor = (marker: string) => page.getByText(marker, { exact: false }).first().locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(@class,"paragraph--type--")][1]');
  const evidence: Record<string, unknown> = {};

  const accordion = componentFor(`QA-AUTOMATED-TABS-accordion-${run}`);
  const accordionControl = accordion.getByRole('button', { name: 'QA accordion tab', exact: true });
  await expect(accordionControl).toBeVisible();
  const initialExpanded = await accordionControl.getAttribute('aria-expanded');
  await accordionControl.click();
  await expect(accordionControl).not.toHaveAttribute('aria-expanded', initialExpanded ?? '');
  const mouseExpanded = await accordionControl.getAttribute('aria-expanded');
  await accordionControl.focus();
  await accordionControl.press('Enter');
  await expect(accordionControl).toHaveAttribute('aria-expanded', initialExpanded ?? '');
  evidence.tabsAccordion = { initialExpanded, mouseExpanded, keyboardExpanded: await accordionControl.getAttribute('aria-expanded') };

  const noneTabs = componentFor(`QA-AUTOMATED-TABS-none-${run}`);
  await expect(noneTabs).toBeVisible();
  evidence.tabsNone = await noneTabs.evaluate((element) => ({ classes: element.className, roles: Array.from(element.querySelectorAll('[role]')).map((node) => node.getAttribute('role')) }));

  const collectionCards = {
    '3': ['QA 3 card 1', 'QA 3 card 2', 'QA 3 card 3', 'QA V2 3 Card 4', 'QA V2 3 Card 5'],
    '4': ['QA 4 card 1', 'QA 4 card 2', 'QA 4 card 3', 'QA 4 card 4', 'QA V2 4 Card 5'],
    carousel: ['QA carousel card 1', 'QA carousel card 2', 'QA carousel card 3', 'QA carousel card 4', 'QA carousel card 5'],
  } as const;
  for (const [display, expectedCards] of Object.entries(collectionCards)) {
    const component = componentFor(`QA-AUTOMATED-COLLECTION-V2-${display}-${run}`);
    await expect(component).toBeVisible();
    for (const card of expectedCards) await expect(component.getByText(card, { exact: true })).toBeVisible();
    if (display === 'carousel') {
      const previous = component.getByRole('button', { name: /previous slide/i });
      const next = component.getByRole('button', { name: /next slide/i });
      await expect(previous).toBeVisible(); await expect(next).toBeVisible();
      const state = () => component.evaluate((element) => ({ transform: Array.from(element.querySelectorAll<HTMLElement>('[style*="transform"]')).map((node) => node.style.transform).join('|'), active: Array.from(element.querySelectorAll('.swiper-pagination-bullet-active, [aria-current="true"]')).map((node) => node.className).join('|') }));
      const initial = await state(); await next.click(); await expect.poll(state).not.toEqual(initial); await page.waitForTimeout(750);
      const afterNext = await state(); await previous.click(); await page.waitForTimeout(750); await expect.poll(state).not.toEqual(afterNext);
      await next.focus(); await next.press('Enter'); await page.waitForTimeout(750); await expect.poll(state).not.toEqual(initial);
      evidence.cardCollectionCarousel = { initial, afterNext, keyboard: await state() };
    }
  }

  const themedMarkers = [
    ...['white', 'gray', 'dark-gray', 'purple', 'dark-purple', 'green'].map((color, index) => `QA-AUTOMATED-FEATURED-${color}-${index === 0 ? 'right' : 'left'}-${run}`),
    ...['attenuate_3_light__white_cards', 'white__purple_cards', 'attenuate_1_dark__white_cards'].map((style) => `QA-AUTOMATED-COLLECTION-${style}-${run}`),
    ...['bg-ang-purple', 'bg-ang-green', 'bg-ang-teal'].map((color) => `QA-AUTOMATED-COLOR-${color}-${run}`),
    ...['_none', 'blue', 'green', 'white'].map((color) => `QA-AUTOMATED-BLOCKQUOTE-${color}-${run}`),
  ];
  const presentation = [];
  for (const marker of themedMarkers) {
    const component = componentFor(marker); await expect(component).toBeVisible();
    presentation.push({ marker, ...(await component.evaluate((element) => {
      const slot = element.closest('.paragraph-slot') ?? element;
      const style = getComputedStyle(slot);
      return { classes: (slot as HTMLElement).className, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, color: style.color, overflow: element.scrollWidth > element.clientWidth + 1 };
    })) });
  }
  expect(presentation.every((item) => !item.overflow)).toBe(true);
  evidence.presentation = presentation;
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflows: string[] = [];
  for (const marker of themedMarkers) if (await componentFor(marker).evaluate((element) => element.scrollWidth > element.clientWidth + 1)) mobileOverflows.push(marker);
  evidence.mobileOverflows = mobileOverflows;
  console.log(`BENEFITS_FINAL_VARIANT_BEHAVIOR ${JSON.stringify(evidence)}`);
  expect(mobileOverflows).toEqual([]);
});

test('Benefits final material component variants retain exact configuration', async ({ page }) => {
  test.setTimeout(600_000);
  const run = site.target === 'leidos' ? '20261005-stage-variants' : '20261004-final-variants';
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const opened = await openOwnedEdit(page);
  const verifySelect = async (type: string, marker: string, suffix: string, expected: string) => {
    const row = opened.wrapper.locator(`tr.paragraph-type--${type}`).filter({ hasText: marker });
    await expect(row).toHaveCount(1);
    const actionName = await row.locator('input[name$="_edit"], input[name$="_collapse"]').first().getAttribute('name') ?? '';
    const delta = /field_page_paragraphs_(\d+)_(?:edit|collapse)/.exec(actionName)?.[1];
    expect(delta).toBeTruthy();
    const edit = row.getByRole('button', { name: 'Edit', exact: true });
    if (await edit.isVisible()) await activateOwnedParagraphEdit(edit);
    await expect(opened.wrapper.locator(`[name="${paragraphField}[${delta}][subform]${suffix}"]`)).toHaveValue(expected, { timeout: 30_000 });
  };
  const featuredColors = ['white', 'gray', 'dark-gray', 'purple', 'dark-purple', 'green'];
  for (let index = 0; index < featuredColors.length; index += 1) {
    const color = featuredColors[index]; const alignment = index === 0 ? 'right' : 'left';
    const marker = `QA-AUTOMATED-FEATURED-${color}-${alignment}-${run}`;
    await verifySelect('featured-banner', marker, '[field_paragraph_alignment]', alignment);
    await verifySelect('featured-banner', marker, '[field_paragraph_color]', color);
  }
  for (const style of ['accordion', '_none']) await verifySelect('tabs', `QA-AUTOMATED-TABS-${style === '_none' ? 'none' : style}-${run}`, '[field_tabs_style]', style);
  for (const [style, heading] of [['attenuate_3_light__white_cards', 'QA Collection Light'], ['white__purple_cards', 'QA Collection Purple'], ['attenuate_1_dark__white_cards', 'QA Collection Dark']] as const) await verifySelect('partners', heading, '[field_background_style]', style);
  for (const display of ['3', '4', 'carousel']) await verifySelect('card-collection', `QA-AUTOMATED-COLLECTION-V2-${display}-${run}`, '[field_card_display]', display);
  for (const color of ['bg-ang-purple', 'bg-ang-green', 'bg-ang-teal']) await verifySelect('formatted-text-with-color-bg', `QA-AUTOMATED-COLOR-${color}-${run}`, '[field_paragraph_color]', color);
  await verifySelect('list', `QA-AUTOMATED-LIST-RIGHT-${run}`, '[field_paragraph_alignment]', 'right');
  for (const color of ['_none', 'blue', 'green', 'white']) await verifySelect('blockquote', `QA-AUTOMATED-BLOCKQUOTE-${color}-${run}`, '[field_paragraph_color]', color);

  const collectOptions = async (type: string, suffix: string) => {
    const rows = opened.wrapper.locator(`tr.paragraph-type--${type}`);
    const values: string[] = [];
    for (let index = 0; index < await rows.count(); index += 1) {
      const row = rows.nth(index); const edit = row.getByRole('button', { name: 'Edit', exact: true });
      if (await edit.isVisible()) await activateOwnedParagraphEdit(edit);
      const control = row.locator(`[name$="${suffix}"]`);
      await control.first().waitFor({ state: 'attached', timeout: 30_000 });
      const count = await control.count();
      if (count === 1) values.push(await control.inputValue());
      else if (count > 1) values.push(await row.locator(`[name$="${suffix}"]:checked`).inputValue());
    }
    return values;
  };
  const jumpNavTypes = await collectOptions('jump-nav', '[field_jump_nav_type]');
  expect(jumpNavTypes).toContain('sticky');
  const statAlignments = await collectOptions('stat-callout', '[field_paragraph_alignment]');
  const statColors = await collectOptions('stat-callout', '[field_paragraph_color]');
  expect(statAlignments).toContain('right');
  for (const color of ['_none', 'purple', 'blue', 'green']) expect(statColors).toContain(color);
  console.log(`BENEFITS_FINAL_VARIANT_CONFIGURATION ${JSON.stringify({ jumpNavTypes, statAlignments, statColors })}`);
});

test('Benefits final material variants expose layout and theme DOM evidence', async ({ page }) => {
  const run = site.target === 'leidos' ? '20261005-stage-variants' : '20261004-final-variants';
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  await page.goto(`/node/${host.nodeId}`, { waitUntil: 'networkidle' });
  const componentFor = (marker: string) => page.getByText(marker, { exact: false }).first().locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(@class,"paragraph--type--")][1]');
  const inspect = (component: Locator) => component.evaluate((element) => Array.from(element.querySelectorAll<HTMLElement>('*')).concat(element as HTMLElement).map((node) => {
    const style = getComputedStyle(node);
    return { tag: node.tagName.toLowerCase(), classes: node.className, background: style.backgroundColor, color: style.color, position: style.position, textAlign: style.textAlign };
  }).filter((entry) => typeof entry.classes === 'string' && (entry.classes || entry.background !== 'rgba(0, 0, 0, 0)' || entry.position === 'sticky')).slice(0, 80));
  const evidence = {
    featuredRight: await inspect(componentFor(`QA-AUTOMATED-FEATURED-white-right-${run}`)),
    featuredLeft: await inspect(componentFor(`QA-AUTOMATED-FEATURED-gray-left-${run}`)),
    listRight: await inspect(componentFor(`QA-AUTOMATED-LIST-RIGHT-${run}`)),
    jumpNav: await page.locator('.paragraph--type--jump-nav').evaluateAll((elements) => elements.map((element) => ({ classes: (element as HTMLElement).className, html: element.outerHTML.slice(0, 2500) }))),
    stats: await page.locator('.paragraph--type--stat-callout').evaluateAll((elements) => elements.slice(-4).map((element) => ({ classes: (element as HTMLElement).className, html: element.outerHTML.slice(0, 1600) }))),
  };
  expect(evidence.featuredRight).not.toEqual(evidence.featuredLeft);
  expect(evidence.listRight.length).toBeGreaterThan(0);
  expect(evidence.jumpNav.length).toBeGreaterThanOrEqual(2);
  expect(evidence.stats.length).toBeGreaterThanOrEqual(4);
  console.log(`BENEFITS_FINAL_VARIANT_DOM ${JSON.stringify(evidence)}`);
});

test('finalize the three revision-branch component gaps without duplicates', async ({ page }) => {
  test.setTimeout(1_200_000);
  const environment = getEnvironmentConfig();
  expect(environment.target).toBe('devv');
  expect(environment.baseUrl).toBe('https://devv.leidos.com');
  assertPublishingAllowed();
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const opened = await openOwnedEdit(page);

  if ((await deltas(opened.wrapper, 'featured_banner')).length === 0) {
    const delta = await add(page, opened.wrapper, 'featured_banner');
    await field(opened.wrapper, delta, '[field_featured_banner_eyebrow][0][value]').fill('QA AUTOMATED');
    await field(opened.wrapper, delta, '[field_featured_banner_head][0][value]').fill(`QA-AUTOMATED-FEATURED-BANNER-${runId}`);
    await setEditor(opened.form, delta, '[field_featured_banner_text][0][value]', 'QA automated featured banner text.', 'Featured banner text');
    await field(opened.wrapper, delta, '[field_featured_banner_cta][0][uri]').fill(`/node/${host.nodeId}`);
    await field(opened.wrapper, delta, '[field_featured_banner_cta][0][title]').fill('View QA page');
    const row = opened.wrapper.locator(`[name="${paragraphField}_${delta}_collapse"]`).locator('xpath=ancestor::tr[1]');
    await selectAutomationImageFixtureFromTrigger(page, row.getByRole('button', { name: 'Add media', exact: true }), AUTOMATED_IMAGE_MEDIA_ID);
  }
  if ((await deltas(opened.wrapper, 'ceros_embed')).length === 0) {
    const delta = await add(page, opened.wrapper, 'ceros_embed');
    await field(opened.wrapper, delta, '[field_ceros_embed_code][0][value]').fill(`<div class="qa-automated-ceros-placeholder">QA-AUTOMATED-CEROS-${runId}</div>`);
  }
  if ((await deltas(opened.wrapper, 'tabs_card')).length === 0) {
    const delta = await add(page, opened.wrapper, 'tabs_card');
    await field(opened.wrapper, delta, '[field_intro_header][0][value]').fill(`QA-AUTOMATED-TABS-CARD-${runId}`);
    await field(opened.wrapper, delta, '[field_intro_text][0][value]').fill('QA automated tabs card intro.');
    await field(opened.wrapper, delta, '[field_tabs][0][subform][field_tab_label][0][value]').fill('QA Tab');
    await field(opened.wrapper, delta, '[field_tabs][0][subform][field_title][0][value]').fill('QA Automated Tab Card');
    await setEditor(opened.form, delta, '[field_tabs][0][subform][field_body][0][value]', 'QA automated tab card body.', 'Tabs Card body');
    await field(opened.wrapper, delta, '[field_tabs][0][subform][field_link][0][uri]').fill(`/node/${host.nodeId}`);
    await field(opened.wrapper, delta, '[field_tabs][0][subform][field_link][0][title]').fill('View QA page');
  }

  await saveAndPublish(page, opened.form, monitor);
  const final = await openOwnedEdit(page);
  for (const machineName of ['featured_banner', 'ceros_embed', 'tabs_card', 'full_width_image', 'hubspot_form']) {
    expect(await deltas(final.wrapper, machineName), machineName).toHaveLength(1);
  }
  const response = await page.goto(`/node/${host.nodeId}`, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  const body = await page.locator('body').innerText();
  expect(body).toContain(`QA-AUTOMATED-FEATURED-BANNER-${runId}`);
  expect(body).toContain(`QA-AUTOMATED-TABS-CARD-${runId}`);
  monitor.stop();
});

test('finalize Ceros and Tabs Card after the independent media-library blocker', async ({ page }) => {
  test.setTimeout(900_000);
  const environment = getEnvironmentConfig();
  expect(environment.target).toBe('devv');
  expect(environment.baseUrl).toBe('https://devv.leidos.com');
  assertPublishingAllowed();
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const opened = await openOwnedEdit(page);
  if ((await deltas(opened.wrapper, 'ceros_embed')).length === 0) {
    const delta = await add(page, opened.wrapper, 'ceros_embed');
    await field(opened.wrapper, delta, '[field_ceros_embed_code][0][value]').fill(`<div class="qa-automated-ceros-placeholder">QA-AUTOMATED-CEROS-${runId}</div>`);
  }
  if ((await deltas(opened.wrapper, 'tabs_card')).length === 0) {
    const delta = await add(page, opened.wrapper, 'tabs_card');
    await field(opened.wrapper, delta, '[field_intro_header][0][value]').fill(`QA-AUTOMATED-TABS-CARD-${runId}`);
    await field(opened.wrapper, delta, '[field_intro_text][0][value]').fill('QA automated tabs card intro.');
    await field(opened.wrapper, delta, '[field_tabs][0][subform][field_tab_label][0][value]').fill('QA Tab');
    await field(opened.wrapper, delta, '[field_tabs][0][subform][field_title][0][value]').fill('QA Automated Tab Card');
    await setEditor(opened.form, delta, '[field_tabs][0][subform][field_body][0][value]', 'QA automated tab card body.', 'Tabs Card body');
    await field(opened.wrapper, delta, '[field_tabs][0][subform][field_link][0][uri]').fill(`/node/${host.nodeId}`);
    await field(opened.wrapper, delta, '[field_tabs][0][subform][field_link][0][title]').fill('View QA page');
  }
  await saveAndPublish(page, opened.form, monitor);
  const final = await openOwnedEdit(page);
  expect(await deltas(final.wrapper, 'ceros_embed')).toHaveLength(1);
  expect(await deltas(final.wrapper, 'tabs_card')).toHaveLength(1);
  const response = await page.goto(`/node/${host.nodeId}`, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  expect(await page.locator('body').innerText()).toContain(`QA-AUTOMATED-TABS-CARD-${runId}`);
  monitor.stop();
});

test('read-only verify the final published requested-component surface', async ({ page }) => {
  test.setTimeout(180_000);
  const response = await page.goto(`/node/${host.nodeId}`, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  const body = await page.locator('body').innerText();
  const markers = [
    'QA-AUTOMATED-COLOR-BACKGROUND-20261003-remaining',
    'QA-AUTOMATED-RELATED-INSIGHTS-20261003-remaining',
    'QA-AUTOMATED-MARKETO-20261003-remaining',
    'QA-AUTOMATED-MARKETO-MODAL-20261003-remaining',
    'QA-AUTOMATED-STICKY-FOOTER-20261003-remaining',
    'QA-AUTOMATED-JOB-SEARCH-20261003-remaining',
    'QA-AUTOMATED-HUBSPOT-20261003-remaining',
  ];
  const markerResults = Object.fromEntries(markers.map((marker) => [marker, body.includes(marker)]));
  const componentCounts = await page.locator('[class*="paragraph--type--"]').evaluateAll((elements) => {
    const counts: Record<string, number> = {};
    for (const element of elements) {
      for (const className of element.classList) if (className.startsWith('paragraph--type--')) counts[className] = (counts[className] ?? 0) + 1;
    }
    return counts;
  });
  console.log(`FINAL_REQUESTED_COMPONENT_SURFACE ${JSON.stringify({ status: response?.status(), url: page.url(), markerResults, componentCounts })}`);
});
