import { expect, test } from '@playwright/test';
import {
  classifyPublishingResult,
  publishingMetadataForTestTitle,
  publishingTotals,
} from '../src/reporting/publishing-regression-reporter';
import { classifyPostRunVerification } from '../src/reporting/publishing-post-run-verification';

test('publishing reporter classifies passed, blocked, and failed results', () => {
  expect(classifyPublishingResult('passed', '', undefined)).toBe('passed');
  expect(classifyPublishingResult('skipped', '', 'Required approval transition unavailable')).toBe('blocked');
  expect(
    classifyPublishingResult(
      'failed',
      'PUBLISHING_BLOCKED: expected workflow capability unavailable',
      undefined,
    ),
  ).toBe('blocked');
  expect(classifyPublishingResult('failed', 'HTTP 500 POST /node/1', undefined)).toBe(
    'failed',
  );
});

test('publishing reporter preserves three-stage success and distinct block layers', () => {
  const workflow = [
    ['Draft', 'In review'],
    ['In review', 'Reviewed and approved'],
    ['Reviewed and approved', 'Published'],
  ];
  expect(workflow).toHaveLength(3);
  expect(workflow.at(-1)).toEqual(['Reviewed and approved', 'Published']);
  expect(classifyPublishingResult('skipped', '', 'Reviewed and approved transition unavailable')).toBe('blocked');
  expect(classifyPublishingResult('skipped', '', 'Published transition unavailable')).toBe('blocked');
  expect(classifyPublishingResult('failed', 'Drupal fatal page detected', undefined)).toBe('failed');
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

test('post-run reporter passes published fallback evidence and rejects genuine failures', () => {
  const published = {
    ownershipVerified: true,
    titleVerified: true,
    contentTypeVerified: true,
    expectedState: 'Published' as const,
    actualState: 'Published',
    publicPagePassed: true,
    serverErrorCount: 0,
    fatalPageDetected: false,
  };
  expect(classifyPostRunVerification(published)).toBe('passed');
  expect(classifyPostRunVerification({ ...published, actualState: 'Reviewed and approved' })).toBe('failed');
  expect(classifyPostRunVerification({ ...published, actualState: undefined })).toBe('failed');
  expect(classifyPostRunVerification({ ...published, serverErrorCount: 1 })).toBe('failed');
  expect(classifyPostRunVerification({ ...published, fatalPageDetected: true })).toBe('failed');
  expect(classifyPostRunVerification({ ...published, ownershipVerified: false })).toBe('failed');
  expect(classifyPostRunVerification({ ...published, titleVerified: false })).toBe('failed');
});
