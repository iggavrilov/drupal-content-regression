import type { Locator, Page } from '@playwright/test';
import type { ContentTypeConfig } from '../config/content-types';
import { hasAutomatedContentPrefix } from '../config/automation';
import {
  assertNoDrupalFatalPage,
  type NetworkMonitor,
} from '../diagnostics/network-monitor';
import { submitNodeForm } from '../content/node-form';
import type { PublishingSourceNode } from './source-nodes';
import { isPublishPermissionExpected } from '../config/write-safety';

export interface ModerationOption {
  label: string;
  value: string;
  selected: boolean;
  disabled: boolean;
}

export interface OwnedNodeModeration {
  form: Locator;
  currentState: string;
  options: readonly ModerationOption[];
}

export interface ModerationTransitionResult {
  from: string;
  to: string;
  value: string;
  status: 'passed';
  availableAfterTransition: readonly ModerationOption[];
}

export interface PublishingWorkflowResult {
  status: 'passed' | 'blocked';
  initialState: string;
  finalState: string;
  transitions: readonly ModerationTransitionResult[];
  publishedAvailable: boolean;
  publishedValue?: string;
  blockedReason?: string;
  publicPageLoaded: boolean;
}

export async function inspectOwnedNodeModeration(
  page: Page,
  config: ContentTypeConfig,
  source: PublishingSourceNode,
  expectedCurrentState: string,
): Promise<OwnedNodeModeration> {
  if (
    !Number.isInteger(source.nodeId) ||
    source.nodeId <= 0 ||
    source.machineName !== config.machineName ||
    !hasAutomatedContentPrefix(source.title)
  ) {
    throw new Error(`Unsafe publishing source identity for ${config.label}.`);
  }
  const response = await page.goto(`/node/${source.nodeId}/edit`, {
    waitUntil: 'domcontentloaded',
  });
  if (!response || response.status() >= 400) {
    throw new Error(
      `${config.label} source node ${source.nodeId} could not be opened.`,
    );
  }
  const form = page.locator(config.formSelector).first();
  await form.waitFor({ state: 'visible' });
  const title = form.locator(config.titleField.selector);
  if (
    (await title.count()) !== 1 ||
    (await title.inputValue()) !== source.title
  ) {
    throw new Error(
      `Exact ${config.label} source-node ownership could not be proven.`,
    );
  }
  const moderation = form.locator('select[name="moderation_state[0][state]"]');
  if ((await moderation.count()) !== 1) {
    throw new Error(
      `${config.label} moderation control was not found uniquely.`,
    );
  }
  const options = await moderation.locator('option').evaluateAll((elements) =>
    elements.map((element) => {
      const option = element as HTMLOptionElement;
      return {
        label: option.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        value: option.value,
        selected: option.selected,
        disabled: option.disabled,
      };
    }),
  );
  const selected = options.filter((option) => option.selected);
  if (
    selected.length !== 1 ||
    selected[0].label !== expectedCurrentState
  ) {
    throw new Error(
      `${config.label} expected state ${expectedCurrentState} was not present exactly.`,
    );
  }
  return { form, currentState: selected[0].label, options };
}

export async function transitionNodeModeration({
  page,
  monitor,
  config,
  source,
  expectedCurrentState,
  targetState,
}: {
  page: Page;
  monitor: NetworkMonitor;
  config: ContentTypeConfig;
  source: PublishingSourceNode;
  expectedCurrentState: string;
  targetState: string;
}): Promise<ModerationTransitionResult> {
  const inspection = await inspectOwnedNodeModeration(
    page,
    config,
    source,
    expectedCurrentState,
  );
  monitor.assertNoServerErrors();
  await assertNoDrupalFatalPage(page);
  const targets = inspection.options.filter(
    (option) =>
      !option.disabled && !option.selected && option.label === targetState,
  );
  if (targets.length !== 1 || !targets[0].value) {
    throw new Error(
      `${config.label} does not expose the expected exact ${expectedCurrentState} to ${targetState} transition.`,
    );
  }
  const moderation = inspection.form.locator(
    'select[name="moderation_state[0][state]"]',
  );
  await moderation.selectOption(targets[0].value);
  await submitNodeForm(page, inspection.form, config.label);
  monitor.assertNoServerErrors();
  await assertNoDrupalFatalPage(page);

  const persisted = await inspectOwnedNodeModeration(
    page,
    config,
    source,
    targetState,
  );
  monitor.assertNoServerErrors();
  await assertNoDrupalFatalPage(page);
  console.log(
    `PUBLISHING_EVENT ${JSON.stringify({
      machineName: config.machineName,
      nodeId: source.nodeId,
      type: 'transition',
      from: expectedCurrentState,
      to: targetState,
      status: 'passed',
      value: targets[0].value,
    })}`,
  );
  return {
    from: expectedCurrentState,
    to: targetState,
    value: targets[0].value,
    status: 'passed',
    availableAfterTransition: persisted.options,
  };
}

