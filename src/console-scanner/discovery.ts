import type { Page } from '@playwright/test';

export interface DiscoveredNavigationPage { route: string; url: string; label: string }
export type NavigationMode = 'desktop' | 'mobile';
export interface NavigationDiscoveryDiagnostics { mode: NavigationMode; navigationContainersFound: number; candidateLinksDetected: number; internalLinksAccepted: number; internalLinksInitiallyHidden: number; menuTogglesFound: number; menuTogglesOpened: number; linksRejected: number; rejectionReasons: Record<string, number>; rejectedSamples: Array<{ href: string; reason: string }>; discoveryErrors: string[] }
export interface NavigationDiscoveryResult { pages: DiscoveredNavigationPage[]; actions: string[]; skipped: string[]; totalUniquePages: number; truncatedCount: number; complete: boolean; incompleteReason?: string; diagnostics: NavigationDiscoveryDiagnostics }

const DOWNLOAD_EXTENSION = /\.(?:pdf|docx?|xlsx?|pptx?|zip|csv|xml|json|jpe?g|png|gif|svg|webp|mp4|mp3)(?:$|[?#])/i;

export function normalizeNavigationUrl(href: string, baseOrigin: string, currentUrl = `${baseOrigin}/`, allowedHostnames = ['devv.leidos.com', 'www.leidos.com']): string | undefined {
  const raw = href.trim();
  if (!raw || /^(?:mailto:|tel:|javascript:|data:)/i.test(raw) || DOWNLOAD_EXTENSION.test(raw)) return undefined;
  let target: URL;
  let current: URL;
  try { target = new URL(raw, currentUrl); current = new URL(currentUrl); } catch { return undefined; }
  if (target.protocol !== 'https:' || !allowedHostnames.includes(target.hostname.toLowerCase())) return undefined;
  if (target.username || target.password || DOWNLOAD_EXTENSION.test(target.pathname)) return undefined;
  if (target.hash && target.pathname === current.pathname && target.search === current.search) return undefined;
  const base = new URL(baseOrigin);
  target.protocol = base.protocol;
  target.host = base.host;
  target.hash = '';
  for (const key of [...target.searchParams.keys()]) {
    if (/^(?:utm_.+|gclid|fbclid|dclid|_ga|_gl)$/i.test(key)) target.searchParams.delete(key);
  }
  target.pathname = target.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return target.href.replace(/\/$/, target.pathname === '/' ? '/' : '');
}

async function discoverMainNavigationLegacy(page: Page, baseOrigin: string, maximumPages: number, allowedHostnames = ['devv.leidos.com', 'www.leidos.com'], mode: NavigationMode = 'desktop'): Promise<NavigationDiscoveryResult> {
  const actions: string[] = [];
  const skipped: string[] = [];
  const unique = new Map<string, DiscoveredNavigationPage>();
  const header = page.locator('header').first();
  const toolbar = page.locator('#toolbar-administration, [data-drupal-toolbar]');
  const roots = (await toolbar.count()) > 0
    ? toolbar.locator('nav, [role="navigation"], [class*="navigation"], [class*="menu"], a[href]').or(toolbar)
    : (await header.count()) > 0
    ? header.locator('nav, [role="navigation"], [class*="navigation"], [class*="menu"]')
    : page.locator('nav[aria-label*="main" i], nav[aria-label*="primary" i], [role="navigation"]');

  const collectVisibleLinks = async () => {
    const links = await roots.locator('a[href]').evaluateAll((elements) => elements.filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).map((element) => ({
      href: element.getAttribute('href') ?? '',
      label: (element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })));
    for (const link of links) {
      const currentUrl = /^https:\/\//i.test(page.url()) ? page.url() : `${new URL(baseOrigin).origin}/`;
      const url = normalizeNavigationUrl(link.href, baseOrigin, currentUrl, allowedHostnames);
      if (!url) continue;
      const parsed = new URL(url);
      const route = `${parsed.pathname}${parsed.search}`;
      if (!unique.has(route)) unique.set(route, { route, url, label: link.label || route });
    }
  };

  unique.set('/', { route: '/', url: `${new URL(baseOrigin).origin}/`, label: 'Homepage' });
  await collectVisibleLinks();
  const processed = new Set<string>();

  if (mode === 'mobile') {
    const mobileToggle = page.locator('button, [role="button"]').filter({ has: page.locator('svg, span') }).filter({ hasText: /menu|navigation/i }).or(page.locator('button[aria-label*="menu" i], button[aria-controls*="menu" i], [role="button"][aria-label*="menu" i]')).first();
    if (await mobileToggle.isVisible().catch(() => false)) {
      try {
        const label = ((await mobileToggle.getAttribute('aria-label')) ?? (await mobileToggle.innerText().catch(() => 'Menu'))).trim() || 'Menu';
        processed.add(`${label}|${await mobileToggle.getAttribute('aria-controls') ?? ''}|${await mobileToggle.getAttribute('href') ?? ''}`);
        await mobileToggle.click({ timeout: 2_000 }); actions.push('Opened mobile main navigation'); await page.waitForTimeout(300); await collectVisibleLinks();
      }
      catch { skipped.push('Could not open the visible mobile main navigation control'); }
    } else skipped.push('No visible mobile main navigation toggle was found');
  }

  for (let pass = 0; pass < 4; pass += 1) {
    const expandable = roots.locator('button, [role="button"], a[aria-haspopup="true"], a[aria-controls]');
    const count = Math.min(await expandable.count(), 60);
    let activated = 0;
    for (let index = 0; index < count; index += 1) {
      const control = expandable.nth(index);
    if (!await control.isVisible().catch(() => false)) continue;
    const label = ((await control.getAttribute('aria-label')) ?? (await control.innerText().catch(() => ''))).trim() || `navigation control ${index + 1}`;
      const signature = `${label}|${await control.getAttribute('aria-controls') ?? ''}|${await control.getAttribute('href') ?? ''}`;
      if (processed.has(signature)) continue;
      processed.add(signature);
      if (/\b(?:log\s*(?:in|out)|account|profile|consent|accept|download|checkout|cart)\b/i.test(label)) { skipped.push(`Skipped unsafe navigation control "${label}"`); continue; }
    try {
        await control.hover({ timeout: 1_500 }).catch(() => undefined);
        await control.focus().catch(() => undefined);
        actions.push(`Revealed navigation menu "${label}" by hover/focus`);
      await page.waitForTimeout(250);
        await collectVisibleLinks();
        const tagName = await control.evaluate((node) => node.tagName.toLowerCase());
        const href = await control.getAttribute('href');
        if (tagName !== 'a' || !href || href.startsWith('#')) {
          await control.click({ timeout: 2_000 });
          actions.push(`Opened navigation menu "${label}"`);
          await page.waitForTimeout(250);
          await collectVisibleLinks();
        }
        activated += 1;
    } catch { skipped.push(`Could not expand navigation control "${label}"`); }
  }
    if (!activated) break;
  }
  await collectVisibleLinks();
  if (mode === 'mobile') {
    const closeToggle = page.locator('button[aria-label*="menu" i], button[aria-controls*="menu" i], [role="button"][aria-label*="menu" i]').first();
    if (await closeToggle.isVisible().catch(() => false) && await closeToggle.getAttribute('aria-expanded') === 'true') {
      try { await closeToggle.click({ timeout: 2_000 }); actions.push('Closed mobile main navigation'); }
      catch { skipped.push('Mobile main navigation opened but could not be closed safely'); }
    }
  }
  const pages = [...unique.values()].slice(0, maximumPages);
  const truncatedCount = Math.max(0, unique.size - maximumPages);
  if (truncatedCount) skipped.push(`INCOMPLETE COVERAGE: skipped ${truncatedCount} navigation pages above the configured ${maximumPages}-page limit`);
  const complete = unique.size > 1 && truncatedCount === 0;
  return { pages, actions, skipped, totalUniquePages: unique.size, truncatedCount, complete, incompleteReason: complete ? undefined : 'Legacy discovery was incomplete.', diagnostics: { mode, navigationContainersFound: await roots.count(), candidateLinksDetected: unique.size, internalLinksAccepted: unique.size, internalLinksInitiallyHidden: 0, menuTogglesFound: 0, menuTogglesOpened: 0, linksRejected: 0, rejectionReasons: {}, rejectedSamples: [], discoveryErrors: [] } };
}

const CUSTOM_NAV_ROOTS = 'nav, [role="navigation"], [aria-label*="main" i], [aria-label*="primary" i], [data-drupal-selector*="menu"], [data-drupal-selector*="nav"], #main-menu, #primary-menu, #navigation, #nav, .main-menu, .primary-menu, .main-navigation, .site-navigation, .mega-menu, [class*="main-menu"], [class*="primary-menu"], [class*="main-nav"], [class*="mega-menu"], [class*="navigation"]';
const CUSTOM_HEADERS = 'header, [role="banner"], #header, .site-header, .global-header, [class*="site-header"], [class*="global-header"]';
const CUSTOM_EXPANDERS = 'button, [role="button"], a[aria-haspopup="true"], a[aria-controls], li:has(ul), .menu-item--expanded, .menu-item-has-children, [class*="has-children"], [class*="dropdown"]';
const CUSTOM_MAIN_MENU_TOGGLES = 'button[aria-label*="menu" i], button[aria-label*="navigation" i], button[aria-controls*="menu" i], [role="button"][aria-label*="menu" i], [aria-label*="hamburger" i], .menu-toggle, .nav-toggle, .navbar-toggler, .hamburger, [class*="menu-toggle"], [class*="nav-toggle"], [class*="hamburger"], [data-drupal-selector*="menu-toggle"]';

function navigationDecision(href: string, baseOrigin: string, currentUrl: string, allowedHostnames: string[]): { url?: string; reason?: string } {
  const raw = href.trim();
  if (!raw) return { reason: 'empty href' };
  if (/^(?:mailto:|tel:|javascript:|data:)/i.test(raw)) return { reason: 'non-HTTP link scheme' };
  if (DOWNLOAD_EXTENSION.test(raw)) return { reason: 'download or media link' };
  let target: URL;
  let current: URL;
  try { target = new URL(raw, currentUrl); current = new URL(currentUrl); } catch { return { reason: 'invalid URL' }; }
  if (target.protocol !== 'https:') return { reason: 'non-HTTPS destination' };
  if (!allowedHostnames.includes(target.hostname.toLowerCase())) return { reason: 'external or unapproved hostname' };
  if (target.username || target.password) return { reason: 'embedded credentials' };
  if (DOWNLOAD_EXTENSION.test(target.pathname)) return { reason: 'download or media path' };
  if (target.hash && target.pathname === current.pathname && target.search === current.search) return { reason: 'same-page fragment' };
  const base = new URL(baseOrigin);
  target.protocol = base.protocol; target.host = base.host; target.hash = '';
  for (const key of [...target.searchParams.keys()]) if (/^(?:utm_.+|gclid|fbclid|dclid|_ga|_gl)$/i.test(key)) target.searchParams.delete(key);
  target.pathname = target.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return { url: target.href.replace(/\/$/, target.pathname === '/' ? '/' : '') };
}

export async function discoverMainNavigation(page: Page, baseOrigin: string, maximumPages: number, allowedHostnames = ['devv.leidos.com', 'www.leidos.com'], mode: NavigationMode = 'desktop'): Promise<NavigationDiscoveryResult> {
  const actions: string[] = [];
  const skipped: string[] = [];
  const unique = new Map<string, DiscoveredNavigationPage>();
  const diagnostics: NavigationDiscoveryDiagnostics = { mode, navigationContainersFound: 0, candidateLinksDetected: 0, internalLinksAccepted: 0, internalLinksInitiallyHidden: 0, menuTogglesFound: 0, menuTogglesOpened: 0, linksRejected: 0, rejectionReasons: {}, rejectedSamples: [], discoveryErrors: [] };
  const toolbar = page.locator('#toolbar-administration, [data-drupal-toolbar]');
  const headers = page.locator(CUSTOM_HEADERS);
  const headerCount = await headers.count();
  const nested = headerCount ? headers.locator(CUSTOM_NAV_ROOTS) : page.locator(CUSTOM_NAV_ROOTS);
  const nestedCount = await nested.count();
  const roots = await toolbar.count() ? toolbar : nestedCount ? nested : headerCount ? headers : page.locator('__missing_navigation_container__');
  diagnostics.navigationContainersFound = await roots.count();
  const processed = new Set<string>();
  const seenCandidates = new Set<string>();
  const evaluatedCandidates = new Set<string>();
  const hiddenCandidatesReported = new Set<string>();

  const reject = (href: string, reason: string) => {
    diagnostics.linksRejected += 1;
    diagnostics.rejectionReasons[reason] = (diagnostics.rejectionReasons[reason] ?? 0) + 1;
    if (diagnostics.rejectedSamples.length < 30) diagnostics.rejectedSamples.push({ href: href.slice(0, 200), reason });
  };
  const collect = async () => {
    try {
      const links = await roots.locator('a[href]').evaluateAll((elements) => elements.map((element) => {
        const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
        return { href: element.getAttribute('href') ?? '', label: (element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim(), rendered: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 };
      }));
      for (const link of links) {
        const key = `${link.href}|${link.label}`;
        if (!seenCandidates.has(key)) { seenCandidates.add(key); diagnostics.candidateLinksDetected += 1; }
        if (evaluatedCandidates.has(key)) continue;
        evaluatedCandidates.add(key);
        const currentUrl = /^https:\/\//i.test(page.url()) ? page.url() : `${new URL(baseOrigin).origin}/`;
        const decision = navigationDecision(link.href, baseOrigin, currentUrl, allowedHostnames);
        if (!decision.url) { reject(link.href, decision.reason ?? 'rejected'); continue; }
        // Navigation menus commonly keep real nested destinations hidden until a
        // hamburger, dropdown, or mega-menu is expanded. Because these anchors
        // are scoped to a proven navigation/header container, visibility is not
        // an ownership or safety boundary. Count them as menu destinations while
        // retaining visibility diagnostics for expansion troubleshooting.
        if (!link.rendered && !hiddenCandidatesReported.has(key)) {
          hiddenCandidatesReported.add(key);
          diagnostics.internalLinksInitiallyHidden += 1;
        }
        const parsed = new URL(decision.url); const route = `${parsed.pathname}${parsed.search}`;
        if (!unique.has(route)) unique.set(route, { route, url: decision.url, label: link.label || route });
      }
    } catch (error) { diagnostics.discoveryErrors.push(error instanceof Error ? error.message : 'Link collection failed'); }
  };

  unique.set('/', { route: '/', url: `${new URL(baseOrigin).origin}/`, label: 'Homepage' });
  await collect();
  {
    const toggles = page.locator(CUSTOM_MAIN_MENU_TOGGLES);
    diagnostics.menuTogglesFound = await toggles.count();
    let toggle = toggles.first();
    let toggleFound = false;
    for (let index = 0; index < Math.min(diagnostics.menuTogglesFound, 20); index += 1) {
      const candidate = toggles.nth(index);
      if (await candidate.isVisible().catch(() => false)) { toggle = candidate; toggleFound = true; break; }
    }
    if (toggleFound) {
      try {
        const label = ((await toggle.getAttribute('aria-label')) ?? (await toggle.innerText().catch(() => 'Menu'))).trim() || 'Menu';
        processed.add(`${label}|${await toggle.getAttribute('aria-controls') ?? ''}|${await toggle.getAttribute('href') ?? ''}`);
        await toggle.click({ timeout: 2_000 }); diagnostics.menuTogglesOpened += 1; actions.push(`Opened ${mode} main navigation`); await page.waitForTimeout(350); await collect();
      } catch (error) { diagnostics.discoveryErrors.push(`${mode} menu open failed: ${error instanceof Error ? error.message : String(error)}`); skipped.push(`Could not open the visible ${mode} main navigation control`); }
    } else skipped.push(`No visible ${mode} main navigation toggle was found`);
  }
  for (let pass = 0; pass < 5; pass += 1) {
    const controls = roots.locator(CUSTOM_EXPANDERS); const count = Math.min(await controls.count(), 100); let activated = 0;
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index); if (!await control.isVisible().catch(() => false)) continue;
      const label = ((await control.getAttribute('aria-label')) ?? (await control.innerText().catch(() => ''))).replace(/\s+/g, ' ').trim().slice(0, 120) || `navigation control ${index + 1}`;
      const signature = `${label}|${await control.getAttribute('aria-controls') ?? ''}|${await control.getAttribute('href') ?? ''}`;
      if (processed.has(signature)) continue; processed.add(signature);
      const tag = await control.evaluate((node) => node.tagName.toLowerCase()); const role = await control.getAttribute('role'); const href = await control.getAttribute('href');
      const clickable = tag === 'button' || role === 'button' || (tag === 'a' && (!href || href.startsWith('#')));
      if (clickable && /\b(?:log\s*(?:in|out)|account|profile|consent|accept|download|checkout|cart)\b/i.test(label)) { skipped.push(`Skipped unsafe navigation control "${label}"`); continue; }
      try {
        await control.hover({ timeout: 1_500 }).catch(() => undefined); await control.focus().catch(() => undefined); actions.push(`Revealed navigation menu "${label}" by hover/focus`); await page.waitForTimeout(250); await collect();
        if (clickable) { await control.click({ timeout: 2_000 }); actions.push(`Opened navigation menu "${label}"`); await page.waitForTimeout(250); await collect(); }
        activated += 1;
      } catch (error) { diagnostics.discoveryErrors.push(`Menu reveal failed for ${label}: ${error instanceof Error ? error.message : String(error)}`); skipped.push(`Could not expand navigation control "${label}"`); }
    }
    if (!activated) break;
  }
  await collect();
  {
    const toggles = page.locator(CUSTOM_MAIN_MENU_TOGGLES);
    for (let index = 0; index < Math.min(await toggles.count(), 20); index += 1) {
      const toggle = toggles.nth(index);
      if (await toggle.isVisible().catch(() => false) && await toggle.getAttribute('aria-expanded') === 'true') {
        try { await toggle.click({ timeout: 2_000 }); actions.push(`Closed ${mode} main navigation`); } catch { skipped.push(`${mode} main navigation opened but could not be closed safely`); }
        break;
      }
    }
  }
  diagnostics.internalLinksAccepted = unique.size;
  const pages = [...unique.values()].slice(0, maximumPages); const truncatedCount = Math.max(0, unique.size - maximumPages); const onlyHomepage = unique.size === 1;
  const complete = !onlyHomepage && truncatedCount === 0;
  const incompleteReason = onlyHomepage ? 'Main Menu discovery found only the homepage; navigation discovery is incomplete.' : truncatedCount ? `${truncatedCount} discovered Main Menu destinations exceeded the configured page limit.` : undefined;
  if (incompleteReason) skipped.push(`INCOMPLETE COVERAGE: ${incompleteReason}`);
  return { pages, actions, skipped, totalUniquePages: unique.size, truncatedCount, complete, incompleteReason, diagnostics };
}
