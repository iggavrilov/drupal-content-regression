import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { contentTypes } from '../src/config/content-types';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import { detectDrupalFatalPage, NetworkMonitor } from '../src/diagnostics/network-monitor';
import { inspectOwnedNodeModeration } from '../src/publishing/moderation-workflow';
import { loadPublishingSourceNodes } from '../src/publishing/source-nodes';
import { classifyPostRunVerification } from '../src/reporting/publishing-post-run-verification';

test('published manifest nodes can be verified read-only after execution', async ({ page }) => {
  test.setTimeout(180_000);
  const startedAt = Date.now();
  const environment = assertExplicitNonProductionEnvironment();
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const results = [];
  for (const source of loadPublishingSourceNodes()) {
    const config = contentTypes.find((candidate) => candidate.machineName === source.machineName);
    expect(config, `Expected configuration for ${source.machineName}`).toBeDefined();
    const monitor = new NetworkMonitor();
    monitor.start(page);
    let actualState: string | undefined;
    let ownershipVerified = false;
    let titleVerified = false;
    let contentTypeVerified = false;
    let publicPagePassed = false;
    let fatalPageDetected = false;
    let reason: string | undefined;
    try {
      const publicResponse = await page.goto(`/node/${source.nodeId}`, { waitUntil: 'domcontentloaded' });
      publicPagePassed = Boolean(publicResponse && publicResponse.status() < 400);
      fatalPageDetected = (await detectDrupalFatalPage(page)).detected;
      const inspection = await inspectOwnedNodeModeration(page, config!, source, 'Published');
      actualState = inspection.currentState;
      ownershipVerified = true;
      titleVerified = true;
      contentTypeVerified = true;
    } catch (error) {
      reason = error instanceof Error ? error.message.split(/\r?\n/)[0].replace(/[?#][^\s]*/g, '') : 'Unknown verification failure.';
    } finally {
      monitor.stop();
    }
    const serverErrors = monitor.getServerErrors().map(({ status, method, url }) => ({
      status,
      method,
      path: new URL(url).pathname,
    }));
    const evidence = {
      ownershipVerified,
      titleVerified,
      contentTypeVerified,
      expectedState: 'Published' as const,
      actualState,
      publicPagePassed,
      serverErrorCount: serverErrors.length,
      fatalPageDetected,
    };
    results.push({
      machineName: source.machineName,
      label: source.label,
      nodeId: source.nodeId,
      ...evidence,
      serverErrors,
      status: classifyPostRunVerification(evidence),
      reason,
    });
  }
  const totals = {
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    published: results.filter((result) => result.actualState === 'Published').length,
    total: results.length,
    durationMs: Date.now() - startedAt,
  };
  const report = { environment, generatedAt: new Date().toISOString(), historicalExecution: { passed: 0, failed: 7, blocked: 0, note: 'Original automated verification failed because the node-view moderation form disappears after publication.' }, totals, results };
  const outputDirectory = path.resolve(process.cwd(), 'test-results');
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'publishing-post-run-verification-summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const markdown = [
    '# Drupal Publishing Post-Run Verification',
    '',
    `Environment: ${environment}`,
    '',
    'Historical publishing execution: 0 passed, 7 failed, 0 blocked due to the verifier defect.',
    '',
    ...results.flatMap((result) => [
      `## ${result.label}`,
      '',
      `Status: ${result.status.toUpperCase()}`,
      `Node: ${result.nodeId}`,
      `Expected state: Published`,
      `Actual state: ${result.actualState ?? 'not proven'}`,
      `Title integrity: ${result.titleVerified ? 'passed' : 'failed'}`,
      `Content type: ${result.contentTypeVerified ? 'passed' : 'failed'}`,
      `Public page: ${result.publicPagePassed ? 'passed' : 'failed'}`,
      `HTTP 500–505: ${result.serverErrors.length === 0 ? 'none' : 'detected'}`,
      `Drupal fatal page: ${result.fatalPageDetected ? 'detected' : 'none'}`,
      ...(result.reason ? [`Reason: ${result.reason}`] : []),
      '',
    ]),
    `Passed: ${totals.passed}`,
    `Failed: ${totals.failed}`,
    `Published: ${totals.published}/${totals.total}`,
    `Duration: ${(totals.durationMs / 1000).toFixed(1)}s`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outputDirectory, 'publishing-post-run-verification-summary.md'), markdown, 'utf8');
  console.log(`Publishing post-run verification: passed=${totals.passed} failed=${totals.failed} published=${totals.published}/${totals.total} durationMs=${totals.durationMs}`);
  expect(totals.failed).toBe(0);
  expect(totals.published).toBe(7);
});
