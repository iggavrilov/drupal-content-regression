import type { Locator } from '@playwright/test';

export interface ParagraphActivationResult {
  strategy: 'normal click' | 'keyboard Enter';
  pointerOverlap: boolean;
  focusVerified: boolean;
}

const BLOCKERS = ['.layout-region--secondary'] as const;

export async function activateOwnedParagraphEdit(control: Locator): Promise<ParagraphActivationResult> {
  if ((await control.count()) !== 1 || !(await control.isVisible()) || !(await control.isEnabled())) {
    throw new Error('Paragraph Edit control is not uniquely visible and enabled.');
  }
  await control.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  if ((await control.count()) !== 1 || !(await control.isVisible()) || !(await control.isEnabled())) {
    throw new Error('Paragraph Edit control lost unique visible ownership after positioning.');
  }
  const state = await control.evaluate((element, blockerSelectors) => {
    const input = element as HTMLInputElement;
    const target = input.getBoundingClientRect();
    const center = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
    const pointerOverlap = blockerSelectors.some((selector) => [...document.querySelectorAll(selector)].some((blocker) => {
      const rect = blocker.getBoundingClientRect();
      const visible = Boolean((blocker as HTMLElement).offsetWidth || (blocker as HTMLElement).offsetHeight || (blocker as HTMLElement).getClientRects().length);
      return visible && center.x >= rect.left && center.x <= rect.right && center.y >= rect.top && center.y <= rect.bottom;
    }));
    return { tag: input.tagName.toLowerCase(), type: input.type, pointerOverlap };
  }, [...BLOCKERS]);
  if (!['input', 'button'].includes(state.tag) || state.type !== 'submit') {
    throw new Error('Paragraph Edit control is not a semantic input/button submit control.');
  }
  if (!state.pointerOverlap) {
    await control.click({ timeout: 5_000 });
    return { strategy: 'normal click', pointerOverlap: false, focusVerified: false };
  }
  await control.focus();
  const focusVerified = await control.evaluate((element) => document.activeElement === element);
  if (!focusVerified) {
    throw new Error('Structurally overlapped Paragraph Edit control could not acquire exact focus.');
  }
  await control.press('Enter');
  return { strategy: 'keyboard Enter', pointerOverlap: true, focusVerified: true };
}
