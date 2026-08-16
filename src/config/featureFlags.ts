export type FeatureFlagName = "dataAdminConciergeEnabled";

export const FEATURE_FLAGS: Record<FeatureFlagName, boolean> = {
  dataAdminConciergeEnabled: false,
};

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  return FEATURE_FLAGS[flag];
}
