import { expect, test } from '@playwright/test';
import {
  classifyPublishingResult,
  publishingMetadataForTestTitle,
  publishingTotals,
} from '../src/reporting/publishing-regression-reporter';

test('publishing reporter classifies passed, blocked, and failed results', () => {
  expect(classifyPublishingResult('passed', '', true)).toBe('passed');
  expect(classifyPublishingResult('skipped', '', false)).toBe('blocked');
  expect(
    classifyPublishingResult(
      'failed',
      'PUBLISHING_BLOCKED: expected workflow capability unavailable',
      undefined,
    ),
  ).toBe('blocked');
  expect(classifyPublishingResult('failed', 'HTTP 500 POST /node/1', true)).toBe(
    'failed',
  );
});

test('publishing reporter attributes Insight variants by exact machine identifier', () => {
  expect(
    publishingMetadataForTestTitle(
      '[insight] Insight exact regression node can complete publishing workflow',
    )?.[0],
  ).toBe('insight');
  expect(
    publishingMetadataForTestTitle(
      '[insight_external] Insight (external) exact regression node can complete publishing workflow',
    )?.[0],
  ).toBe('insight_external');
  expect(
    publishingMetadataForTestTitle(
      '[insight_search] Insight Search Filter Page exact regression node can complete publishing workflow',
    )?.[0],
  ).toBe('insight_search');
});

test('publishing reporter totals preserve blocked status separately', () => {
  expect(
    publishingTotals([
      { status: 'passed' },
      { status: 'failed' },
      { status: 'blocked' },
      { status: 'blocked' },
    ]),
  ).toEqual({ passed: 1, failed: 1, blocked: 2, total: 4 });
});
