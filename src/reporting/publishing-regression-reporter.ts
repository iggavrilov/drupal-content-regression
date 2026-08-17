import fs from 'node:fs';
import path from 'node:path';
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { assertExplicitNonProductionEnvironment } from '../config/write-safety';

export type ResultStatus = 'passed' | 'failed' | 'blocked';

interface TransitionResult {
  from: string;
  to: string;
  value?: string;
  status: 'passed' | 'failed' | 'blocked';
}

interface PublishingResult {
  machineName: string;
  label: string;
  nodeId?: number;
  status: ResultStatus;
  initialState?: string;
  transitions: TransitionResult[];
  finalState?: string;
  publishedTransitionAvailable?: boolean;
  publishedTransitionValue?: string;
  blockedReason?: string;
  publicPageLoaded: boolean;
  serverErrors: Array<{ status: number; method: string; path: string }>;
  fatalPageDetected: boolean;
  reason?: string;
  durationMs: number;
}

interface PublishingEvent {
  machineName: string;
  nodeId: number;
  type: 'initial' | 'transition' | 'availability' | 'blocked' | 'final';
  state?: string;
  from?: string;
  to?: string;
  status?: 'passed';
  value?: string;
  target?: string;
  available?: boolean;
  publicPageLoaded?: boolean;
  reason?: string;
}

const orderedTypes = [
  ['page', 'Basic page'],
  ['landing_page', 'Landing page'],
  ['statistic', 'Statistic'],
  ['author', 'Author'],
  ['insight_external', 'Insight (external)'],
  ['insight', 'Insight'],
  ['insight_search', 'Insight Search Filter Page'],
] as const;

export function publishingMetadataForTestTitle(
  title: string,
): (typeof orderedTypes)[number] | undefined {
  return orderedTypes.find(
    ([machineName, label]) =>
      title ===
      `[${machineName}] ${label} exact regression node can complete publishing workflow`,
  );
}

export function classifyPublishingResult(
  playwrightStatus: TestResult['status'],
  error: string,
  publishedAvailable: boolean | undefined,
): ResultStatus {
  if (playwrightStatus === 'passed') return 'passed';
  if (
    (playwrightStatus === 'skipped' && publishedAvailable === false) ||
    /PUBLISHING_BLOCKED:/i.test(error)
  ) {
    return 'blocked';
  }
  return 'failed';
}

export function publishingTotals(
  results: ReadonlyArray<{ status: ResultStatus }>,
): { passed: number; failed: number; blocked: number; total: number } {
  return {
    passed: results.filter((entry) => entry.status === 'passed').length,
    failed: results.filter((entry) => entry.status === 'failed').length,
    blocked: results.filter((entry) => entry.status === 'blocked').length,
    total: results.length,
  };
}

function combinedError(result: TestResult): string {
  return result.errors.map((error) => error.message ?? '').join('\n');
}

