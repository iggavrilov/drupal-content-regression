import { assertPublishingAllowed } from '../config/write-safety';
import { loadPublishingSourceNodes } from './source-nodes';

export default function publishingGlobalSetup(): void {
  assertPublishingAllowed();
  loadPublishingSourceNodes();
}
