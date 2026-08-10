import { requireExactDocumentId } from "./membershipValidation";

export interface CoachIdentityCandidate {
  id: string;
  userId: unknown;
}

export interface CoachIdentityResolution {
  profileId: string;
  matchedExistingProfile: boolean;
}

export function resolveExactUidCoachProfile(
  userId: string,
  exactUidMatches: readonly CoachIdentityCandidate[],
): CoachIdentityResolution {
  requireExactDocumentId(userId, "claim.userId");

  if (exactUidMatches.length > 1) {
    throw new Error("Multiple Coach profiles are bound to the same Firebase UID.");
  }

  const exactMatch = exactUidMatches[0];
  if (!exactMatch) {
    return { profileId: userId, matchedExistingProfile: false };
  }

  requireExactDocumentId(exactMatch.id, "Coach profile ID");
  if (exactMatch.userId !== userId) {
    throw new Error("Coach profile UID does not exactly match claim.userId.");
  }

  return { profileId: exactMatch.id, matchedExistingProfile: true };
}

export function assertExactUidCoachMutationTarget(
  userId: string,
  targetData: Record<string, unknown> | null,
): void {
  requireExactDocumentId(userId, "claim.userId");
  if (targetData && targetData.userId !== userId) {
    throw new Error(
      "Coach profile target is already bound to a different UID or is not UID-bound.",
    );
  }
}
