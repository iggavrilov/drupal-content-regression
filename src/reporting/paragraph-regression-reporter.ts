import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { assertExplicitNonProductionEnvironment } from '../config/write-safety';
import type { ParagraphRegressionResult } from '../content/paragraphs/paragraph-types';
import { deferredParagraphConfigs, paragraphConfigs } from '../content/paragraphs/paragraph-types';

function safeReason(result?: TestResult): string | undefined {
  if (!result) return undefined;
  const line = result.errors.map((error) => error.message ?? '').join('\n').split(/\r?\n/).find(Boolean);
  return line?.replace(/https?:\/\/[^\s/?#]+([^\s?#]*)[^\s]*/g, '$1').replace(/[?#][^\s]*/g, '');
}

export default class ParagraphRegressionReporter implements Reporter {
  private startedAt = 0;
  private testResult?: TestResult;
  private result?: ParagraphRegressionResult;
  private failure?: { nodeId?: string; title: string; saves: number; components: ParagraphRegressionResult['components']; serverErrors: number; fatalPageDetected: boolean; reason: string };

  onBegin(): void { this.startedAt = Date.now(); }

  onTestEnd(_test: TestCase, result: TestResult): void {
    this.testResult = result;
    const stdout = result.stdout.map((chunk) => typeof chunk === 'string' ? chunk : chunk.toString('utf8')).join('');
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.startsWith('PARAGRAPH_REGRESSION_EVENT ')) continue;
      try {
        const event = JSON.parse(line.slice('PARAGRAPH_REGRESSION_EVENT '.length)) as { stage?: string; result?: ParagraphRegressionResult };
        if (event.stage === 'complete' && event.result) this.result = event.result;
        if (event.stage === 'failure') this.failure = event as typeof this.failure;
      } catch { /* A malformed sanitized event is reflected as a failed report below. */ }
    }
  }

  onEnd(_fullResult: FullResult): void {
    if (!this.testResult) return;
    const environment = assertExplicitNonProductionEnvironment();
    const status = this.testResult.status === 'passed' && this.result ? 'passed' : /PARAGRAPH_BLOCKED:/.test(safeReason(this.testResult) ?? '') ? 'blocked' : 'failed';
    const totals = { passed: status === 'passed' ? paragraphConfigs.length : 0, failed: status === 'failed' ? 1 : 0, blocked: status === 'blocked' ? 1 : 0, total: paragraphConfigs.length, durationMs: Date.now() - this.startedAt };
    const host = this.result?.host ?? (this.failure ? { nodeId: this.failure.nodeId, title: this.failure.title, contentType: 'Insight Search Filter Page', machineName: 'insight_search', moderationState: this.failure.saves ? 'Draft (expected)' : 'not saved', saves: this.failure.saves, createdParagraphCount: this.failure.components.filter((component) => component.addResult === 'passed').length, nodeCreations: this.failure.saves ? 1 : 0, paragraphAdditions: this.failure.components.filter((component) => component.addMethod === 'ajax' && component.addResult === 'passed').length, paragraphRemovals: 0, initialParagraphCount: this.failure.saves ? 4 : 0, finalParagraphCount: 0 } : undefined);
    const report = { environment, generatedAt: new Date().toISOString(), status, totals, host, components: this.result?.components ?? this.failure?.components ?? [], deferred: deferredParagraphConfigs, serverErrors: this.result?.serverErrors ?? this.failure?.serverErrors ?? 0, fatalPageDetected: this.result?.fatalPageDetected ?? this.failure?.fatalPageDetected ?? false, reason: status === 'passed' ? undefined : this.failure?.reason ?? safeReason(this.testResult) };
    const output = path.resolve(process.cwd(), 'test-results');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'paragraph-regression-summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const lines = ['# Drupal Paragraph Regression', '', `Environment: ${environment}`, `Status: ${status.toUpperCase()}`, `Duration: ${(totals.durationMs / 1000).toFixed(1)}s`, '', '## Host node', '', `Node ID: ${report.host?.nodeId ?? 'not resolved'}`, `Title: ${report.host?.title ?? 'not resolved'}`, `Content type: ${report.host?.contentType ?? 'Insight Search Filter Page'}`, `Moderation: ${report.host?.moderationState ?? 'not resolved'}`, `Saves: ${report.host?.saves ?? 'not resolved'}`, `Nodes created: ${report.host?.nodeCreations ?? 'not resolved'}`, `Initial Paragraph count: ${report.host?.initialParagraphCount ?? 'not resolved'}`, `Final Paragraph count: ${report.host?.finalParagraphCount ?? 'not resolved'}`, `Paragraph additions: ${report.host?.paragraphAdditions ?? 'not resolved'}`, `Paragraph removals: ${report.host?.paragraphRemovals ?? 'not resolved'}`, '', '## Components', '', ...report.components.flatMap((entry) => [`### ${entry.label}`, '', `Machine name: ${entry.machineName}`, `Add: ${entry.addResult}${entry.addMethod ? ` (${entry.addMethod})` : ''}`, `Populate: ${entry.fieldPopulationResult}`, `Initial persistence: ${entry.initialPersistenceResult}`, `Update: ${entry.updateResult}`, `Update activation: ${entry.updateActivationMethod ?? 'not applicable'}`, ...(entry.updateActivationMethod === 'keyboard' ? [`Focus verified: ${entry.updateFocusVerified ? 'yes' : 'no'}`] : []), `Final persistence: ${entry.finalPersistenceResult}`, `HTTP 500-505: ${entry.serverErrors}`, `Fatal page: ${entry.fatalPageDetected ? 'detected' : 'none'}`, ...(entry.initialValue ? [`Initial value: ${entry.initialValue}`] : []), ...(entry.updatedValue ? [`Updated value: ${entry.updatedValue}`] : []), ...(entry.availableOptions ? [`Available options: ${entry.availableOptions.map((option) => `${option.label} (${option.value})`).join(', ')}`] : []), ...(entry.selectedOption ? [`Selected option: ${entry.selectedOption.label} (${entry.selectedOption.value})`] : []), ...(entry.updatedOption ? [`Updated option: ${entry.updatedOption.label} (${entry.updatedOption.value})`] : []), ...(entry.blockedReason ? [`Blocked reason: ${entry.blockedReason}`] : []), '']), '## Deferred', '', ...deferredParagraphConfigs.flatMap((entry) => [`### ${entry.label}`, '', 'Status: Deferred', `Machine name: ${entry.machineName}`, `Reason: ${entry.reason}`, '']), '## Summary', '', `Passed: ${totals.passed}`, `Failed: ${totals.failed}`, `Blocked: ${totals.blocked}`, ...(report.reason ? [`Reason: ${report.reason}`] : []), ''];
    fs.writeFileSync(path.join(output, 'paragraph-regression-summary.md'), lines.join('\n'), 'utf8');
  }
}
