import type { Locator, Page, Response } from '@playwright/test';

export interface SafeModerationState {
  moderationStates: readonly string[];
  moderationStateUsed: string;
}

export async function validateSafeModerationState(
  form: Locator,
  contentTypeLabel: string,
): Promise<SafeModerationState> {
  const moderation = form.locator('select[name="moderation_state[0][state]"]');
  if ((await moderation.count()) !== 1) {
    throw new Error(
      `Cannot safely save ${contentTypeLabel}: moderation state control was not found uniquely.`,
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
            /\bdraft\b/i.test(option.label),
        ) ??
        options.find(
          (option) =>
            !option.disabled &&
            Boolean(option.value) &&
            /\bunpublished\b/i.test(option.label),
        );

  if (!stateToUse) {
    throw new Error(
      `Cannot safely save ${contentTypeLabel}: no clearly identifiable Draft or Unpublished moderation state is available.`,
    );
  }
  if (!stateToUse.selected) {
    await moderation.selectOption(stateToUse.value);
    stateToUse = { ...stateToUse, selected: true };
  }

  return {
    moderationStates: options
      .filter((option) => !option.disabled && option.label)
      .map((option) => option.label),
    moderationStateUsed: stateToUse.label,
  };
}

interface OwnedEditor {
  textarea?: Locator;
  editable?: Locator;
}

function normalizeEditorText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6]|blockquote|figure|figcaption)[^>]*>/gi, '\n')
    .replace(/<\/?(strong|b|em|i|u|span|a|code)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveOwnedEditor(
  form: Locator,
  textareaSelector: string,
): Promise<OwnedEditor | undefined> {
  const textareas = form.locator(textareaSelector);
  if ((await textareas.count()) !== 1) {
    return undefined;
  }

  const textarea = textareas.first();
  const owner = textarea.locator(
    'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " field--name-") or contains(concat(" ", normalize-space(@class), " "), " js-text-format-wrapper ") or contains(concat(" ", normalize-space(@class), " "), " text-format-wrapper ") or contains(concat(" ", normalize-space(@class), " "), " form-item ")][1]',
  );
  const editables = owner.locator(
    '.ck-editor__editable[contenteditable="true"]',
  );

  if ((await editables.count()) === 1) {
    const editable = editables.first();
    if (await editable.isVisible().catch(() => false)) {
      return { textarea, editable };
    }
  }

  if (await textarea.isVisible().catch(() => false)) {
    return { textarea };
  }

  return undefined;
}

export async function hasOwnedEditor(
  form: Locator,
  textareaSelector: string,
): Promise<boolean> {
  return Boolean(await resolveOwnedEditor(form, textareaSelector));
}

export async function fillOwnedEditor(
  form: Locator, textareaSelector: string, text: string, fieldLabel: string,
): Promise<void> {
  const editor = await resolveOwnedEditor(form, textareaSelector);
  if (!editor?.textarea) throw new Error(fieldLabel + ' has no uniquely owned visible editor.');
  if (editor.editable) {
    await editor.editable.fill(text);
    await editor.editable.press('Tab');
    if (normalizeEditorText(await editor.editable.innerText()) !== normalizeEditorText(text)) {
      throw new Error(fieldLabel + ' editor did not retain the generated text.');
    }
    return;
  }
  await editor.textarea.fill(text);
  if (normalizeEditorText(await editor.textarea.inputValue()) !== normalizeEditorText(text)) {
    throw new Error(fieldLabel + ' textarea did not retain the generated text.');
  }
}

export async function readOwnedEditor(
  form: Locator,
  textareaSelector: string,
  fieldLabel: string,
): Promise<string> {
  const editor =
    (await resolveOwnedEditor(form, textareaSelector)) ?? {
      textarea: form.locator(textareaSelector),
    };

  const textarea = editor.textarea;
  if (!textarea) {
    throw new Error(
      `${fieldLabel} has no unique CKEditor or textarea target to read.`,
    );
  }

  const textareaCount = await textarea.count();
  if (textareaCount !== 1) {
    throw new Error(
      `${fieldLabel} has no unique CKEditor or textarea target to read.`,
    );
  }

  const textareaValue = (await textarea.inputValue()).trim();
  if (textareaValue) return normalizeEditorText(textareaValue);
  if (editor.editable) {
    return normalizeEditorText((await editor.editable.innerText()).trim());
  }
  return '';
}

export async function submitNodeForm(
  page: Page,
  form: Locator,
  contentTypeLabel: string,
): Promise<Response> {
  const submit = form.locator('input#edit-submit[name="op"], #edit-submit').first();
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
      `${contentTypeLabel} save request failed with HTTP status ${response.status()}.`,
    );
  }
  return response;
}
