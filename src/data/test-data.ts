import { AUTOMATED_CONTENT_PREFIX } from '../config/automation';
import type { ContentTypeConfig } from '../config/content-types';

export interface ContentTypeTestData {
  runId: string;
  createValues: Readonly<Record<string, string>>;
  updateValues: Readonly<Record<string, string>>;
}

export function generateConfiguredTestData(
  config: ContentTypeConfig,
): ContentTypeTestData {
  const runId = generateRunId();
  const createValues: Record<string, string> = {};
  const updateValues: Record<string, string> = {};
  const title = `${AUTOMATED_CONTENT_PREFIX}${config.testData.titleSegment}-${runId}`;
  createValues[config.testData.titleKey] = title;
  updateValues[config.testData.titleKey] = `${title}-UPDATED`;

  for (const [key, templates] of Object.entries(config.testData.values)) {
    createValues[key] = templates.create.replaceAll('{runId}', runId);
    updateValues[key] = templates.update.replaceAll('{runId}', runId);
  }

  return { runId, createValues, updateValues };
}

function generateRunId(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace(/\.\d{3}Z$/, '');
  const randomSuffix = crypto.randomUUID().slice(0, 4);
  return `${timestamp}-${randomSuffix}`;
}
