import type { SelectedDrupalTarget, WorkflowAssigneeConfig } from '../config/environments';

export interface AssigneeCandidate { username: string; entityId?: string }
export interface WorkflowPreSubmitInput {
  selectedTarget: SelectedDrupalTarget;
  currentOrigin: string;
  assigneeRequired: boolean;
  selectedAssignees: readonly AssigneeCandidate[];
  unresolvedAutocomplete: boolean;
}

export function selectExpectedAssigneeCandidate(
  expected: WorkflowAssigneeConfig,
  candidates: readonly AssigneeCandidate[],
): number {
  const exactUsername = candidates.map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.username === expected.username);
  if (exactUsername.length === 0) throw new Error('PUBLISHING_BLOCKED: configured expected assignee was not present exactly');
  const identitiesExposed = exactUsername.some(({ candidate }) => candidate.entityId !== undefined);
  const exactEntity = exactUsername.filter(({ candidate }) => candidate.entityId === expected.id);
  if (identitiesExposed) {
    if (exactEntity.length !== 1) throw new Error('PUBLISHING_BLOCKED: expected assignee entity identity was absent or ambiguous');
    return exactEntity[0].index;
  }
  if (exactUsername.length !== 1) throw new Error('PUBLISHING_BLOCKED: expected assignee username was ambiguous without a provable entity ID');
  return exactUsername[0].index;
}

export function assertWorkflowPreSubmitGuard(input: WorkflowPreSubmitInput): void {
  const { selectedTarget, currentOrigin, assigneeRequired, selectedAssignees, unresolvedAutocomplete } = input;
  if (currentOrigin !== selectedTarget.baseUrl) throw new Error('PUBLISHING_BLOCKED: current origin does not match the selected target');
  if (unresolvedAutocomplete) throw new Error('PUBLISHING_BLOCKED: unresolved autocomplete state remains before submit');
  const expected = selectedTarget.workflowAssignee;
  if (!assigneeRequired) {
    if (selectedAssignees.length !== 0) throw new Error('PUBLISHING_BLOCKED: workflow does not require an assignee but a user is selected');
    return;
  }
  if (!expected) throw new Error('PUBLISHING_BLOCKED: workflow requires an assignee but the selected target configures none');
  if (selectedAssignees.length !== 1) throw new Error('PUBLISHING_BLOCKED: exactly one selected workflow assignee is required');
  const actual = selectedAssignees[0];
  if (actual.username !== expected.username) throw new Error('PUBLISHING_BLOCKED: selected workflow-assignee username changed before submit');
  if (actual.entityId !== expected.id) throw new Error('PUBLISHING_BLOCKED: selected workflow-assignee entity ID changed before submit');
}
