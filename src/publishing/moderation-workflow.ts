import type { Locator, Page, Response } from '@playwright/test';
import type { ContentTypeConfig } from '../config/content-types';
import { hasAutomatedContentPrefix } from '../config/automation';
import { getRequiredEnvironmentVariable } from '../config/environments';
import { isPublishPermissionExpected } from '../config/write-safety';
import { assertNoDrupalFatalPage, type NetworkMonitor } from '../diagnostics/network-monitor';
import type { PublishingSourceNode } from './source-nodes';

export const moderationSelectors = {
  form: 'form.content-moderation-entity-moderation-form, form[id^="content-moderation-entity-moderation-form"]',
  currentState: '.entity-moderation-form__item:first-child',
  transition: 'select[name="new_state"]',
  logMessage: 'input[name="revision_log"]',
  apply: 'input[name="op"][value="Apply"], button[name="op"][value="Apply"]',
} as const;

export const WORKFLOW_STATES = ['Draft', 'In review', 'Reviewed and approved', 'Published'] as const;
export const WORKFLOW_LOG_MESSAGES: Readonly<Record<string, string>> = {
  'In review': 'QA-AUTOMATED: submit for review',
  'Reviewed and approved': 'QA-AUTOMATED: review approved',
  Published: 'QA-AUTOMATED: publish',
};

export interface ModerationOption { label: string; value: string; selected: boolean; disabled: boolean }
export interface AssignmentControl {
  label: string;
  selector: string;
  name: string;
  widgetType: 'autocomplete' | 'select' | 'text';
  required: boolean;
}
export interface OwnedNodeModeration {
  form: Locator;
  currentState: string;
  options: readonly ModerationOption[];
  logMessageRequired: boolean;
  assignmentControls: readonly AssignmentControl[];
}
export interface ModerationTransitionResult {
  from: string;
  to: string;
  value: string;
  status: 'passed';
  assignmentRequired: boolean;
  assignmentResult: 'not required' | 'resolved';
  logMessageResult: 'populated' | 'not required';
  availableAfterTransition: readonly ModerationOption[];
}
export interface PublishingWorkflowResult {
  status: 'passed' | 'blocked';
  initialState: string;
  finalState: string;
  transitions: readonly ModerationTransitionResult[];
  publishedAvailable?: boolean;
  publishedValue?: string;
  blockedReason?: string;
  publicPageLoaded: boolean;
}
export interface WorkflowAssigneeResolution {
  suggestionsReturned: number;
  exactMatches: number;
  numericTargetIdResolved: boolean;
  numericTargetIdMatches: boolean;
  usernameMatches: boolean;
}
export interface WorkflowAssigneeSuggestionDiagnostic {
  label: string;
  containsSearchText: boolean;
  numericIdInParentheses: boolean;
  numericIdElsewhere: boolean;
  emailLikeText: boolean;
  displayNameBeforeSearchText: boolean;
  hasParentheses: boolean;
  hasComma: boolean;
  hasHyphenSeparator: boolean;
  normalizedLength: number;
  tag: string;
  role?: string;
  visibleLabelSource: 'textContent';
  identityAttributes: Readonly<Record<string, string>>;
  hiddenValues: readonly string[];
  machineValue?: string;
}
export interface WorkflowAssigneeDiagnostic {
  suggestions: readonly WorkflowAssigneeSuggestionDiagnostic[];
  selectedCandidateInputValue: string;
  selectedValueDiffersFromRenderedLabel: boolean;
  selectedValueNumericId?: string;
}

class PublishingBlockedError extends Error {
  constructor(message: string) { super(`PUBLISHING_BLOCKED: ${message}`); }
}

function workflowAssigneeConfiguration(): { search: string; expected: string; expectedId: string } {
  const search = process.env.DRUPAL_WORKFLOW_ASSIGNEE_SEARCH?.trim();
  const expected = process.env.DRUPAL_WORKFLOW_ASSIGNEE_EXPECTED?.trim();
  const expectedId = process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID?.trim();
  if (!search || !expected || !expectedId) throw new PublishingBlockedError('workflow assignee search, expected label, and expected numeric ID are required');
  if (!/^\d+$/.test(expectedId)) throw new PublishingBlockedError('configured workflow assignee ID must contain digits only');
  return { search, expected, expectedId };
}

