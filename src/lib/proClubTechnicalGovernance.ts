import type {
  ProClubStaffRole,
  ProClubStaffStatus,
} from "../types/ProClub";
import {
  isProClubStaffRole,
  isProClubStaffStatus,
  isValidDocumentIdentifier,
} from "./proClubModel";

export type ProClubTechnicalAuthorityRole =
  | "TECHNICAL_DIRECTOR"
  | "HEAD_COACH";

export type ProClubTechnicalAuthorityMode =
  | "AUTO"
  | "TECHNICAL_DIRECTOR"
  | "HEAD_COACH";

export interface ProClubTechnicalGovernanceConfig {
  authorityMode: ProClubTechnicalAuthorityMode;
  /**
   * Optional explicit selection for ambiguous or club-specific structures.
   * This is a governance selection only; it never grants tenant membership.
   */
  selectedAuthorityUid?: string;
}

export interface ProClubTechnicalStaffCandidate {
  uid: string;
  staffRole: ProClubStaffRole;
  status: ProClubStaffStatus;
}

export type ProClubTechnicalAuthorityResolution =
  | {
      state: "FOUND";
      authorityUid: string;
      authorityRole: ProClubTechnicalAuthorityRole;
      resolvedBy: "AUTO" | "MODE" | "SELECTED_UID";
    }
  | {
      state: "MISSING";
      requiredRole: ProClubTechnicalAuthorityRole | null;
    }
  | {
      state: "AMBIGUOUS";
      authorityRole: ProClubTechnicalAuthorityRole;
      candidateUids: readonly string[];
    }
  | {
      state: "INVALID_CONFIG";
      reason: string;
    };

export interface ProClubTechnicalCapabilities {
  canCreateTrainingPlan: boolean;
  canEditTrainingPlan: boolean;
  canCoAuthorTrainingPlan: boolean;
  canSubmitTechnicalWork: boolean;
  canReviewTechnicalWork: boolean;
  canApproveSubmittedWork: boolean;
  canPublishOwnTechnicalWork: boolean;
}

export type ProClubTechnicalAuthorityAction =
  | "NONE"
  | "REVIEW_AND_APPROVE"
  | "PUBLISH_OWN_WORK";

export type ProClubTechnicalWorkStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "NEEDS_REVISION"
  | "APPROVED"
  | "PUBLISHED";

const TECHNICAL_ROLES: readonly ProClubTechnicalAuthorityRole[] = [
  "TECHNICAL_DIRECTOR",
  "HEAD_COACH",
];

const TECHNICAL_WORK_TRANSITIONS: Readonly<
  Record<ProClubTechnicalWorkStatus, readonly ProClubTechnicalWorkStatus[]>
