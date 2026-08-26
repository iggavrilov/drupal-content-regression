import type { Locator, Page } from '@playwright/test';
import { AUTOMATED_CONTENT_PREFIX, hasAutomatedContentPrefix, PROTECTED_DEVV_NODE_IDS } from '../../config/automation';
import { insightSearchConfig } from '../../config/content-types';
import { assertExplicitNonProductionEnvironment } from '../../config/write-safety';
import { assertNoDrupalFatalPage, NetworkMonitor } from '../../diagnostics/network-monitor';
import { nodeIdFromEditLink, nodeIdFromUrl } from '../basic-page-form';
import { fillOwnedEditor, readOwnedEditor, submitNodeForm, validateSafeModerationState } from '../node-form';
import { addParagraph, expandParagraphForControl, findParagraphDeltasByLabel, PARAGRAPH_WRAPPER, subformPrefix } from './paragraph-utils';
import type { ParagraphConfig } from './paragraph-types';
import type { ParagraphM3Activation, ParagraphM3Result } from './paragraph-m3-types';

const BLOCKQUOTE: ParagraphConfig = { machineName: 'blockquote', label: 'Blockquote', handler: 'ckeditor', fieldMachineName: 'field_blockquote_text' };
interface OptionalDefaults {
  textFormat: string;
  border: string;
  color: string;
}

export class ParagraphM3Runner {
  private readonly monitor = new NetworkMonitor();
  private saves = 0;