function safeReason(message: string): string | undefined {
  return message
    .split(/\r?\n/)
    .find(Boolean)
    ?.replace(/https?:\/\/[^\s/?#]+([^\s?#]*)[^\s]*/g, '$1')
    .replace(/[?#][^\s]*/g, '');
}

function extractServerErrors(
  message: string,
): PublishingResult['serverErrors'] {
  const records: PublishingResult['serverErrors'] = [];
  for (const match of message.matchAll(
    /HTTP (500|501|502|503|504|505) ([A-Z]+) (https?:\/\/[^\s]+|\/[^\s]+)/g,
  )) {
    let safePath = match[3].split(/[?#]/)[0];
    try {
      safePath = new URL(match[3]).pathname;
    } catch {
      // Relative paths are already sanitized above.
    }
    records.push({ status: Number(match[1]), method: match[2], path: safePath });
  }
  return records;
}

export default class PublishingRegressionReporter implements Reporter {
  private readonly results = new Map<string, PublishingResult>();
  private startedAt = Date.now();

  onTestEnd(test: TestCase, result: TestResult): void {
    const metadata = publishingMetadataForTestTitle(test.title);
    if (!metadata) return;
    const [machineName, label] = metadata;
    const error = combinedError(result);
    const publishingResult: PublishingResult = {
      machineName,
      label,
      status: 'failed',
      transitions: [],
      publicPageLoaded: false,
      serverErrors: extractServerErrors(error),
      fatalPageDetected: /Drupal fatal page detected/i.test(error),
      reason: result.status === 'passed' ? undefined : safeReason(error),
      durationMs: result.duration,
    };
    const stdout = result.stdout
      .map((chunk) => (typeof chunk === 'string' ? chunk : chunk.toString('utf8')))
      .join('');
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.startsWith('PUBLISHING_EVENT ')) continue;
      try {
        const event = JSON.parse(
          line.slice('PUBLISHING_EVENT '.length),
        ) as PublishingEvent;
        if (event.machineName !== machineName) continue;
        publishingResult.nodeId = event.nodeId;
        if (event.type === 'initial') {
          publishingResult.initialState = event.state;
          publishingResult.finalState = event.state;
        }
        if (event.type === 'transition' && event.from && event.to) {
          publishingResult.transitions.push({
            from: event.from,
            to: event.to,
            value: event.value,
            status: event.status ?? 'passed',
          });
          publishingResult.finalState = event.to;
        }
        if (event.type === 'availability' && event.target === 'Published') {
          publishingResult.publishedTransitionAvailable = event.available;
          publishingResult.publishedTransitionValue = event.value;
        }
        if (event.type === 'blocked') {
          publishingResult.finalState = event.state;
          publishingResult.blockedReason = event.reason;
        }
        if (event.type === 'final') {
          publishingResult.finalState = event.state;
          publishingResult.publicPageLoaded = event.publicPageLoaded === true;
        }
      } catch {
        publishingResult.status = 'failed';
        publishingResult.reason = 'A sanitized publishing lifecycle event could not be parsed.';
      }
    }
    publishingResult.status = classifyPublishingResult(
      result.status,
      error,
      publishingResult.publishedTransitionAvailable,
    );
    if (publishingResult.status === 'blocked') {
      publishingResult.blockedReason ??=
        'Published transition unavailable to automation user';
      publishingResult.reason = undefined;
    }
    this.results.set(machineName, publishingResult);
  }

  onEnd(_result: FullResult): void {
    if (this.results.size === 0) return;
    const environment = assertExplicitNonProductionEnvironment();
    const results = orderedTypes.map(([machineName, label]) =>
      this.results.get(machineName) ?? {
        machineName,
        label,
        status: 'blocked' as const,
        transitions: [],
        publicPageLoaded: false,
        serverErrors: [],
        fatalPageDetected: false,
        reason: 'Test did not execute.',
        durationMs: 0,
      },
    );
    const statusTotals = publishingTotals(results);
    const totals = {
      ...statusTotals,
      durationMs: Date.now() - this.startedAt,
    };
    const capability = {
      draftToInReview:
        results.every((entry) =>
          entry.transitions.some(
            (transition) =>
              transition.from === 'Draft' &&
              transition.to === 'In review' &&
              transition.status === 'passed',
          ),
        )
          ? 'supported'
          : 'mixed',
      inReviewToPublished: results.every(
        (entry) => entry.publishedTransitionAvailable === false,
      )
        ? 'not permitted'
        : results.every(
              (entry) => entry.publishedTransitionAvailable === true,
            )
          ? 'supported'
          : 'mixed',
    };
    const report = {
      environment,
      generatedAt: new Date().toISOString(),
      totals,
      capability,
      results,
    };
    const outputDirectory = path.resolve(process.cwd(), 'test-results');
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(outputDirectory, 'publishing-regression-summary.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    const markdown = [
      '# Drupal Publishing Regression',
      '',
      `Environment: ${environment}`,
      '',
      '## Publishing capability',
      '',
      `Draft → In review: ${capability.draftToInReview}`,
      `In review → Published: ${capability.inReviewToPublished}`,
      '',
      ...results.flatMap((entry) => [
        `## ${entry.label}`,
        '',
        entry.status.toUpperCase(),
        `Node: ${entry.nodeId ?? 'not reached'}`,
        `Initial state: ${entry.initialState ?? 'not reached'}`,
        ...(entry.transitions.length > 0
          ? entry.transitions.map(
              (transition) =>
                `${transition.from} → ${transition.to}: ${transition.status.toUpperCase()}${transition.value ? ` (value: ${transition.value})` : ''}`,
            )
          : ['Transitions: none']),
        `Final state: ${entry.finalState ?? 'not reached'}`,
        `Published available: ${entry.publishedTransitionAvailable === undefined ? 'not inspected' : entry.publishedTransitionAvailable ? 'yes' : 'no'}`,
        ...(entry.publishedTransitionValue
          ? [`Published value: ${entry.publishedTransitionValue}`]
          : []),
        `Public page: ${entry.publicPageLoaded ? 'available' : 'not verified'}`,
        `Server errors: ${entry.serverErrors.length === 0 ? 'none' : entry.serverErrors.map((error) => `${error.status} ${error.method} ${error.path}`).join(', ')}`,
        `Fatal page: ${entry.fatalPageDetected ? 'detected' : 'none'}`,
        ...(entry.reason ? [`Reason: ${entry.reason}`] : []),
        ...(entry.blockedReason
          ? [`Blocked reason: ${entry.blockedReason}`]
          : []),
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
      path.join(outputDirectory, 'publishing-regression-summary.md'),
      markdown,
      'utf8',
    );

    console.log('\nDrupal Publishing Regression\n');
    for (const entry of results) {
      console.log(`${entry.status === 'passed' ? 'PASS' : entry.status.toUpperCase()} ${entry.label}`);
      for (const transition of entry.transitions) {
        console.log(
          `  ${transition.from} → ${transition.to}: ${transition.status.toUpperCase()}`,
        );
      }
      console.log(`  Final: ${entry.finalState ?? 'not reached'}`);
    }
    console.log(
      `\nPassed: ${totals.passed}\nFailed: ${totals.failed}\nBlocked: ${totals.blocked}`,
    );
  }
}
