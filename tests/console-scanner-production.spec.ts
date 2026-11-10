import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { runConsoleScan } from '../src/console-scanner/scanner';
import { getProductionConsoleArtifactDir, resolveProductionConsoleSites, type ProductionConsoleTarget } from '../src/console-scanner/production';

test('scan one configured Production public site read-only', async ({ browser }) => {
  test.setTimeout(1_800_000);

  // Resolve every approved origin before the first page or browser context is created.
  const sites = resolveProductionConsoleSites();
  const target = process.env.PRODUCTION_CONSOLE_TARGET?.trim() as ProductionConsoleTarget | undefined;
  const site = sites.find((candidate) => candidate.target === target);
  if (!site) throw new Error('PRODUCTION_CONSOLE_TARGET must be leidos, qtcm, or benefits.');

  const maximumPages = Number(process.env.CONSOLE_SCAN_MAX_PAGES ?? '25');
  const maximumInteractions = Number(process.env.CONSOLE_SCAN_MAX_INTERACTIONS ?? '4');
  if (!Number.isInteger(maximumPages) || maximumPages < 1 || maximumPages > 50) throw new Error('CONSOLE_SCAN_MAX_PAGES must be an integer between 1 and 50 for Production.');
  if (!Number.isInteger(maximumInteractions) || maximumInteractions < 0 || maximumInteractions > 8) throw new Error('CONSOLE_SCAN_MAX_INTERACTIONS must be an integer between 0 and 8 for Production.');

  const report = await runConsoleScan(browser, {
    developmentOrigin: site.origin,
    productionOrigin: '',
    settleMs: 2_000,
    interactionSettleMs: 1_000,
    maximumPages,
    maximumInteractions,
    outputDir: getProductionConsoleArtifactDir(site.target),
    primaryEnvironment: 'PRODUCTION',
    readOnly: true,
    publicOnly: true,
    siteLabel: site.label,
  });

  expect(report.scanMode).toBe('standalone-production');
  expect(report.developmentOrigin).toBe(site.origin);
  expect(report.routes.length).toBeGreaterThan(0);
});
