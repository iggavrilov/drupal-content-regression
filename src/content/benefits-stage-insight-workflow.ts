import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { contentTypes } from '../config/content-types';
import { getEnvironmentConfig } from '../config/environments';
import { assertPublishingAllowed } from '../config/write-safety';
import { generateConfiguredTestData } from '../data/test-data';
import { NetworkMonitor } from '../diagnostics/network-monitor';
import { runPublishingWorkflow } from '../publishing/moderation-workflow';
import { ContentTypeRunner } from './content-type-runner';
import { readConfiguredField } from './field-handlers';

type InsightMachine = 'insight' | 'insight_external';
export interface InsightExecutionRecord {
  machineName: InsightMachine; title: string; createTitle: string;
  createAttempted: boolean; updateAttempted?: boolean; createSaveSubmitted?: boolean; createIssue?: string; updateIssue?: string; nodeId?: number; draft?: string; update?: string;
  published?: string; editUrl?: string; issue?: string;
  data: ReturnType<typeof generateConfiguredTestData>;
  fields?: Array<{ key: string; expected: string; actual?: string; pass: boolean }>;
  workflow?: Awaited<ReturnType<typeof runPublishingWorkflow>>;
}

/** Single-create orchestration: reuse existing handlers, recover exact saves, never retry writes. */
export async function runBenefitsStageInsight(
  page: Page, machine: InsightMachine, evidenceFile: string,
  hooks: { onCreated?: (nodeId: number) => void; beforePublish?: (record: InsightExecutionRecord) => Promise<void> } = {},
): Promise<InsightExecutionRecord> {
  assertPublishingAllowed();
  const environment = getEnvironmentConfig();
  if (environment.target !== 'benefits' || environment.tier !== 'stage' || environment.baseUrl !== 'https://benefits-stage.leidos.com') {
    throw new Error('Benefits STAGE exact target required.');
  }
  if (fs.existsSync(evidenceFile)) throw new Error('Execution evidence already exists; inspect saved nodes before any new attempt.');
  const config = contentTypes.find(c => c.machineName === machine)!;
  if (!config.requiredMedia?.expectedId) throw new Error('Verified Benefits QA image configuration is required.');
  const generated = generateConfiguredTestData(config);
  const data = { ...generated, createValues: { ...generated.createValues }, updateValues: { ...generated.updateValues } };
  const prefix = machine === 'insight' ? 'QA-AUTOMATED-BENEFITS-STAGE-Insight' : 'QA-AUTOMATED-BENEFITS-STAGE-Insight-External';
  data.createValues.title = prefix + '-' + data.runId;
  data.updateValues.title = data.createValues.title + '-UPDATED';
  const record: InsightExecutionRecord = { machineName: machine, createTitle: data.createValues.title, title: data.updateValues.title, createAttempted: false, data };
  fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
  const persist = () => fs.writeFileSync(evidenceFile, JSON.stringify(record, null, 2));
  const runner = new ContentTypeRunner(), monitor = new NetworkMonitor();
  monitor.start(page); persist();
  const trackCreate = (request: import('@playwright/test').Request) => { if (request.method() === 'POST' && request.isNavigationRequest() && new URL(request.url()).pathname === '/node/add/' + machine) { record.createSaveSubmitted = true; persist(); } };
  page.on('request', trackCreate);
  const open = async (expectedTitle: string) => {
    await page.goto('/node/' + record.nodeId + '/edit', { waitUntil: 'domcontentloaded' });
    const form = page.locator('form.node-' + machine.replaceAll('_', '-') + '-edit-form');
    await form.waitFor({ state: 'visible' });
    if (await form.count() !== 1 || await form.locator(config.titleField.selector).inputValue() !== expectedTitle) throw new Error('Exact new QA node ownership mismatch.');
    return form;
  };
  const verifyFields = async (expected: Record<string, string>) => {
    const form = await open(expected.title);
    const fields = [];
    for (const field of config.fields) {
      const actual = await readConfiguredField(form, field);
      fields.push({ key: field.key, expected: expected[field.key], actual, pass: actual === expected[field.key] });
    }
    record.fields = fields; persist();
    if (fields.some(f => !f.pass)) throw new Error('Saved field persistence mismatch; no write retry.');
    return form;
  };
  try {
    record.createAttempted = true; persist();
    try {
      const created = await runner.create({ page, config, data, monitor });
      record.nodeId = Number(created.nodeId);
    } catch (error) {
      record.createIssue = error instanceof Error ? error.message.split('\n')[0] : 'Create blocked'; persist();
      // The legacy success-message assertion may fail after a successful save.
      await page.goto('/admin/content?' + new URLSearchParams({ title: record.createTitle, type: machine }));
      const exact = page.getByRole('link', { name: record.createTitle, exact: true });
      if (await exact.count() !== 1) throw new Error('Create outcome unresolved: inspect exact-title admin results; no retry.');
      const ids = await exact.locator('xpath=ancestor::tr[1]').locator('a[href*="/edit"]').evaluateAll(es =>
        [...new Set(es.map(e => new URL((e as HTMLAnchorElement).href).pathname.match(/^\/node\/(\d+)\/edit$/)?.[1]).filter(Boolean))]);
      if (ids.length !== 1) throw new Error('Saved node ID is ambiguous; no retry.');
      record.nodeId = Number(ids[0]);
      await open(record.createTitle);
    }
    record.editUrl = environment.baseUrl + '/node/' + record.nodeId + '/edit';
    hooks.onCreated?.(record.nodeId); persist();
    let form = await verifyFields(data.createValues);
    if (!/Current state\s+(Draft|Unpublished)/.test(await form.locator('.field--name-moderation-state').innerText())) throw new Error('New node did not persist as Draft.');
    record.draft = 'PASS'; persist();
    record.updateAttempted = true; persist();
    try { await runner.update({ page, config, data, monitor }, String(record.nodeId)); }
    catch (error) { record.updateIssue = error instanceof Error ? error.message.split('\n')[0] : 'Update blocked'; persist(); }
    form = await verifyFields(data.updateValues);
    record.update = 'PASS'; persist();
    await hooks.beforePublish?.(record);
    record.workflow = await runPublishingWorkflow(page, monitor, config, {
      nodeId: record.nodeId, machineName: machine, label: config.label, title: record.title, moderation: 'Draft',
    });
    form = await open(record.title);
    record.published = /Current state Published/.test(await form.locator('.field--name-moderation-state').innerText()) ? 'PASS' : 'BLOCKED';
    persist();
    if (record.published !== 'PASS') throw new Error('Publication was not verified.');
    return record;
  } catch (error) {
    record.issue = error instanceof Error ? error.message.split('\n')[0] : 'Workflow blocked';
    persist(); throw new Error(record.issue);
  } finally { page.off('request', trackCreate); monitor.stop(); }
}


