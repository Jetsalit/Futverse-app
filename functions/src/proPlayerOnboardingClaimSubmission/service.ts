import type { ProPlayerOnboardingV1 } from "./contract.js";
import { validateProPlayerOnboardingV1Server } from "./contract.js";
import type { ProPlayerClaimSubmissionRateLimiterV1 } from "./rateLimiter.js";

export const PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INVALID_DATA: "INVALID_DATA",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ProPlayerClaimSubmissionErrorCode =
  (typeof PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES)[keyof typeof PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES];

export class ProPlayerClaimSubmissionServiceError extends Error {
  constructor(readonly code: ProPlayerClaimSubmissionErrorCode, message: string) {
    super(message);
    this.name = "ProPlayerClaimSubmissionServiceError";
  }
}

export interface CanonicalUserSnapshotV1 {
  exists: boolean;
  data?: Record<string, unknown>;
}

export interface ExistingClaimSnapshotV1 {
  exists: boolean;
  data?: Record<string, unknown>;
}

export interface ExistingBindingSnapshotV1 {
  exists: boolean;
  data?: Record<string, unknown>;
}

export interface ProPlayerClaimSubmissionTransactionV1 {
  getUser(uid: string): Promise<CanonicalUserSnapshotV1>;
  getClaim(uid: string): Promise<ExistingClaimSnapshotV1>;
  getBinding(uid: string): Promise<ExistingBindingSnapshotV1>;
  createClaim(uid: string, data: Record<string, unknown>): void;
}

export interface ProPlayerClaimSubmissionSourceV1 {
  runSubmissionTransaction<T>(
    operation: (transaction: ProPlayerClaimSubmissionTransactionV1) => Promise<T>,
  ): Promise<T>;
}

export interface ProPlayerClaimSubmissionResultV1 {
  status: "PENDING";
  created: boolean;
  idempotent: boolean;
}

export interface ProPlayerClaimSubmissionServiceV1 {
  submitClaim(input: {
    requesterUid: string;
    requestBody: unknown;
    now?: Date;
  }): Promise<ProPlayerClaimSubmissionResultV1>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !value.includes("/");
}

function parseRequestBody(value: unknown): ProPlayerOnboardingV1 {
  const record = asRecord(value);
  if (!record || Object.keys(record).length !== 1 || !Object.prototype.hasOwnProperty.call(record, "profile")) {
    throw new ProPlayerClaimSubmissionServiceError(
      PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.INVALID_REQUEST,
      "Claim submission request is invalid.",
    );
  }
  if (!validateProPlayerOnboardingV1Server(record.profile)) {
    throw new ProPlayerClaimSubmissionServiceError(
      PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.INVALID_REQUEST,
      "Claim profile is invalid.",
    );
  }
  return record.profile;
}

function assertActivePlayer(uid: string, snapshot: CanonicalUserSnapshotV1): void {
  if (!snapshot.exists || !snapshot.data) {
    throw new ProPlayerClaimSubmissionServiceError(
      PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.FORBIDDEN,
      "Active Player account required.",
    );
  }
  const data = snapshot.data;
  if (Object.prototype.hasOwnProperty.call(data, "uid") && data.uid !== uid) {
    throw new ProPlayerClaimSubmissionServiceError(
      PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.INVALID_DATA,
      "Canonical User UID is inconsistent.",
    );
  }
  if (data.role !== "PLAYER" || (data.status !== "ACTIVE" && data.status !== "Active")) {
    throw new ProPlayerClaimSubmissionServiceError(
      PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.FORBIDDEN,
      "Active Player account required.",
    );
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isSamePendingClaim(uid: string, profile: ProPlayerOnboardingV1, snapshot: ExistingClaimSnapshotV1): boolean {
  if (!snapshot.exists || !snapshot.data) return false;
  const data = snapshot.data;
  return (
    data.schemaVersion === 1 &&
    data.type === "PRO_PLAYER_SELF_SERVICE_ONBOARDING" &&
    data.userId === uid &&
    data.status === "PENDING" &&
    validateProPlayerOnboardingV1Server(data.profile) &&
    stableStringify(data.profile) === stableStringify(profile)
  );
}

export function createProPlayerClaimSubmissionServiceV1(
  source: ProPlayerClaimSubmissionSourceV1,
  rateLimiter: ProPlayerClaimSubmissionRateLimiterV1,
): ProPlayerClaimSubmissionServiceV1 {
  return {
    async submitClaim({ requesterUid, requestBody, now }) {
      if (!isIdentifier(requesterUid)) {
        throw new ProPlayerClaimSubmissionServiceError(
          PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.UNAUTHORIZED,
          "Authentication required.",
        );
      }

      const profile = parseRequestBody(requestBody);
      const quota = await rateLimiter.consumeQuota(requesterUid, now);
      if (!quota.allowed) {
        throw new ProPlayerClaimSubmissionServiceError(
          PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.RATE_LIMIT_EXCEEDED,
          "Too many Pro Player claim submission attempts.",
        );
      }

      return source.runSubmissionTransaction(async (transaction) => {
        const [user, binding, claim] = await Promise.all([
          transaction.getUser(requesterUid),
          transaction.getBinding(requesterUid),
          transaction.getClaim(requesterUid),
        ]);

        assertActivePlayer(requesterUid, user);

        if (binding.exists) {
          throw new ProPlayerClaimSubmissionServiceError(
            PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.CONFLICT,
            "This account is already bound to a Pro Player identity.",
          );
        }

        if (claim.exists) {
          if (isSamePendingClaim(requesterUid, profile, claim)) {
            return { status: "PENDING", created: false, idempotent: true };
          }
          throw new ProPlayerClaimSubmissionServiceError(
            PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.CONFLICT,
            "An onboarding claim already exists for this account.",
          );
        }

        transaction.createClaim(requesterUid, {
          schemaVersion: 1,
          type: "PRO_PLAYER_SELF_SERVICE_ONBOARDING",
          userId: requesterUid,
          status: "PENDING",
          profile,
        });

        return { status: "PENDING", created: true, idempotent: false };
      });
    },
  };
}
