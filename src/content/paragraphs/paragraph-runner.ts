import type { Locator, Page } from '@playwright/test';
import { AUTOMATED_CONTENT_PREFIX, hasAutomatedContentPrefix } from '../../config/automation';
import { insightSearchConfig } from '../../config/content-types';
import { assertExplicitNonProductionEnvironment } from '../../config/write-safety';
import { assertNoDrupalFatalPage, NetworkMonitor } from '../../diagnostics/network-monitor';
import { nodeIdFromEditLink, nodeIdFromUrl } from '../basic-page-form';
import { fillOwnedEditor, readOwnedEditor, submitNodeForm, validateSafeModerationState } from '../node-form';
import { addParagraph, expandParagraph, expandParagraphForControl, findParagraphDeltasByLabel, identifyDeltas, ownedField, PARAGRAPH_WRAPPER, radioOptions, subformPrefix } from './paragraph-utils';
import { paragraphConfigs, type ParagraphComponentResult, type ParagraphConfig, type ParagraphRegressionResult, type RadioOption } from './paragraph-types';

const PROTECTED_NODE_IDS = new Set(['24971', '24976', '24981', '24986', '24991', '24996', '25001', '25011']);

interface Values { anchor: string; formatted: string; }

export class ParagraphRegressionRunner {
  private readonly monitor = new NetworkMonitor();
  private saves = 0;

