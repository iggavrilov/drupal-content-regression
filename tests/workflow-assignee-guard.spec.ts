import { expect, test } from '@playwright/test';
import { resolveDrupalTarget } from '../src/config/environments';
import { assertWorkflowPreSubmitGuard, selectExpectedAssigneeCandidate } from '../src/publishing/workflow-assignee-guard';

const configPath = `${process.cwd()}/config/environments.yml`;
const selected = (target: 'devv' | 'benefits' | 'qtcm' | 'cms') => resolveDrupalTarget(target, configPath);
const guard = (target: 'devv' | 'benefits' | 'qtcm' | 'cms', assigneeRequired: boolean, users: readonly { username: string; entityId?: string }[], unresolvedAutocomplete = false, origin = selected(target).baseUrl) =>
  assertWorkflowPreSubmitGuard({ selectedTarget: selected(target), currentOrigin: origin, assigneeRequired, selectedAssignees: users, unresolvedAutocomplete });

for (const [target, id] of [['devv', '17636'], ['benefits', '15686'], ['qtcm', '21']] as const) {
  test(`${target} accepts only its exact configured username and ID`, () => {
    expect(() => guard(target, true, [{ username: 'igor.gavrilov', entityId: id }])).not.toThrow();
  });
}

for (const [name, user] of [
  ['wrong username', { username: 'fake.unrelated', entityId: '17636' }],
  ['wrong ID', { username: 'igor.gavrilov', entityId: '999' }],
  ['partial username', { username: 'igor.gav', entityId: '17636' }],
] as const) test(`DEVV rejects ${name}`, () => expect(() => guard('devv', true, [user])).toThrow());

test('unrelated first candidate is not selected when the exact candidate is later', () => {
  expect(selectExpectedAssigneeCandidate({ username: 'igor.gavrilov', id: '17636' }, [
    { username: 'fake.first', entityId: '1' }, { username: 'igor.gavrilov', entityId: '17636' },
  ])).toBe(1);
});
test('absent expected user is rejected', () => expect(() => selectExpectedAssigneeCandidate({ username: 'igor.gavrilov', id: '17636' }, [{ username: 'fake.user', entityId: '1' }])).toThrow());
test('duplicate username without provable ID is rejected', () => expect(() => selectExpectedAssigneeCandidate({ username: 'igor.gavrilov', id: '17636' }, [{ username: 'igor.gavrilov' }, { username: 'igor.gavrilov' }])).toThrow());
test('multiple selected assignees are rejected', () => expect(() => guard('devv', true, [{ username: 'igor.gavrilov', entityId: '17636' }, { username: 'fake.user', entityId: '1' }])).toThrow());
test('stale selected assignee is rejected', () => expect(() => guard('devv', true, [{ username: 'fake.stale', entityId: '2' }])).toThrow());
test('selected form identity changed after resolution is rejected before submit', () => {
  expect(selectExpectedAssigneeCandidate({ username: 'igor.gavrilov', id: '17636' }, [{ username: 'igor.gavrilov', entityId: '17636' }])).toBe(0);
  expect(() => guard('devv', true, [{ username: 'igor.gavrilov', entityId: '15686' }])).toThrow();
});
test('unresolved autocomplete state is rejected', () => expect(() => guard('devv', true, [{ username: 'igor.gavrilov', entityId: '17636' }], true)).toThrow());
test('wrong origin is rejected', () => expect(() => guard('devv', true, [{ username: 'igor.gavrilov', entityId: '17636' }], false, 'https://benefits-dev.leidos.com')).toThrow());

for (const [target, wrongIds] of [
  ['devv', ['15686', '21']], ['benefits', ['17636', '21']], ['qtcm', ['17636', '15686']],
] as const) for (const id of wrongIds) test(`${target} rejects cross-environment ID ${id}`, () => expect(() => guard(target, true, [{ username: 'igor.gavrilov', entityId: id }])).toThrow());

test('CMS workflow without assignment is accepted with no selected user', () => expect(() => guard('cms', false, [])).not.toThrow());
test('CMS workflow requiring assignment is rejected with null policy', () => expect(() => guard('cms', true, [])).toThrow());
test('CMS never inherits another target assignee', () => expect(() => guard('cms', true, [{ username: 'igor.gavrilov', entityId: '17636' }])).toThrow());