export async function runPublishingWorkflow(
  page: Page,
  monitor: NetworkMonitor,
  config: ContentTypeConfig,
  source: PublishingSourceNode,
): Promise<PublishingWorkflowResult> {
  const initial = await inspectOwnedNodeModeration(
    page,
    config,
    source,
    'Draft',
  );
  console.log(
    `PUBLISHING_EVENT ${JSON.stringify({
      machineName: config.machineName,
      nodeId: source.nodeId,
      type: 'initial',
      state: initial.currentState,
    })}`,
  );
  const directPublished = initial.options.some(
    (option) => !option.disabled && !option.selected && option.label === 'Published',
  );
  const inReview = initial.options.some(
    (option) => !option.disabled && !option.selected && option.label === 'In review',
  );
  const transitions: ModerationTransitionResult[] = [];
  if (directPublished) {
    transitions.push(
      await transitionNodeModeration({
        page,
        monitor,
        config,
        source,
        expectedCurrentState: 'Draft',
        targetState: 'Published',
      }),
    );
  } else if (inReview) {
    const reviewTransition = await transitionNodeModeration({
      page,
      monitor,
      config,
      source,
      expectedCurrentState: 'Draft',
      targetState: 'In review',
    });
    transitions.push(reviewTransition);
    const publishedAvailable = reviewTransition.availableAfterTransition.some(
      (option) =>
        !option.disabled && !option.selected && option.label === 'Published',
    );
    const publishedOption = reviewTransition.availableAfterTransition.find(
      (option) =>
        !option.disabled && !option.selected && option.label === 'Published',
    );
    console.log(
      `PUBLISHING_EVENT ${JSON.stringify({
        machineName: config.machineName,
        nodeId: source.nodeId,
        type: 'availability',
        target: 'Published',
        available: publishedAvailable,
        value: publishedOption?.value,
      })}`,
    );
    if (!publishedAvailable) {
      const blockedReason =
        'Published transition unavailable to automation user';
      if (isPublishPermissionExpected()) {
        throw new Error(
          `${config.label} expected a Published transition for the configured automation role, but none was available after In review.`,
        );
      }
      console.log(
        `PUBLISHING_EVENT ${JSON.stringify({
          machineName: config.machineName,
          nodeId: source.nodeId,
          type: 'blocked',
          state: 'In review',
          reason: blockedReason,
        })}`,
      );
      return {
        status: 'blocked',
        initialState: 'Draft',
        finalState: 'In review',
        transitions,
        publishedAvailable: false,
        blockedReason,
        publicPageLoaded: false,
      };
    }
    transitions.push(
      await transitionNodeModeration({
        page,
        monitor,
        config,
        source,
        expectedCurrentState: 'In review',
        targetState: 'Published',
      }),
    );
  } else {
    throw new Error(
      `${config.label} exposes neither the proven In review transition nor a direct Published transition from Draft.`,
    );
  }

  const publicResponse = await page.goto(`/node/${source.nodeId}`, {
    waitUntil: 'domcontentloaded',
  });
  if (!publicResponse || publicResponse.status() >= 400) {
    throw new Error(
      `${config.label} public node availability check failed with HTTP ${publicResponse?.status() ?? 'unknown'}.`,
    );
  }
  monitor.assertNoServerErrors();
  await assertNoDrupalFatalPage(page);
  console.log(
    `PUBLISHING_EVENT ${JSON.stringify({
      machineName: config.machineName,
      nodeId: source.nodeId,
      type: 'final',
      state: 'Published',
      publicPageLoaded: true,
    })}`,
  );
  return {
    status: 'passed',
    initialState: 'Draft',
    finalState: 'Published',
    transitions,
    publishedAvailable: true,
    publishedValue: transitions.at(-1)?.value,
    publicPageLoaded: true,
  };
}
