import type { PlayerPositionCanonicalKey } from "./playerPositionMap";
import {
  PRO_PLAYER_ONBOARDING_SCHEMA_VERSION,
  validateProPlayerOnboardingV1,
  type ProPlayerCareerHistoryEntryV1,
  type ProPlayerLeagueLevel,
  type ProPlayerOnboardingV1,
  type ProPlayerPreferredFoot,
  type ProPlayerSalaryVisibility,
  type ProPlayerShoeSizeSystem,
} from "./proPlayerOnboardingV1";

export const PRO_PLAYER_POSITION_OPTIONS_V1 = [
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
  "WINGER",
  "RW",
  "CF",
  "ST",
] as const satisfies readonly Exclude<PlayerPositionCanonicalKey, "UNKNOWN">[];

export const PRO_PLAYER_ACTIVE_LEAGUE_OPTIONS_V1 = [
  "T1",
  "T2",
  "T3",
  "SEMI_PRO",
] as const satisfies readonly Exclude<ProPlayerLeagueLevel, "FREE_AGENT">[];

export interface ProPlayerCareerHistoryDraftV1 {
  clubName: string;
  leagueLevel: Exclude<ProPlayerLeagueLevel, "FREE_AGENT">;
  fromDate: string;
  toDate: string;
  position: string;
  appearances: string;
  starts: string;
  substituteAppearances: string;
  minutesPlayed: string;
  goals: string;
  assists: string;
}

export interface ProPlayerOnboardingDraftV1 {
  firstName: string;
  lastName: string;
  nickname: string;
  nationality: string;
  dateOfBirth: string;
  primaryPosition: string;
  secondaryPosition: string;
  heightCm: string;
  weightKg: string;
  preferredFoot: ProPlayerPreferredFoot;
  shoeSize: string;
  shoeSizeSystem: ProPlayerShoeSizeSystem;
  bootBrand: string;
  bootModel: string;
  currentClubName: string;
  leagueLevel: ProPlayerLeagueLevel;
  contractExpiryDate: string;
  expectedMonthlySalary: string;
  salaryVisibility: ProPlayerSalaryVisibility;
  profileImageUrl: string;
  careerHistory: ProPlayerCareerHistoryDraftV1[];
}

export type ProPlayerOnboardingFormErrorsV1 = Record<string, string>;

export type ProPlayerOnboardingFormBuildResultV1 =
  | { ok: true; profile: ProPlayerOnboardingV1; errors: {} }
  | { ok: false; profile: null; errors: ProPlayerOnboardingFormErrorsV1 };

export function createEmptyProPlayerCareerHistoryDraftV1(): ProPlayerCareerHistoryDraftV1 {
  return {
    clubName: "",
    leagueLevel: "T1",
    fromDate: "",
    toDate: "",
    position: "",
    appearances: "0",
    starts: "0",
    substituteAppearances: "0",
    minutesPlayed: "0",
    goals: "0",
    assists: "0",
  };
}

export function createInitialProPlayerOnboardingDraftV1(): ProPlayerOnboardingDraftV1 {
  return {
    firstName: "",
    lastName: "",
    nickname: "",
    nationality: "Thai",
    dateOfBirth: "",
    primaryPosition: "",
    secondaryPosition: "",
    heightCm: "",
    weightKg: "",
    preferredFoot: "RIGHT",
    shoeSize: "",
    shoeSizeSystem: "EU",
    bootBrand: "",
    bootModel: "",
    currentClubName: "",
    leagueLevel: "FREE_AGENT",
    contractExpiryDate: "",
    expectedMonthlySalary: "",
    salaryVisibility: "PRIVATE",
    profileImageUrl: "",
    careerHistory: [],
  };
}

function trim(value: string): string {
  return value.trim();
}

function nullableText(value: string): string | null {
  const normalized = trim(value);
  return normalized.length > 0 ? normalized : null;
}

