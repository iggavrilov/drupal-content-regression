export type ParagraphHandler = 'fieldless' | 'text' | 'radio' | 'ckeditor';

export interface ParagraphConfig {
  machineName: string;
  label: string;
  handler: ParagraphHandler;
  fieldMachineName?: string;
  required?: boolean;
  repeatableItem?: boolean;
}

export interface RadioOption {
  label: string;
  value: string;
}

export interface ParagraphComponentResult {
  label: string;
  machineName: string;
  delta?: string;
  addMethod?: 'ajax' | 'host default';
  addResult: 'passed' | 'blocked' | 'failed';
  fieldPopulationResult: 'passed' | 'not applicable' | 'blocked' | 'failed';
  initialPersistenceResult: 'passed' | 'blocked' | 'failed';
  updateResult: 'passed' | 'not applicable' | 'blocked' | 'failed';
  finalPersistenceResult: 'passed' | 'blocked' | 'failed';
  blockedReason?: string;
  initialValue?: string;
  updatedValue?: string;
  availableOptions?: readonly RadioOption[];
  selectedOption?: RadioOption;
  updatedOption?: RadioOption;
  updateActivationMethod?: 'pointer' | 'keyboard' | 'already expanded';
  updateFocusVerified?: boolean;
  serverErrors: number;
  fatalPageDetected: boolean;
}

export interface ParagraphRegressionResult {
  host: {
    nodeId: string;
    title: string;
    contentType: 'Insight Search Filter Page';
    machineName: 'insight_search';
    moderationState: string;
    saves: number;
    createdParagraphCount: number;
    nodeCreations: number;
    paragraphAdditions: number;
    paragraphRemovals: number;
    initialParagraphCount: number;
    finalParagraphCount: number;
  };
  components: ParagraphComponentResult[];
  serverErrors: number;
  fatalPageDetected: boolean;
}

export interface DeferredParagraphConfig {
  machineName: string;
  label: string;
  status: 'deferred';
  reason: string;
}

export const paragraphConfigs: readonly ParagraphConfig[] = [
  { machineName: 'insights_overview', label: 'Insights overview', handler: 'fieldless' },
  { machineName: 'anchor', label: 'Anchor', handler: 'text', fieldMachineName: 'field_anchor_id', required: true },
  { machineName: 'jump_nav', label: 'Jump nav', handler: 'radio', fieldMachineName: 'field_jump_nav_type' },
  { machineName: 'formatted_text', label: 'Formatted text', handler: 'ckeditor', fieldMachineName: 'field_formatted_text' },
] as const;

export const deferredParagraphConfigs: readonly DeferredParagraphConfig[] = [
  {
    machineName: 'secondary_footer',
    label: 'Secondary footer',
    status: 'deferred',
    reason: 'nested Blocks/Add block widget requires separate strategy',
  },
] as const;
