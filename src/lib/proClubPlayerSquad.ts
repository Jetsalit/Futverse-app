import { isValidDocumentIdentifier } from "./proClubModel";

export const PRO_CLUB_PLAYER_SQUAD_SCHEMA_VERSION = 1 as const;

export const PRO_CLUB_PLAYER_SQUAD_STATUSES = Object.freeze([
  "ACTIVE",
  "INACTIVE",
  "RELEASED",
] as const);

export type ProClubPlayerSquadStatus =
  (typeof PRO_CLUB_PLAYER_SQUAD_STATUSES)[number];

export const PRO_CLUB_PLAYER_SQUAD_LABEL_MAX_LENGTH = 80;
export const PRO_CLUB_PLAYER_SHIRT_NUMBER_MIN = 1;
export const PRO_CLUB_PLAYER_SHIRT_NUMBER_MAX = 99;

export interface ProClubPlayerSquadContext {
  clubId: string;
  proPlayerId: string;
}

export interface ProClubPlayerSquadRecord {
  schemaVersion: typeof PRO_CLUB_PLAYER_SQUAD_SCHEMA_VERSION;
  status: ProClubPlayerSquadStatus;
  squadLabel: string | null;
  shirtNumber: number | null;
  joinedAt: string;
  releasedAt: string | null;
  createdBy: string;
  updatedBy: string;
}

export type ProClubPlayerSquadValidationResult =
  | { valid: true; value: ProClubPlayerSquadRecord }
  | { valid: false; errors: string[] };

const RECORD_FIELDS = new Set([
  "schemaVersion",
  "status",
  "squadLabel",
  "shirtNumber",
  "joinedAt",
  "releasedAt",
  "createdBy",
  "updatedBy",
]);

const STATUS_SET = new Set<string>(PRO_CLUB_PLAYER_SQUAD_STATUSES);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function isProClubPlayerSquadStatus(
  value: unknown,
): value is ProClubPlayerSquadStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

export function isCanonicalIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.endsWith("Z")) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
}

export function isValidProClubPlayerSquadContext(
  context: unknown,
): context is ProClubPlayerSquadContext {
  const candidate = asRecord(context);
  if (!candidate) return false;
  if (Object.keys(candidate).some((key) => key !== "clubId" && key !== "proPlayerId")) {
    return false;
  }
  return (
    isValidDocumentIdentifier(candidate.clubId) &&
    isValidDocumentIdentifier(candidate.proPlayerId)
  );
}

export function isValidProClubPlayerSquadLabel(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= PRO_CLUB_PLAYER_SQUAD_LABEL_MAX_LENGTH &&
      value.trim() === value)
  );
}

export function isValidProClubPlayerShirtNumber(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= PRO_CLUB_PLAYER_SHIRT_NUMBER_MIN &&
      value <= PRO_CLUB_PLAYER_SHIRT_NUMBER_MAX)
  );
}

export function isAllowedProClubPlayerSquadTransition(
  from: unknown,
  to: unknown,
): boolean {
  if (!isProClubPlayerSquadStatus(from) || !isProClubPlayerSquadStatus(to)) {
    return false;
  }

  if (from === "ACTIVE") {
    return to === "INACTIVE" || to === "RELEASED";
  }

  if (from === "INACTIVE") {
    return to === "ACTIVE" || to === "RELEASED";
  }

  return false;
}

export function isValidInitialProClubPlayerSquadStatus(value: unknown): boolean {
  return value === "ACTIVE";
}

export function validateProClubPlayerSquadRecord(
  value: unknown,
  context: unknown,
): ProClubPlayerSquadValidationResult {
  const errors: string[] = [];
  const candidate = asRecord(value);

  if (!isValidProClubPlayerSquadContext(context)) {
    errors.push("Player Squad context must contain exact clubId and proPlayerId identifiers only.");
  }

  if (!candidate) {
    return {
      valid: false,
      errors: [...errors, "Player Squad record must be an object."],
    };
  }

  const unknownFields = Object.keys(candidate).filter(
    (field) => !RECORD_FIELDS.has(field),
  );
  if (unknownFields.length > 0) {
    errors.push("Player Squad record contains unknown fields.");
  }

  if (candidate.schemaVersion !== PRO_CLUB_PLAYER_SQUAD_SCHEMA_VERSION) {
    errors.push("Player Squad schemaVersion must be 1.");
  }

  if (!isProClubPlayerSquadStatus(candidate.status)) {
    errors.push("Player Squad status is invalid.");
  }

  if (!isValidProClubPlayerSquadLabel(candidate.squadLabel)) {
    errors.push("Player Squad squadLabel is invalid.");
  }

  if (!isValidProClubPlayerShirtNumber(candidate.shirtNumber)) {
    errors.push("Player Squad shirtNumber must be null or an integer from 1 through 99.");
  }

  if (!isCanonicalIsoUtcTimestamp(candidate.joinedAt)) {
    errors.push("Player Squad joinedAt must be canonical ISO UTC.");
  }

  if (!isValidDocumentIdentifier(candidate.createdBy)) {
    errors.push("Player Squad createdBy must be an exact document identifier.");
  }

  if (!isValidDocumentIdentifier(candidate.updatedBy)) {
    errors.push("Player Squad updatedBy must be an exact document identifier.");
  }

  if (candidate.status === "RELEASED") {
    if (!isCanonicalIsoUtcTimestamp(candidate.releasedAt)) {
      errors.push("Released Player Squad record requires canonical releasedAt.");
    } else if (
      isCanonicalIsoUtcTimestamp(candidate.joinedAt) &&
      Date.parse(candidate.releasedAt) < Date.parse(candidate.joinedAt)
    ) {
      errors.push("Player Squad releasedAt cannot be earlier than joinedAt.");
    }
  } else if (candidate.releasedAt !== null) {
    errors.push("Non-released Player Squad record requires releasedAt to be null.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      schemaVersion: PRO_CLUB_PLAYER_SQUAD_SCHEMA_VERSION,
      status: candidate.status as ProClubPlayerSquadStatus,
      squadLabel: candidate.squadLabel as string | null,
      shirtNumber: candidate.shirtNumber as number | null,
      joinedAt: candidate.joinedAt as string,
      releasedAt: candidate.releasedAt as string | null,
      createdBy: candidate.createdBy as string,
      updatedBy: candidate.updatedBy as string,
    },
  };
}
