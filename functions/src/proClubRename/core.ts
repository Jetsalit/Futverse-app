export const RENAME_ERROR_CODES = {
  INVALID_REQUEST: "ERROR_INVALID_PRO_CLUB_RENAME_REQUEST",
  UNAUTHORIZED: "ERROR_UNAUTHORIZED_REQUESTING_PRINCIPAL",
  CLUB_NOT_FOUND: "ERROR_PRO_CLUB_NOT_FOUND",
  INVALID_EXISTING_CLUB: "ERROR_INVALID_EXISTING_PRO_CLUB",
  STALE_REQUEST: "ERROR_STALE_PRO_CLUB_RENAME_REQUEST",
  NO_OP: "ERROR_PRO_CLUB_RENAME_NO_OP",
  EFFECTIVE_AT_FUTURE: "ERROR_PRO_CLUB_RENAME_EFFECTIVE_AT_FUTURE",
  EFFECTIVE_AT_OUT_OF_ORDER: "ERROR_PRO_CLUB_RENAME_EFFECTIVE_AT_OUT_OF_ORDER",
  INTEGRITY: "ERROR_PRO_CLUB_RENAME_INTEGRITY",
} as const;

export type ProClubRenameErrorCode =
  (typeof RENAME_ERROR_CODES)[keyof typeof RENAME_ERROR_CODES];

export class ProClubRenameError extends Error {
  constructor(public readonly code: ProClubRenameErrorCode, message: string) {
    super(message);
    this.name = "ProClubRenameError";
  }
}

export type ProClubNameChangeReason =
  | "TAKEOVER"
  | "REBRAND"
  | "LEGAL_NAME_CHANGE"
  | "OTHER";

export type ProClubShortNameChange =
  | { readonly action: "UNCHANGED" }
  | { readonly action: "SET"; readonly value: string }
  | { readonly action: "REMOVE" };

export interface NormalizedProClubRenameRequestV1 {
  readonly clubId: string;
  readonly newName: string;
  readonly shortNameChange: ProClubShortNameChange;
  readonly reason: ProClubNameChangeReason;
  readonly reasonNote: string | null;
  readonly effectiveAt: string;
  readonly expectedCurrentName: string;
  readonly expectedCurrentShortName: string | null;
  readonly expectedUpdatedAt: string | null;
}

export interface StoredProClubForRename {
  name: string;
  shortName?: string;
  level: "T1" | "T2" | "T3";
  status: "ACTIVE" | "INACTIVE";
  country?: string;
  logoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoredProClubNameHistoryV1 {
  schemaVersion: 1;
  clubId: string;
  previousName: string;
  previousShortName: string | null;
  newName: string;
  newShortName: string | null;
  reason: ProClubNameChangeReason;
  reasonNote: string | null;
  effectiveAt: string;
  changedAt: string;
  changedBy: string;
}

const REQUEST_FIELDS = new Set([
  "clubId", "newName", "shortNameChange", "reason", "reasonNote",
  "effectiveAt", "expectedCurrentName", "expectedCurrentShortName",
  "expectedUpdatedAt",
]);
const CLUB_FIELDS = new Set([
  "name", "shortName", "level", "status", "country", "logoUrl",
  "createdAt", "updatedAt",
]);
const HISTORY_FIELDS = new Set([
  "schemaVersion", "clubId", "previousName", "previousShortName", "newName",
  "newShortName", "reason", "reasonNote", "effectiveAt", "changedAt",
  "changedBy",
]);
const MAX_NAME_LENGTH = 120;
const MAX_SHORT_NAME_LENGTH = 32;
const MAX_REASON_NOTE_LENGTH = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function isValidDocumentIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.trim() === value && !value.includes("/");
}

export function isCanonicalIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.endsWith("Z")) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
}

function requireCanonicalText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string" || value.length === 0 ||
      value.length > maxLength || value.trim() !== value) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INVALID_REQUEST,
      `${field} must be a non-empty, already-trimmed string of at most ${maxLength} characters`,
    );
  }
  return value;
}

function requireExactText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INVALID_REQUEST,
      `${field} must be a non-empty, already-trimmed string`,
    );
  }
  return value;
}

function requireNullableExactText(
  value: unknown,
  field: string,
): string | null {
  if (value === null) return null;
  return requireExactText(value, field);
}

export function isProClubNameChangeReason(
  value: unknown,
): value is ProClubNameChangeReason {
  return value === "TAKEOVER" || value === "REBRAND" ||
    value === "LEGAL_NAME_CHANGE" || value === "OTHER";
}

