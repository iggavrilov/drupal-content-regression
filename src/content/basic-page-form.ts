import type { Locator, Page, Response } from '@playwright/test';

export const BASIC_PAGE_FORM_SELECTOR =
  'form.node-page-form, form.node-form, form[id^="node-page-form"]';
export const BASIC_PAGE_TITLE_SELECTOR = 'input[name="title[0][value]"]';
export const BASIC_PAGE_BODY_SELECTOR =
  'textarea[name="field_page_paragraphs[0][subform][field_formatted_text][0][value]"]';
const BASIC_PAGE_FORMATTED_TEXT_SELECTOR =
  'textarea[name*="[field_formatted_text]"][name$="[value]"]';
const SCOPED_FORMATTED_TEXT_FIELD =
  '.field--name-field-page-paragraphs .field--name-field-formatted-text';

export interface SafeFormDefaults {
  footerColorHasValidDefault: boolean;
  moderationStates: readonly string[];
  moderationStateUsed: string;
}

function nodeForm(page: Page): Locator {
  return page.locator(BASIC_PAGE_FORM_SELECTOR).first();
}

export async function validateSafeBasicPageDefaults(
  page: Page,
): Promise<SafeFormDefaults> {
  const form = nodeForm(page);
  await form.waitFor({ state: 'visible' });

  const footerColor = form.locator('select[name="field_page_footer_color"]');
  if ((await footerColor.count()) !== 1) {
    throw new Error(
      'Cannot safely save Basic page: required Footer color control was not found uniquely.',
    );
  }

  const footerColorHasValidDefault = await footerColor.evaluate((select) => {
    const selected = (select as HTMLSelectElement).selectedOptions[0];
    return Boolean(
      selected &&
        !selected.disabled &&
        selected.value.trim() &&
        selected.value !== '_none',
    );
  });
  if (!footerColorHasValidDefault) {
    throw new Error(
      'Cannot safely save Basic page: required Footer color has no selected value.',
    );
  }

  const moderation = form.locator('select[name="moderation_state[0][state]"]');
  if ((await moderation.count()) !== 1) {
    throw new Error(
      'Cannot safely save Basic page: moderation state control was not found uniquely.',
    );
  }

  const options = await moderation.locator('option').evaluateAll((elements) =>
    elements.map((element) => {
      const option = element as HTMLOptionElement;
      return {
        label: option.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        value: option.value,
        selected: option.selected,
        disabled: option.disabled,
      };
    }),
  );
  const safeStatePattern = /\b(draft|unpublished)\b/i;
  const selected = options.find((option) => option.selected);
  let stateToUse =
    selected && !selected.disabled && safeStatePattern.test(selected.label)
      ? selected
      : options.find(
          (option) =>
            !option.disabled &&
            Boolean(option.value) &&
            safeStatePattern.test(option.label),
        );

  if (!stateToUse) {
    throw new Error(
      'Cannot safely save Basic page: no clearly identifiable Draft or Unpublished moderation state is available.',
    );
  }

  if (!stateToUse.selected) {
    await moderation.selectOption(stateToUse.value);
    stateToUse = { ...stateToUse, selected: true };
  }

  return {
    footerColorHasValidDefault,
    moderationStates: options
      .filter((option) => !option.disabled && option.label)
      .map((option) => option.label),
    moderationStateUsed: stateToUse.label,
  };
}

export async function fillBasicPageBody(
  page: Page,
  body: string,
): Promise<void> {
  const editor = await resolveBasicPageBodyEditor(page);
  if (!editor) {
    throw new Error(
      'Basic page formatted-text field has no uniquely owned visible CKEditor or textarea.',
    );
  }

  if (editor.editable) {
    await editor.editable.fill(body);
    if ((await editor.editable.innerText()).trim() !== body) {
      throw new Error('CKEditor did not retain the generated QA body text.');
    }
    return;
  }

  if (editor.textarea) {
    await editor.textarea.fill(body);
    return;
  }
}

interface ResolvedBodyEditor {
  textarea?: Locator;
  editable?: Locator;
}

async function resolveBasicPageBodyEditor(
  page: Page,
): Promise<ResolvedBodyEditor | undefined> {
  const form = nodeForm(page);
  const scopedField = form.locator(SCOPED_FORMATTED_TEXT_FIELD);
  const scopedFieldCount = await scopedField.count();
  if (scopedFieldCount > 1) {
    return undefined;
  }

  const owner = scopedFieldCount === 1 ? scopedField : form;
  let textareas = owner.locator(BASIC_PAGE_FORMATTED_TEXT_SELECTOR);
  if ((await textareas.count()) === 0) {
    textareas = form.locator(BASIC_PAGE_BODY_SELECTOR);
  }
  const textareaCount = await textareas.count();
  if (textareaCount > 1) {
    return undefined;
  }

  if (textareaCount === 1) {
    const textarea = textareas.first();
    const editorOwner = textarea.locator(
      'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " field--name-field-formatted-text ") or contains(concat(" ", normalize-space(@class), " "), " js-text-format-wrapper ") or contains(concat(" ", normalize-space(@class), " "), " text-format-wrapper ") or contains(concat(" ", normalize-space(@class), " "), " form-item ")][1]',
    );
    const editable = editorOwner.locator(
      '.ck-editor__editable[contenteditable="true"]',
    );
    if ((await editable.count()) === 1 && (await editable.isVisible())) {
      return { textarea, editable };
    }
    if (await textarea.isVisible()) {
      return { textarea };
    }
  }

  const scopedEditables = owner.locator(
    '.ck-editor__editable[contenteditable="true"]',
  );
  if (
    (await scopedEditables.count()) === 1 &&
    (await scopedEditables.first().isVisible())
  ) {
    return { editable: scopedEditables.first() };
  }

  return undefined;
}

export async function hasBasicPageBodyEditor(page: Page): Promise<boolean> {
  return Boolean(await resolveBasicPageBodyEditor(page));
}

export async function submitBasicPageForm(page: Page): Promise<Response> {
  const submit = nodeForm(page)
    .locator('input#edit-submit[name="op"], #edit-submit')
    .first();
  await submit.waitFor({ state: 'visible' });

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.request().isNavigationRequest(),
  );
  await submit.click();
  const response = await responsePromise;
  await page.waitForLoadState('domcontentloaded');

  if (response.status() >= 400) {
    throw new Error(
      `Basic page save request failed with HTTP status ${response.status()}.`,
    );
  }
  return response;
}

export function nodeIdFromUrl(rawUrl: string): string | undefined {
  try {
    return new URL(rawUrl).pathname.match(/^\/node\/(\d+)(?:\/|$)/)?.[1];
  } catch {
    return undefined;
  }
}

export async function nodeIdFromEditLink(
  page: Page,
): Promise<string | undefined> {
  const links = page.locator('a[href^="/node/"][href$="/edit"]');
  const nodeIds: string[] = [];
  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index);
    if (!(await link.isVisible())) {
      continue;
    }
    const nodeId = (await link.getAttribute('href'))?.match(
      /^\/node\/(\d+)\/edit$/,
    )?.[1];
    if (nodeId) {
      nodeIds.push(nodeId);
    }
  }
  const uniqueNodeIds = [...new Set(nodeIds)];
  return uniqueNodeIds.length === 1 ? uniqueNodeIds[0] : undefined;
}

export function safeNodeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  return `${url.origin}${url.pathname}`;
}
