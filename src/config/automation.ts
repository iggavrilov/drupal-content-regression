export const AUTOMATED_CONTENT_PREFIX = 'QA-AUTOMATED-' as const;

export const AUTOMATED_IMAGE_FIXTURE = 'fixtures/qa-automated-image.png';
export const AUTOMATED_IMAGE_MEDIA_NAME = 'qa-automated-image.png';
export const AUTOMATED_IMAGE_MEDIA_ID = '44706';
export const AUTOMATED_AUTHOR_NODE_ID = '24951';
export const AUTOMATED_AUTHOR_TITLE =
  'QA-AUTOMATED-Author-20260817-133851-c5b1-UPDATED';

export function hasAutomatedContentPrefix(title: string): boolean {
  return title.startsWith(AUTOMATED_CONTENT_PREFIX);
}