function normalizeShortNameChange(value: unknown): ProClubShortNameChange {
  const change = asRecord(value);
  if (!change || typeof change.action !== "string") {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INVALID_REQUEST,
      "shortNameChange must declare UNCHANGED, SET, or REMOVE",
    );
  }
  if (change.action === "UNCHANGED" || change.action === "REMOVE") {
    if (Object.keys(change).length !== 1) {
      throw new ProClubRenameError(
        RENAME_ERROR_CODES.INVALID_REQUEST,
        `${change.action} shortNameChange must contain only action`,
      );
    }
    return { action: change.action };
  }
  if (change.action === "SET") {
    if (Object.keys(change).length !== 2 || !("value" in change)) {
      throw new ProClubRenameError(
        RENAME_ERROR_CODES.INVALID_REQUEST,
        "SET shortNameChange requires exactly action and value",
      );
    }
    return {
      action: "SET",
      value: requireCanonicalText(
        change.value,
        "shortNameChange.value",
        MAX_SHORT_NAME_LENGTH,
      ),
    };
  }
  throw new ProClubRenameError(
    RENAME_ERROR_CODES.INVALID_REQUEST,
    "shortNameChange action is invalid",
  );
}

export function validateAndNormalizeProClubRenameRequest(
  rawInput: unknown,
): NormalizedProClubRenameRequestV1 {
  const input = asRecord(rawInput);
  if (!input || Object.keys(input).length !== REQUEST_FIELDS.size ||
      !Object.keys(input).every((key) => REQUEST_FIELDS.has(key))) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INVALID_REQUEST,
      "Request payload must contain only the exact rename fields",
    );
  }
  if (!isValidDocumentIdentifier(input.clubId)) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INVALID_REQUEST,
      "clubId must be an exact document identifier",
    );
  }
  if (!isProClubNameChangeReason(input.reason)) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INVALID_REQUEST,
      "reason must be TAKEOVER, REBRAND, LEGAL_NAME_CHANGE, or OTHER",
    );
  }
  if (!isCanonicalIsoUtcTimestamp(input.effectiveAt)) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INVALID_REQUEST,
      "effectiveAt must be a canonical ISO-8601 UTC timestamp",
    );
  }

  let reasonNote: string | null = null;
  if (input.reason === "OTHER") {
    reasonNote = requireCanonicalText(
      input.reasonNote,
      "reasonNote",
      MAX_REASON_NOTE_LENGTH,
    );
  } else if (input.reasonNote !== null) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INVALID_REQUEST,
      "reasonNote must be null unless reason is OTHER",
    );
  }

  let expectedUpdatedAt: string | null = null;
  if (input.expectedUpdatedAt !== null) {
    expectedUpdatedAt = requireExactText(input.expectedUpdatedAt, "expectedUpdatedAt");
  }

  return {
    clubId: input.clubId,
    newName: requireCanonicalText(input.newName, "newName", MAX_NAME_LENGTH),
    shortNameChange: normalizeShortNameChange(input.shortNameChange),
    reason: input.reason,
    reasonNote,
    effectiveAt: input.effectiveAt,
    expectedCurrentName: requireExactText(
      input.expectedCurrentName,
      "expectedCurrentName",
    ),
    expectedCurrentShortName: requireNullableExactText(
      input.expectedCurrentShortName,
      "expectedCurrentShortName",
    ),
    expectedUpdatedAt,
  };
}

function optionalCanonicalText(value: unknown): boolean {
  return value === undefined || (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}

export function validateStoredProClubForRename(
  value: unknown,
): value is StoredProClubForRename {
  const club = asRecord(value);
  if (!club || !Object.keys(club).every((key) => CLUB_FIELDS.has(key))) return false;
  return typeof club.name === "string" && club.name.length > 0 &&
    club.name.trim() === club.name &&
    optionalCanonicalText(club.shortName) &&
    (club.level === "T1" || club.level === "T2" || club.level === "T3") &&
    (club.status === "ACTIVE" || club.status === "INACTIVE") &&
    optionalCanonicalText(club.country) && optionalCanonicalText(club.logoUrl) &&
    optionalCanonicalText(club.createdAt) && optionalCanonicalText(club.updatedAt);
}

export function resolveNewShortName(
  currentShortName: string | undefined,
  change: ProClubShortNameChange,
): string | undefined {
  if (change.action === "UNCHANGED") return currentShortName;
  if (change.action === "REMOVE") return undefined;
  return change.value;
}

export function assertFreshRenameRequest(
  request: NormalizedProClubRenameRequestV1,
  club: StoredProClubForRename,
): void {
  if (request.expectedCurrentName !== club.name ||
      request.expectedCurrentShortName !== (club.shortName ?? null) ||
      request.expectedUpdatedAt !== (club.updatedAt ?? null)) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.STALE_REQUEST,
      "The Pro Club identity changed after this rename request was prepared",
    );
  }
  const newShortName = resolveNewShortName(club.shortName, request.shortNameChange);
  if (request.newName === club.name && newShortName === club.shortName) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.NO_OP,
      "Rename must change the name or short name",
    );
  }
}

