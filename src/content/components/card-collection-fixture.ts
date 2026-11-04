export const CARD_COLLECTION_ITEM_COUNT = 4;

export interface CardCollectionFixture {
  backgroundStyle: 'attenuate_3_light__white_cards';
  padding: '_none';
  heading: string;
  text: string;
  ctaUri: string;
  ctaText: string;
  items: Array<{ heading: string; text: string; uri: string; linkText: string }>;
}

export function buildCardCollectionFixture(nodeId: string, runId: string): CardCollectionFixture {
  if (!/^\d+$/.test(nodeId)) throw new Error('Card Collection fixture requires a numeric owned node ID.');
  if (!runId.trim()) throw new Error('Card Collection fixture requires a run ID.');
  const uri = `/node/${nodeId}`;
  return {
    backgroundStyle: 'attenuate_3_light__white_cards',
    padding: '_none',
    heading: `QA-AUTOMATED-CARD-COLLECTION-HEADING-${runId}`,
    text: 'QA automated card collection text.',
    ctaUri: uri,
    ctaText: 'View QA page',
    items: Array.from({ length: CARD_COLLECTION_ITEM_COUNT }, (_, index) => ({
      heading: `QA-AUTOMATED-COLLECTION-CARD-${index + 1}-${runId}`,
      text: `QA automated collection card ${index + 1}.`,
      uri,
      linkText: 'View QA page',
    })),
  };
}
