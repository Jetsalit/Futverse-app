import {
  calculateAgeFromDateOnly,
} from "./dateTimeFoundation";

export type PlayerProfileSource =
  | "ACADEMY"
  | "PRO";

export type ProPreferredFoot =
  | "Right"
  | "Left"
  | "Both";

export type ProLeague =
  | "T1"
  | "T2"
  | "T3"
  | "Semi-pro"
  | "Free Agent";

export interface PlayerProfileReadModelBase {
  source: PlayerProfileSource;
  sourceDocumentId: string;
  displayName: string;
  position: string;
  dateOfBirth: string;
  age: number | null;
  avatarUrl: string | null;
}

export interface AcademyPlayerProfileReadModel
  extends PlayerProfileReadModelBase {
  source: "ACADEMY";
  ageGroup: string;
}

export interface ProPlayerProfileReadModel
  extends PlayerProfileReadModelBase {
  source: "PRO";
  secondaryPosition: string | null;
  preferredFoot: ProPreferredFoot | null;
  nationality: string | null;
  height: number | null;
  weight: number | null;
  currentClub: string | null;
  league: ProLeague | null;
}

export type PlayerProfileReadModel =
  | AcademyPlayerProfileReadModel
  | ProPlayerProfileReadModel;

/**
 * Current Academy player storage contract required
 * by the read adapter.
 *
 * `age` and `fitness_status` are intentionally not
 * authoritative profile fields. Existing documents may
 * still contain them for legacy compatibility.
 */
export interface AcademyPlayerProfileSource {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  ageGroup: string;
  dob: string;
  avatar?: string | null;
  age?: number;
  fitness_status?: string;
}

/**
 * Current Pro player storage fields required by the
 * shared read adapter.
 *
 * No FUTID or playerKey authority belongs here.
 */
export interface ProPlayerProfileSource {
  id: string;
  name: string;
  position: string;
  dob: string;
  avatarUrl?: string | null;
  secondaryPosition?: string | null;
  preferredFoot?: ProPreferredFoot | null;
  nationality?: string | null;
  height?: number | null;
  weight?: number | null;
  currentClub?: string | null;
  league?: ProLeague | null;
}

function optionalText(
  value: string | null | undefined,
): string | null {
  return (
    typeof value === "string" &&
    value.length > 0
  )
    ? value
    : null;
}

function academyDisplayName(
  firstName: string,
  lastName: string,
): string {
  return [
    firstName,
    lastName,
  ]
    .filter(
      (part) => part.length > 0,
    )
    .join(" ");
}

/**
 * Maps the existing Academy tenant player record into
 * the shared presentation/read contract.
 *
 * This function performs no Firestore writes and does
 * not resolve identity authority.
 */
export function toAcademyPlayerProfileReadModel(
  player: AcademyPlayerProfileSource,
  onDate: string,
): AcademyPlayerProfileReadModel {
  return {
    source: "ACADEMY",
    sourceDocumentId: player.id,
    displayName: academyDisplayName(
      player.firstName,
      player.lastName,
    ),
    position: player.position,
    dateOfBirth: player.dob,
    age: calculateAgeFromDateOnly(
      player.dob,
      onDate,
    ),
    avatarUrl: optionalText(
      player.avatar,
    ),
    ageGroup: player.ageGroup,
  };
}

/**
 * Maps the existing Pro player record into the shared
 * presentation/read contract.
 *
 * Pro-only CV fields remain extensions rather than
 * becoming Academy/shared storage fields.
 */
export function toProPlayerProfileReadModel(
  player: ProPlayerProfileSource,
  onDate: string,
): ProPlayerProfileReadModel {
  return {
    source: "PRO",
    sourceDocumentId: player.id,
    displayName: player.name,
    position: player.position,
    dateOfBirth: player.dob,
    age: calculateAgeFromDateOnly(
      player.dob,
      onDate,
    ),
    avatarUrl: optionalText(
      player.avatarUrl,
    ),
    secondaryPosition: optionalText(
      player.secondaryPosition,
    ),
    preferredFoot:
      player.preferredFoot ?? null,
    nationality: optionalText(
      player.nationality,
    ),
    height:
      typeof player.height === "number"
        ? player.height
        : null,
    weight:
      typeof player.weight === "number"
        ? player.weight
        : null,
    currentClub: optionalText(
      player.currentClub,
    ),
    league:
      player.league ?? null,
  };
}
