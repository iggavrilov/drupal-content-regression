import type { Page } from '@playwright/test';
import type { ServerErrorRecord } from '../diagnostics/network-monitor';
import type { DiscoveredContentType } from './discover-content-types';
import {
  inspectContentForm,
  type ContentEditorMetadata,
  type ContentFormField,
  type ContentFormSubmitControl,
} from './inspect-content-form';

export type AutomationComplexity = 'simple' | 'moderate' | 'complex';

export interface ParagraphsInventory {
  detected: boolean;
  nestedFieldNames: readonly string[];
  subtypeClues: readonly string[];
  addControls: readonly string[];
}

export interface ContentTypeFormInventory {
  machineName: string;
  label: string;
  url: string;
  fields: readonly ContentFormField[];
  visibleRequiredFields: readonly ContentFormField[];
  hiddenRequiredFields: readonly ContentFormField[];
  editors: readonly ContentEditorMetadata[];
  paragraphs: ParagraphsInventory;
  mediaEntityReferenceFields: readonly ContentFormField[];
  moderationStates: readonly string[];
  nodeSaveControls: readonly ContentFormSubmitControl[];
  widgetSubmitControls: readonly ContentFormSubmitControl[];
  serverErrors: readonly ServerErrorRecord[];
  fatalPageDetected: boolean;
  complexity: AutomationComplexity;
}

interface ParagraphDomInventory {
  wrapperDetected: boolean;
  nestedFieldNames: string[];
  subtypeClues: string[];
  addControls: string[];
}

function safePageUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  return `${url.origin}${url.pathname}`;
}

function classifyComplexity(
  fields: readonly ContentFormField[],
  editors: readonly ContentEditorMetadata[],
  paragraphs: ParagraphsInventory,
): AutomationComplexity {
  const mediaCount = fields.filter(
    (field) => field.widgetType === 'media-file',
  ).length;
  const referenceCount = fields.filter(
    (field) => field.widgetType === 'autocomplete-entity-reference',
  ).length;

  if (paragraphs.detected || mediaCount > 0 || referenceCount > 1) {
    return 'complex';
  }
  if (
    editors.some((editor) => editor.implementation === 'ckeditor5') ||
    referenceCount === 1 ||
    fields.filter((field) => field.visible && field.editable).length > 5
  ) {
    return 'moderate';
  }
  return 'simple';
}

export async function inventoryContentTypeForm(
  page: Page,
  contentType: DiscoveredContentType,
  serverErrors: readonly ServerErrorRecord[],
  fatalPageDetected: boolean,
): Promise<ContentTypeFormInventory> {
  const inspection = await inspectContentForm(page);
  const form = page.locator(inspection.formSelector).first();
  const moderationStates = await form
    .locator('select[name="moderation_state[0][state]"] option:not([disabled])')
    .allTextContents();
  const paragraphDom = await form.evaluate((formElement) => {
    const normalize = (value: string): string =>
      value.replace(/\s+/g, ' ').trim();
    const controls = [...formElement.querySelectorAll<HTMLElement>(
      'input[name], textarea[name], select[name], button[name]',
    )];
    const nestedFieldNames = controls
      .map((control) => control.getAttribute('name') ?? '')
      .filter((name) => name.includes('[subform]'));
    const addControls = controls
      .filter((control) => {
        const name = control.getAttribute('name') ?? '';
        return /paragraph/i.test(name) && /add_more$/.test(name);
      })
      .map((control) => {
        const input = control instanceof HTMLInputElement ? control.value : '';
        return normalize(input || control.textContent || control.getAttribute('name') || '');
      })
      .filter(Boolean);
    const subtypeClues = [
      ...formElement.querySelectorAll<HTMLElement>('[data-paragraphs-bundle]'),
    ]
      .map((element) => element.getAttribute('data-paragraphs-bundle') ?? '')
      .filter(Boolean);
    for (const element of formElement.querySelectorAll<HTMLElement>(
      '[class*="paragraph-type--"]',
    )) {
      for (const className of element.classList) {
        if (className.startsWith('paragraph-type--')) {
          subtypeClues.push(className.slice('paragraph-type--'.length));
        }
      }
    }

    return {
      wrapperDetected: Boolean(
        formElement.querySelector(
          '.field--widget-entity-reference-paragraphs, .paragraphs-subform, [data-paragraphs-bundle]',
        ),
      ),
      nestedFieldNames: [...new Set(nestedFieldNames)],
      subtypeClues: [...new Set(subtypeClues)],
      addControls: [...new Set(addControls)],
    } satisfies ParagraphDomInventory;
  });
  const paragraphs: ParagraphsInventory = {
    detected:
      paragraphDom.wrapperDetected ||
      paragraphDom.nestedFieldNames.length > 0 ||
      paragraphDom.addControls.length > 0,
    nestedFieldNames: paragraphDom.nestedFieldNames,
    subtypeClues: paragraphDom.subtypeClues,
    addControls: paragraphDom.addControls,
  };
  const nodeSaveControls = inspection.submitControls.filter(
    (control) => control.defaultAction || control.name === 'op',
  );
  const widgetSubmitControls = inspection.submitControls.filter(
    (control) => !nodeSaveControls.includes(control),
  );

  return {
    machineName: contentType.machineName,
    label: contentType.label,
    url: safePageUrl(page.url()),
    fields: inspection.fields,
    visibleRequiredFields: inspection.fields.filter(
      (field) => field.required && field.visible,
    ),
    hiddenRequiredFields: inspection.fields.filter(
      (field) => field.required && !field.visible,
    ),
    editors: inspection.editors,
    paragraphs,
    mediaEntityReferenceFields: inspection.fields.filter((field) =>
      ['media-file', 'autocomplete-entity-reference'].includes(field.widgetType),
    ),
    moderationStates: moderationStates.map((label) => label.trim()).filter(Boolean),
    nodeSaveControls,
    widgetSubmitControls,
    serverErrors,
    fatalPageDetected,
    complexity: classifyComplexity(
      inspection.fields,
      inspection.editors,
      paragraphs,
    ),
  };
}