  async run(page: Page): Promise<ParagraphM3Result> {
    assertExplicitNonProductionEnvironment();
    this.monitor.start(page);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const title = `${AUTOMATED_CONTENT_PREFIX}Paragraph-M3-Blockquote-${runId}`;
    const initialText = `QA-AUTOMATED blockquote ${runId}`;
    const finalText = `${initialText} - UPDATED`;
    let nodeId: string | undefined;
    try {
      const response = await page.goto('/node/add/insight_search', { waitUntil: 'domcontentloaded' });
      if (!response || response.status() >= 400) throw new Error(`Milestone 3 host form failed with HTTP ${response?.status() ?? 'unknown'}.`);
      const form = await this.exactForm(page);
      await form.locator(insightSearchConfig.titleField.selector).fill(title);
      await this.populateRequiredLead(form, runId);
      await this.assertDraftAndTitle(form, title);
      const wrapper = form.locator(PARAGRAPH_WRAPPER);
      await this.assertInitialInventory(wrapper);
      const delta = await addParagraph(page, wrapper, BLOCKQUOTE, this.monitor);
      await this.assertInventory(wrapper);
      const defaults = await this.captureAndAssertOptionalDefaults(wrapper, delta);
      await fillOwnedEditor(wrapper, this.textSelector(delta), initialText, BLOCKQUOTE.label);
      await this.assertPreSave(wrapper, delta, initialText, defaults);
      await this.assertDraftAndTitle(form, title);
      await this.save(page, form, 'Milestone 3 initial Save');
      nodeId = nodeIdFromUrl(page.url()) ?? await nodeIdFromEditLink(page);
      if (!nodeId || !/^\d+$/.test(nodeId) || PROTECTED_DEVV_NODE_IDS.has(nodeId)) throw new Error('Milestone 3 host save did not resolve one safe new numeric node ID.');

      let persistedDelta = await this.openOwnedEdit(page, nodeId, title);
      let editForm = await this.exactForm(page);
      let editWrapper = editForm.locator(PARAGRAPH_WRAPPER);
      const initialActivation = await expandParagraphForControl(editWrapper, persistedDelta, this.textSelector(persistedDelta), 'attached');
      await this.assertPersisted(editWrapper, persistedDelta, initialText, defaults);

      const current = await findParagraphDeltasByLabel(editWrapper, BLOCKQUOTE.label);
      if (current.length !== 1) throw new Error('PARAGRAPH_BLOCKED: Blockquote ownership changed before update.');
      persistedDelta = current[0];
      const updateActivation = await expandParagraphForControl(editWrapper, persistedDelta, this.textSelector(persistedDelta), 'attached');
      await fillOwnedEditor(editWrapper, this.textSelector(persistedDelta), finalText, BLOCKQUOTE.label);
      await this.assertPreSave(editWrapper, persistedDelta, finalText, defaults);
      await this.assertDraftAndTitle(editForm, title);
      await this.save(page, editForm, 'Milestone 3 update Save');

      persistedDelta = await this.openOwnedEdit(page, nodeId, title);
      editForm = await this.exactForm(page);
      editWrapper = editForm.locator(PARAGRAPH_WRAPPER);
      const finalActivation = await expandParagraphForControl(editWrapper, persistedDelta, this.textSelector(persistedDelta), 'attached');
      await this.assertPersisted(editWrapper, persistedDelta, finalText, defaults);
      await this.assertDraftAndTitle(editForm, title);
      const moderation = await validateSafeModerationState(editForm, insightSearchConfig.label);
      const result: ParagraphM3Result = {
        host: { nodeId, title, contentType: 'Insight Search Filter Page', machineName: 'insight_search', moderation: moderation.moderationStateUsed, nodeCreations: 1, saves: 2 },
        component: {
          label: 'Blockquote', machineName: 'blockquote', initialDelta: delta, persistedDelta, initialText, finalText, textFormat: 'limited_text',
          initialPopulation: 'passed', firstSave: 'passed', initialPersistence: 'passed', update: 'passed', secondSave: 'passed', finalPersistence: 'passed', optionalFieldsUntouched: 'passed',
          activations: { initialPersistence: this.activationLabel(initialActivation), controlledUpdate: this.activationLabel(updateActivation), finalPersistence: this.activationLabel(finalActivation) },
        },
        featuredBanner: { status: 'blocked', reason: 'Required field_paragraph_border defaults to invalid _none; no approved semantic rule authorizes Padding.' },
        serverErrors: this.monitor.getServerErrors().length, fatalPageDetected: false,
        paragraphAdditions: 1, paragraphRemovals: 0, mediaSelections: 0, mediaUploads: 0, mediaCreations: 0, mediaEdits: 0,
      };
      console.log(`PARAGRAPH_M3_EVENT ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.log(`PARAGRAPH_M3_FAILURE ${JSON.stringify({ nodeId, title, saves: this.saves, serverErrors: this.monitor.getServerErrors().length, reason: error instanceof Error ? error.message : 'Unknown failure' })}`);
      throw error;
    } finally {
      this.monitor.stop();
    }
  }

  private async exactForm(page: Page): Promise<Locator> {
    const form = page.locator(insightSearchConfig.formSelector);
    if ((await form.count()) !== 1 || !(await form.isVisible())) throw new Error('PARAGRAPH_BLOCKED: Milestone 3 host form was not uniquely visible.');
    return form;
  }

  private textSelector(delta: string): string {
    return `textarea[name="${subformPrefix(delta)}[field_blockquote_text][0][value]"]`;
  }

  private fieldSelector(delta: string, suffix: string): string {
    return `[name="${subformPrefix(delta)}${suffix}"]`;
  }

  private async assertInitialInventory(wrapper: Locator): Promise<void> {
    const overview = await findParagraphDeltasByLabel(wrapper, 'Insights overview');
    const blockquotes = await findParagraphDeltasByLabel(wrapper, BLOCKQUOTE.label);
    const actions = wrapper.locator('[name^="field_landing_paragraphs_"][name$="_edit"], [name^="field_landing_paragraphs_"][name$="_collapse"]');
    if (overview.length !== 1 || blockquotes.length !== 0 || (await actions.count()) !== 1) throw new Error('PARAGRAPH_BLOCKED: New host did not contain exactly one default Insights overview and no Blockquote.');
  }

  private async assertInventory(wrapper: Locator): Promise<void> {
    const overview = await findParagraphDeltasByLabel(wrapper, 'Insights overview');
    const blockquotes = await findParagraphDeltasByLabel(wrapper, BLOCKQUOTE.label);
    const featured = await findParagraphDeltasByLabel(wrapper, 'Featured banner');
    const actions = wrapper.locator('[name^="field_landing_paragraphs_"][name$="_edit"], [name^="field_landing_paragraphs_"][name$="_collapse"]');
    if (overview.length !== 1 || blockquotes.length !== 1 || featured.length !== 0 || (await actions.count()) !== 2) throw new Error('PARAGRAPH_BLOCKED: Inventory was not exactly default Insights overview plus one Blockquote.');
  }

  private async captureAndAssertOptionalDefaults(wrapper: Locator, delta: string): Promise<OptionalDefaults> {
    const defaults = {
      textFormat: await this.exactValue(wrapper, this.fieldSelector(delta, '[field_blockquote_text][0][format]')),
      border: await this.exactValue(wrapper, this.fieldSelector(delta, '[field_paragraph_border]')),
      color: await this.exactValue(wrapper, this.fieldSelector(delta, '[field_paragraph_color]')),
    };
    if (defaults.textFormat !== 'limited_text' || defaults.border !== 'padding' || defaults.color !== 'purple') throw new Error('PARAGRAPH_BLOCKED: Blockquote safe discovered defaults changed.');
    await this.assertOptionalFields(wrapper, delta, defaults);
    return defaults;
  }

  private async assertOptionalFields(wrapper: Locator, delta: string, defaults: OptionalDefaults): Promise<void> {
    const emptySelectors = [
      '[field_blockquote_author_name][0][value]', '[field_blockquote_author_title][0][value]',
      '[field_media_image][media_library_selection]', '[field_blockquote_cta][0][uri]',
      '[field_blockquote_cta][0][title]', '[field_blockquote_cta][0][options][attributes][aria-label]',
    ];
    for (const suffix of emptySelectors) {
      const control = wrapper.locator(this.fieldSelector(delta, suffix));
      if ((await control.count()) !== 1 || (await control.inputValue()) !== '') throw new Error(`PARAGRAPH_BLOCKED: Optional Blockquote field ${suffix} was not untouched.`);
    }
    const mediaAssociations = wrapper.locator(`[name^="${subformPrefix(delta)}[field_media_image][selection]"][name$="[target_id]"]`);
    for (let index = 0; index < (await mediaAssociations.count()); index += 1) {
      if ((await mediaAssociations.nth(index).inputValue()) !== '') throw new Error('PARAGRAPH_BLOCKED: Blockquote unexpectedly has a media association.');
    }
    if (await this.exactValue(wrapper, this.fieldSelector(delta, '[field_blockquote_text][0][format]')) !== defaults.textFormat
      || await this.exactValue(wrapper, this.fieldSelector(delta, '[field_paragraph_border]')) !== defaults.border
      || await this.exactValue(wrapper, this.fieldSelector(delta, '[field_paragraph_color]')) !== defaults.color) {
      throw new Error('PARAGRAPH_BLOCKED: Blockquote text format, style, or color default changed.');
    }
  }

  private async exactValue(wrapper: Locator, selector: string): Promise<string> {
    const control = wrapper.locator(selector);
    if ((await control.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: Expected one exact control for ${selector}.`);
    return control.inputValue();
  }

  private async assertPreSave(wrapper: Locator, delta: string, expectedText: string, defaults: OptionalDefaults): Promise<void> {
    await this.assertInventory(wrapper);
    if ((await readOwnedEditor(wrapper, this.textSelector(delta), BLOCKQUOTE.label)) !== expectedText) throw new Error('PARAGRAPH_BLOCKED: Blockquote pre-save text mismatch.');
    await this.assertOptionalFields(wrapper, delta, defaults);
  }

  private async assertPersisted(wrapper: Locator, delta: string, expectedText: string, defaults: OptionalDefaults): Promise<void> {
    await this.assertInventory(wrapper);
    if ((await readOwnedEditor(wrapper, this.textSelector(delta), BLOCKQUOTE.label)) !== expectedText) throw new Error('Blockquote persisted text mismatch.');
    await this.assertOptionalFields(wrapper, delta, defaults);
  }

  private async assertDraftAndTitle(form: Locator, title: string): Promise<void> {
    const titleField = form.locator(insightSearchConfig.titleField.selector);
    if ((await titleField.count()) !== 1 || (await titleField.inputValue()) !== title || !hasAutomatedContentPrefix(title)) throw new Error('PARAGRAPH_BLOCKED: Milestone 3 host ownership failed.');
    const moderation = await validateSafeModerationState(form, insightSearchConfig.label);
    if (!/draft|unpublished/i.test(moderation.moderationStateUsed)) throw new Error('PARAGRAPH_BLOCKED: Milestone 3 host was not Draft.');
  }

  private async populateRequiredLead(form: Locator, runId: string): Promise<void> {
    const lead = form.locator('textarea[name="field_insight_lead[0][value]"]');
    const required = await lead.evaluate((element) => (element as HTMLTextAreaElement).required || element.getAttribute('aria-required') === 'true' || Boolean(element.closest('.form-item, [class*="field--name-"]')?.querySelector('label.form-required, label.js-form-required')));
    if (required) await fillOwnedEditor(form, 'textarea[name="field_insight_lead[0][value]"]', `QA-AUTOMATED Milestone 3 lead ${runId}`, 'Insight lead');
  }

  private async openOwnedEdit(page: Page, nodeId: string, title: string): Promise<string> {
    if (PROTECTED_DEVV_NODE_IDS.has(nodeId)) throw new Error(`Refusing protected node ${nodeId}.`);
    const response = await page.goto(`/node/${nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 400) throw new Error(`Milestone 3 edit form failed with HTTP ${response?.status() ?? 'unknown'}.`);
    this.monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
    const form = await this.exactForm(page);
    await this.assertDraftAndTitle(form, title);
    const wrapper = form.locator(PARAGRAPH_WRAPPER);
    await this.assertInventory(wrapper);
    const blockquotes = await findParagraphDeltasByLabel(wrapper, BLOCKQUOTE.label);
    if (blockquotes.length !== 1) throw new Error('PARAGRAPH_BLOCKED: Saved Blockquote ownership was ambiguous.');
    return blockquotes[0];
  }

  private async save(page: Page, form: Locator, label: string): Promise<void> {
    if (this.saves >= 2) throw new Error('PARAGRAPH_BLOCKED: Milestone 3 save limit exceeded.');
    await submitNodeForm(page, form, label);
    this.saves += 1;
    this.monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
    if ((await page.locator('[data-drupal-messages] .messages--status, .messages.messages--status').filter({ visible: true }).count()) < 1) throw new Error(`${label} did not display a success message.`);
  }

  private activationLabel(activation: Awaited<ReturnType<typeof expandParagraphForControl>>): ParagraphM3Activation {
    return !activation ? 'already expanded' : activation.strategy === 'keyboard Enter' ? 'keyboard' : 'pointer';
  }
}
