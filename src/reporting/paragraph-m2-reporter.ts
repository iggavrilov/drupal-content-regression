import fs from 'node:fs';
import path from 'node:path';
import type { Reporter, TestResult } from '@playwright/test/reporter';
import { assertExplicitNonProductionEnvironment } from '../config/write-safety';
import type { ParagraphM2Result } from '../content/paragraphs/paragraph-m2-types';
import { AUTOMATED_IMAGE_MEDIA_ID } from '../config/automation';

export default class ParagraphM2Reporter implements Reporter {
  private startedAt = 0;
  private testResult?: TestResult;
  private result?: ParagraphM2Result;
  private failure?: { nodeId?: string; title: string; saves: number; serverErrors: number; reason: string };
  onBegin(): void { this.startedAt = Date.now(); }
  onTestEnd(_test: unknown, result: TestResult): void {
    this.testResult = result;
    const stdout = result.stdout.map((chunk) => typeof chunk === 'string' ? chunk : chunk.toString('utf8')).join('');
    for (const line of stdout.split(/\r?\n/)) {
      try {
        if (line.startsWith('PARAGRAPH_M2_EVENT ')) this.result = JSON.parse(line.slice('PARAGRAPH_M2_EVENT '.length)) as ParagraphM2Result;
        if (line.startsWith('PARAGRAPH_M2_FAILURE ')) this.failure = JSON.parse(line.slice('PARAGRAPH_M2_FAILURE '.length)) as typeof this.failure;
      } catch { /* Test status remains authoritative. */ }
    }
  }
  onEnd(): void {
    if (!this.testResult) return;
    const durationMs = Date.now() - this.startedAt;
    const status = this.testResult.status === 'passed' && this.result ? 'passed' : 'failed';
    const report = { environment: assertExplicitNonProductionEnvironment(), generatedAt: new Date().toISOString(), status, durationMs, phaseA: { formattedTextColorBackground: { status: 'blocked', reason: 'Required field_paragraph_color defaulted to invalid _none; selecting a design option would be arbitrary.' }, formattedTextImageBackground: { status: 'supported', fixtureId: AUTOMATED_IMAGE_MEDIA_ID } }, result: this.result, failure: this.failure };
    const output = path.resolve(process.cwd(), 'test-results'); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'paragraph-m2-regression-summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const component = this.result?.components[0];
    const lines = ['# Drupal Paragraph Milestone 2 Regression', '', `Status: ${status.toUpperCase()}`, `Duration: ${(durationMs / 1000).toFixed(1)}s`, '', '## Phase A', '', 'Formatted text (w/ color background): BLOCKED — required color default is invalid `_none`.', `Formatted text (w/ image background): SUPPORTED — exact fixture resolved to media ${AUTOMATED_IMAGE_MEDIA_ID}.`, '', '## Phase B', '', `Node: ${this.result?.host.nodeId ?? this.failure?.nodeId ?? 'not resolved'}`, `Title: ${this.result?.host.title ?? this.failure?.title ?? 'not resolved'}`, `Moderation: ${this.result?.host.moderation ?? 'not resolved'}`, `Saves: ${this.result?.host.saves ?? this.failure?.saves ?? 0}`, `Initial delta: ${component?.initialDelta ?? 'not captured'}`, `Post-media delta: ${component?.postMediaDelta ?? 'not captured'}`, `Post-media action element: ${component?.postMediaRowActionElementType ?? 'not captured'}`, `Initial persistence: ${component?.initialPersistence ?? 'not completed'}`, `Update: ${component?.update ?? 'not completed'}`, `Final persistence: ${component?.finalPersistence ?? 'not completed'}`, `Initial activation: ${component?.activations.initialPersistence ?? 'not captured'}`, `Update activation: ${component?.activations.controlledUpdate ?? 'not captured'}`, `Final activation: ${component?.activations.finalPersistence ?? 'not captured'}`, `Fixture: ${component?.fixtureFilename ?? 'not verified'}`, `Media ID: ${component?.mediaId ?? 'not verified'}`, `Dialog closure: ${component?.mediaLibraryClosure ?? 'not completed'}`, `Row rediscovery: ${component?.rowRediscovery ?? 'not completed'}`, `Delta rediscovery: ${component?.deltaRediscovery ?? 'not completed'}`, `Association stability: ${component?.associationStability ?? 'not completed'}`, `Media selections: ${this.result?.mediaSelections ?? 0}`, `HTTP 500-505: ${this.result?.serverErrors ?? this.failure?.serverErrors ?? 0}`, `Fatal page: ${this.result?.fatalPageDetected ? 'detected' : 'none'}`, ...(this.failure?.reason ? [`Reason: ${this.failure.reason}`] : []), ''];
    fs.writeFileSync(path.join(output, 'paragraph-m2-regression-summary.md'), lines.join('\n'), 'utf8');
  }
}
