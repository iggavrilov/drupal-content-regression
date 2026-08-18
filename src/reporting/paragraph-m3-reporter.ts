import fs from 'node:fs';
import path from 'node:path';
import type { Reporter, TestResult } from '@playwright/test/reporter';
import { assertExplicitNonProductionEnvironment } from '../config/write-safety';
import type { ParagraphM3Result } from '../content/paragraphs/paragraph-m3-types';

interface Failure { nodeId?: string; title: string; saves: number; serverErrors: number; reason: string }

export default class ParagraphM3Reporter implements Reporter {
  private startedAt = 0;
  private testResult?: TestResult;
  private result?: ParagraphM3Result;
  private failure?: Failure;
  onBegin(): void { this.startedAt = Date.now(); }
  onTestEnd(_test: unknown, result: TestResult): void {
    this.testResult = result;
    const stdout = result.stdout.map((chunk) => typeof chunk === 'string' ? chunk : chunk.toString('utf8')).join('');
    for (const line of stdout.split(/\r?\n/)) {
      try {
        if (line.startsWith('PARAGRAPH_M3_EVENT ')) this.result = JSON.parse(line.slice('PARAGRAPH_M3_EVENT '.length)) as ParagraphM3Result;
        if (line.startsWith('PARAGRAPH_M3_FAILURE ')) this.failure = JSON.parse(line.slice('PARAGRAPH_M3_FAILURE '.length)) as Failure;
      } catch { /* Playwright status remains authoritative. */ }
    }
  }
  onEnd(): void {
    if (!this.testResult) return;
    const durationMs = Date.now() - this.startedAt;
    const status = this.testResult.status === 'passed' && this.result ? 'passed' : 'failed';
    const report = { environment: assertExplicitNonProductionEnvironment(), generatedAt: new Date().toISOString(), status, durationMs, result: this.result, failure: this.failure };
    const output = path.resolve(process.cwd(), 'test-results');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'paragraph-m3-regression-summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const component = this.result?.component;
    const lines = [
      '# Drupal Paragraph Milestone 3 Regression', '', `Status: ${status.toUpperCase()}`, `Duration: ${(durationMs / 1000).toFixed(1)}s`, '',
      'Blockquote: SUPPORTED', 'Featured banner: BLOCKED — required field_paragraph_border defaults to invalid `_none`; Padding has no approved semantic rule.', '',
      `Node: ${this.result?.host.nodeId ?? this.failure?.nodeId ?? 'not resolved'}`, `Title: ${this.result?.host.title ?? this.failure?.title ?? 'not resolved'}`,
      `Moderation: ${this.result?.host.moderation ?? 'not resolved'}`, `Saves: ${this.result?.host.saves ?? this.failure?.saves ?? 0}`,
      `Runtime delta: ${component?.initialDelta ?? 'not captured'}`, `Initial population: ${component?.initialPopulation ?? 'not completed'}`,
      `First Save: ${component?.firstSave ?? 'not completed'}`, `Initial persistence: ${component?.initialPersistence ?? 'not completed'}`,
      `Update: ${component?.update ?? 'not completed'}`, `Second Save: ${component?.secondSave ?? 'not completed'}`,
      `Final persistence: ${component?.finalPersistence ?? 'not completed'}`, `Text format: ${component?.textFormat ?? 'not verified'}`,
      `Optional fields untouched: ${component?.optionalFieldsUntouched ?? 'not completed'}`,
      `Initial activation: ${component?.activations.initialPersistence ?? 'not captured'}`, `Update activation: ${component?.activations.controlledUpdate ?? 'not captured'}`,
      `Final activation: ${component?.activations.finalPersistence ?? 'not captured'}`, `HTTP 500-505: ${this.result?.serverErrors ?? this.failure?.serverErrors ?? 0}`,
      `Fatal page: ${this.result?.fatalPageDetected ? 'detected' : 'none'}`, `Media selections: ${this.result?.mediaSelections ?? 0}`,
      ...(this.failure?.reason ? [`Reason: ${this.failure.reason}`] : []), '',
    ];
    fs.writeFileSync(path.join(output, 'paragraph-m3-regression-summary.md'), lines.join('\n'), 'utf8');
  }
}
