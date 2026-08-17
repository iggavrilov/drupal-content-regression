import type { Locator, Page } from '@playwright/test';
import {
  AUTOMATED_CONTENT_PREFIX,
  hasAutomatedContentPrefix,
} from '../config/automation';
import type { ContentTypeConfig } from '../config/content-types';
import type { ContentTypeTestData } from '../data/test-data';
import {
  assertNoDrupalFatalPage,
  type NetworkMonitor,
} from '../diagnostics/network-monitor';
import {
  nodeIdFromEditLink,
  nodeIdFromUrl,
  safeNodeUrl,
} from './basic-page-form';
import {
  canPopulateField,
  populateField,
  readConfiguredField,
} from './field-handlers';
import {
  submitNodeForm,
  type SafeModerationState,
  validateSafeModerationState,
} from './node-form';
import {
  assertSelectedMediaFixture,
  selectAutomationImageFixture,
} from './media/media-library';
import {
  assertEntityReferenceFixture,
  selectEntityReferenceFixture,
  verifyEntityReferenceFixture,
} from './field-handlers/entity-reference-field';

export interface ContentTypeRunContext {
  page: Page;
  config: ContentTypeConfig;
  data: ContentTypeTestData;
  monitor: NetworkMonitor;
}

export interface GenericCreateResult {
  nodeId: string;
  nodeUrl: string;
  title: string;
  moderation?: SafeModerationState;
  validatedDefaults: readonly string[];
  mediaId?: string;
  referenceIds?: Readonly<Record<string, string>>;
  validatedControls: readonly string[];
}

export interface GenericUpdateResult {
  nodeId: string;
  nodeUrl: string;
  title: string;
  moderation?: SafeModerationState;
  skippedOptionalFields: readonly string[];
  mediaId?: string;
  referenceIds?: Readonly<Record<string, string>>;
  validatedControls: readonly string[];
}

export interface ContentTypeRunResult {
  created: GenericCreateResult;
  updated: GenericUpdateResult;
}

export class ContentTypeRunner {
  async run(context: ContentTypeRunContext): Promise<ContentTypeRunResult> {
    const created = await this.create(context);
    const updated = await this.update(context, created.nodeId);
    return { created, updated };
  }

  async create(context: ContentTypeRunContext): Promise<GenericCreateResult> {
    const { page, config, data, monitor } = context;
    const title = this.valueFor(data.createValues, config.titleField.key);
    this.assertOwnedTitle(title, `create ${config.label}`);

    for (const reference of config.requiredEntityReferences ?? []) {
      await verifyEntityReferenceFixture(page, reference);
      monitor.assertNoServerErrors();
      await assertNoDrupalFatalPage(page);
    }

    const response = await page.goto(`/node/add/${config.machineName}`, {
      waitUntil: 'domcontentloaded',
    });
    if (!response || response.status() >= 400) {
      throw new Error(
        `${config.label} creation form failed to load with HTTP status ${response?.status() ?? 'unknown'}.`,
      );
    }
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
    const form = page.locator(config.formSelector).first();
    await form.waitFor({ state: 'visible' });

    const validatedDefaults = await this.validateRequiredDefaults(form, config);
    await this.validateUntouchedOptionalFields(form, config);
    const validatedControls = await this.validateExpectedControls(form, config);
    const moderation = config.moderation?.enabled
      ? await validateSafeModerationState(form, config.label)
      : undefined;
    let mediaId: string | undefined;
    if (config.requiredMedia) {
      const media = await selectAutomationImageFixture(
        page,
        config.requiredMedia.expectedId,
      );
      mediaId = media.id;
      await assertSelectedMediaFixture(
        form,
        config.requiredMedia.selectionSelector,
        config.requiredMedia.expectedId,
        config.requiredMedia.label,
      );
    }
    const referenceIds: Record<string, string> = {};
    for (const reference of config.requiredEntityReferences ?? []) {
      await selectEntityReferenceFixture(page, form, reference);
      referenceIds[reference.label] = reference.expectedId;
    }
    await this.populateValues(page, form, config, data.createValues, false);

    await submitNodeForm(page, form, config.label);
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
    await this.assertSuccessfulSave(page, config, title, 'creation');
    const nodeId = nodeIdFromUrl(page.url()) ?? (await nodeIdFromEditLink(page));
    if (!nodeId) {
      throw new Error(
        `${config.label} may have been saved, but its node ID could not be tied uniquely to the owned result page. Refusing to edit any node.`,
      );
    }

    const result: GenericCreateResult = {
      nodeId,
      nodeUrl: safeNodeUrl(page.url()),
      title,
      moderation,
      validatedDefaults,
      mediaId,
      referenceIds,
      validatedControls,
    };
    this.reportLifecycleEvent(config, 'created', result);
    return result;
  }

