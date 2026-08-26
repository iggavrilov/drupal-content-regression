import { expect, type Locator, type Page } from '@playwright/test';
import { AUTOMATED_CONTENT_PREFIX, AUTOMATED_IMAGE_MEDIA_ID, AUTOMATED_IMAGE_MEDIA_NAME, hasAutomatedContentPrefix, PROTECTED_DEVV_NODE_IDS } from '../../config/automation';
import { insightSearchConfig } from '../../config/content-types';
import { assertExplicitNonProductionEnvironment } from '../../config/write-safety';
import { assertNoDrupalFatalPage, NetworkMonitor } from '../../diagnostics/network-monitor';
import { nodeIdFromEditLink, nodeIdFromUrl } from '../basic-page-form';
import { selectAutomationImageFixtureFromTrigger } from '../media/media-library';
import { fillOwnedEditor, readOwnedEditor, submitNodeForm, validateSafeModerationState } from '../node-form';
import { addParagraph, expandParagraphForControl, findParagraphDeltasByLabel, PARAGRAPH_WRAPPER, subformPrefix } from './paragraph-utils';
import type { ParagraphConfig } from './paragraph-types';
import type { ParagraphM2Result } from './paragraph-m2-types';

const IMAGE_CONFIG: ParagraphConfig = { machineName: 'formatted_text_with_img_bg', label: 'Formatted text (w/ image background)', handler: 'ckeditor', fieldMachineName: 'field_formatted_text' };
export class ParagraphM2Runner {
  private readonly monitor = new NetworkMonitor();
  private saves = 0;

