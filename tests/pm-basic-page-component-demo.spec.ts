import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getEffectiveCredentials, getEnvironmentConfig } from '../src/config/environments';
import { BasicPageFormattedTextPocRunner, type LeidosStageBasicPageDemoStep } from '../src/content/component-functional-runner';
import { NetworkMonitor } from '../src/diagnostics/network-monitor';

test('Leidos Stage demo: create and publish one Basic Page with three Paragraph types', async ({ browser, page }, testInfo) => {
  const environment = getEnvironmentConfig();
  expect(environment).toMatchObject({ target: 'leidos', tier: 'stage', baseUrl: 'https://stage.leidos.com' });
  const credentials = getEffectiveCredentials();
  const evidenceDir = path.resolve('artifacts/basic-page-demo/leidos-stage/latest');
  await fs.mkdir(evidenceDir, { recursive: true });
  const authoringPageErrors: string[] = [];
  const publicPageErrors: string[] = [];
  const failedPublicFirstPartyRequests: string[] = [];
  page.on('pageerror', (error) => authoringPageErrors.push(error.message));
  const publicContext = await browser.newContext({ baseURL: environment.baseUrl, httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
  const publicPage = await publicContext.newPage();
  publicPage.on('pageerror', (error) => publicPageErrors.push(error.message));
  publicPage.on('requestfailed', (request) => {
    try {
      if (new URL(request.url()).origin === environment.baseUrl) failedPublicFirstPartyRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`);
    } catch { /* Ignore malformed browser diagnostics. */ }
  });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const onStep = async (step: LeidosStageBasicPageDemoStep): Promise<void> => {
    const screenshotPath = path.join(evidenceDir, `${step.name}.png`);
    await (step.name === 'frontend-verified' ? publicPage : page).screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach(`${step.name} screenshot`, { path: screenshotPath, contentType: 'image/png' });
    await fs.writeFile(path.join(evidenceDir, 'run-state.json'), `${JSON.stringify({ ...step, target: environment.baseUrl }, null, 2)}\n`, 'utf8');
  };
  try {
    await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
    const recoveryNodeId = process.env.LEIDOS_STAGE_BASIC_PAGE_DEMO_RECOVERY_NODE_ID?.trim();
    const recoveryRunId = process.env.LEIDOS_STAGE_BASIC_PAGE_DEMO_RECOVERY_RUN_ID?.trim();
    const runner = new BasicPageFormattedTextPocRunner();
    const result = recoveryNodeId || recoveryRunId
      ? await runner.verifyLeidosStageDemoRecovery(page, monitor, publicPage, {
        nodeId: recoveryNodeId ?? '',
        runId: recoveryRunId ?? '',
        title: `QA-AUTOMATED-QA Automated Demo - Basic Page - ${recoveryRunId ?? ''}`,
      }, onStep)
      : await runner.createLeidosStageDemo(page, monitor, onStep, publicPage);
    expect(result.published).toBe(true);
    expect(result.frontendVerified).toBe(true);
    expect(result.components).toEqual(['Formatted text', 'Blockquote', 'List']);
    expect(publicPageErrors).toEqual([]);
    expect(failedPublicFirstPartyRequests).toEqual([]);
    const summary = { status: 'PASS', environment: environment.baseUrl, nodeId: result.nodeId, title: result.title, editUrl: result.editUrl, publicUrl: result.publicUrl, components: result.components, publishing: 'Published', frontendVerification: 'PASS', authoringPageErrors, publicPageErrors, failedPublicFirstPartyRequests };
    const summaryPath = path.join(evidenceDir, 'summary.json');
    await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await testInfo.attach('demo summary', { path: summaryPath, contentType: 'application/json' });
    console.log(`DEMO_RESULT PASS node=${result.nodeId} edit=${result.editUrl} public=${result.publicUrl}`);
  } finally {
    monitor.stop();
    await publicContext.close();
  }
});
