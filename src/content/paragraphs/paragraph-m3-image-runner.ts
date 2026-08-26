import { expect, type Locator, type Page } from '@playwright/test';
import { AUTOMATED_CONTENT_PREFIX, AUTOMATED_IMAGE_MEDIA_ID, AUTOMATED_IMAGE_MEDIA_NAME, hasAutomatedContentPrefix, PROTECTED_DEVV_NODE_IDS } from '../../config/automation';
import { insightSearchConfig } from '../../config/content-types';
import { assertExplicitNonProductionEnvironment } from '../../config/write-safety';
import { assertNoDrupalFatalPage, NetworkMonitor } from '../../diagnostics/network-monitor';
import { nodeIdFromEditLink, nodeIdFromUrl } from '../basic-page-form';
import { selectAutomationImageFixtureFromTrigger } from '../media/media-library';
import { fillOwnedEditor, readOwnedEditor, submitNodeForm, validateSafeModerationState } from '../node-form';
import { addParagraph, expandParagraphForControl, findParagraphDeltasByLabel, PARAGRAPH_WRAPPER, subformPrefix } from './paragraph-utils';
import type { ParagraphM3ImageResult } from './paragraph-m3-image-types';
import type { ParagraphM3Activation } from './paragraph-m3-types';
import type { ParagraphConfig } from './paragraph-types';

const BLOCKQUOTE: ParagraphConfig = { machineName: 'blockquote', label: 'Blockquote', handler: 'ckeditor', fieldMachineName: 'field_blockquote_text' };
interface Defaults { textFormat: string; border: string; color: string }

export class ParagraphM3ImageRunner {
  private readonly monitor = new NetworkMonitor();
  private saves = 0;