  async run(page: Page): Promise<ParagraphM2Result> {
    assertExplicitNonProductionEnvironment();
    this.monitor.start(page);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const title = `${AUTOMATED_CONTENT_PREFIX}Paragraph-M2-Image-${runId}`;
    const initialText = `QA-AUTOMATED image background paragraph ${runId}`;
    const finalText = `${initialText} - UPDATED`;
    let nodeId: string | undefined;
    try {
      const response = await page.goto('/node/add/insight_search', { waitUntil: 'domcontentloaded' });
      if (!response || response.status() >= 400) throw new Error(`Milestone 2 host form failed with HTTP ${response?.status() ?? 'unknown'}.`);
      const form = await this.exactForm(page);
      await form.locator(insightSearchConfig.titleField.selector).fill(title);
      await this.populateRequiredLead(form, runId);
      await this.assertDraftAndTitle(form, title);
      const wrapper = form.locator(PARAGRAPH_WRAPPER);
      const overview = await findParagraphDeltasByLabel(wrapper, 'Insights overview');
      if (overview.length !== 1) throw new Error('PARAGRAPH_BLOCKED: Expected exactly one default Insights overview.');
      const existing = await findParagraphDeltasByLabel(wrapper, IMAGE_CONFIG.label);
      if (existing.length !== 0) throw new Error('PARAGRAPH_BLOCKED: Image-background Paragraph unexpectedly existed on the new host.');
      let delta = await addParagraph(page, wrapper, IMAGE_CONFIG, this.monitor);
      const initialDelta = delta;
      const textSelector = this.textSelector(delta);
      await fillOwnedEditor(wrapper, textSelector, initialText, IMAGE_CONFIG.label);
      const row = await this.exactRow(wrapper, delta);
      const trigger = row.getByRole('button', { name: 'Add media', exact: true });
      const media = await selectAutomationImageFixtureFromTrigger(page, trigger, AUTOMATED_IMAGE_MEDIA_ID);
      await expect.poll(async () => (await findParagraphDeltasByLabel(wrapper, IMAGE_CONFIG.label)).length, { timeout: 15_000, message: 'Image-background ownership should stabilize after Media Library AJAX.' }).toBe(1);
      const reacquired = await findParagraphDeltasByLabel(wrapper, IMAGE_CONFIG.label);
      if (reacquired.length !== 1) throw new Error('PARAGRAPH_BLOCKED: Image-background ownership was ambiguous after Media Library AJAX stabilization.');
      delta = reacquired[0];
      const postMediaRowActionElementType = await this.exactActionElementType(wrapper, delta);
      const associationSelector = this.associationSelector(delta);
      await this.assertAssociation(wrapper, associationSelector, media.id);
      await this.assertInventory(wrapper);
      await this.assertText(wrapper, delta, initialText);
      await this.assertDraftAndTitle(form, title);
      await this.save(page, form, 'Milestone 2 initial Save');
      nodeId = nodeIdFromUrl(page.url()) ?? await nodeIdFromEditLink(page);
      if (!nodeId || !/^\d+$/.test(nodeId) || PROTECTED_DEVV_NODE_IDS.has(nodeId)) throw new Error('Milestone 2 host save did not resolve one safe new node ID.');

      let persistedDelta = await this.openOwnedEdit(page, nodeId, title);
      const editForm = await this.exactForm(page);
      const editWrapper = editForm.locator(PARAGRAPH_WRAPPER);
      const initialActivation = await expandParagraphForControl(editWrapper, persistedDelta, this.textSelector(persistedDelta), 'attached');
      await this.assertText(editWrapper, persistedDelta, initialText);
      await this.assertAssociation(editWrapper, this.associationSelector(persistedDelta), media.id);

      const current = await findParagraphDeltasByLabel(editWrapper, IMAGE_CONFIG.label);
      if (current.length !== 1) throw new Error('PARAGRAPH_BLOCKED: Image-background ownership changed before update.');
      persistedDelta = current[0];
      const updateActivation = await expandParagraphForControl(editWrapper, persistedDelta, this.textSelector(persistedDelta), 'attached');
      await fillOwnedEditor(editWrapper, this.textSelector(persistedDelta), finalText, IMAGE_CONFIG.label);
      await this.assertAssociation(editWrapper, this.associationSelector(persistedDelta), media.id);
      await this.assertInventory(editWrapper);
      await this.assertText(editWrapper, persistedDelta, finalText);
      await this.assertDraftAndTitle(editForm, title);
      await this.save(page, editForm, 'Milestone 2 update Save');

      persistedDelta = await this.openOwnedEdit(page, nodeId, title);
      const finalForm = await this.exactForm(page);
      const finalWrapper = finalForm.locator(PARAGRAPH_WRAPPER);
      const finalActivation = await expandParagraphForControl(finalWrapper, persistedDelta, this.textSelector(persistedDelta), 'attached');
      await this.assertText(finalWrapper, persistedDelta, finalText);
      await this.assertAssociation(finalWrapper, this.associationSelector(persistedDelta), media.id);
      await this.assertInventory(finalWrapper);
      const moderation = await validateSafeModerationState(finalForm, insightSearchConfig.label);
      const activation = updateActivation ?? initialActivation;
      const result: ParagraphM2Result = {
        host: { nodeId, title, moderation: moderation.moderationStateUsed, saves: this.saves, nodeCreations: 1, initialInventory: ['Insights overview', IMAGE_CONFIG.label], finalInventory: ['Insights overview', IMAGE_CONFIG.label] },
        components: [{ label: IMAGE_CONFIG.label, machineName: 'formatted_text_with_img_bg', delta: persistedDelta, initialDelta, postMediaDelta: delta, postMediaRowActionElementType, requiredFields: ['field_media_image'], defaults: { field_paragraph_border: '_none', textFormat: 'rich_text' }, mediaId: media.id, fixtureFilename: AUTOMATED_IMAGE_MEDIA_NAME, fixtureResolution: 'exact unique match', mediaAjaxReadiness: 'passed', mediaLibraryClosure: 'passed', rowRediscovery: 'passed', deltaRediscovery: 'passed', associationStability: 'passed', mediaAssociationSelector: this.associationSelector(persistedDelta), initialText, finalText, initialPopulation: 'passed', initialPersistence: 'passed', update: 'passed', finalPersistence: 'passed', updateActivation: this.activationLabel(activation), focusVerified: activation?.focusVerified ?? false, activations: { initialPersistence: this.activationLabel(initialActivation), controlledUpdate: this.activationLabel(updateActivation), finalPersistence: this.activationLabel(finalActivation) } }],
        serverErrors: this.monitor.getServerErrors().length, fatalPageDetected: false, mediaUploads: 0, mediaCreations: 0, mediaEdits: 0, mediaSelections: 1, paragraphAdditions: 1, paragraphRemovals: 0,
      };
      console.log(`PARAGRAPH_M2_EVENT ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.log(`PARAGRAPH_M2_FAILURE ${JSON.stringify({ nodeId, title, saves: this.saves, serverErrors: this.monitor.getServerErrors().length, reason: error instanceof Error ? error.message : 'Unknown failure' })}`);
      throw error;
    } finally {
      this.monitor.stop();
    }
  }

  private async exactForm(page: Page): Promise<Locator> {
    const form = page.locator(insightSearchConfig.formSelector);
    if ((await form.count()) !== 1 || !(await form.isVisible())) throw new Error('PARAGRAPH_BLOCKED: Milestone 2 host form was not uniquely visible.');
    return form;
  }

  private async exactRow(wrapper: Locator, delta: string): Promise<Locator> {
    const action = wrapper.locator(`[name="field_landing_paragraphs_${delta}_collapse"], [name="field_landing_paragraphs_${delta}_edit"]`);
    if ((await action.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: Delta ${delta} action ownership was ambiguous.`);
    const row = action.locator('xpath=ancestor::tr[1]');
    if ((await row.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: Delta ${delta} row ownership was ambiguous.`);
    return row;
  }

  private async exactActionElementType(wrapper: Locator, delta: string): Promise<string> {
    const action = wrapper.locator(`[name="field_landing_paragraphs_${delta}_collapse"], [name="field_landing_paragraphs_${delta}_edit"]`);
    if ((await action.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: Delta ${delta} post-media action ownership was ambiguous.`);
    return action.evaluate((element) => element.tagName.toLowerCase());
  }

  private textSelector(delta: string): string { return `textarea[name="${subformPrefix(delta)}[field_formatted_text][0][value]"]`; }
  private associationSelector(delta: string): string { return `input[type="hidden"][name="${subformPrefix(delta)}[field_media_image][selection][0][target_id]"]`; }
  private activationLabel(activation: Awaited<ReturnType<typeof expandParagraphForControl>>): 'pointer' | 'keyboard' | 'already expanded' { return !activation ? 'already expanded' : activation.strategy === 'keyboard Enter' ? 'keyboard' : 'pointer'; }

  private async assertAssociation(wrapper: Locator, selector: string, mediaId: string): Promise<void> {
    const association = wrapper.locator(selector);
    await expect.poll(async () => (await association.count()) === 1 ? association.inputValue() : 'ambiguous', { timeout: 15_000, message: `Image-background Paragraph should retain exact media ${mediaId}.` }).toBe(mediaId);
  }

  private async assertText(wrapper: Locator, delta: string, expected: string): Promise<void> {
    if ((await readOwnedEditor(wrapper, this.textSelector(delta), IMAGE_CONFIG.label)) !== expected) throw new Error('Image-background Paragraph text mismatch.');
  }

  private async assertInventory(wrapper: Locator): Promise<void> {
    const overview = await findParagraphDeltasByLabel(wrapper, 'Insights overview');
    const image = await findParagraphDeltasByLabel(wrapper, IMAGE_CONFIG.label);
    const actions = wrapper.locator('[name^="field_landing_paragraphs_"][name$="_edit"], [name^="field_landing_paragraphs_"][name$="_collapse"]');
    if (overview.length !== 1 || image.length !== 1 || (await actions.count()) !== 2) throw new Error('PARAGRAPH_BLOCKED: Milestone 2 Paragraph inventory was not exactly default overview plus one image background.');
  }

  private async assertDraftAndTitle(form: Locator, title: string): Promise<void> {
    const titleField = form.locator(insightSearchConfig.titleField.selector);
    if ((await titleField.count()) !== 1 || (await titleField.inputValue()) !== title || !hasAutomatedContentPrefix(title)) throw new Error('PARAGRAPH_BLOCKED: Milestone 2 host ownership failed.');
    const moderation = await validateSafeModerationState(form, insightSearchConfig.label);
    if (!/draft|unpublished/i.test(moderation.moderationStateUsed)) throw new Error('PARAGRAPH_BLOCKED: Milestone 2 host was not Draft.');
  }

  private async populateRequiredLead(form: Locator, runId: string): Promise<void> {
    const lead = form.locator('textarea[name="field_insight_lead[0][value]"]');
    const required = await lead.evaluate((element) => (element as HTMLTextAreaElement).required || element.getAttribute('aria-required') === 'true' || Boolean(element.closest('.form-item, [class*="field--name-"]')?.querySelector('label.form-required, label.js-form-required')));
    if (required) await fillOwnedEditor(form, 'textarea[name="field_insight_lead[0][value]"]', `QA-AUTOMATED Milestone 2 lead ${runId}`, 'Insight lead');
  }

  private async openOwnedEdit(page: Page, nodeId: string, title: string): Promise<string> {
    if (PROTECTED_DEVV_NODE_IDS.has(nodeId)) throw new Error(`Refusing protected node ${nodeId}.`);
    const response = await page.goto(`/node/${nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 400) throw new Error(`Milestone 2 edit form failed with HTTP ${response?.status() ?? 'unknown'}.`);
    this.monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
    const form = await this.exactForm(page); await this.assertDraftAndTitle(form, title);
    const wrapper = form.locator(PARAGRAPH_WRAPPER); await this.assertInventory(wrapper);
    const image = await findParagraphDeltasByLabel(wrapper, IMAGE_CONFIG.label);
    return image[0];
  }

  private async save(page: Page, form: Locator, label: string): Promise<void> {
    await submitNodeForm(page, form, label); this.saves += 1;
    this.monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
    if ((await page.locator('[data-drupal-messages] .messages--status, .messages.messages--status').filter({ visible: true }).count()) < 1) throw new Error(`${label} did not display a success message.`);
  }
}
