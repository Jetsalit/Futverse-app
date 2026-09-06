import type { ProPlayerOnboardingV1, ProPlayerExpectedSalaryV1 } from "./proPlayerOnboardingV1";
import { validateProPlayerOnboardingV1 } from "./proPlayerOnboardingV1";
import { isExactPlayerKey, isIssuedFutIdV1 } from "./playerIdentityFoundation";

export const PRO_PLAYER_ONBOARDING_CLAIM_SCHEMA_VERSION = 1 as const;
export const PRO_PLAYER_ONBOARDING_CLAIM_COLLECTION = "proPlayerOnboardingClaims" as const;
export const PRO_PLAYER_ACCOUNT_BINDING_COLLECTION = "proPlayerAccountBindings" as const;
export const PRO_PLAYER_PRIVATE_MARKET_COLLECTION = "proPlayerPrivateMarketPreferences" as const;

export type ProPlayerOnboardingClaimStatusV1 = "PENDING" | "APPROVED" | "REJECTED";

export interface ProPlayerOnboardingClaimV1 {
  schemaVersion: 1;
  type: "PRO_PLAYER_SELF_SERVICE_ONBOARDING";
  userId: string;
  status: ProPlayerOnboardingClaimStatusV1;
  profile: ProPlayerOnboardingV1;
}

/** Public-safe projection for root proPlayers. Salary is intentionally absent. */
export type ProPlayerPublicProfileV1 = Omit<ProPlayerOnboardingV1, "expectedSalary"> & {
  schemaVersion: 1;
  playerKey: string;
  futId: string;
};

export interface ProPlayerPrivateMarketPreferenceV1 {
  schemaVersion: 1;
  playerKey: string;
  expectedSalary: ProPlayerExpectedSalaryV1;
}

export interface ProPlayerAccountBindingV1 {
  schemaVersion: 1;
  userId: string;
  playerKey: string;
  futId: string;
}

export interface ProPlayerClaimReviewerV1 {
  uid: string;
  role: string;
  status: string;
}

export type ProPlayerClaimDecisionV1 =
  | { type: "APPROVE"; playerKey: string; futId: string }
  | { type: "REJECT" };

export interface ProPlayerClaimApprovalPlanV1 {
  claim: ProPlayerOnboardingClaimV1;
  publicProfile: ProPlayerPublicProfileV1;
  privateMarketPreference: ProPlayerPrivateMarketPreferenceV1;
  accountBinding: ProPlayerAccountBindingV1;
  identityIssuance: {
    playerKey: string;
    futId: string;
    source: "SUPERADMIN_ISSUANCE";
  };
}

export type ProPlayerClaimDecisionPlanV1 =
  | { kind: "APPROVED"; value: ProPlayerClaimApprovalPlanV1 }
  | { kind: "REJECTED"; claim: ProPlayerOnboardingClaimV1 };

export class ProPlayerOnboardingClaimError extends Error {
  constructor(readonly code:
    | "INVALID_CLAIM"
    | "REVIEWER_REQUIRED"
    | "INVALID_TRANSITION"
    | "INVALID_IDENTITY") {
    super(code);
    this.name = "ProPlayerOnboardingClaimError";
  }
}

function exactDocumentId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !value.includes("/");
}

export function buildProPlayerOnboardingClaimV1(
  userId: string,
  profile: ProPlayerOnboardingV1,
): ProPlayerOnboardingClaimV1 {
  if (!exactDocumentId(userId) || !validateProPlayerOnboardingV1(profile)) {
    throw new ProPlayerOnboardingClaimError("INVALID_CLAIM");
  }
  return {
    schemaVersion: PRO_PLAYER_ONBOARDING_CLAIM_SCHEMA_VERSION,
    type: "PRO_PLAYER_SELF_SERVICE_ONBOARDING",
    userId,
    status: "PENDING",
    profile,
  };
}

export function isActiveSuperAdminClaimReviewerV1(reviewer: ProPlayerClaimReviewerV1): boolean {
  return exactDocumentId(reviewer.uid) && reviewer.role === "SUPERADMIN" &&
    (reviewer.status === "ACTIVE" || reviewer.status === "Active");
}

/**
 * Pure contract planner only. It performs no Firestore write.
 * Future persistence must re-read canonical actor/claim/binding/identity state server-side
 * and apply the approved plan atomically without overwriting existing records.
 */
export function planProPlayerOnboardingClaimDecisionV1(
  reviewer: ProPlayerClaimReviewerV1,
  currentClaim: ProPlayerOnboardingClaimV1,
  decision: ProPlayerClaimDecisionV1,
): ProPlayerClaimDecisionPlanV1 {
  if (!isActiveSuperAdminClaimReviewerV1(reviewer)) {
    throw new ProPlayerOnboardingClaimError("REVIEWER_REQUIRED");
  }
  if (
    currentClaim.schemaVersion !== 1 ||
    currentClaim.type !== "PRO_PLAYER_SELF_SERVICE_ONBOARDING" ||
    !exactDocumentId(currentClaim.userId) ||
    !validateProPlayerOnboardingV1(currentClaim.profile)
  ) {
    throw new ProPlayerOnboardingClaimError("INVALID_CLAIM");
  }
  if (currentClaim.status !== "PENDING") {
    throw new ProPlayerOnboardingClaimError("INVALID_TRANSITION");
  }

  if (decision.type === "REJECT") {
    return {
      kind: "REJECTED",
      claim: { ...currentClaim, status: "REJECTED" },
    };
  }

  if (!isExactPlayerKey(decision.playerKey) || !isIssuedFutIdV1(decision.futId)) {
    throw new ProPlayerOnboardingClaimError("INVALID_IDENTITY");
  }

  const { expectedSalary, ...publicProfile } = currentClaim.profile;
  const approvedClaim: ProPlayerOnboardingClaimV1 = {
    ...currentClaim,
    status: "APPROVED",
  };

  return {
    kind: "APPROVED",
    value: {
      claim: approvedClaim,
      publicProfile: {
        ...publicProfile,
        schemaVersion: 1,
        playerKey: decision.playerKey,
        futId: decision.futId,
      },
      privateMarketPreference: {
        schemaVersion: 1,
        playerKey: decision.playerKey,
        expectedSalary,
      },
      accountBinding: {
        schemaVersion: 1,
        userId: currentClaim.userId,
        playerKey: decision.playerKey,
        futId: decision.futId,
      },
      identityIssuance: {
        playerKey: decision.playerKey,
        futId: decision.futId,
        source: "SUPERADMIN_ISSUANCE",
      },
    },
  };
}