  async update(
    context: ContentTypeRunContext,
    nodeId: string,
  ): Promise<GenericUpdateResult> {
    const { page, config, data, monitor } = context;
    if (!/^\d+$/.test(nodeId)) {
      throw new Error(`Refusing to edit ${config.label} without a numeric node ID.`);
    }
    const originalTitle = this.valueFor(
      data.createValues,
      config.titleField.key,
    );
    const updatedTitle = this.valueFor(
      data.updateValues,
      config.titleField.key,
    );
    this.assertOwnedTitle(originalTitle, `edit ${config.label}`);
    this.assertOwnedTitle(updatedTitle, `edit ${config.label}`);

    const response = await page.goto(`/node/${nodeId}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    if (!response || response.status() >= 400) {
      throw new Error(
        `${config.label} edit form for node ${nodeId} failed to load with HTTP status ${response?.status() ?? 'unknown'}.`,
      );
    }
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
    const form = page.locator(config.formSelector).first();
    await form.waitFor({ state: 'visible' });
    const currentTitle = await readConfiguredField(form, config.titleField);
    if (
      currentTitle !== originalTitle ||
      !hasAutomatedContentPrefix(currentTitle)
    ) {
      throw new Error(
        `Refusing to edit node ${nodeId}: exact owned ${config.label} title was not present.`,
      );
    }

    await this.validateRequiredDefaults(form, config);
    await this.validateUntouchedOptionalFields(form, config);
    const validatedControls = await this.validateExpectedControls(form, config);
    const moderation = config.moderation?.enabled
      ? await validateSafeModerationState(form, config.label)
      : undefined;
    if (config.requiredMedia) {
      await assertSelectedMediaFixture(
        form,
        config.requiredMedia.selectionSelector,
        config.requiredMedia.expectedId,
        config.requiredMedia.label,
      );
    }
    for (const reference of config.requiredEntityReferences ?? []) {
      await assertEntityReferenceFixture(form, reference);
    }
    for (const field of config.fields.filter(
      (configuredField) =>
        configuredField.verifyPersisted &&
        configuredField.key !== config.titleField.key,
    )) {
      const currentValue = await readConfiguredField(form, field);
      if (currentValue === undefined) {
        throw new Error(
          `${config.label} pre-update ownership verification is not supported for ${field.label}.`,
        );
      }
      if (currentValue !== this.valueFor(data.createValues, field.key)) {
        throw new Error(
          `Refusing to edit node ${nodeId}: exact original ${field.label} was not present.`,
        );
      }
    }
    const skippedOptionalFields = await this.populateValues(
      page,
      form,
      config,
      data.updateValues,
      true,
    );
    await submitNodeForm(page, form, config.label);
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
    await this.assertSuccessfulSave(page, config, updatedTitle, 'update');
    const nodeUrl = safeNodeUrl(page.url());

    const verifyFields = config.fields.filter((field) => field.verifyPersisted);
    if (verifyFields.length > 0) {
      const verifyResponse = await page.goto(`/node/${nodeId}/edit`, {
        waitUntil: 'domcontentloaded',
      });
      if (!verifyResponse || verifyResponse.status() >= 400) {
        throw new Error(
          `${config.label} persistence verification failed for node ${nodeId}.`,
        );
      }
      monitor.assertNoServerErrors();
      await assertNoDrupalFatalPage(page);
      const verifyForm = page.locator(config.formSelector).first();
      await verifyForm.waitFor({ state: 'visible' });
      for (const field of verifyFields) {
        const actual = await readConfiguredField(verifyForm, field);
        if (actual === undefined) {
          throw new Error(
            `${config.label} persistence verification is not supported for ${field.label}.`,
          );
        }
        if (actual !== this.valueFor(data.updateValues, field.key)) {
          throw new Error(
            `${config.label} node ${nodeId} did not persist ${field.label}.`,
          );
        }
      }
      if (config.moderation?.enabled) {
        const selectedModerationLabel = await verifyForm
          .locator('select[name="moderation_state[0][state]"] option:checked')
          .textContent();
        if (!selectedModerationLabel || !/draft|unpublished/i.test(selectedModerationLabel)) {
          throw new Error(
            `${config.label} node ${nodeId} did not remain Draft or Unpublished after update.`,
          );
        }
      }
      if (config.requiredMedia) {
        await assertSelectedMediaFixture(
          verifyForm,
          config.requiredMedia.selectionSelector,
          config.requiredMedia.expectedId,
          config.requiredMedia.label,
        );
      }
      for (const reference of config.requiredEntityReferences ?? []) {
        await assertEntityReferenceFixture(verifyForm, reference);
      }
    }

    const result: GenericUpdateResult = {
      nodeId,
      nodeUrl,
      title: updatedTitle,
      moderation,
      skippedOptionalFields,
      mediaId: config.requiredMedia?.expectedId,
      referenceIds: Object.fromEntries(
        (config.requiredEntityReferences ?? []).map((reference) => [
          reference.label,
          reference.expectedId,
        ]),
      ),
      validatedControls,
    };
    this.reportLifecycleEvent(config, 'updated', result);
    return result;
  }

  private async populateValues(
    page: Page,
    form: Locator,
    config: ContentTypeConfig,
    values: Readonly<Record<string, string>>,
    isUpdate: boolean,
  ): Promise<string[]> {
    const skipped: string[] = [];
    for (const field of config.fields) {
      const value = this.valueFor(values, field.key);
      if (isUpdate && field.optionalOnUpdate) {
        if (!(await canPopulateField(page, form, field))) {
          skipped.push(field.label);
          continue;
        }
      }
      await populateField(page, form, field, value);
    }
    return skipped;
  }

  private async validateRequiredDefaults(
    form: Locator,
    config: ContentTypeConfig,
  ): Promise<string[]> {
    const validated: string[] = [];
    for (const field of config.requiredDefaults ?? []) {
      const control = form.locator(field.selector);
      if ((await control.count()) !== 1) {
        throw new Error(
          `Cannot safely save ${config.label}: required ${field.label} control was not found uniquely.`,
        );
      }
      const hasValidDefault = await control.evaluate((element) => {
        if (!(element instanceof HTMLSelectElement)) return false;
        const selected = element.selectedOptions[0];
        return Boolean(
          selected &&
            !selected.disabled &&
            selected.value.trim() &&
            selected.value !== '_none',
        );
      });
      if (!hasValidDefault) {
        throw new Error(
          `Cannot safely save ${config.label}: required ${field.label} has no valid default.`,
        );
      }
      validated.push(field.label);
    }
    return validated;
  }

  private async validateUntouchedOptionalFields(
    form: Locator,
    config: ContentTypeConfig,
  ): Promise<void> {
    for (const field of config.untouchedOptionalFields ?? []) {
      const control = form.locator(field.selector);
      if ((await control.count()) !== 1) {
        throw new Error(
          `Cannot safely save ${config.label}: untouched ${field.label} control was not found uniquely.`,
        );
      }
      const required = await control.evaluate((element) => {
        const wrapper = element.closest('.form-item, .form-wrapper, [class*="field--name-"]');
        return Boolean(
          element.hasAttribute('required') ||
            element.getAttribute('aria-required') === 'true' ||
            wrapper?.querySelector(
              '[required], [aria-required="true"], label.form-required, label.js-form-required',
            ),
        );
      });
      if (required) {
        throw new Error(
          `Cannot safely save ${config.label}: untouched ${field.label} is required.`,
        );
      }
    }
  }

  private async validateExpectedControls(
    form: Locator,
    config: ContentTypeConfig,
  ): Promise<string[]> {
    const validated: string[] = [];
    for (const controlConfig of config.expectedControls ?? []) {
      const control = form.locator(controlConfig.selector);
      if ((await control.count()) !== 1 || !(await control.isVisible())) {
        throw new Error(
          `Cannot safely use ${config.label}: expected ${controlConfig.label} control was not found uniquely and visibly.`,
        );
      }
      validated.push(controlConfig.label);
    }
    return validated;
  }

  private async assertSuccessfulSave(
    page: Page,
    config: ContentTypeConfig,
    expectedTitle: string,
    operation: 'creation' | 'update',
  ): Promise<void> {
    const statusMessage = page.locator(
      '[data-drupal-messages] .messages--status, .messages.messages--status',
    );
    if (!(await statusMessage.first().isVisible())) {
      throw new Error(
        `${config.label} ${operation} did not display a Drupal success message.`,
      );
    }
    const titleHeading = await page
      .getByRole('heading', { name: expectedTitle, exact: true })
      .first()
      .isVisible();
    const titleInStatus = await statusMessage
      .filter({ hasText: expectedTitle })
      .first()
      .isVisible();
    if (!titleHeading && !titleInStatus) {
      throw new Error(
        `${config.label} ${operation} did not confirm the exact ${AUTOMATED_CONTENT_PREFIX} title.`,
      );
    }
  }

  private assertOwnedTitle(title: string, operation: string): void {
    if (!hasAutomatedContentPrefix(title)) {
      throw new Error(
        `Refusing to ${operation} without ${AUTOMATED_CONTENT_PREFIX} title ownership.`,
      );
    }
  }

  private valueFor(
    values: Readonly<Record<string, string>>,
    key: string,
  ): string {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`Missing configured test value for field key: ${key}`);
    }
    return value;
  }

  private reportLifecycleEvent(
    config: ContentTypeConfig,
    stage: 'created' | 'updated',
    result: GenericCreateResult | GenericUpdateResult,
  ): void {
    console.log(
      `CONTENT_REGRESSION_EVENT ${JSON.stringify({
        machineName: config.machineName,
        label: config.label,
        stage,
        nodeId: result.nodeId,
        title: result.title,
        moderation: result.moderation?.moderationStateUsed,
      })}`,
    );
  }
}
