export const AUTOMATED_CONTENT_PREFIX = 'QA-AUTOMATED-' as const;

export const AUTOMATED_IMAGE_FIXTURE = 'fixtures/qa-automated-image.png';
export const AUTOMATED_IMAGE_MEDIA_NAME = 'qa-automated-image.png';
export const AUTOMATED_IMAGE_MEDIA_ID = '44801';
export const AUTOMATED_AUTHOR_NODE_ID = '24961';
export const AUTOMATED_AUTHOR_TITLE =
  'QA-AUTOMATED-Author-20260826-072146-372b-UPDATED';
export const PROTECTED_DEVV_NODE_IDS = new Set([
  '24946',
  '24951',
  '24956',
  '24961',
  '24966',
  '24971',
  '24976',
  '24981',
  '24986',
  '24991',
  '24996',
]);

export function hasAutomatedContentPrefix(title: string): boolean {
  return title.startsWith(AUTOMATED_CONTENT_PREFIX);
}
