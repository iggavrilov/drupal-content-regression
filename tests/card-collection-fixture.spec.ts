import { expect, test } from '@playwright/test';
import { buildCardCollectionFixture, CARD_COLLECTION_ITEM_COUNT } from '../src/content/components/card-collection-fixture';

test('Card Collection fixture follows the proven persisted widget contract', () => {
  const fixture = buildCardCollectionFixture('25196', 'stage-contract');
  expect(fixture.backgroundStyle).toBe('attenuate_3_light__white_cards');
  expect(fixture.padding).toBe('_none');
  expect(fixture.ctaUri).toBe('/node/25196');
  expect(fixture.ctaText).toBeTruthy();
  expect(fixture.items).toHaveLength(CARD_COLLECTION_ITEM_COUNT);
  expect(new Set(fixture.items.map((item) => item.heading)).size).toBe(CARD_COLLECTION_ITEM_COUNT);
  for (const item of fixture.items) expect(item).toMatchObject({ uri: '/node/25196', linkText: 'View QA page' });
});

test('Card Collection fixture rejects ambiguous node ownership', () => {
  expect(() => buildCardCollectionFixture('not-a-node', 'run')).toThrow('numeric owned node ID');
});