> = {
  DRAFT: ["SUBMITTED", "PUBLISHED"],
  SUBMITTED: ["IN_REVIEW"],
  IN_REVIEW: ["NEEDS_REVISION", "APPROVED"],
  NEEDS_REVISION: ["SUBMITTED"],
  APPROVED: [],
  PUBLISHED: [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isTechnicalAuthorityRole(
  value: unknown,
): value is ProClubTechnicalAuthorityRole {
  return value === "TECHNICAL_DIRECTOR" || value === "HEAD_COACH";
}

function isTechnicalAuthorityMode(
  value: unknown,
): value is ProClubTechnicalAuthorityMode {
  return (
    value === "AUTO" ||
    value === "TECHNICAL_DIRECTOR" ||
    value === "HEAD_COACH"
  );
}

function isTechnicalStaffCandidate(
  value: unknown,
): value is ProClubTechnicalStaffCandidate {
  const candidate = asRecord(value);
  return Boolean(
    candidate &&
      isValidDocumentIdentifier(candidate.uid) &&
      isProClubStaffRole(candidate.staffRole) &&
      isProClubStaffStatus(candidate.status),
  );
}

function invalidConfig(reason: string): ProClubTechnicalAuthorityResolution {
  return { state: "INVALID_CONFIG", reason };
}

function resolveSingleRole(
  role: ProClubTechnicalAuthorityRole,
  activeTechnicalCandidates: readonly ProClubTechnicalStaffCandidate[],
  resolvedBy: "AUTO" | "MODE",
): ProClubTechnicalAuthorityResolution {
  const matching = activeTechnicalCandidates.filter(
    (candidate) => candidate.staffRole === role,
  );

  if (matching.length === 0) {
    return { state: "MISSING", requiredRole: role };
  }

  if (matching.length > 1) {
    return {
      state: "AMBIGUOUS",
      authorityRole: role,
      candidateUids: matching.map((candidate) => candidate.uid).sort(),
    };
  }

  return {
    state: "FOUND",
    authorityUid: matching[0].uid,
    authorityRole: role,
    resolvedBy,
  };
}

/**
 * Resolves the current football technical authority without granting tenant
 * authorization. Only effective ACTIVE staff assignments supplied by the
 * caller can become candidates.
 *
 * AUTO follows the Thai-club operating default frozen for V1:
 * - one ACTIVE Technical Director => Technical Director authority;
 * - otherwise one ACTIVE Head Coach => Head Coach authority;
 * - ambiguity fails closed unless an explicit selectedAuthorityUid is supplied.
 */
export function resolveProClubTechnicalAuthority(
  configValue: unknown,
  candidateValues: readonly unknown[],
): ProClubTechnicalAuthorityResolution {
  const config = asRecord(configValue);
  if (!config || !isTechnicalAuthorityMode(config.authorityMode)) {
    return invalidConfig("A valid technical authority mode is required.");
  }

  if (!Array.isArray(candidateValues)) {
    return invalidConfig("Technical staff candidates must be an array.");
  }

  const candidates: ProClubTechnicalStaffCandidate[] = [];
  const seenUids = new Set<string>();

  for (const value of candidateValues) {
    if (!isTechnicalStaffCandidate(value)) {
      return invalidConfig("Every technical staff candidate must be canonical.");
    }
    if (seenUids.has(value.uid)) {
      return invalidConfig("Technical staff candidates must contain unique UIDs.");
    }
    seenUids.add(value.uid);
    candidates.push(value);
  }

  const activeTechnicalCandidates = candidates.filter(
    (candidate) =>
      candidate.status === "ACTIVE" &&
      isTechnicalAuthorityRole(candidate.staffRole),
  );

  const selectedAuthorityUid = config.selectedAuthorityUid;
  if (selectedAuthorityUid !== undefined) {
    if (!isValidDocumentIdentifier(selectedAuthorityUid)) {
      return invalidConfig("selectedAuthorityUid must be an exact document identifier.");
    }

    const selected = activeTechnicalCandidates.find(
      (candidate) => candidate.uid === selectedAuthorityUid,
    );

    if (!selected || !isTechnicalAuthorityRole(selected.staffRole)) {
      return invalidConfig(
        "selectedAuthorityUid must reference an ACTIVE Head Coach or Technical Director.",
      );
    }

    if (
      config.authorityMode !== "AUTO" &&
      selected.staffRole !== config.authorityMode
    ) {
      return invalidConfig(
        "selectedAuthorityUid must match the configured technical authority role.",
      );
    }

    return {
      state: "FOUND",
      authorityUid: selected.uid,
      authorityRole: selected.staffRole,
      resolvedBy: "SELECTED_UID",
    };
  }

  if (config.authorityMode === "TECHNICAL_DIRECTOR") {
    return resolveSingleRole(
      "TECHNICAL_DIRECTOR",
      activeTechnicalCandidates,
      "MODE",
    );
  }

  if (config.authorityMode === "HEAD_COACH") {
    return resolveSingleRole(
      "HEAD_COACH",
      activeTechnicalCandidates,
      "MODE",
    );
  }

  const technicalDirectors = activeTechnicalCandidates.filter(
    (candidate) => candidate.staffRole === "TECHNICAL_DIRECTOR",
  );

  if (technicalDirectors.length > 0) {
    return resolveSingleRole(
      "TECHNICAL_DIRECTOR",
      activeTechnicalCandidates,
      "AUTO",
    );
  }

  return resolveSingleRole(
    "HEAD_COACH",
    activeTechnicalCandidates,
    "AUTO",
  );
}

/**
 * Converts effective role + resolved authority into UI/workflow capabilities.
 * Privileged review/approval/publish capabilities require the exact resolved
 * authority UID. This does not authorize Firestore access by itself.
 */
export function resolveProClubTechnicalCapabilities(input: {
  actorUid: string;
  actorRole: ProClubStaffRole;
  authority: ProClubTechnicalAuthorityResolution;
}): ProClubTechnicalCapabilities {
  const none: ProClubTechnicalCapabilities = {
    canCreateTrainingPlan: false,
    canEditTrainingPlan: false,
    canCoAuthorTrainingPlan: false,
    canSubmitTechnicalWork: false,
    canReviewTechnicalWork: false,
    canApproveSubmittedWork: false,
    canPublishOwnTechnicalWork: false,
  };

  if (
    !isValidDocumentIdentifier(input.actorUid) ||
    !isProClubStaffRole(input.actorRole)
  ) {
    return none;
  }

  const isHeadCoach = input.actorRole === "HEAD_COACH";
  const isTechnicalDirector = input.actorRole === "TECHNICAL_DIRECTOR";
  if (!isHeadCoach && !isTechnicalDirector) return none;

  const isAuthority =
    input.authority.state === "FOUND" &&
    input.authority.authorityUid === input.actorUid &&
    input.authority.authorityRole === input.actorRole;

  return {
    canCreateTrainingPlan: isHeadCoach || isAuthority,
    canEditTrainingPlan: isHeadCoach || isTechnicalDirector,
    canCoAuthorTrainingPlan: isTechnicalDirector,
    canSubmitTechnicalWork: isHeadCoach || isTechnicalDirector,
    canReviewTechnicalWork: isAuthority,
    canApproveSubmittedWork: isAuthority,
    canPublishOwnTechnicalWork: isAuthority,
  };
}

/**
 * The resolved authority reviews/approves work created by somebody else, but
 * publishes its own work instead of self-approving it.
 */
export function resolveProClubTechnicalAuthorityAction(input: {
  actorUid: string;
  authorUid: string;
  authority: ProClubTechnicalAuthorityResolution;
}): ProClubTechnicalAuthorityAction {
  if (
    !isValidDocumentIdentifier(input.actorUid) ||
    !isValidDocumentIdentifier(input.authorUid) ||
    input.authority.state !== "FOUND" ||
    input.authority.authorityUid !== input.actorUid
  ) {
    return "NONE";
  }

  return input.actorUid === input.authorUid
    ? "PUBLISH_OWN_WORK"
    : "REVIEW_AND_APPROVE";
}

export function isProClubTechnicalWorkStatus(
  value: unknown,
): value is ProClubTechnicalWorkStatus {
  return (
    value === "DRAFT" ||
    value === "SUBMITTED" ||
    value === "IN_REVIEW" ||
    value === "NEEDS_REVISION" ||
    value === "APPROVED" ||
    value === "PUBLISHED"
  );
}

export function canTransitionProClubTechnicalWorkStatus(
  from: unknown,
  to: unknown,
): boolean {
  if (!isProClubTechnicalWorkStatus(from) || !isProClubTechnicalWorkStatus(to)) {
    return false;
  }
  return TECHNICAL_WORK_TRANSITIONS[from].includes(to);
}

export function isTechnicalLeadershipRole(
  role: ProClubStaffRole,
): role is ProClubTechnicalAuthorityRole {
  return TECHNICAL_ROLES.includes(role as ProClubTechnicalAuthorityRole);
}
