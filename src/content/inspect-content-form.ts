import type { Page } from '@playwright/test';

export type FormControlKind =
  | 'input'
  | 'textarea'
  | 'select'
  | 'button';

export type FormWidgetType =
  | 'standard-text'
  | 'plain-textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'date-time'
  | 'autocomplete-entity-reference'
  | 'media-file'
  | 'paragraphs'
  | 'hidden'
  | 'submit-control'
  | 'unknown';

export interface ContentFormField {
  name?: string;
  id?: string;
  kind: FormControlKind;
  type: string;
  label?: string;
  selector: string;
  required: boolean;
  visible: boolean;
  editable: boolean;
  drupalWidget: boolean;
  widgetClues: readonly string[];
  dataAttributes: readonly string[];
  widgetType: FormWidgetType;
  hasValidSelectedDefault?: boolean;
}

export interface ContentFormSubmitControl {
  name?: string;
  id?: string;
  type: string;
  label?: string;
  selector: string;
  defaultAction: boolean;
}

export interface ContentEditorMetadata {
  fieldName: string;
  implementation: 'ckeditor5' | 'textarea';
  textareaSelector: string;
  editableSelector?: string;
  ownedEditableResolved: boolean;
  fieldWrapperClues: readonly string[];
}

export interface ContentFormInspection {
  formSelector: string;
  fields: readonly ContentFormField[];
  submitControls: readonly ContentFormSubmitControl[];
  editors: readonly ContentEditorMetadata[];
}

const NODE_FORM_SELECTOR =
  'form.node-form, form[class*="node-"][class*="-form"], form[id^="node-"][id$="-form"]';