  async run(page: Page): Promise<ParagraphM3ImageResult> {
    assertExplicitNonProductionEnvironment();
    this.monitor.start(page);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const title = `${AUTOMATED_CONTENT_PREFIX}Paragraph-M3-Blockquote-Image-${runId}`;
    const initialText = `QA-AUTOMATED blockquote image ${runId}`;
    const finalText = `${initialText} - UPDATED`;
    let nodeId: string | undefined;
    try {
      const response = await page.goto('/node/add/insight_search', { waitUntil: 'domcontentloaded' });
      if (!response || response.status() >= 400) throw new Error(`Milestone 3 image host form failed with HTTP ${response?.status() ?? 'unknown'}.`);
      const form = await this.exactForm(page);
      await form.locator(insightSearchConfig.titleField.selector).fill(title);
      await this.populateRequiredLead(form, runId);
      await this.assertDraftAndTitle(form, title);
      const wrapper = form.locator(PARAGRAPH_WRAPPER);
      await this.assertInitialInventory(wrapper);
      let delta = await addParagraph(page, wrapper, BLOCKQUOTE, this.monitor);
      const deltaBeforeMedia = delta;
      await this.assertInventory(wrapper);
      const defaults = await this.captureDefaults(wrapper, delta);
      await fillOwnedEditor(wrapper, this.textSelector(delta), initialText, BLOCKQUOTE.label);
      const row = await this.exactRow(wrapper, delta);
      const triggerName = `field_media_image-media-library-open-button-field_landing_paragraphs-${delta}-subform`;
      const trigger = row.locator(`[name="${triggerName}"]`);
      if ((await trigger.count()) !== 1 || !(await trigger.isVisible()) || !(await trigger.isEnabled())) throw new Error('PARAGRAPH_BLOCKED: Blockquote media trigger was not exactly owned and actionable.');
      const media = await selectAutomationImageFixtureFromTrigger(page, trigger, AUTOMATED_IMAGE_MEDIA_ID);
      if (media.name !== AUTOMATED_IMAGE_MEDIA_NAME || media.id !== AUTOMATED_IMAGE_MEDIA_ID) throw new Error('PARAGRAPH_BLOCKED: Exact automation image fixture identity was not proven.');
      await expect(page.locator('[role="dialog"], .ui-dialog').filter({ visible: true })).toHaveCount(0, { timeout: 15_000 });
      await expect.poll(async () => (await findParagraphDeltasByLabel(wrapper, BLOCKQUOTE.label)).length, { timeout: 15_000 }).toBe(1);
      const rediscovered = await findParagraphDeltasByLabel(wrapper, BLOCKQUOTE.label);
      if (rediscovered.length !== 1) throw new Error('PARAGRAPH_BLOCKED: Blockquote ownership was ambiguous after media AJAX.');
      delta = rediscovered[0];
      const deltaAfterMedia = delta;
      const rowControlType = await this.rowControlType(wrapper, delta);
      await this.assertAssociation(wrapper, delta, media.id);
      await this.assertPreSave(wrapper, delta, initialText, defaults, media.id);
      await this.assertDraftAndTitle(form, title);
      await this.save(page, form, 'Milestone 3 image initial Save');
      nodeId = nodeIdFromUrl(page.url()) ?? await nodeIdFromEditLink(page);
      if (!nodeId || !/^\d+$/.test(nodeId) || PROTECTED_DEVV_NODE_IDS.has(nodeId)) throw new Error('Milestone 3 image host save did not resolve one safe new numeric node ID.');

      let persistedDelta = await this.openOwnedEdit(page, nodeId, title);
      let editForm = await this.exactForm(page);
      let editWrapper = editForm.locator(PARAGRAPH_WRAPPER);
      const initialActivation = await expandParagraphForControl(editWrapper, persistedDelta, this.textSelector(persistedDelta), 'attached');
      await this.assertPersisted(editWrapper, persistedDelta, initialText, defaults, media.id);
      const current = await findParagraphDeltasByLabel(editWrapper, BLOCKQUOTE.label);
      if (current.length !== 1) throw new Error('PARAGRAPH_BLOCKED: Blockquote ownership changed before image-scenario update.');
      persistedDelta = current[0];
      const updateActivation = await expandParagraphForControl(editWrapper, persistedDelta, this.textSelector(persistedDelta), 'attached');
      await fillOwnedEditor(editWrapper, this.textSelector(persistedDelta), finalText, BLOCKQUOTE.label);
      await this.assertPreSave(editWrapper, persistedDelta, finalText, defaults, media.id);
      await this.assertDraftAndTitle(editForm, title);
      await this.save(page, editForm, 'Milestone 3 image update Save');

      persistedDelta = await this.openOwnedEdit(page, nodeId, title);
      editForm = await this.exactForm(page);
      editWrapper = editForm.locator(PARAGRAPH_WRAPPER);
      const finalActivation = await expandParagraphForControl(editWrapper, persistedDelta, this.textSelector(persistedDelta), 'attached');
      await this.assertPersisted(editWrapper, persistedDelta, finalText, defaults, media.id);
      await this.assertDraftAndTitle(editForm, title);
      const moderation = await validateSafeModerationState(editForm, insightSearchConfig.label);
      const result: ParagraphM3ImageResult = {
        host: { nodeId, title, moderation: moderation.moderationStateUsed, nodeCreations: 1, saves: 2 },
        component: {
          label: 'Blockquote', machineName: 'blockquote', deltaBeforeMedia, deltaAfterMedia, finalDelta: persistedDelta, rowControlType,
          initialText, finalText, textFormat: 'limited_text', fixtureFilename: 'qa-automated-image.png', fixtureResolution: 'exact unique match', mediaId: media.id,
          dialogClosure: 'passed', rowRediscovery: 'passed', deltaReadiness: 'passed', stableTargetId: media.id,
          initialPersistedAssociation: 'passed', finalPersistedAssociation: 'passed', optionalFieldsUntouched: 'passed',
          activations: { initialPersistence: this.activationLabel(initialActivation), controlledUpdate: this.activationLabel(updateActivation), finalPersistence: this.activationLabel(finalActivation) },
        },
        scenarioA: { status: 'previously passed', nodeId: '25026', executed: false },
        featuredBanner: { status: 'blocked', reason: 'Required field_paragraph_border defaults to invalid _none; Padding has no approved semantic rule.' },
        formattedTextColorBackground: { status: 'blocked', reason: 'Required color selection lacks an approved semantic rule.' },
        serverErrors: this.monitor.getServerErrors().length, fatalPageDetected: false, paragraphAdditions: 1, paragraphRemovals: 0,
        mediaSelections: 1, mediaUploads: 0, mediaCreations: 0, mediaEdits: 0,
      };
      console.log(`PARAGRAPH_M3_IMAGE_EVENT ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.log(`PARAGRAPH_M3_IMAGE_FAILURE ${JSON.stringify({ nodeId, title, saves: this.saves, serverErrors: this.monitor.getServerErrors().length, reason: error instanceof Error ? error.message : 'Unknown failure' })}`);
      throw error;
    } finally { this.monitor.stop(); }
  }

  private async exactForm(page: Page): Promise<Locator> {
    const form = page.locator(insightSearchConfig.formSelector);
    if ((await form.count()) !== 1 || !(await form.isVisible())) throw new Error('PARAGRAPH_BLOCKED: Milestone 3 image host form was not uniquely visible.');
    return form;
  }
  private textSelector(delta: string): string { return `textarea[name="${subformPrefix(delta)}[field_blockquote_text][0][value]"]`; }
  private associationSelector(delta: string): string { return `input[type="hidden"][name="${subformPrefix(delta)}[field_media_image][selection][0][target_id]"]`; }
  private fieldSelector(delta: string, suffix: string): string { return `[name="${subformPrefix(delta)}${suffix}"]`; }

  private async exactRow(wrapper: Locator, delta: string): Promise<Locator> {
    const action = wrapper.locator(`[name="field_landing_paragraphs_${delta}_collapse"], [name="field_landing_paragraphs_${delta}_edit"]`);
    if ((await action.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: Blockquote delta ${delta} action was ambiguous.`);
    const row = action.locator('xpath=ancestor::tr[1]');
    if ((await row.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: Blockquote delta ${delta} row was ambiguous.`);
    return row;
  }
  private async rowControlType(wrapper: Locator, delta: string): Promise<'input' | 'button'> {
    const action = wrapper.locator(`[name="field_landing_paragraphs_${delta}_collapse"], [name="field_landing_paragraphs_${delta}_edit"]`);
    if ((await action.count()) !== 1) throw new Error('PARAGRAPH_BLOCKED: Post-media Blockquote row control was ambiguous.');
    const tag = await action.evaluate((element) => element.tagName.toLowerCase());
    if (tag !== 'input' && tag !== 'button') throw new Error('PARAGRAPH_BLOCKED: Post-media row control was not an input or button.');
    return tag;
  }
  private async assertInitialInventory(wrapper: Locator): Promise<void> {
    const overview = await findParagraphDeltasByLabel(wrapper, 'Insights overview');
    const blockquote = await findParagraphDeltasByLabel(wrapper, 'Blockquote');
    const actions = wrapper.locator('[name^="field_landing_paragraphs_"][name$="_edit"], [name^="field_landing_paragraphs_"][name$="_collapse"]');
    if (overview.length !== 1 || blockquote.length !== 0 || (await actions.count()) !== 1) throw new Error('PARAGRAPH_BLOCKED: New image host inventory was not exactly one default Insights overview.');
  }
  private async assertInventory(wrapper: Locator): Promise<void> {
    const overview = await findParagraphDeltasByLabel(wrapper, 'Insights overview');
    const blockquote = await findParagraphDeltasByLabel(wrapper, 'Blockquote');
    const featured = await findParagraphDeltasByLabel(wrapper, 'Featured banner');
    const actions = wrapper.locator('[name^="field_landing_paragraphs_"][name$="_edit"], [name^="field_landing_paragraphs_"][name$="_collapse"]');
    if (overview.length !== 1 || blockquote.length !== 1 || featured.length !== 0 || (await actions.count()) !== 2) throw new Error('PARAGRAPH_BLOCKED: Image scenario inventory was not default overview plus one Blockquote.');
  }
  private async captureDefaults(wrapper: Locator, delta: string): Promise<Defaults> {
    const defaults = { textFormat: await this.value(wrapper, this.fieldSelector(delta, '[field_blockquote_text][0][format]')), border: await this.value(wrapper, this.fieldSelector(delta, '[field_paragraph_border]')), color: await this.value(wrapper, this.fieldSelector(delta, '[field_paragraph_color]')) };
    if (defaults.textFormat !== 'limited_text' || defaults.border !== 'padding' || defaults.color !== 'purple') throw new Error('PARAGRAPH_BLOCKED: Blockquote discovered defaults changed.');
    return defaults;
  }
  private async assertOptionalFields(wrapper: Locator, delta: string, defaults: Defaults): Promise<void> {
    for (const suffix of ['[field_blockquote_author_name][0][value]', '[field_blockquote_author_title][0][value]', '[field_blockquote_cta][0][uri]', '[field_blockquote_cta][0][title]', '[field_blockquote_cta][0][options][attributes][aria-label]']) {
      if (await this.value(wrapper, this.fieldSelector(delta, suffix)) !== '') throw new Error(`PARAGRAPH_BLOCKED: Optional Blockquote field ${suffix} changed.`);
    }
    if (await this.value(wrapper, this.fieldSelector(delta, '[field_blockquote_text][0][format]')) !== defaults.textFormat
      || await this.value(wrapper, this.fieldSelector(delta, '[field_paragraph_border]')) !== defaults.border
      || await this.value(wrapper, this.fieldSelector(delta, '[field_paragraph_color]')) !== defaults.color) throw new Error('PARAGRAPH_BLOCKED: Blockquote format, Style, or Color changed.');
  }
  private async value(wrapper: Locator, selector: string): Promise<string> {
    const control = wrapper.locator(selector);
    if ((await control.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: Expected one exact control for ${selector}.`);
    return control.inputValue();
  }
  private async assertAssociation(wrapper: Locator, delta: string, mediaId: string): Promise<void> {
    const association = wrapper.locator(this.associationSelector(delta));
    await expect.poll(async () => (await association.count()) === 1 ? association.inputValue() : 'ambiguous', { timeout: 15_000 }).toBe(mediaId);
    if (!/^\d+$/.test(await association.inputValue())) throw new Error('PARAGRAPH_BLOCKED: Stable Blockquote media target ID was not numeric.');
  }
  private async assertPreSave(wrapper: Locator, delta: string, text: string, defaults: Defaults, mediaId: string): Promise<void> {
    await this.assertInventory(wrapper);
    if ((await readOwnedEditor(wrapper, this.textSelector(delta), BLOCKQUOTE.label)) !== text) throw new Error('PARAGRAPH_BLOCKED: Blockquote image-scenario text mismatch.');
    await this.assertAssociation(wrapper, delta, mediaId);
    await this.assertOptionalFields(wrapper, delta, defaults);
  }
  private async assertPersisted(wrapper: Locator, delta: string, text: string, defaults: Defaults, mediaId: string): Promise<void> {
    await this.assertPreSave(wrapper, delta, text, defaults, mediaId);
  }
  private async assertDraftAndTitle(form: Locator, title: string): Promise<void> {
    const titleField = form.locator(insightSearchConfig.titleField.selector);
    if ((await titleField.count()) !== 1 || (await titleField.inputValue()) !== title || !hasAutomatedContentPrefix(title)) throw new Error('PARAGRAPH_BLOCKED: Milestone 3 image host ownership failed.');
    const moderation = await validateSafeModerationState(form, insightSearchConfig.label);
    if (!/draft|unpublished/i.test(moderation.moderationStateUsed)) throw new Error('PARAGRAPH_BLOCKED: Milestone 3 image host was not Draft.');
  }
  private async populateRequiredLead(form: Locator, runId: string): Promise<void> {
    const lead = form.locator('textarea[name="field_insight_lead[0][value]"]');
    const required = await lead.evaluate((element) => (element as HTMLTextAreaElement).required || element.getAttribute('aria-required') === 'true' || Boolean(element.closest('.form-item, [class*="field--name-"]')?.querySelector('label.form-required, label.js-form-required')));
    if (required) await fillOwnedEditor(form, 'textarea[name="field_insight_lead[0][value]"]', `QA-AUTOMATED Milestone 3 image lead ${runId}`, 'Insight lead');
  }
  private async openOwnedEdit(page: Page, nodeId: string, title: string): Promise<string> {
    if (PROTECTED_DEVV_NODE_IDS.has(nodeId)) throw new Error(`Refusing protected node ${nodeId}.`);
    const response = await page.goto(`/node/${nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 400) throw new Error(`Milestone 3 image edit form failed with HTTP ${response?.status() ?? 'unknown'}.`);
    this.monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
    const form = await this.exactForm(page); await this.assertDraftAndTitle(form, title);
    const wrapper = form.locator(PARAGRAPH_WRAPPER); await this.assertInventory(wrapper);
    const matches = await findParagraphDeltasByLabel(wrapper, BLOCKQUOTE.label);
    if (matches.length !== 1) throw new Error('PARAGRAPH_BLOCKED: Saved Blockquote image ownership was ambiguous.');
    return matches[0];
  }
  private async save(page: Page, form: Locator, label: string): Promise<void> {
    if (this.saves >= 2) throw new Error('PARAGRAPH_BLOCKED: Milestone 3 image save limit exceeded.');
    await submitNodeForm(page, form, label); this.saves += 1;
    this.monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
    if ((await page.locator('[data-drupal-messages] .messages--status, .messages.messages--status').filter({ visible: true }).count()) < 1) throw new Error(`${label} did not display a success message.`);
  }
  private activationLabel(activation: Awaited<ReturnType<typeof expandParagraphForControl>>): ParagraphM3Activation {
    return !activation ? 'already expanded' : activation.strategy === 'keyboard Enter' ? 'keyboard' : 'pointer';
  }
}
