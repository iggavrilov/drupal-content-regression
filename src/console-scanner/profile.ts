export type ConsoleScanTarget = 'devv' | 'stage' | 'qtcm' | 'benefits' | 'benefits-stage' | 'cms';

export interface ConsoleScanProfile {
  settleMs: number;
  interactionSettleMs: number;
  maximumInteractions: number;
  compareProduction: boolean;
}

const DEFAULT_PROFILE: ConsoleScanProfile = {
  settleMs: 1_000,
  interactionSettleMs: 750,
  maximumInteractions: 8,
  compareProduction: false,
};

export function getConsoleScanProfile(target: ConsoleScanTarget): ConsoleScanProfile {
  if (target === 'devv') return { ...DEFAULT_PROFILE, compareProduction: true };
  if (target === 'stage') return { ...DEFAULT_PROFILE, settleMs: 5_000, interactionSettleMs: 1_500 };
  if (target === 'benefits-stage') return { ...DEFAULT_PROFILE, settleMs: 5_000, interactionSettleMs: 1_500 };
  return { ...DEFAULT_PROFILE };
}