export function assertEffectiveAtNotFuture(
  request: NormalizedProClubRenameRequestV1,
  changedAt: string,
): void {
  if (!isCanonicalIsoUtcTimestamp(changedAt)) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INTEGRITY,
      "Trusted rename timestamp is invalid",
    );
  }
  if (Date.parse(request.effectiveAt) > Date.parse(changedAt)) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.EFFECTIVE_AT_FUTURE,
      "V1 does not permit a future scheduled rename",
    );
  }
}

export function assertEffectiveAtNotBeforeClubCreation(
  request: NormalizedProClubRenameRequestV1,
  club: StoredProClubForRename,
): void {
  if (!isCanonicalIsoUtcTimestamp(club.createdAt)) return;
  if (Date.parse(request.effectiveAt) < Date.parse(club.createdAt)) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.EFFECTIVE_AT_OUT_OF_ORDER,
      "Rename effectiveAt cannot precede canonical club creation",
    );
  }
}

function isNullableCanonicalText(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}

function isCompleteCanonicalNameHistoryRecord(
  value: unknown,
): value is StoredProClubNameHistoryV1 {
  const history = asRecord(value);
  if (!history || Object.keys(history).length !== HISTORY_FIELDS.size ||
      !Object.keys(history).every((key) => HISTORY_FIELDS.has(key))) {
    return false;
  }
  return history.schemaVersion === 1 &&
    isValidDocumentIdentifier(history.clubId) &&
    typeof history.previousName === "string" &&
    history.previousName.length > 0 &&
    history.previousName.trim() === history.previousName &&
    isNullableCanonicalText(history.previousShortName) &&
    typeof history.newName === "string" &&
    history.newName.length > 0 && history.newName.length <= MAX_NAME_LENGTH &&
    history.newName.trim() === history.newName &&
    isNullableCanonicalText(history.newShortName) &&
    isProClubNameChangeReason(history.reason) &&
    isNullableCanonicalText(history.reasonNote) &&
    (history.reasonNote === null || history.reasonNote.length <= MAX_REASON_NOTE_LENGTH) &&
    (history.reason === "OTHER" ? history.reasonNote !== null : history.reasonNote === null) &&
    isCanonicalIsoUtcTimestamp(history.effectiveAt) &&
    isCanonicalIsoUtcTimestamp(history.changedAt) &&
    isValidDocumentIdentifier(history.changedBy);
}

export function assertEffectiveAtFollowsPriorTransition(
  request: NormalizedProClubRenameRequestV1,
  club: StoredProClubForRename,
  priorHistory: unknown | null,
): void {
  if (priorHistory === null) return;
  if (!isCompleteCanonicalNameHistoryRecord(priorHistory) ||
      priorHistory.clubId !== request.clubId ||
      priorHistory.newName !== club.name ||
      priorHistory.newShortName !== (club.shortName ?? null)) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INTEGRITY,
      "Prior Pro Club name transition is malformed or discontinuous",
    );
  }
  if (Date.parse(request.effectiveAt) <= Date.parse(priorHistory.effectiveAt)) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.EFFECTIVE_AT_OUT_OF_ORDER,
      "Rename effectiveAt must be later than the prior name transition",
    );
  }
}

export function buildNameHistoryRecord(
  request: NormalizedProClubRenameRequestV1,
  club: StoredProClubForRename,
  changedBy: string,
  changedAt: string,
): StoredProClubNameHistoryV1 {
  if (!isValidDocumentIdentifier(changedBy) ||
      !isCanonicalIsoUtcTimestamp(changedAt)) {
    throw new ProClubRenameError(
      RENAME_ERROR_CODES.INTEGRITY,
      "Trusted audit identity or timestamp is invalid",
    );
  }
  return {
    schemaVersion: 1,
    clubId: request.clubId,
    previousName: club.name,
    previousShortName: club.shortName ?? null,
    newName: request.newName,
    newShortName: resolveNewShortName(club.shortName, request.shortNameChange) ?? null,
    reason: request.reason,
    reasonNote: request.reasonNote,
    effectiveAt: request.effectiveAt,
    changedAt,
    changedBy,
  };
}