function css(value: string): string { return value.replace(/(["\\])/g, '\\$1'); }

async function discoverAssignmentControls(form: Locator): Promise<AssignmentControl[]> {
  const candidates = form.locator('input[name]:not([type="hidden"]):not([type="submit"]), select[name]');
  const controls: AssignmentControl[] = [];
  for (let i = 0; i < await candidates.count(); i += 1) {
    const candidate = candidates.nth(i);
    const name = (await candidate.getAttribute('name')) ?? '';
    if (!name || name === 'new_state' || name === 'op') continue;
    const id = await candidate.getAttribute('id');
    const label = id ? ((await form.locator(`label[for="${css(id)}"]`).textContent()) ?? '').replace(/\s+/g, ' ').replace(/\*$/, '').trim() : '';
    if (!/select user/i.test(label)) continue;
    const tag = await candidate.evaluate((element) => element.tagName.toLowerCase());
    const widgetType = tag === 'select' ? 'select' : (await candidate.getAttribute('data-autocomplete-path')) ? 'autocomplete' : 'text';
    controls.push({
      label,
      selector: `${tag}[name="${css(name)}"]`,
      name,
      widgetType,
      required: (await candidate.getAttribute('required')) !== null || (await candidate.getAttribute('aria-required')) === 'true',
    });
  }
  return controls;
}

async function openOwnedNodeView(page: Page, config: ContentTypeConfig, source: PublishingSourceNode): Promise<void> {
  if (!Number.isInteger(source.nodeId) || source.nodeId <= 0 || source.machineName !== config.machineName || !hasAutomatedContentPrefix(source.title)) {
    throw new Error(`Unsafe publishing source identity for ${config.label}.`);
  }
  const response = await page.goto(`/node/${source.nodeId}`, { waitUntil: 'domcontentloaded' });
  if (!response || response.status() >= 400) throw new Error(`${config.label} source node ${source.nodeId} could not be opened.`);
  const heading = page.getByRole('heading', { level: 1, name: source.title, exact: true });
  if ((await heading.count()) !== 1) {
    const editResponse = await page.goto(`/node/${source.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    const editForm = page.locator(config.formSelector);
    const title = editForm.locator(config.titleField.selector);
    if (!editResponse || editResponse.status() >= 400 || (await editForm.count()) !== 1 || (await title.count()) !== 1 || (await title.inputValue()) !== source.title) {
      throw new Error(`Exact ${config.label} source-node ownership could not be proven.`);
    }
    const viewResponse = await page.goto(`/node/${source.nodeId}`, { waitUntil: 'domcontentloaded' });
    if (!viewResponse || viewResponse.status() >= 400) throw new Error(`${config.label} exact node view could not be reopened.`);
  }
}

export async function inspectOwnedNodeModeration(
  page: Page,
  config: ContentTypeConfig,
  source: PublishingSourceNode,
  expectedCurrentState?: string,
): Promise<OwnedNodeModeration> {
  await openOwnedNodeView(page, config, source);
  let form = page.locator(moderationSelectors.form);
  let currentStateSelector: string = moderationSelectors.currentState;
  let transitionSelector: string = moderationSelectors.transition;
  if ((await form.count()) === 0) {
    const editResponse = await page.goto(`/node/${source.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    form = page.locator(config.formSelector);
    const title = form.locator(config.titleField.selector);
    if (!editResponse || editResponse.status() >= 400 || (await form.count()) !== 1 || (await title.count()) !== 1 || (await title.inputValue()) !== source.title) {
      throw new Error(`Exact ${config.label} published-state ownership could not be proven.`);
    }
    currentStateSelector = '.field--name-moderation-state, [data-drupal-selector*="moderation-state"]';
    transitionSelector = 'select[name="moderation_state[0][state]"]';
  }
  if ((await form.count()) !== 1) throw new Error(`${config.label} moderation form was not found uniquely.`);
  const select = form.locator(transitionSelector);
  if ((await select.count()) !== 1) throw new Error(`${config.label} Change to control was not found uniquely.`);
  const options = await select.locator('option').evaluateAll((elements) => elements.map((element) => {
    const option = element as HTMLOptionElement;
    return { label: option.textContent?.replace(/\s+/g, ' ').trim() ?? '', value: option.value, selected: option.selected, disabled: option.disabled };
  }));
  const currentText = ((await form.locator(currentStateSelector).first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
  const explicitCurrentState = /Current state\s+(Draft|In review|Reviewed and approved|Published)\b/.exec(currentText)?.[1];
  const currentState = explicitCurrentState ?? WORKFLOW_STATES.find((state) => currentText.includes(state));
  if (!currentState || (expectedCurrentState && currentState !== expectedCurrentState)) {
    throw new Error(`${config.label} expected state ${expectedCurrentState ?? '(discoverable)'} was not present exactly; actual state was ${currentState ?? 'unknown'}.`);
  }
  if (currentState === 'Published') {
    return {
      form,
      currentState,
      options,
      logMessageRequired: false,
      assignmentControls: [],
    };
  }
  const log = form.locator(moderationSelectors.logMessage);
  return {
    form,
    currentState,
    options,
    logMessageRequired: (await log.count()) === 1 && ((await log.getAttribute('required')) !== null || (await log.getAttribute('aria-required')) === 'true'),
    assignmentControls: await discoverAssignmentControls(form),
  };
}

async function populateAssignment(page: Page, form: Locator, control: AssignmentControl): Promise<WorkflowAssigneeResolution> {
  const { search, expected, expectedId } = workflowAssigneeConfiguration();
  const field = form.locator(control.selector);
  if ((await field.count()) !== 1) throw new PublishingBlockedError(`${control.label} was not found uniquely.`);
  if (control.widgetType === 'select') {
    const values = await field.locator('option').evaluateAll((options, exact) => options.filter((option) => (option.textContent ?? '').replace(/\s+/g, ' ').trim() === exact && !(option as HTMLOptionElement).disabled).map((option) => (option as HTMLOptionElement).value), expected);
    if (values.length !== 1 || !values[0]) throw new PublishingBlockedError(`${control.label} could not resolve the exact configured workflow assignee.`);
    await field.selectOption(values[0]);
    return { suggestionsReturned: values.length, exactMatches: 1, numericTargetIdResolved: true, numericTargetIdMatches: true, usernameMatches: true };
  }
  if (control.widgetType !== 'autocomplete') throw new PublishingBlockedError(`${control.label} uses an unsupported assignment widget.`);
  await field.fill('');
  await field.fill(search);
  const suggestions = page.locator('ul.ui-autocomplete:visible li.ui-menu-item');
  try {
    await suggestions.first().waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    throw new PublishingBlockedError('workflow assignee search returned no suggestions');
  }
  const labels = await suggestions.evaluateAll((elements) => elements.map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim()));
  console.log(`autocomplete suggestions returned: ${labels.length}`);
  if (labels.length === 0) throw new PublishingBlockedError('workflow assignee search returned no suggestions');
  const exactIndexes = labels.map((label, index) => label === expected ? index : -1).filter((index) => index >= 0);
  console.log(`exact expected matches: ${exactIndexes.length}`);
  if (exactIndexes.length === 0) throw new PublishingBlockedError('configured expected assignee was not present');
  if (exactIndexes.length > 1) throw new PublishingBlockedError('configured expected assignee matched more than one result');
  await suggestions.nth(exactIndexes[0]).click();
  const resolved = (await field.inputValue()).trim();
  const resolvedIdentity = /^(.*\S)\s+\((\d+)\)$/.exec(resolved);
  if (!resolvedIdentity || !/^\d+$/.test(resolvedIdentity[2])) {
    throw new PublishingBlockedError('resolved assignee value did not contain a numeric entity ID');
  }
  if (resolvedIdentity[1] !== expected) throw new PublishingBlockedError('resolved assignee username did not equal the exact expected rendered label');
  if (resolvedIdentity[2] !== expectedId) throw new PublishingBlockedError('resolved assignee numeric entity ID did not equal the configured expected ID');
  console.log('numeric target ID resolved: yes');
  return { suggestionsReturned: labels.length, exactMatches: exactIndexes.length, numericTargetIdResolved: true, numericTargetIdMatches: true, usernameMatches: true };
}

export async function verifyWorkflowAssigneeReadOnly(page: Page, inspection: OwnedNodeModeration): Promise<WorkflowAssigneeResolution> {
  const controls = inspection.assignmentControls.filter((control) => control.widgetType === 'autocomplete');
  if (controls.length !== 1) throw new PublishingBlockedError('The current moderation form did not expose one unique assignment autocomplete.');
  const transition = inspection.form.locator(moderationSelectors.transition);
  const originalValue = await transition.inputValue();
  const field = inspection.form.locator(controls[0].selector);
  try {
    if (!await field.isVisible()) {
      const currentIndex = WORKFLOW_STATES.indexOf(inspection.currentState as typeof WORKFLOW_STATES[number]);
      const nextState = WORKFLOW_STATES[currentIndex + 1];
      const exact = inspection.options.filter((option) => !option.disabled && option.label === nextState && option.value);
      if (exact.length !== 1) throw new PublishingBlockedError('The exact forward transition needed to expose the assignment field was unavailable.');
      await transition.selectOption(exact[0].value);
      await field.waitFor({ state: 'visible' });
    }
    const result = await populateAssignment(page, inspection.form, controls[0]);
    await field.fill('');
    return result;
  } finally {
    await transition.selectOption(originalValue);
  }
}

export async function diagnoseWorkflowAssigneeReadOnly(page: Page, inspection: OwnedNodeModeration): Promise<WorkflowAssigneeDiagnostic> {
  const { search } = workflowAssigneeConfiguration();
  const controls = inspection.assignmentControls.filter((control) => control.widgetType === 'autocomplete');
  if (controls.length !== 1) throw new PublishingBlockedError('The current moderation form did not expose one unique assignment autocomplete.');
  const transition = inspection.form.locator(moderationSelectors.transition);
  const originalValue = await transition.inputValue();
  const field = inspection.form.locator(controls[0].selector);
  try {
    if (!await field.isVisible()) {
      const currentIndex = WORKFLOW_STATES.indexOf(inspection.currentState as typeof WORKFLOW_STATES[number]);
      const nextState = WORKFLOW_STATES[currentIndex + 1];
      const exact = inspection.options.filter((option) => !option.disabled && option.label === nextState && option.value);
      if (exact.length !== 1) throw new PublishingBlockedError('The exact forward transition needed to expose the assignment field was unavailable.');
      await transition.selectOption(exact[0].value);
      await field.waitFor({ state: 'visible' });
    }
    await field.fill('');
    await field.fill(search);
    const items = page.locator('ul.ui-autocomplete:visible li.ui-menu-item');
    await items.first().waitFor({ state: 'visible', timeout: 10_000 });
    const raw = await items.evaluateAll((elements) => elements.map((element) => {
      const attributes: Record<string, string> = {};
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name === 'role' || attribute.name === 'data-value' || attribute.name === 'data-autocomplete-value' || attribute.name === 'aria-selected') attributes[attribute.name] = attribute.value;
      }
      const identityElement = element.querySelector('[data-autocomplete-value], [data-value]');
      if (identityElement) {
        for (const name of ['data-autocomplete-value', 'data-value']) {
          const value = identityElement.getAttribute(name);
          if (value !== null) attributes[name] = value;
        }
      }
      return {
        label: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') ?? undefined,
        attributes,
        hiddenValues: Array.from(element.querySelectorAll('input[type="hidden"]')).map((input) => (input as HTMLInputElement).value),
      };
    }));
    const suggestions = raw.map((item) => {
      const withoutParentheticalId = item.label.replace(/\(\d+\)/g, '');
      const searchIndex = item.label.toLocaleLowerCase().indexOf(search.toLocaleLowerCase());
      return {
        label: item.label,
        containsSearchText: searchIndex >= 0,
        numericIdInParentheses: /\(\d+\)/.test(item.label),
        numericIdElsewhere: /\d+/.test(withoutParentheticalId),
        emailLikeText: /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(item.label),
        displayNameBeforeSearchText: searchIndex > 0 && /[\p{L}\p{N}]/u.test(item.label.slice(0, searchIndex)),
        hasParentheses: /[()]/.test(item.label),
        hasComma: item.label.includes(','),
        hasHyphenSeparator: /\s[-–—]\s/.test(item.label),
        normalizedLength: item.label.length,
        tag: item.tag,
        role: item.role,
        visibleLabelSource: 'textContent' as const,
        identityAttributes: item.attributes,
        hiddenValues: item.hiddenValues,
        machineValue: item.attributes['data-autocomplete-value'] ?? item.attributes['data-value'],
      };
    });
    if (suggestions.length !== 2) throw new PublishingBlockedError('The diagnostic expected exactly two autocomplete suggestions.');
    await items.nth(0).click();
    const selectedCandidateInputValue = (await field.inputValue()).trim();
    const selectedValueNumericId = /\((\d+)\)\s*$/.exec(selectedCandidateInputValue)?.[1];
    await field.fill('');
    return {
      suggestions,
      selectedCandidateInputValue,
      selectedValueDiffersFromRenderedLabel: selectedCandidateInputValue !== suggestions[0].label,
      selectedValueNumericId,
    };
  } finally {
    if (await field.isVisible()) await field.fill('');
    await transition.selectOption(originalValue);
  }
}

async function submitOnce(page: Page, form: Locator, label: string): Promise<Response> {
  const apply = form.locator(moderationSelectors.apply);
  if ((await apply.count()) !== 1) throw new Error(`${label} moderation Apply control was not found uniquely.`);
  const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.request().isNavigationRequest());
  await apply.click();
  const response = await responsePromise;
  await page.waitForLoadState('domcontentloaded');
  if (response.status() >= 400) throw new Error(`${label} moderation request failed with HTTP ${response.status()}.`);
  return response;
}

export async function transitionNodeModeration({ page, monitor, config, source, expectedCurrentState, targetState }: {
  page: Page; monitor: NetworkMonitor; config: ContentTypeConfig; source: PublishingSourceNode; expectedCurrentState: string; targetState: string;
}): Promise<ModerationTransitionResult> {
  const inspection = await inspectOwnedNodeModeration(page, config, source, expectedCurrentState);
  monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
  const targets = inspection.options.filter((option) => !option.disabled && !option.selected && option.label === targetState);
  if (targets.length !== 1 || !targets[0].value) {
    const available = inspection.options.filter((option) => !option.disabled && option.value).map((option) => option.label).join(', ') || 'none';
    throw new PublishingBlockedError(`${config.label} does not expose the exact ${expectedCurrentState} → ${targetState} transition; available transitions: ${available}.`);
  }
  await inspection.form.locator(moderationSelectors.transition).selectOption(targets[0].value);
  const assignments: AssignmentControl[] = [];
  for (const control of await discoverAssignmentControls(inspection.form)) {
    if (control.required || await inspection.form.locator(control.selector).isVisible()) assignments.push(control);
  }
  const assignmentResolutions: WorkflowAssigneeResolution[] = [];
  for (const assignment of assignments) assignmentResolutions.push(await populateAssignment(page, inspection.form, assignment));
  const log = inspection.form.locator(moderationSelectors.logMessage);
  let logMessageResult: 'populated' | 'not required' = 'not required';
  if ((await log.count()) === 1 && await log.isVisible()) {
    const message = WORKFLOW_LOG_MESSAGES[targetState];
    if (!message) throw new PublishingBlockedError(`No automation-owned log message is configured for ${targetState}.`);
    await log.fill(message);
    logMessageResult = 'populated';
  } else if (inspection.logMessageRequired) throw new PublishingBlockedError(`Required Log message is unavailable for ${expectedCurrentState} → ${targetState}.`);
  await submitOnce(page, inspection.form, config.label);
  monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
  const persisted = await inspectOwnedNodeModeration(page, config, source, targetState);
  monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
  const assignmentRequired = assignments.length > 0;
  console.log(`PUBLISHING_EVENT ${JSON.stringify({ machineName: config.machineName, nodeId: source.nodeId, type: 'transition', from: expectedCurrentState, to: targetState, status: 'passed', value: targets[0].value, logMessageResult, assignmentRequired, assignmentResult: assignmentRequired ? 'resolved' : 'not required', assignmentExactLabelVerified: assignmentRequired ? assignmentResolutions.every((result) => result.exactMatches === 1 && result.usernameMatches) : undefined, assignmentNumericIdVerified: assignmentRequired ? assignmentResolutions.every((result) => result.numericTargetIdMatches) : undefined })}`);
  return { from: expectedCurrentState, to: targetState, value: targets[0].value, status: 'passed', logMessageResult, assignmentRequired, assignmentResult: assignmentRequired ? 'resolved' : 'not required', availableAfterTransition: persisted.options };
}

export async function runPublishingWorkflow(page: Page, monitor: NetworkMonitor, config: ContentTypeConfig, source: PublishingSourceNode): Promise<PublishingWorkflowResult> {
  const initial = await inspectOwnedNodeModeration(page, config, source);
  console.log(`PUBLISHING_EVENT ${JSON.stringify({ machineName: config.machineName, nodeId: source.nodeId, type: 'initial', state: initial.currentState })}`);
  const transitions: ModerationTransitionResult[] = [];
  let currentState = initial.currentState;
  try {
    while (currentState !== 'Published') {
      const index = WORKFLOW_STATES.indexOf(currentState as typeof WORKFLOW_STATES[number]);
      const target = WORKFLOW_STATES[index + 1];
      if (index < 0 || !target) throw new PublishingBlockedError(`No proven next workflow state is configured after ${currentState}.`);
      transitions.push(await transitionNodeModeration({ page, monitor, config, source, expectedCurrentState: currentState, targetState: target }));
      currentState = target;
    }
  } catch (error) {
    if (!(error instanceof PublishingBlockedError)) throw error;
    const reason = error.message.replace(/^PUBLISHING_BLOCKED:\s*/, '');
    const publicationStage = currentState === 'Reviewed and approved';
    const nextTarget = WORKFLOW_STATES[WORKFLOW_STATES.indexOf(currentState as typeof WORKFLOW_STATES[number]) + 1];
    if (publicationStage && isPublishPermissionExpected()) throw new Error(`${config.label} expected Published from Reviewed and approved, but it was unavailable: ${reason}`);
    console.log(`PUBLISHING_EVENT ${JSON.stringify({ machineName: config.machineName, nodeId: source.nodeId, type: 'blocked', state: currentState, target: nextTarget, reason })}`);
    return { status: 'blocked', initialState: initial.currentState, finalState: currentState, transitions, publishedAvailable: publicationStage ? false : undefined, blockedReason: reason, publicPageLoaded: false };
  }
  const response = await page.goto(`/node/${source.nodeId}`, { waitUntil: 'domcontentloaded' });
  if (!response || response.status() >= 400) throw new Error(`${config.label} public node availability check failed with HTTP ${response?.status() ?? 'unknown'}.`);
  monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
  console.log(`PUBLISHING_EVENT ${JSON.stringify({ machineName: config.machineName, nodeId: source.nodeId, type: 'final', state: 'Published', publicPageLoaded: true })}`);
  return { status: 'passed', initialState: initial.currentState, finalState: 'Published', transitions, publishedAvailable: true, publishedValue: transitions.at(-1)?.value, publicPageLoaded: true };
}
