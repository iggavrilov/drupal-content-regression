import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  getProductionConsoleArtifactDir,
  isReadOnlyHttpMethod,
  isSafeProductionPublicRoute,
  resolveProductionConsoleSites,
  validateProductionOrigin,
} from '../src/console-scanner/production';
import { groupFullProductionFindings } from '../src/console-scanner/full-production';
import type { RawConsoleFinding } from '../src/console-scanner/model';
import { discoverMainNavigation } from '../src/console-scanner/discovery';

const validEnvironment = {
  DRUPAL_PROD_LEIDOS_URL: 'https://www.leidos.com',
  DRUPAL_PROD_QTCM_URL: 'https://www.qtcm.com',
  DRUPAL_PROD_BENEFITS_URL: 'https://benefits.leidos.com',
};

test('validates all three exact approved Production root origins', () => {
  expect(resolveProductionConsoleSites(validEnvironment)).toEqual([
    expect.objectContaining({ target: 'leidos', origin: 'https://www.leidos.com' }),
    expect.objectContaining({ target: 'qtcm', origin: 'https://www.qtcm.com' }),
    expect.objectContaining({ target: 'benefits', origin: 'https://benefits.leidos.com' }),
  ]);
});

test('rejects missing, mismatched, and structurally unsafe Production origins', () => {
  expect(() => validateProductionOrigin('TEST_URL', undefined, 'www.leidos.com')).toThrow(/required/);
  for (const value of [
    'http://www.leidos.com',
    'https://www.leidos.com.evil.example',
    'https://foo.www.leidos.com',
    'https://user:password@www.leidos.com',
    'https://www.leidos.com:8443',
    'https://www.leidos.com/about',
    'https://www.leidos.com/?scan=true',
    'https://www.leidos.com/#top',
  ]) expect(() => validateProductionOrigin('TEST_URL', value, 'www.leidos.com')).toThrow();
});

test('requires every Production target before any scan can start', () => {
  expect(() => resolveProductionConsoleSites({ ...validEnvironment, DRUPAL_PROD_QTCM_URL: '' })).toThrow(/DRUPAL_PROD_QTCM_URL/);
});

test('keeps Production reports separated by target', () => {
  expect(getProductionConsoleArtifactDir('leidos')).toBe(path.resolve('artifacts/console-scan/production/leidos'));
  expect(getProductionConsoleArtifactDir('qtcm')).toBe(path.resolve('artifacts/console-scan/production/qtcm'));
  expect(getProductionConsoleArtifactDir('benefits')).toBe(path.resolve('artifacts/console-scan/production/benefits'));
});

test('rejects admin, authentication, entity mutation, checkout, and external routes', () => {
  for (const route of ['/admin', '/admin/content', '/user/profile', '/user/login', '/user/logout', '/node/add/page', '/node/123/edit', '/media/3/delete', '/checkout', 'https://example.com/about']) {
    expect(isSafeProductionPublicRoute(route), route).toBe(false);
  }
  expect(isSafeProductionPublicRoute('/about')).toBe(true);
  expect(isSafeProductionPublicRoute('/markets/aviation')).toBe(true);
});

test('allows only read-only HTTP methods', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) expect(isReadOnlyHttpMethod(method)).toBe(true);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(isReadOnlyHttpMethod(method)).toBe(false);
});

test('Production entry point does not import Drupal authentication or write helpers', () => {
  const source = fs.readFileSync(path.resolve('tests/console-scanner-production.spec.ts'), 'utf8');
  expect(source).not.toMatch(/drupal-login|write-safety|node-form|publishing|resolveEffectiveCredentials|loginToDrupal/);
  expect(source).toContain('readOnly: true');
  expect(source).toContain('publicOnly: true');
});

test('groups repeated desktop and mobile findings by root cause while preserving contexts', () => {
  const base: RawConsoleFinding = { environment: 'PRODUCTION', route: '/about', pageUrl: 'https://www.leidos.com/about', finalUrl: 'https://www.leidos.com/about', action: 'Page load', actionKey: 'page-load', phase: 'page_load', type: 'console_error', message: 'TypeError: example', sourceUrl: 'https://www.leidos.com/app.js' };
  const grouped = groupFullProductionFindings([base], [{ ...base, route: '/markets', pageUrl: 'https://www.leidos.com/markets', finalUrl: 'https://www.leidos.com/markets', action: 'Activated "Capabilities"' }]);
  expect(grouped).toHaveLength(1);
  expect(grouped[0].ownership).toBe('FIRST_PARTY');
  expect(grouped[0].occurrences).toBe(2);
  expect(grouped[0].affectedUrls).toEqual(['https://www.leidos.com/about', 'https://www.leidos.com/markets']);
  expect(grouped[0].interactionContexts.map((item) => item.viewport)).toEqual(['desktop', 'mobile']);
  expect(grouped[0].reproductionSteps).toHaveLength(2);
});

