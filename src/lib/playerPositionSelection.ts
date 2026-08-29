export const PLAYER_POSITION_CODES = [
  "GK",
  "LB",
  "LWB",
  "CB",
  "RB",
  "RWB",
  "DM",
  "LM",
  "CM",
  "RM",
  "AM",
  "LW",
  "RW",
  "CF",
  "ST",
] as const;

export type PlayerPositionCode =
  (typeof PLAYER_POSITION_CODES)[number];

export const MAX_ADDITIONAL_POSITIONS = 3;

export const POSITION_PRIMARY_STORAGE_FIELD =
  "position" as const;

export const POSITION_ADDITIONAL_STORAGE_FIELD =
  "additionalPositions" as const;

export const POSITION_LEGACY_SECONDARY_FIELD =
  "secondaryPosition" as const;

const selectablePositionSet =
  new Set<string>(PLAYER_POSITION_CODES);

export function isPlayerPositionCode(
  value: unknown,
): value is PlayerPositionCode {
  return (
    typeof value === "string" &&
    selectablePositionSet.has(value)
  );
}

export type StoredPositionReviewKind =
  | "EMPTY"
  | "CANONICAL"
  | "LEGACY_WINGER"
  | "LEGACY_ALIAS"
  | "NON_CANONICAL"
  | "UNKNOWN";

export interface StoredPositionReview {
  originalText: string;
  trimmedText: string;
  kind: StoredPositionReviewKind;
  selectable: boolean;
  requiresConfirmation: boolean;
  suggestedCanonical: PlayerPositionCode | null;
}

export function inspectStoredPosition(
  value: unknown,
): StoredPositionReview {
  const originalText =
    typeof value === "string"
      ? value
      : "";

  const trimmedText =
    originalText.trim();

  if (!trimmedText) {
    return {
      originalText,
      trimmedText,
      kind: "EMPTY",
      selectable: false,
      requiresConfirmation: true,
      suggestedCanonical: null,
    };
  }

  if (isPlayerPositionCode(originalText)) {
    return {
      originalText,
      trimmedText,
      kind: "CANONICAL",
      selectable: true,
      requiresConfirmation: false,
      suggestedCanonical: originalText,
    };
  }

  const upper =
    trimmedText.toUpperCase();

  if (isPlayerPositionCode(upper)) {
    return {
      originalText,
      trimmedText,
      kind: "NON_CANONICAL",
      selectable: false,
      requiresConfirmation: true,
      suggestedCanonical: upper,
    };
  }

  if (upper === "WINGER") {
    return {
      originalText,
      trimmedText,
      kind: "LEGACY_WINGER",
      selectable: false,
      requiresConfirmation: true,
      suggestedCanonical: null,
    };
  }

  if (upper === "STRIKER") {
    return {
      originalText,
      trimmedText,
      kind: "LEGACY_ALIAS",
      selectable: false,
      requiresConfirmation: true,
      suggestedCanonical: "ST",
    };
  }

  return {
    originalText,
    trimmedText,
    kind: "UNKNOWN",
    selectable: false,
    requiresConfirmation: true,
    suggestedCanonical: null,
  };
}

export interface PositionSelectionInput {
  primary: string;
  additional: readonly string[];
}

export type PositionSelectionError =
  | "PRIMARY_REQUIRED"
  | "PRIMARY_NOT_SELECTABLE"
  | "TOO_MANY_ADDITIONAL"
  | "ADDITIONAL_NOT_SELECTABLE"
  | "PRIMARY_DUPLICATED_IN_ADDITIONAL"
  | "DUPLICATE_ADDITIONAL";

export interface PositionSelectionValidation {
  valid: boolean;
  errors: PositionSelectionError[];
}

export function validatePositionSelection(
  input: PositionSelectionInput,
): PositionSelectionValidation {
  const errors: PositionSelectionError[] = [];

  if (!input.primary) {
    errors.push("PRIMARY_REQUIRED");
  } else if (
    !isPlayerPositionCode(input.primary)
  ) {
    errors.push("PRIMARY_NOT_SELECTABLE");
  }

  if (
    input.additional.length >
    MAX_ADDITIONAL_POSITIONS
  ) {
    errors.push("TOO_MANY_ADDITIONAL");
  }

  if (
    input.additional.some(
      (position) =>
        !isPlayerPositionCode(position),
    )
  ) {
    errors.push("ADDITIONAL_NOT_SELECTABLE");
  }

  if (
    input.additional.includes(input.primary)
  ) {
    errors.push(
      "PRIMARY_DUPLICATED_IN_ADDITIONAL",
    );
  }

  if (
    new Set(input.additional).size !==
    input.additional.length
  ) {
    errors.push("DUPLICATE_ADDITIONAL");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export interface StoredAdditionalPositionInput {
  additionalPositions?: unknown;
  secondaryPosition?: unknown;
}

/**
 * Read compatibility only.
 *
 * Presence of the new additionalPositions field is
 * authoritative, including an explicit empty array,
 * null, undefined, or malformed runtime value.
 *
 * The legacy Pro secondaryPosition field is consulted
 * only when additionalPositions is truly absent.
 */
export function resolveAdditionalPositionsForRead(
  input: StoredAdditionalPositionInput,
): string[] {
  const hasAdditionalPositions =
    Object.prototype.hasOwnProperty.call(
      input,
      POSITION_ADDITIONAL_STORAGE_FIELD,
    );

  if (hasAdditionalPositions) {
    if (!Array.isArray(input.additionalPositions)) {
      return [];
    }

    return input.additionalPositions.filter(
      (value): value is string =>
        typeof value === "string",
    );
  }

  if (
    typeof input.secondaryPosition === "string" &&
    input.secondaryPosition.trim().length > 0
  ) {
    return [
      input.secondaryPosition,
    ];
  }

  return [];
}