function positiveNumber(value: string): number | null {
  const normalized = trim(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: string): number | null {
  const normalized = trim(value);
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInteger(value: string): number | null {
  const parsed = nonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function isPosition(value: string): value is (typeof PRO_PLAYER_POSITION_OPTIONS_V1)[number] {
  return (PRO_PLAYER_POSITION_OPTIONS_V1 as readonly string[]).includes(value);
}

function buildCareerEntry(
  draft: ProPlayerCareerHistoryDraftV1,
  index: number,
  errors: ProPlayerOnboardingFormErrorsV1,
): ProPlayerCareerHistoryEntryV1 | null {
  const prefix = `careerHistory.${index}`;
  const clubName = trim(draft.clubName);
  const position = trim(draft.position);
  const appearances = nonNegativeInteger(draft.appearances);
  const starts = nonNegativeInteger(draft.starts);
  const substituteAppearances = nonNegativeInteger(draft.substituteAppearances);
  const minutesPlayed = nonNegativeInteger(draft.minutesPlayed);
  const goals = nonNegativeInteger(draft.goals);
  const assists = nonNegativeInteger(draft.assists);

  if (!clubName) errors[`${prefix}.clubName`] = "Club name is required.";
  if (!draft.fromDate) errors[`${prefix}.fromDate`] = "Start date is required.";
  if (!isPosition(position)) errors[`${prefix}.position`] = "Choose a supported football position.";
  if (appearances === null) errors[`${prefix}.appearances`] = "Appearances must be a whole number of 0 or more.";
  if (starts === null) errors[`${prefix}.starts`] = "Starts must be a whole number of 0 or more.";
  if (substituteAppearances === null) errors[`${prefix}.substituteAppearances`] = "Substitute appearances must be a whole number of 0 or more.";
  if (minutesPlayed === null) errors[`${prefix}.minutesPlayed`] = "Minutes must be a whole number of 0 or more.";
  if (goals === null) errors[`${prefix}.goals`] = "Goals must be a whole number of 0 or more.";
  if (assists === null) errors[`${prefix}.assists`] = "Assists must be a whole number of 0 or more.";

  if (
    appearances !== null &&
    starts !== null &&
    substituteAppearances !== null &&
    starts + substituteAppearances > appearances
  ) {
    errors[`${prefix}.appearances`] = "Starts plus substitute appearances cannot exceed total appearances.";
  }

  if (draft.toDate && draft.fromDate && draft.toDate < draft.fromDate) {
    errors[`${prefix}.toDate`] = "End date cannot be before the start date.";
  }

  if (Object.keys(errors).some((key) => key.startsWith(prefix))) return null;

  return {
    clubName,
    leagueLevel: draft.leagueLevel,
    fromDate: draft.fromDate,
    toDate: nullableText(draft.toDate),
    position,
    appearances: appearances!,
    starts: starts!,
    substituteAppearances: substituteAppearances!,
    minutesPlayed: minutesPlayed!,
    goals: goals!,
    assists: assists!,
  };
}

export function buildProPlayerOnboardingV1FromDraft(
  draft: ProPlayerOnboardingDraftV1,
): ProPlayerOnboardingFormBuildResultV1 {
  const errors: ProPlayerOnboardingFormErrorsV1 = {};

  const firstName = trim(draft.firstName);
  const lastName = trim(draft.lastName);
  const nickname = trim(draft.nickname);
  const nationality = trim(draft.nationality);
  const primaryPosition = trim(draft.primaryPosition);
  const secondaryPosition = nullableText(draft.secondaryPosition);
  const heightCm = positiveNumber(draft.heightCm);
  const weightKg = positiveNumber(draft.weightKg);
  const shoeSize = positiveNumber(draft.shoeSize);
  const expectedMonthlySalary = positiveInteger(draft.expectedMonthlySalary);
  const bootBrand = trim(draft.bootBrand);
  const bootModel = trim(draft.bootModel);

  if (!firstName) errors.firstName = "First name is required.";
  if (!lastName) errors.lastName = "Last name is required.";
  if (!nickname) errors.nickname = "Nickname is required.";
  if (!nationality) errors.nationality = "Nationality is required.";
  if (!draft.dateOfBirth) errors.dateOfBirth = "Date of birth is required.";
  if (!isPosition(primaryPosition)) errors.primaryPosition = "Choose a supported primary position.";
  if (secondaryPosition !== null && !isPosition(secondaryPosition)) {
    errors.secondaryPosition = "Choose a supported secondary position or leave it empty.";
  }
  if (secondaryPosition !== null && secondaryPosition === primaryPosition) {
    errors.secondaryPosition = "Secondary position must be different from the primary position.";
  }
  if (heightCm === null) errors.heightCm = "Height must be greater than 0.";
  if (weightKg === null) errors.weightKg = "Weight must be greater than 0.";
  if (shoeSize === null) errors.shoeSize = "Shoe size must be greater than 0.";
  if (!bootBrand) errors.bootBrand = "Boot brand is required.";
  if (!bootModel) errors.bootModel = "Boot model is required.";
  if (expectedMonthlySalary === null) {
    errors.expectedMonthlySalary = "Expected monthly salary must be a positive whole-THB amount.";
  }

  const isFreeAgent = draft.leagueLevel === "FREE_AGENT";
  const currentClubName = isFreeAgent ? null : nullableText(draft.currentClubName);
  const contractExpiryDate = isFreeAgent ? null : nullableText(draft.contractExpiryDate);
  if (!isFreeAgent && currentClubName === null) {
    errors.currentClubName = "Current club is required unless you are a free agent.";
  }

  const careerHistory = draft.careerHistory
    .map((entry, index) => buildCareerEntry(entry, index, errors))
    .filter((entry): entry is ProPlayerCareerHistoryEntryV1 => entry !== null);

  if (Object.keys(errors).length > 0) {
    return { ok: false, profile: null, errors };
  }

  const profile: ProPlayerOnboardingV1 = {
    schemaVersion: PRO_PLAYER_ONBOARDING_SCHEMA_VERSION,
    firstName,
    lastName,
    nickname,
    nationality,
    dateOfBirth: draft.dateOfBirth,
    primaryPosition,
    secondaryPosition,
    heightCm: heightCm!,
    weightKg: weightKg!,
    preferredFoot: draft.preferredFoot,
    currentEquipment: {
      shoeSize: shoeSize!,
      shoeSizeSystem: draft.shoeSizeSystem,
      bootBrand,
      bootModel,
    },
    currentClubName,
    leagueLevel: draft.leagueLevel,
    contractExpiryDate,
    expectedSalary: {
      monthlyAmount: expectedMonthlySalary!,
      currency: "THB",
      visibility: draft.salaryVisibility,
    },
    profileImageUrl: nullableText(draft.profileImageUrl),
    careerHistory,
  };

  if (!validateProPlayerOnboardingV1(profile)) {
    return {
      ok: false,
      profile: null,
      errors: {
        _form: "Some values do not satisfy the Pro Player Onboarding V1 contract. Review dates, lengths, and career totals.",
      },
    };
  }

  return { ok: true, profile, errors: {} };
}
