export interface ParagraphM2ComponentResult {
  label: string;
  machineName: 'formatted_text_with_img_bg';
  delta: string;
  initialDelta: string;
  postMediaDelta: string;
  postMediaRowActionElementType: string;
  requiredFields: readonly string[];
  defaults: Readonly<Record<string, string>>;
  mediaId: string;
  fixtureFilename: string;
  fixtureResolution: 'exact unique match';
  mediaAjaxReadiness: 'passed';
  mediaLibraryClosure: 'passed';
  rowRediscovery: 'passed';
  deltaRediscovery: 'passed';
  associationStability: 'passed';
  mediaAssociationSelector: string;
  initialText: string;
  finalText: string;
  initialPopulation: 'passed';
  initialPersistence: 'passed';
  update: 'passed';
  finalPersistence: 'passed';
  updateActivation: 'pointer' | 'keyboard' | 'already expanded';
  focusVerified: boolean;
  activations: {
    initialPersistence: 'pointer' | 'keyboard' | 'already expanded';
    controlledUpdate: 'pointer' | 'keyboard' | 'already expanded';
    finalPersistence: 'pointer' | 'keyboard' | 'already expanded';
  };
}

export interface ParagraphM2Result {
  host: {
    nodeId: string;
    title: string;
    moderation: string;
    saves: number;
    nodeCreations: number;
    initialInventory: readonly string[];
    finalInventory: readonly string[];
  };
  components: readonly ParagraphM2ComponentResult[];
  serverErrors: number;
  fatalPageDetected: boolean;
  mediaUploads: number;
  mediaCreations: number;
  mediaEdits: number;
  mediaSelections: number;
  paragraphAdditions: number;
  paragraphRemovals: number;
}