  async run(page: Page): Promise<ParagraphRegressionResult> {
    assertExplicitNonProductionEnvironment();
    this.monitor.start(page);
    const runId = this.runId();
    const title = `${AUTOMATED_CONTENT_PREFIX}Paragraph-Regression-${runId}`;
    const initial: Values = { anchor: `qa-automated-anchor-${runId.toLowerCase()}`, formatted: `QA-AUTOMATED formatted text ${runId}` };
    const updated: Values = { anchor: `${initial.anchor}-updated`, formatted: `${initial.formatted} - UPDATED` };
    const components = paragraphConfigs.map((config): ParagraphComponentResult => ({ label: config.label, machineName: config.machineName, addResult: 'failed', fieldPopulationResult: 'failed', initialPersistenceResult: 'failed', updateResult: 'failed', finalPersistenceResult: 'failed', serverErrors: 0, fatalPageDetected: false }));
    let nodeId: string | undefined;
    try {
      const response = await page.goto('/node/add/insight_search', { waitUntil: 'domcontentloaded' });
      if (!response || response.status() >= 400) throw new Error(`Host creation form failed with HTTP ${response?.status() ?? 'unknown'}.`);
      const form = await this.exactForm(page);
      await form.waitFor({ state: 'visible' });
      await form.locator(insightSearchConfig.titleField.selector).fill(title);
      await this.populateRequiredHostFields(form, runId);
      const moderation = await validateSafeModerationState(form, insightSearchConfig.label);
      const wrapper = form.locator(PARAGRAPH_WRAPPER);
      if ((await wrapper.count()) !== 1) throw new Error('PARAGRAPH_BLOCKED: Paragraph host field was not unique.');
      const deltaByMachine = new Map<string, string>();
      for (const config of paragraphConfigs) {
        const result = this.result(components, config);
        const existing = await findParagraphDeltasByLabel(wrapper, config.label);
        let delta: string;
        if (existing.length === 1 && config.machineName === 'insights_overview') {
          delta = existing[0];
          result.addMethod = 'host default';
        } else {
          if (existing.length !== 0) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} already exists unexpectedly on the new host form.`);
          delta = await addParagraph(page, wrapper, config, this.monitor);
          result.addMethod = 'ajax';
        }
        deltaByMachine.set(config.machineName, delta);
        result.delta = delta;
        result.addResult = 'passed';
        await this.populate(wrapper, config, delta, initial, result);
      }
      await this.assertExactInventory(wrapper, deltaByMachine);
      await this.verifyInForm(wrapper, deltaByMachine, initial, components, 'initial');
      await this.verifyHostBeforeSave(form, title);
      await this.save(page, form, 'Paragraph regression creation');
      nodeId = nodeIdFromUrl(page.url()) ?? await nodeIdFromEditLink(page);
      if (!nodeId || !/^\d+$/.test(nodeId) || PROTECTED_NODE_IDS.has(nodeId)) throw new Error('Host save did not resolve a safe new numeric node ID.');
      this.event({ stage: 'host-created', nodeId, title, moderation: moderation.moderationStateUsed, saves: this.saves });

      let persistedDeltas = await this.openOwnedEdit(page, nodeId, title);
      await this.verifyAll(page, persistedDeltas, initial, components, 'initial');
      const editForm = await this.exactForm(page);
      const editWrapper = editForm.locator(PARAGRAPH_WRAPPER);
      await this.updateAll(editWrapper, persistedDeltas, initial, updated, components);
      persistedDeltas = await identifyDeltas(editWrapper, paragraphConfigs);
      await this.assertExactInventory(editWrapper, persistedDeltas);
      await this.verifyInForm(editWrapper, persistedDeltas, updated, components, 'updated');
      await this.verifyHostBeforeSave(editForm, title);
      await this.save(page, editForm, 'Paragraph regression update');

      persistedDeltas = await this.openOwnedEdit(page, nodeId, title);
      await this.verifyAll(page, persistedDeltas, updated, components, 'final');
      const finalForm = await this.exactForm(page);
      const finalModeration = await validateSafeModerationState(finalForm, insightSearchConfig.label);
      if (!/draft|unpublished/i.test(finalModeration.moderationStateUsed)) throw new Error('Final moderation state was not Draft.');
      const result: ParagraphRegressionResult = { host: { nodeId, title, contentType: 'Insight Search Filter Page', machineName: 'insight_search', moderationState: finalModeration.moderationStateUsed, saves: this.saves, createdParagraphCount: paragraphConfigs.length, nodeCreations: 1, paragraphAdditions: 3, paragraphRemovals: 0, initialParagraphCount: 4, finalParagraphCount: 4 }, components, serverErrors: this.monitor.getServerErrors().length, fatalPageDetected: false };
      this.event({ stage: 'complete', result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Paragraph regression failure.';
      const blocked = message.startsWith('PARAGRAPH_BLOCKED:');
      const active = components.find((component) => component.addResult === 'passed' && component.fieldPopulationResult === 'failed');
      if (active && blocked) { active.addResult = 'blocked'; active.fieldPopulationResult = 'blocked'; active.blockedReason = message; }
      this.event({ stage: 'failure', nodeId, title, saves: this.saves, components, serverErrors: this.monitor.getServerErrors().length, fatalPageDetected: /fatal page/i.test(message), reason: message });
      throw error;
    } finally {
      this.monitor.stop();
    }
  }

  private async populateRequiredHostFields(form: Locator, runId: string): Promise<void> {
    const lead = form.locator('textarea[name="field_insight_lead[0][value]"]');
    const required = await lead.evaluate((element) => (element as HTMLTextAreaElement).required || element.getAttribute('aria-required') === 'true' || Boolean(element.closest('.form-item, [class*="field--name-"]')?.querySelector('label.form-required, label.js-form-required')));
    if (required) await fillOwnedEditor(form, 'textarea[name="field_insight_lead[0][value]"]', `QA-AUTOMATED paragraph regression lead ${runId}`, 'Insight lead');
  }

  private async populate(wrapper: Locator, config: ParagraphConfig, delta: string, values: Values, result: ParagraphComponentResult): Promise<void> {
    if (config.handler === 'fieldless') { result.fieldPopulationResult = 'not applicable'; return; }
    await expandParagraph(wrapper, delta);
    if (!config.fieldMachineName) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} has no configured field.`);
    if (config.handler === 'radio') {
      const field = wrapper.locator(`[name="${subformPrefix(delta)}[${config.fieldMachineName}]"]`).locator('xpath=..');
      const options = await radioOptions(field);
      const inline = options.find((option) => /^inline$/i.test(option.label) && option.value === 'inline');
      const sticky = options.find((option) => /^sticky$/i.test(option.label) && option.value === 'sticky');
      if (!inline || !sticky) throw new Error('PARAGRAPH_BLOCKED: Jump nav does not expose exact Inline/inline and Sticky/sticky options.');
      const selected = inline;
      await wrapper.locator(`input[type="radio"][name="${subformPrefix(delta)}[${config.fieldMachineName}]"][value="${selected.value}"]`).check();
      result.availableOptions = options; result.selectedOption = selected; result.fieldPopulationResult = 'passed'; return;
    }
    if (config.handler === 'ckeditor') {
      const selector = `textarea[name="${subformPrefix(delta)}[${config.fieldMachineName}][0][value]"]`;
      await fillOwnedEditor(wrapper, selector, values.formatted, config.label);
      result.initialValue = values.formatted; result.fieldPopulationResult = 'passed'; return;
    }
    if (config.repeatableItem) await this.ensureSecondaryFooterItem(wrapper, delta, config);
    const field = ownedField(wrapper, delta, config.fieldMachineName).filter({ visible: true });
    if ((await field.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} text field ownership was ambiguous.`);
    const value = values.anchor;
    await field.fill(value); result.initialValue = value; result.fieldPopulationResult = 'passed';
  }

  private async ensureSecondaryFooterItem(wrapper: Locator, delta: string, config: ParagraphConfig): Promise<void> {
    const prefix = `${subformPrefix(delta)}[${config.fieldMachineName}]`;
    if (await wrapper.locator(`[name^="${prefix}"] input[type="text"]:visible, input[type="text"][name^="${prefix}"]:visible`).count()) return;
    const nestedAdd = wrapper.locator(`input[name^="${prefix}"][name*="add_more"], button[name^="${prefix}"][name*="add_more"]`).filter({ visible: true });
    if (await nestedAdd.count()) {
      throw new Error('PARAGRAPH_BLOCKED: Secondary footer exposes a nested Blocks widget instead of one exact owned text field; nested component selection is outside this regression scope.');
    }
    throw new Error('PARAGRAPH_BLOCKED: Secondary footer exact owned text field was not available.');
  }

  private async openOwnedEdit(page: Page, nodeId: string, title: string): Promise<Map<string, string>> {
    if (PROTECTED_NODE_IDS.has(nodeId)) throw new Error(`Refusing to edit protected node ${nodeId}.`);
    const response = await page.goto(`/node/${nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 400) throw new Error(`Owned node edit form failed with HTTP ${response?.status() ?? 'unknown'}.`);
    this.monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
    const form = await this.exactForm(page);
    const actual = await form.locator(insightSearchConfig.titleField.selector).inputValue();
    if (actual !== title || !hasAutomatedContentPrefix(actual)) throw new Error(`Refusing to edit node ${nodeId}: exact ownership failed.`);
    const moderation = await validateSafeModerationState(form, insightSearchConfig.label);
    if (!/draft|unpublished/i.test(moderation.moderationStateUsed)) throw new Error(`Refusing to edit node ${nodeId}: moderation is not Draft.`);
    const wrapper = form.locator(PARAGRAPH_WRAPPER);
    const found = await identifyDeltas(wrapper, paragraphConfigs);
    await this.assertExactInventory(wrapper, found);
    return found;
  }

  private async verifyAll(page: Page, deltas: Map<string, string>, values: Values, components: ParagraphComponentResult[], stage: 'initial' | 'final'): Promise<void> {
    const wrapper = (await this.exactForm(page)).locator(PARAGRAPH_WRAPPER);
    for (const config of paragraphConfigs) {
      const current = await findParagraphDeltasByLabel(wrapper, config.label);
      if (current.length !== 1) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} ownership changed during ${stage} verification.`);
      const delta = current[0]; deltas.set(config.machineName, delta); const result = this.result(components, config);
      if (config.handler === 'fieldless') {
        if (stage === 'initial') result.initialPersistenceResult = 'passed'; else result.finalPersistenceResult = 'passed';
        continue;
      }
      await expandParagraphForControl(wrapper, delta, this.controlSelector(config, delta), config.handler === 'ckeditor' ? 'attached' : 'visible');
      if (config.handler === 'text') {
        const field = ownedField(wrapper, delta, config.fieldMachineName!).filter({ visible: true });
        if ((await field.count()) !== 1) throw new Error(`${config.label} persisted field was ambiguous.`);
        const expected = values.anchor;
        if ((await field.inputValue()) !== expected) throw new Error(`${config.label} persisted-value mismatch.`);
      } else if (config.handler === 'ckeditor') {
        const actual = await readOwnedEditor(wrapper, `textarea[name="${subformPrefix(delta)}[${config.fieldMachineName}][0][value]"]`, config.label);
        if (actual !== values.formatted) throw new Error(`${config.label} persisted-value mismatch.`);
      } else if (config.handler === 'radio') {
        const selected = wrapper.locator(`input[type="radio"][name="${subformPrefix(delta)}[${config.fieldMachineName}]"]:checked`);
        if ((await selected.count()) !== 1) throw new Error('Jump nav persisted-value mismatch.');
        const expected = stage === 'final' && result.updatedOption ? result.updatedOption.value : result.selectedOption?.value;
        if ((await selected.inputValue()) !== expected) throw new Error('Jump nav persisted-value mismatch.');
      }
      if (stage === 'initial') result.initialPersistenceResult = 'passed'; else result.finalPersistenceResult = 'passed';
    }
  }

  private async updateAll(wrapper: Locator, deltas: Map<string, string>, initial: Values, updated: Values, components: ParagraphComponentResult[]): Promise<void> {
    for (const config of paragraphConfigs) {
      const result = this.result(components, config);
      if (config.handler === 'fieldless') { result.updateResult = 'not applicable'; continue; }
      const current = await findParagraphDeltasByLabel(wrapper, config.label);
      if (current.length !== 1) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} ownership changed before update.`);
      const delta = current[0]; deltas.set(config.machineName, delta);
      const activation = await expandParagraphForControl(wrapper, delta, this.controlSelector(config, delta), config.handler === 'ckeditor' ? 'attached' : 'visible');
      result.updateActivationMethod = !activation ? 'already expanded' : activation.strategy === 'keyboard Enter' ? 'keyboard' : 'pointer';
      result.updateFocusVerified = activation?.focusVerified ?? false;
      if (config.handler === 'radio') {
        const radios = wrapper.locator(`input[type="radio"][name="${subformPrefix(delta)}[${config.fieldMachineName}]"]`);
        const options = await radioOptions(radios.locator('xpath=..'));
        const sticky = options.find((option) => option.label === 'Sticky' && option.value === 'sticky');
        if (!sticky) throw new Error('PARAGRAPH_BLOCKED: Jump nav exact Sticky/sticky option was unavailable during update.');
        await wrapper.locator(`input[type="radio"][name="${subformPrefix(delta)}[${config.fieldMachineName}]"][value="sticky"]`).check();
        result.updatedOption = sticky; result.updateResult = 'passed'; continue;
      }
      if (config.handler === 'ckeditor') {
        await fillOwnedEditor(wrapper, `textarea[name="${subformPrefix(delta)}[${config.fieldMachineName}][0][value]"]`, updated.formatted, config.label);
        result.updatedValue = updated.formatted; result.updateResult = 'passed'; continue;
      }
      const field = ownedField(wrapper, delta, config.fieldMachineName!).filter({ visible: true });
      if ((await field.count()) !== 1) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} update field was ambiguous.`);
      const value = updated.anchor;
      await field.fill(value); result.updatedValue = value; result.updateResult = 'passed';
    }
  }

  private controlSelector(config: ParagraphConfig, delta: string): string {
    if (!config.fieldMachineName) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} has no configured field.`);
    if (config.handler === 'radio') return `input[type="radio"][name="${subformPrefix(delta)}[${config.fieldMachineName}]"]`;
    if (config.handler === 'ckeditor') return `textarea[name="${subformPrefix(delta)}[${config.fieldMachineName}][0][value]"]`;
    return `[name^="${subformPrefix(delta)}[${config.fieldMachineName}]"]`;
  }

  private async verifyInForm(wrapper: Locator, deltas: Map<string, string>, values: Values, components: ParagraphComponentResult[], stage: 'initial' | 'updated'): Promise<void> {
    await this.assertExactInventory(wrapper, deltas);
    for (const config of paragraphConfigs) {
      if (config.handler === 'fieldless') continue;
      const current = await findParagraphDeltasByLabel(wrapper, config.label);
      if (current.length !== 1) throw new Error(`PARAGRAPH_BLOCKED: ${config.label} ownership was ambiguous during pre-save verification.`);
      const delta = current[0]; deltas.set(config.machineName, delta);
      await expandParagraphForControl(wrapper, delta, this.controlSelector(config, delta), config.handler === 'ckeditor' ? 'attached' : 'visible');
      if (config.handler === 'text') {
        const field = ownedField(wrapper, delta, config.fieldMachineName!).filter({ visible: true });
        if ((await field.count()) !== 1 || (await field.inputValue()) !== values.anchor) throw new Error(`PARAGRAPH_BLOCKED: Anchor ${stage} pre-save value mismatch.`);
      } else if (config.handler === 'ckeditor') {
        if ((await readOwnedEditor(wrapper, this.controlSelector(config, delta), config.label)) !== values.formatted) throw new Error(`PARAGRAPH_BLOCKED: Formatted text ${stage} pre-save value mismatch.`);
      } else if (config.handler === 'radio') {
        const selected = wrapper.locator(`${this.controlSelector(config, delta)}:checked`);
        const expected = stage === 'initial' ? 'inline' : 'sticky';
        if ((await selected.count()) !== 1 || (await selected.inputValue()) !== expected) throw new Error(`PARAGRAPH_BLOCKED: Jump nav ${stage} pre-save value mismatch.`);
      }
    }
  }

  private async save(page: Page, form: Locator, label: string): Promise<void> {
    await submitNodeForm(page, form, label); this.saves += 1; this.monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
    const status = page.locator('[data-drupal-messages] .messages--status, .messages.messages--status').filter({ visible: true });
    if ((await status.count()) < 1) throw new Error(`${label} did not display a success message.`);
  }

  private async exactForm(page: Page): Promise<Locator> {
    const forms = page.locator(insightSearchConfig.formSelector);
    if ((await forms.count()) !== 1 || !(await forms.isVisible())) throw new Error('PARAGRAPH_BLOCKED: Insight Search Filter Page node form was not uniquely visible.');
    return forms;
  }

  private async verifyHostBeforeSave(form: Locator, title: string): Promise<void> {
    const titles = form.locator(insightSearchConfig.titleField.selector);
    if ((await titles.count()) !== 1 || (await titles.inputValue()) !== title || !hasAutomatedContentPrefix(title)) throw new Error('PARAGRAPH_BLOCKED: Exact QA-owned host title changed before Save.');
    const moderation = await validateSafeModerationState(form, insightSearchConfig.label);
    if (!/draft|unpublished/i.test(moderation.moderationStateUsed)) throw new Error('PARAGRAPH_BLOCKED: Host moderation was not Draft before Save.');
    this.monitor.assertNoServerErrors();
  }

  private async assertExactInventory(wrapper: Locator, deltasByMachine: Map<string, string>): Promise<void> {
    if (deltasByMachine.size !== paragraphConfigs.length || new Set(deltasByMachine.values()).size !== paragraphConfigs.length) throw new Error('Unexpected duplicate or missing Paragraph delta.');
    const actionCount = await wrapper.locator(`[name^="field_landing_paragraphs_"][name$="_edit"], [name^="field_landing_paragraphs_"][name$="_collapse"]`).count();
    if (actionCount !== paragraphConfigs.length) throw new Error(`Unexpected Paragraph count: expected ${paragraphConfigs.length}, found ${actionCount}.`);
  }

  private result(results: ParagraphComponentResult[], config: ParagraphConfig): ParagraphComponentResult { return results.find((entry) => entry.machineName === config.machineName)!; }
  private runId(): string { return `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`; }
  private event(event: unknown): void { console.log(`PARAGRAPH_REGRESSION_EVENT ${JSON.stringify(event)}`); }
}
