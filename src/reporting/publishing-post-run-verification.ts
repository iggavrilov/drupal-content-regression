export interface PostRunVerificationEvidence {
  ownershipVerified: boolean;
  titleVerified: boolean;
  contentTypeVerified: boolean;
  expectedState: 'Published';
  actualState?: string;
  publicPagePassed: boolean;
  serverErrorCount: number;
  fatalPageDetected: boolean;
}

export type PostRunVerificationStatus = 'passed' | 'failed';

export function classifyPostRunVerification(evidence: PostRunVerificationEvidence): PostRunVerificationStatus {
  return evidence.ownershipVerified &&
    evidence.titleVerified &&
    evidence.contentTypeVerified &&
    evidence.actualState === evidence.expectedState &&
    evidence.publicPagePassed &&
    evidence.serverErrorCount === 0 &&
    !evidence.fatalPageDetected
    ? 'passed'
    : 'failed';
}
