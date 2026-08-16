export const FEATURE_FLAGS = {
  dataAdminConciergeEnabled: false,
} as const;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  return FEATURE_FLAGS[flag] === true;
}