export async function inspectContentForm(
  page: Page,
): Promise<ContentFormInspection> {
  const form = page.locator(NODE_FORM_SELECTOR).first();
  await form.waitFor({ state: 'visible' });

  return form.evaluate((formElement, formSelector) => {
    const cssEscape = (value: string): string =>
      globalThis.CSS?.escape
        ? globalThis.CSS.escape(value)
        : value.replace(/["\\]/g, '\\$&');
    const isVisible = (element: HTMLElement): boolean => {
      const style = globalThis.getComputedStyle(element);
      const rectangle = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rectangle.width > 0 &&
        rectangle.height > 0
      );
    };
    const selectorFor = (element: HTMLElement): string => {
      const name = element.getAttribute('name');
      if (name) {
        return `${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
      }

      if (element.id) {
        return `#${cssEscape(element.id)}`;
      }

      const drupalSelector = element.getAttribute('data-drupal-selector');
      if (drupalSelector) {
        return `[data-drupal-selector="${cssEscape(drupalSelector)}"]`;
      }

      return element.tagName.toLowerCase();
    };
    const labelFor = (element: HTMLElement): string | undefined => {
      const ariaLabel = element.getAttribute('aria-label')?.trim();
      if (ariaLabel) {
        return ariaLabel;
      }

      const id = element.id;
      const explicitLabel = id
        ? formElement.querySelector<HTMLLabelElement>(
            `label[for="${cssEscape(id)}"]`,
          )
        : null;
      const nearbyLabel =
        explicitLabel ??
        element.closest('.form-item, .form-wrapper')?.querySelector('label');
      const text = nearbyLabel?.textContent?.replace(/\s+/g, ' ').trim();
      return text || undefined;
    };
    const requiredFor = (element: HTMLElement): boolean => {
      const wrapper = element.closest('.form-item, .form-wrapper');
      const label = wrapper?.querySelector('label');
      return (
        element.hasAttribute('required') ||
        element.getAttribute('aria-required') === 'true' ||
        Boolean(
          label?.classList.contains('form-required') ||
            label?.classList.contains('js-form-required') ||
            wrapper?.classList.contains('required'),
        )
      );
    };
    const widgetCluesFor = (element: HTMLElement): string[] => {
      const wrapper = element.closest(
        '[class*="field--widget-"], .form-item, .form-wrapper, .text-format-wrapper',
      );
      if (!wrapper) {
        return [];
      }

      return [...wrapper.classList].filter((className) =>
        /^(field--widget-|form-type-|js-form-type-|text-format-wrapper|ck-)/.test(
          className,
        ),
      );
    };
    const widgetTypeFor = (element: HTMLElement, type: string): FormWidgetType => {
      const name = element.getAttribute('name') ?? '';
      const widgetWrapperClasses = element
        .closest('[class*="field--widget-"]')
        ?.getAttribute('class') ?? '';
      if (type === 'submit' || type === 'button' || type === 'reset') {
        return 'submit-control';
      }
      if (
        type === 'file' ||
        /field--widget-(media-library|file|image)/i.test(widgetWrapperClasses)
      ) {
        return 'media-file';
      }
      if (type === 'hidden') return 'hidden';
      if (
        name.includes('[subform]') ||
        /paragraphs/i.test(widgetWrapperClasses)
      ) {
        return 'paragraphs';
      }
      if (
        element.hasAttribute('data-autocomplete-path') ||
        element.classList.contains('form-autocomplete') ||
        /entity-reference-autocomplete/i.test(widgetWrapperClasses)
      ) {
        return 'autocomplete-entity-reference';
      }
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'date' || type === 'time' || type === 'datetime-local') {
        return 'date-time';
      }
      if (element instanceof HTMLSelectElement) return 'select';
      if (element instanceof HTMLTextAreaElement) return 'plain-textarea';
      if (
        element instanceof HTMLInputElement &&
        ['text', 'search', 'number', 'url'].includes(type)
      ) {
        return 'standard-text';
      }
      return 'unknown';
    };

    const allControls = [...formElement.querySelectorAll<HTMLElement>(
      'input, textarea, select, button',
    )];
    const fields = allControls.map((element) => {
      const input = element instanceof HTMLInputElement ? element : undefined;
      const type = input?.type ?? element.getAttribute('type') ?? element.tagName.toLowerCase();
      const visible = isVisible(element);
      const disabled =
        'disabled' in element && Boolean((element as HTMLInputElement).disabled);
      const readOnly =
        'readOnly' in element && Boolean((element as HTMLInputElement).readOnly);
      const editable =
        visible &&
        !disabled &&
        !readOnly &&
        !['hidden', 'submit', 'button', 'reset', 'image'].includes(type);
      const wrapper = element.closest(
        '[class*="field--widget-"], [class*="field--type-"]',
      );
      const selected =
        element instanceof HTMLSelectElement
          ? element.selectedOptions[0]
          : undefined;

      return {
        name: element.getAttribute('name') || undefined,
        id: element.id || undefined,
        kind: element.tagName.toLowerCase() as FormControlKind,
        type,
        label: labelFor(element),
        selector: selectorFor(element),
        required: requiredFor(element),
        visible,
        editable,
        drupalWidget: Boolean(wrapper),
        widgetClues: widgetCluesFor(element),
        dataAttributes: [...element.attributes]
          .map((attribute) => attribute.name)
          .filter((name) => name.startsWith('data-')),
        widgetType: widgetTypeFor(element, type),
        hasValidSelectedDefault:
          element instanceof HTMLSelectElement && requiredFor(element)
            ? Boolean(
                selected &&
                  !selected.disabled &&
                  selected.value.trim() &&
                  selected.value !== '_none',
              )
            : undefined,
      };
    });

    const submitControls = allControls
      .filter((element) => {
        const type =
          element instanceof HTMLInputElement
            ? element.type
            : element.getAttribute('type');
        return type === 'submit';
      })
      .map((element) => {
        const input = element instanceof HTMLInputElement ? element : undefined;
        const label =
          (input?.value || element.textContent || '').replace(/\s+/g, ' ').trim() ||
          undefined;
        const drupalSelector = element.getAttribute('data-drupal-selector');
        return {
          name: element.getAttribute('name') || undefined,
          id: element.id || undefined,
          type: 'submit',
          label,
          selector: selectorFor(element),
          defaultAction:
            element.id === 'edit-submit' || drupalSelector === 'edit-submit',
        };
      });

    const editors = [...formElement.querySelectorAll<HTMLTextAreaElement>('textarea')]
      .filter((textarea) => textarea.name)
      .map((textarea) => {
        const wrapper = textarea.closest(
          '.js-text-format-wrapper, .text-format-wrapper, .form-item',
        );
        const editable = wrapper?.querySelector<HTMLElement>(
          '.ck-editor__editable[contenteditable="true"]',
        );
        const fieldWrapper = textarea.closest(
          '[class*="field--name-"], [class*="field--widget-"]',
        );
        return {
          fieldName: textarea.name,
          implementation: editable ? ('ckeditor5' as const) : ('textarea' as const),
          textareaSelector: selectorFor(textarea),
          editableSelector: editable
            ? editable.id
              ? `#${cssEscape(editable.id)}`
              : '.ck-editor__editable[contenteditable="true"]'
            : undefined,
          ownedEditableResolved: Boolean(editable),
          fieldWrapperClues: fieldWrapper
            ? [...fieldWrapper.classList].filter((className) =>
                /^(field--name-|field--widget-)/.test(className),
              )
            : [],
        };
      });

    return {
      formSelector,
      fields,
      submitControls,
      editors,
    };
  }, NODE_FORM_SELECTOR);
}
