import fs from 'node:fs';
import path from 'node:path';
import { hasAutomatedContentPrefix } from '../config/automation';
import { assertExplicitNonProductionEnvironment } from '../config/write-safety';

export interface PublishingSourceNode {
  machineName: string;
  label: string;
  nodeId: number;
  title: string;
  moderation: string;
}

interface ContentRegressionSourceArtifact {
  environment: string;
  generatedAt: string;
  nodes: Array<{
    machineName: string;
    label: string;
    status: string;
    created: boolean;
    updated: boolean;
    nodeId?: number;
    title?: string;
    moderation?: string;
  }>;
}

const EXPECTED_MACHINE_NAMES = [
  'page',
  'landing_page',
  'statistic',
  'author',
  'insight_external',
  'insight',
  'insight_search',
] as const;

export function loadPublishingSourceNodes(): PublishingSourceNode[] {
  const environment = assertExplicitNonProductionEnvironment();
  const artifactPath = path.resolve(
    process.cwd(),
    '.regression-runs/content-regression-created-nodes.json',
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      'PUBLISHING_BLOCKED: The content regression source-node artifact is missing. Run npm run test:content-regression first.',
    );
  }

  let summary: ContentRegressionSourceArtifact;
  try {
    summary = JSON.parse(
      fs.readFileSync(artifactPath, 'utf8'),
    ) as ContentRegressionSourceArtifact;
  } catch {
    throw new Error(
      'PUBLISHING_BLOCKED: The content regression source-node artifact is invalid.',
    );
  }
  if (
    summary.environment !== environment ||
    summary.nodes.length !== EXPECTED_MACHINE_NAMES.length
  ) {
    throw new Error(
      'PUBLISHING_BLOCKED: The source artifact is not one complete successful regression run for the current environment.',
    );
  }

  return EXPECTED_MACHINE_NAMES.map((machineName) => {
    const matches = summary.nodes.filter(
      (result) => result.machineName === machineName,
    );
    if (matches.length !== 1) {
      throw new Error(
        `PUBLISHING_BLOCKED: Source node for ${machineName} was not recorded uniquely.`,
      );
    }
    const result = matches[0];
    if (
      result.status !== 'passed' ||
      !result.created ||
      !result.updated ||
      !Number.isInteger(result.nodeId) ||
      !result.title ||
      !hasAutomatedContentPrefix(result.title) ||
      result.moderation !== 'Draft'
    ) {
      throw new Error(
        `PUBLISHING_BLOCKED: Source ownership/state for ${machineName} is incomplete or unsafe.`,
      );
    }
    return {
      machineName,
      label: result.label,
      nodeId: result.nodeId as number,
      title: result.title,
      moderation: result.moderation,
    };
  });
}
