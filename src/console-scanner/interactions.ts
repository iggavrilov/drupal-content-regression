import type { Page } from '@playwright/test';

export type InteractionCategory = 'navigation_menu' | 'accordion' | 'tab' | 'carousel' | 'dialog' | 'expandable' | 'search' | 'filter' | 'pagination' | 'video';
export interface InteractionDescriptor {
  id: string;
  actionKey: string;
  action: string;
  category?: InteractionCategory;
  safe: boolean;
  reason?: string;
  outcomeVerified?: boolean;
  beforeState?: string;
  afterState?: string;
}

export interface InteractionCandidateInput {
  tag: string; role?: string; label: string; href?: string; type?: string; ariaExpanded?: string; ariaControls?: string; ariaHaspopup?: string; className?: string; inForm?: boolean;
}

const UNSAFE = /\b(?:submit|send|apply|register|sign\s*(?:in|out|up)|log\s*(?:in|out)|account|profile|delete|remove|publish|save|upload|download|purchase|buy|checkout|accept|consent|cookie|contact)\b/i;

export function classifyInteractionCandidate(input: InteractionCandidateInput): { safe: boolean; category?: InteractionCategory; reason?: string } {
  const label = input.label.trim();
  const evidence = `${label} ${input.role ?? ''} ${input.className ?? ''} ${input.ariaControls ?? ''}`;
  if (!label) return { safe: false, reason: 'No accessible name' };
  if (UNSAFE.test(evidence)) return { safe: false, reason: 'Name or context may cause authentication, submission, download, consent, or persistent change' };
  if ((input.type ?? '').toLowerCase() === 'submit') return { safe: false, reason: 'Form submission control' };
  if (input.href && !input.href.startsWith('#') && !/\b(?:next|previous|prev)\b/i.test(evidence)) return { safe: false, reason: 'Navigating link is not an interaction control' };

  let category: InteractionCategory | undefined;
  if (input.role === 'tab' || /\btab(?:s|list)?\b/i.test(evidence)) category = 'tab';
  else if (/carousel|slider|slick|swiper|\bnext\b|\bprevious\b|\bprev\b/i.test(evidence)) category = 'carousel';
  else if (input.ariaHaspopup === 'dialog' || /modal|dialog/i.test(evidence)) category = 'dialog';
  else if (/accordion/i.test(evidence) || input.tag === 'summary') category = 'accordion';
  else if (/video|\bplay\b|\bwatch\b/i.test(evidence)) category = 'video';
  else if (/pagination|pager|\bnext page\b|\bprevious page\b/i.test(evidence)) category = 'pagination';
  else if (/search/i.test(evidence)) category = 'search';
  else if (/filter/i.test(evidence)) category = 'filter';
  else if (/show more|show less|expand|collapse|toggle|read more/i.test(evidence) || input.ariaExpanded !== undefined || input.ariaControls) category = 'expandable';
  else if (input.ariaHaspopup === 'menu' || /menu/i.test(evidence)) category = 'navigation_menu';
  if (!category) return { safe: false, reason: input.inForm ? 'Ambiguous form control' : 'No recognized safe interaction semantics' };
  return { safe: true, category };
}

export async function inspectSafeInteractions(page: Page, maximumInteractions: number): Promise<{ perform: InteractionDescriptor[]; skipped: InteractionDescriptor[] }> {
  const locator = page.locator('button, [role="button"], [role="tab"], summary, a[aria-controls], a[aria-haspopup], a[href^="#"]');
  const perform: InteractionDescriptor[] = [];
  const skipped: InteractionDescriptor[] = [];
  const seenCategories = new Map<InteractionCategory, number>();
  const count = Math.min(await locator.count(), 150);
  for (let index = 0; index < count; index += 1) {
    const element = locator.nth(index);
    if (!await element.isVisible().catch(() => false) || !await element.isEnabled().catch(() => false)) continue;
    const input = await element.evaluate((node) => {
      const html = node as HTMLElement;
      const parentForm = html.closest('form');
      return {
        tag: html.tagName.toLowerCase(), role: html.getAttribute('role') ?? undefined,
        label: (html.getAttribute('aria-label') ?? html.getAttribute('title') ?? html.innerText ?? '').replace(/\s+/g, ' ').trim(),
        href: html.getAttribute('href') ?? undefined, type: html.getAttribute('type') ?? undefined,
        ariaExpanded: html.hasAttribute('aria-expanded') ? html.getAttribute('aria-expanded') ?? '' : undefined,
        ariaControls: html.getAttribute('aria-controls') ?? undefined, ariaHaspopup: html.getAttribute('aria-haspopup') ?? undefined,
        className: typeof html.className === 'string' ? html.className : '', inForm: Boolean(parentForm),
      };
    });
    const result = classifyInteractionCandidate(input);
    const label = input.label.slice(0, 100) || `control ${index + 1}`;
    const id = `console-scan-${index}`;
    const category = result.category;
    const actionKey = `${category ?? 'skipped'}|${label.toLowerCase().replace(/\s+/g, ' ')}`;
    const descriptor: InteractionDescriptor = { id, actionKey, action: `${result.safe ? 'Activated' : 'Skipped'} "${label}"${category ? ` (${category})` : ''}`, category, safe: result.safe, reason: result.reason };
    if (!result.safe || !category) { if (skipped.length < 25) skipped.push(descriptor); continue; }
    const categoryCount = seenCategories.get(category) ?? 0;
    if (categoryCount >= 2) { if (skipped.length < 25) skipped.push({ ...descriptor, safe: false, action: `Skipped repeated ${category} control "${label}"`, reason: 'Representative variant already selected' }); continue; }
    if (perform.length >= maximumInteractions) { if (skipped.length < 25) skipped.push({ ...descriptor, safe: false, action: `Skipped "${label}"`, reason: `Configured ${maximumInteractions}-interaction page limit reached` }); continue; }
    await element.evaluate((node, marker) => node.setAttribute('data-console-scan-id', marker), id);
    perform.push(descriptor);
    seenCategories.set(category, categoryCount + 1);
  }
  return { perform, skipped };
}
