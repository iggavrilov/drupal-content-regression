import fs from 'node:fs';
import path from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { assertExplicitNonProductionEnvironment } from '../config/write-safety';

type RegressionStatus = 'passed' | 'failed' | 'blocked';

interface RunnerEvent {
  machineName: string;
  label: string;
  stage: 'created' | 'updated';
  nodeId: string;
  title: string;
  moderation?: string;
}

interface RegressionEntry {
  machineName: string;
  label: string;
  status: RegressionStatus;
  created: boolean;
  updated: boolean;
  nodeId?: number;
  title?: string;
  moderation?: string;
  serverErrors: Array<{ status: number; method: string; path: string }>;
  fatalPageDetected: boolean;
  reason?: string;
  durationMs: number;
}

const orderedTypes = [
  ['page', 'Basic page', 'basic-page-crud.spec.ts'],
  ['landing_page', 'Landing page', 'landing-page-crud.spec.ts'],
  ['statistic', 'Statistic', 'statistic-crud.spec.ts'],
  ['author', 'Author', 'author-crud.spec.ts'],
  ['insight_external', 'Insight (external)', 'insight-external-crud.spec.ts'],
  ['insight', 'Insight', 'insight-crud.spec.ts'],
  ['insight_search', 'Insight Search Filter Page', 'insight-search-crud.spec.ts'],
] as const;

function messageFor(result: TestResult): string {
  return result.errors.map((error) => error.message ?? '').join('\n');
}

function isBlocked(message: string): boolean {
  return /fixture.*(missing|unavailable|ambiguous|ownership could not be proven)|automation image fixture|expected fixture identity/i.test(
    message,
  );
}

function safeReason(message: string): string | undefined {
  const firstLine = message.split(/\r?\n/).find(Boolean);
  return firstLine
    ?.replace(/https?:\/\/[^\s/?#]+([^\s?#]*)[^\s]*/g, '$1')
    .replace(/[?#][^\s]*/g, '');
}

function serverErrors(message: string): RegressionEntry['serverErrors'] {
  const records: RegressionEntry['serverErrors'] = [];
  for (const match of message.matchAll(
    /HTTP (500|501|502|503|504|505) ([A-Z]+) (https?:\/\/[^\s]+|\/[^\s]+)/g,
  )) {
    let safePath = match[3];
    try {
      safePath = new URL(match[3]).pathname;
    } catch {
      safePath = match[3].split(/[?#]/)[0];
    }
    records.push({ status: Number(match[1]), method: match[2], path: safePath });
  }
  return records;
}

export default class ContentRegressionReporter implements Reporter {
  private readonly entries = new Map<string, RegressionEntry>();
  private startedAt = 0;

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startedAt = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const metadata = orderedTypes.find(([, , file]) => test.location.file.endsWith(file));
    if (!metadata) return;
    const [machineName, label] = metadata;
    const message = messageFor(result);
    const entry: RegressionEntry = {
      machineName,
      label,
      status:
        result.status === 'passed'
          ? 'passed'
          : isBlocked(message)
            ? 'blocked'
            : 'failed',
      created: false,
      updated: false,
      serverErrors: serverErrors(message),
      fatalPageDetected: /Drupal fatal page detected/i.test(message),
      reason: result.status === 'passed' ? undefined : safeReason(message),
      durationMs: result.duration,
    };

    const stdout = result.stdout
      .map((chunk) => (typeof chunk === 'string' ? chunk : chunk.toString('utf8')))
      .join('');
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.startsWith('CONTENT_REGRESSION_EVENT ')) continue;
      try {
        const event = JSON.parse(
          line.slice('CONTENT_REGRESSION_EVENT '.length),
        ) as RunnerEvent;
        if (event.machineName !== machineName) continue;
        entry.created ||= event.stage === 'created';
        entry.updated ||= event.stage === 'updated';
        entry.nodeId = Number(event.nodeId);
        entry.title = event.title;
        entry.moderation = event.moderation;
      } catch {
        entry.status = 'failed';
        entry.reason = 'The sanitized runner lifecycle event could not be parsed.';
      }
    }
    this.entries.set(machineName, entry);
  }

  onEnd(_result: FullResult): void {
    if (this.entries.size === 0) return;
    const environment = assertExplicitNonProductionEnvironment();
    const results = orderedTypes.map(([machineName, label]) =>
      this.entries.get(machineName) ?? {
        machineName,
        label,
        status: 'blocked' as const,
        created: false,
        updated: false,
        serverErrors: [],
        fatalPageDetected: false,
        reason: 'Test did not execute.',
        durationMs: 0,
      },
    );
    const totals = {
      passed: results.filter((entry) => entry.status === 'passed').length,
      failed: results.filter((entry) => entry.status === 'failed').length,
      blocked: results.filter((entry) => entry.status === 'blocked').length,
      total: results.length,
      durationMs: Date.now() - this.startedAt,
    };
    const report = { environment, generatedAt: new Date().toISOString(), totals, results };
    const outputDirectory = path.resolve(process.cwd(), 'test-results');
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(outputDirectory, 'content-regression-summary.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    const durableDirectory = path.resolve(process.cwd(), '.regression-runs');
    fs.mkdirSync(durableDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(durableDirectory, 'content-regression-created-nodes.json'),
      `${JSON.stringify(
        {
          environment,
          generatedAt: report.generatedAt,
          nodes: results
            .filter((entry) => entry.created && entry.nodeId && entry.title)
            .map((entry) => ({
              machineName: entry.machineName,
              label: entry.label,
              nodeId: entry.nodeId,
              title: entry.title,
              moderation: entry.moderation,
              created: entry.created,
              updated: entry.updated,
              status: entry.status,
            })),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    const markdown = [
      '# Drupal Content Regression',
      '',
      `Environment: ${environment}`,
      '',
      ...results.flatMap((entry) => [
        `## ${entry.label}`,
        '',
        entry.status.toUpperCase(),
        `Created: ${entry.created ? `node ${entry.nodeId}` : 'no'}`,
        `Updated: ${entry.updated ? 'yes' : 'no'}`,
        `Moderation: ${entry.moderation ?? 'not reached'}`,
        `Server errors: ${entry.serverErrors.length === 0 ? 'none' : entry.serverErrors.map((error) => `${error.status} ${error.method} ${error.path}`).join(', ')}`,
        `Fatal page: ${entry.fatalPageDetected ? 'detected' : 'none'}`,
        ...(entry.reason ? [`Reason: ${entry.reason}`] : []),
        '',
      ]),
      '## Summary',
      '',
      `Passed: ${totals.passed}`,
      `Failed: ${totals.failed}`,
      `Blocked: ${totals.blocked}`,
      `Total: ${totals.total}`,
      `Duration: ${(totals.durationMs / 1000).toFixed(1)}s`,
      '',
    ].join('\n');
    fs.writeFileSync(
      path.join(outputDirectory, 'content-regression-summary.md'),
      markdown,
      'utf8',
    );

    console.log('\nDrupal Content Regression\n');
    for (const entry of results) {
      console.log(`${entry.status.toUpperCase()} ${entry.label}`);
    }
    console.log(
      `\nPassed: ${totals.passed}\nFailed: ${totals.failed}\nBlocked: ${totals.blocked}`,
    );
  }
}
