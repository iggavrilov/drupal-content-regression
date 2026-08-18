export type ParagraphM3Activation = 'pointer' | 'keyboard' | 'already expanded';

export interface ParagraphM3Result {
  host: {
    nodeId: string;
    title: string;
    contentType: 'Insight Search Filter Page';
    machineName: 'insight_search';
    moderation: string;
    nodeCreations: 1;
    saves: 2;
  };
  component: {
    label: 'Blockquote';
    machineName: 'blockquote';
    initialDelta: string;
    persistedDelta: string;
    initialText: string;
    finalText: string;
    textFormat: 'limited_text';
    initialPopulation: 'passed';
    firstSave: 'passed';
    initialPersistence: 'passed';
    update: 'passed';
    secondSave: 'passed';
    finalPersistence: 'passed';
    optionalFieldsUntouched: 'passed';
    activations: {
      initialPersistence: ParagraphM3Activation;
      controlledUpdate: ParagraphM3Activation;
      finalPersistence: ParagraphM3Activation;
    };
  };
  featuredBanner: {
    status: 'blocked';
    reason: string;
  };
  serverErrors: number;
  fatalPageDetected: false;
  paragraphAdditions: 1;
  paragraphRemovals: 0;
  mediaSelections: 0;
  mediaUploads: 0;
  mediaCreations: 0;
  mediaEdits: 0;
}
