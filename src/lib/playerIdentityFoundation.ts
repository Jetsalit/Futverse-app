export const PLAYER_IDENTITY_SCHEMA_VERSION = 1 as const;

export const PLAYER_IDENTITY_COLLECTION =
  "playerIdentities" as const;

export const FUTID_REGISTRY_COLLECTION =
  "futIdRegistry" as const;

export const ISSUED_FUTID_MAX_LENGTH = 64;

export const PLAYER_IDENTITY_SOURCES = [
  "SUPERADMIN_ISSUANCE",
  "LEGACY_MIGRATION",
] as const;

export type PlayerIdentitySource =
  (typeof PLAYER_IDENTITY_SOURCES)[number];

export interface PlayerIdentityIssuanceInput {
  playerKey: string;
  futId: string;
  source: PlayerIdentitySource;
}

export interface ValidPlayerIdentityIssuance {
  schemaVersion: 1;
  playerKey: string;
  futId: string;
  source: PlayerIdentitySource;
}

export type PlayerIdentityValidationResult =
  | {
      ok: true;
      value: ValidPlayerIdentityIssuance;
    }
  | {
      ok: false;
      errors: string[];
    };

const ISSUED_FUTID_PATTERN =
  /^FUT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

const ISSUANCE_INPUT_KEYS = [
  "futId",
  "playerKey",
  "source",
] as const;

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function hasExactIssuanceInputKeys(
  value: Record<string, unknown>,
): boolean {
  const keys =
    Object.keys(value).sort();

  return (
    keys.length === ISSUANCE_INPUT_KEYS.length &&
    keys.join(",") ===
      [...ISSUANCE_INPUT_KEYS].sort().join(",")
  );
}

export function isExactPlayerKey(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

export function isIssuedFutIdV1(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= ISSUED_FUTID_MAX_LENGTH &&
    value.trim() === value &&
    ISSUED_FUTID_PATTERN.test(value)
  );
}

export function isPlayerIdentitySource(
  value: unknown,
): value is PlayerIdentitySource {
  return (
    value === "SUPERADMIN_ISSUANCE" ||
    value === "LEGACY_MIGRATION"
  );
}

export function validatePlayerIdentityIssuance(
  input: unknown,
): PlayerIdentityValidationResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: ["Issuance input must be an object."],
    };
  }

  const errors: string[] = [];

  let playerKey: string | null = null;
  let futId: string | null = null;
  let source: PlayerIdentitySource | null = null;

  if (!hasExactIssuanceInputKeys(input)) {
    errors.push(
      "Issuance input must contain exactly playerKey, futId and source.",
    );
  }

  if (isExactPlayerKey(input.playerKey)) {
    playerKey = input.playerKey;
  } else {
    errors.push("Invalid playerKey.");
  }

  if (isIssuedFutIdV1(input.futId)) {
    futId = input.futId;
  } else {
    errors.push("Invalid issued FUTID.");
  }

  if (isPlayerIdentitySource(input.source)) {
    source = input.source;
  } else {
    errors.push("Invalid Player identity source.");
  }

  if (
    errors.length > 0 ||
    playerKey === null ||
    futId === null ||
    source === null
  ) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      schemaVersion:
        PLAYER_IDENTITY_SCHEMA_VERSION,
      playerKey,
      futId,
      source,
    },
  };
}