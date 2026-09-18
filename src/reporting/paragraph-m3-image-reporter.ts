import fs from 'node:fs';
import path from 'node:path';
import type { Reporter, TestResult } from '@playwright/test/reporter';
import { AUTOMATED_M3_TEXT_NODE_ID } from '../config/automation';
import { assertExplicitNonProductionEnvironment } from '../config/write-safety';
import type { ParagraphM3ImageResult } from '../content/paragraphs/paragraph-m3-image-types';

interface Failure { nodeId?: string; title: string; saves: number; serverErrors: number; reason: string }
export default class ParagraphM3ImageReporter implements Reporter {
  private startedAt = 0; private testResult?: TestResult; private result?: ParagraphM3ImageResult; private failure?: Failure;
  onBegin(): void { this.startedAt = Date.now(); }
  onTestEnd(_test: unknown, result: TestResult): void {
    this.testResult = result;
    const stdout = result.stdout.map((chunk) => typeof chunk === 'string' ? chunk : chunk.toString('utf8')).join('');
    for (const line of stdout.split(/\r?\n/)) try {
      if (line.startsWith('PARAGRAPH_M3_IMAGE_EVENT ')) this.result = JSON.parse(line.slice('PARAGRAPH_M3_IMAGE_EVENT '.length)) as ParagraphM3ImageResult;
      if (line.startsWith('PARAGRAPH_M3_IMAGE_FAILURE ')) this.failure = JSON.parse(line.slice('PARAGRAPH_M3_IMAGE_FAILURE '.length)) as Failure;
    } catch { /* Playwright status remains authoritative. */ }
  }
  onEnd(): void {
    if (!this.testResult) return;
    const durationMs = Date.now() - this.startedAt;
    const status = this.testResult.status === 'passed' && this.result ? 'passed' : 'failed';
    const report = { environment: assertExplicitNonProductionEnvironment(), generatedAt: new Date().toISOString(), status, durationMs, scenarios: { textOnly: { status: 'previously passed', nodeId: AUTOMATED_M3_TEXT_NODE_ID, executed: false }, image: this.result }, failure: this.failure };
    const output = path.resolve(process.cwd(), 'test-results'); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'paragraph-m3-image-regression-summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const c = this.result?.component;
    const lines = ['# Drupal Paragraph Milestone 3 Regression', '', `Status: ${status.toUpperCase()}`, `Duration: ${(durationMs / 1000).toFixed(1)}s`, '',
      `Scenario A — Blockquote text-only: PREVIOUSLY PASSED (node ${AUTOMATED_M3_TEXT_NODE_ID}; not executed)`, 'Scenario B — Blockquote + optional image: ' + status.toUpperCase(),
      'Featured banner: BLOCKED / deferred', 'Formatted text (w/ color background): BLOCKED / deferred', '',
      `Node: ${this.result?.host.nodeId ?? this.failure?.nodeId ?? 'not resolved'}`, `Title: ${this.result?.host.title ?? this.failure?.title ?? 'not resolved'}`,
      `Moderation: ${this.result?.host.moderation ?? 'not resolved'}`, `Saves: ${this.result?.host.saves ?? this.failure?.saves ?? 0}`,
      `Delta before media: ${c?.deltaBeforeMedia ?? 'not captured'}`, `Delta after media: ${c?.deltaAfterMedia ?? 'not captured'}`, `Row control: ${c?.rowControlType ?? 'not captured'}`,
      `Fixture: ${c?.fixtureFilename ?? 'not resolved'}`, `Resolution: ${c?.fixtureResolution ?? 'not completed'}`, `Media ID: ${c?.mediaId ?? 'not resolved'}`,
      `Dialog closure: ${c?.dialogClosure ?? 'not completed'}`, `Row rediscovery: ${c?.rowRediscovery ?? 'not completed'}`, `Stable target ID: ${c?.stableTargetId ?? 'not verified'}`,
      `Initial association: ${c?.initialPersistedAssociation ?? 'not completed'}`, `Final association: ${c?.finalPersistedAssociation ?? 'not completed'}`,
      `Optional fields untouched: ${c?.optionalFieldsUntouched ?? 'not completed'}`, `Initial activation: ${c?.activations.initialPersistence ?? 'not captured'}`,
      `Update activation: ${c?.activations.controlledUpdate ?? 'not captured'}`, `Final activation: ${c?.activations.finalPersistence ?? 'not captured'}`,
      `HTTP 500-505: ${this.result?.serverErrors ?? this.failure?.serverErrors ?? 0}`, `Fatal page: ${this.result?.fatalPageDetected ? 'detected' : 'none'}`,
      ...(this.failure?.reason ? [`Reason: ${this.failure.reason}`] : []), ''];
    fs.writeFileSync(path.join(output, 'paragraph-m3-image-regression-summary.md'), lines.join('\n'), 'utf8');
  }
}