/** Explicit recovery of a recorded new node; this function never creates a node. */
export async function resumeBenefitsStageInsight(
  page: Page, evidenceFile: string,
  hooks: { onCreated?: (nodeId: number) => void; beforePublish?: (record: InsightExecutionRecord) => Promise<void> } = {},
): Promise<InsightExecutionRecord> {
  assertPublishingAllowed();
  const environment = getEnvironmentConfig();
  if (environment.target !== 'benefits' || environment.tier !== 'stage' || environment.baseUrl !== 'https://benefits-stage.leidos.com') throw new Error('Benefits STAGE exact target required.');
  const record: InsightExecutionRecord & { updateAttempted?: boolean } = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
  if (!record.createSaveSubmitted || !record.nodeId || !['insight', 'insight_external'].includes(record.machineName) || [621, 626, 631, 636, 641].includes(record.nodeId)) throw new Error('Recorded new Insight identity is required for recovery.');
  const config = contentTypes.find(c => c.machineName === record.machineName)!;
  if (!record.title.startsWith('QA-AUTOMATED-BENEFITS-STAGE-Insight-') || record.title !== record.data.updateValues.title || record.createTitle !== record.data.createValues.title) throw new Error('Recovery title ownership mismatch.');
  const persist = () => fs.writeFileSync(evidenceFile, JSON.stringify(record, null, 2));
  const monitor = new NetworkMonitor(); monitor.start(page);
  const open = async () => {
    await page.goto('/node/' + record.nodeId + '/edit', { waitUntil: 'domcontentloaded' });
    const form = page.locator('form.node-' + record.machineName.replaceAll('_', '-') + '-edit-form');
    await form.waitFor({ state: 'visible' });
    const title = await form.locator(config.titleField.selector).inputValue();
    if (await form.count() !== 1 || ![record.createTitle, record.title].includes(title)) throw new Error('Recovered node exact type/title mismatch.');
    return { form, title, state: await form.locator('.field--name-moderation-state').innerText() };
  };
  const verify = async (form: import('@playwright/test').Locator, values: Readonly<Record<string, string>>) => {
    const fields = [];
    for (const field of config.fields) {
      const actual = await readConfiguredField(form, field);
      fields.push({ key: field.key, expected: values[field.key], actual, pass: actual === values[field.key] });
    }
    record.fields = fields; persist();
    if (fields.some(f => !f.pass)) throw new Error('Recovered fields do not match; no write retry.');
  };
  try {
    let current = await open(); hooks.onCreated?.(record.nodeId);
    if (current.title === record.createTitle) {
      if (record.updateAttempted || !/Current state\s+(Draft|Unpublished)/.test(current.state)) throw new Error('Update cannot safely resume from the recorded state.');
      await verify(current.form, record.data.createValues);
      record.draft = 'PASS'; record.updateAttempted = true; persist();
      try { await new ContentTypeRunner().update({ page, config, data: record.data, monitor }, String(record.nodeId)); }
      catch (error) { record.updateIssue = error instanceof Error ? error.message.split('\n')[0] : 'Update blocked'; persist(); }
      current = await open();
    }
    if (current.title !== record.title) throw new Error('Updated title did not persist; do not resubmit.');
    await verify(current.form, record.data.updateValues); record.update = 'PASS'; persist();
    if (!/Current state Published/.test(current.state)) {
      await hooks.beforePublish?.(record);
      record.workflow = await runPublishingWorkflow(page, monitor, config, { nodeId: record.nodeId, machineName: record.machineName, label: config.label, title: record.title, moderation: 'Draft' });
    }
    current = await open(); record.published = /Current state Published/.test(current.state) ? 'PASS' : 'BLOCKED';
    record.editUrl = environment.baseUrl + '/node/' + record.nodeId + '/edit'; persist(); return record;
  } finally { monitor.stop(); }
}
