import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { runFullProductionConsoleScan } from '../src/console-scanner/full-production';
import { resolveProductionConsoleSites, type ProductionConsoleTarget } from '../src/console-scanner/production';

test('run comprehensive read-only Production main-menu and interaction regression', async ({ browser }) => {
  test.setTimeout(3_600_000);
  const sites = resolveProductionConsoleSites();
  const target = process.env.PRODUCTION_CONSOLE_TARGET?.trim() as ProductionConsoleTarget | undefined;
  const site = sites.find((candidate) => candidate.target === target);
  if (!site) throw new Error('PRODUCTION_CONSOLE_TARGET must be leidos, qtcm, or benefits.');
  const maximumPages = Number(process.env.CONSOLE_SCAN_MAX_PAGES ?? '200');
  const maximumInteractions = Number(process.env.CONSOLE_SCAN_MAX_INTERACTIONS ?? '8');
  if (!Number.isInteger(maximumPages) || maximumPages < 1 || maximumPages > 250) throw new Error('CONSOLE_SCAN_MAX_PAGES must be an integer between 1 and 250 for the full Production scan.');
  if (!Number.isInteger(maximumInteractions) || maximumInteractions < 0 || maximumInteractions > 12) throw new Error('CONSOLE_SCAN_MAX_INTERACTIONS must be an integer between 0 and 12 for the full Production scan.');
  const report = await runFullProductionConsoleScan(browser, site, { maximumPages, maximumInteractions, discoveryOnly: process.env.CONSOLE_SCAN_DISCOVERY_ONLY === 'true', outputDir: `artifacts/console-scan/production-full/${site.target}` });
  expect(report.desktop.scanMode).toBe('standalone-production');
  expect(report.mobile.scanMode).toBe('standalone-production');
  expect(report.summary.homepageCoveredDesktop).toBe(1);
  expect(report.summary.homepageCoveredMobile).toBe(1);
  expect(['COMPLETE', 'INCOMPLETE']).toContain(report.status);
});