test('discovers and deduplicates nested desktop and mobile menu destinations with explicit truncation', async ({ page }) => {
  await page.setContent(`
    <header><nav aria-label="Main">
      <a href="/">Home</a>
      <button aria-expanded="false" aria-controls="mega" onclick="this.setAttribute('aria-expanded','true');document.querySelector('#mega').hidden=false">Markets</button>
      <div id="mega" hidden><a href="/markets">Markets</a><a href="/markets">Markets duplicate</a><a href="/markets/aviation">Aviation</a></div>
      <button aria-label="Menu" aria-expanded="false" aria-controls="mobile" onclick="const m=document.querySelector('#mobile');m.hidden=!m.hidden;this.setAttribute('aria-expanded',String(!m.hidden))">Menu</button>
      <div id="mobile" hidden><a href="/about">About</a></div>
    </nav></header>`);
  const desktop = await discoverMainNavigation(page, 'https://www.leidos.com', 10, ['www.leidos.com'], 'desktop');
  expect(desktop.pages.map((item) => item.route)).toEqual(expect.arrayContaining(['/', '/markets', '/markets/aviation', '/about']));
  expect(desktop.pages.filter((item) => item.route === '/markets')).toHaveLength(1);
  expect(desktop.truncatedCount).toBe(0);

  await page.setContent(`<header><nav><button aria-label="Menu" aria-expanded="false" aria-controls="mobile" onclick="const m=document.querySelector('#mobile');m.hidden=!m.hidden;this.setAttribute('aria-expanded',String(!m.hidden))">Menu</button><div id="mobile" hidden><a href="/about">About</a><a href="/contact">Contact</a></div></nav></header>`);
  const mobile = await discoverMainNavigation(page, 'https://www.leidos.com', 2, ['www.leidos.com'], 'mobile');
  expect(mobile.pages[0].route).toBe('/');
  expect(mobile.totalUniquePages).toBe(3);
  expect(mobile.truncatedCount).toBe(1);
  expect(mobile.skipped.some((item) => item.includes('INCOMPLETE COVERAGE'))).toBe(true);
  expect(mobile.actions).toContain('Opened mobile main navigation');
  expect(mobile.actions).toContain('Closed mobile main navigation');
});

test('discovers hidden mega-menu links and activates a custom desktop hamburger', async ({ page }) => {
  await page.setContent(`
    <header>
      <div class="hamburger" tabindex="0" aria-label="Hamburger" aria-expanded="false"
        onclick="this.setAttribute('aria-expanded','true');document.querySelector('#desktop-menu').hidden=false">Menu</div>
      <div id="desktop-menu" hidden>
        <a href="/markets">Markets</a>
        <a href="/markets/aviation">Aviation</a>
        <a href="/capabilities">Capabilities</a>
        <a href="https://outside.example/path">External</a>
      </div>
    </header>`);
  const result = await discoverMainNavigation(page, 'https://www.leidos.com', 20, ['www.leidos.com'], 'desktop');
  expect(result.pages.map((item) => item.route)).toEqual(['/', '/markets', '/markets/aviation', '/capabilities']);
  expect(result.complete).toBe(true);
  expect(result.actions).toContain('Opened desktop main navigation');
  expect(result.diagnostics.internalLinksInitiallyHidden).toBe(3);
  expect(result.diagnostics.menuTogglesOpened).toBe(1);
  expect(result.diagnostics.rejectionReasons['not rendered before menu expansion']).toBeUndefined();
  expect(result.diagnostics.rejectionReasons['external or unapproved hostname']).toBe(1);
});

test('does not classify Benefits menu labels containing Accounts as unsafe account controls', async ({ page }) => {
  await page.setContent(`
    <header><nav aria-label="Main"><ul><li class="menu-item--expanded">
      <a href="/benefits">Benefits</a><ul>
        <li><a href="/fsa">Flexible Spending Accounts</a></li>
        <li><a href="/hsa">Health Savings Account</a></li>
      </ul>
    </li></ul></nav></header>`);
  const result = await discoverMainNavigation(page, 'https://benefits.leidos.com', 20, ['benefits.leidos.com'], 'desktop');
  expect(result.pages.map((item) => item.route)).toEqual(['/', '/benefits', '/fsa', '/hsa']);
  expect(result.skipped.some((item) => item.startsWith('Skipped unsafe navigation control'))).toBe(false);
  expect(result.complete).toBe(true);
});

test('discovers populated custom Drupal header markup without semantic nav or ARIA roles', async ({ page }) => {
  await page.setContent(`<header><div class="region region-header"><div class="custom-links"><a href="/about">About</a><a href="/markets">Markets</a><a href="/insights">Insights</a></div></div></header>`);
  const result = await discoverMainNavigation(page, 'https://www.leidos.com', 20, ['www.leidos.com'], 'desktop');
  expect(result.pages.map((item) => item.route)).toEqual(['/', '/about', '/markets', '/insights']);
  expect(result.complete).toBe(true);
  expect(result.diagnostics.navigationContainersFound).toBeGreaterThan(0);
  expect(result.diagnostics.candidateLinksDetected).toBe(3);
  expect(result.diagnostics.internalLinksAccepted).toBe(4);
  expect(result.diagnostics.discoveryErrors).toEqual([]);
});

test('marks homepage-only menu discovery incomplete with diagnostics', async ({ page }) => {
  await page.setContent(`<header><div class="custom-links"><a href="/">Home</a><a href="https://example.com">External</a></div></header>`);
  const result = await discoverMainNavigation(page, 'https://www.leidos.com', 20, ['www.leidos.com'], 'desktop');
  expect(result.pages.map((item) => item.route)).toEqual(['/']);
  expect(result.complete).toBe(false);
  expect(result.incompleteReason).toContain('only the homepage');
  expect(result.diagnostics.linksRejected).toBe(1);
  expect(result.diagnostics.rejectionReasons['external or unapproved hostname']).toBe(1);
  expect(result.skipped.some((item) => item.startsWith('INCOMPLETE COVERAGE:'))).toBe(true);
});
