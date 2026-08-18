import type { ParagraphM3Activation } from './paragraph-m3-types';

export interface ParagraphM3ImageResult {
  host: { nodeId: string; title: string; moderation: string; nodeCreations: 1; saves: 2 };
  component: {
    label: 'Blockquote';
    machineName: 'blockquote';
    deltaBeforeMedia: string;
    deltaAfterMedia: string;
    finalDelta: string;
    rowControlType: 'input' | 'button';
    initialText: string;
    finalText: string;
    textFormat: 'limited_text';
    fixtureFilename: 'qa-automated-image.png';
    fixtureResolution: 'exact unique match';
    mediaId: string;
    dialogClosure: 'passed';
    rowRediscovery: 'passed';
    deltaReadiness: 'passed';
    stableTargetId: string;
    initialPersistedAssociation: 'passed';
    finalPersistedAssociation: 'passed';
    optionalFieldsUntouched: 'passed';
    activations: { initialPersistence: ParagraphM3Activation; controlledUpdate: ParagraphM3Activation; finalPersistence: ParagraphM3Activation };
  };
  scenarioA: { status: 'previously passed'; nodeId: '25026'; executed: false };
  featuredBanner: { status: 'blocked'; reason: string };
  formattedTextColorBackground: { status: 'blocked'; reason: string };
  serverErrors: number;
  fatalPageDetected: false;
  paragraphAdditions: 1;
  paragraphRemovals: 0;
  mediaSelections: 1;
  mediaUploads: 0;
  mediaCreations: 0;
  mediaEdits: 0;
}
