export const PRO_PLAYER_ONBOARDING_SCHEMA_VERSION = 1 as const;

export type ProPlayerPreferredFoot = "RIGHT" | "LEFT" | "BOTH";
export type ProPlayerLeagueLevel = "T1" | "T2" | "T3" | "SEMI_PRO" | "FREE_AGENT";
export type ProPlayerShoeSizeSystem = "EU" | "UK" | "US";
export type ProPlayerSalaryCurrency = "THB";
export type ProPlayerSalaryVisibility = "PRIVATE" | "AUTHORIZED_CLUB_ONLY";

export interface ProPlayerCareerHistoryEntryV1 {
  clubName: string;
  leagueLevel: Exclude<ProPlayerLeagueLevel, "FREE_AGENT">;
  fromDate: string;
  toDate: string | null;
  position: string;
  appearances: number;
  starts: number;
  substituteAppearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
}

export interface ProPlayerCurrentEquipmentV1 {
  shoeSize: number;
  shoeSizeSystem: ProPlayerShoeSizeSystem;
  bootBrand: string;
  bootModel: string;
}

export interface ProPlayerExpectedSalaryV1 {
  monthlyAmount: number;
  currency: ProPlayerSalaryCurrency;
  visibility: ProPlayerSalaryVisibility;
}

export interface ProPlayerOnboardingV1 {
  schemaVersion: typeof PRO_PLAYER_ONBOARDING_SCHEMA_VERSION;
  firstName: string;
  lastName: string;
  nickname: string;
  nationality: string;
  dateOfBirth: string;
  primaryPosition: string;
  secondaryPosition: string | null;
  heightCm: number;
  weightKg: number;
  preferredFoot: ProPlayerPreferredFoot;
  currentEquipment: ProPlayerCurrentEquipmentV1;
  currentClubName: string | null;
  leagueLevel: ProPlayerLeagueLevel;
  contractExpiryDate: string | null;
  expectedSalary: ProPlayerExpectedSalaryV1;
  profileImageUrl: string | null;
  careerHistory: ProPlayerCareerHistoryEntryV1[];
}

const ROOT_FIELDS = new Set([
  "schemaVersion",
  "firstName",
  "lastName",
  "nickname",
  "nationality",
  "dateOfBirth",
  "primaryPosition",
  "secondaryPosition",
  "heightCm",
  "weightKg",
  "preferredFoot",
  "currentEquipment",
  "currentClubName",
  "leagueLevel",
  "contractExpiryDate",
  "expectedSalary",
  "profileImageUrl",
  "careerHistory",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isTrimmedText(value: unknown, maxLength = 120): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value
  );
}

function isNullableTrimmedText(value: unknown, maxLength = 120): value is string | null {
  return value === null || isTrimmedText(value, maxLength);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isNullableIsoDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPreferredFoot(value: unknown): value is ProPlayerPreferredFoot {
  return value === "RIGHT" || value === "LEFT" || value === "BOTH";
}

function isLeagueLevel(value: unknown): value is ProPlayerLeagueLevel {
  return value === "T1" || value === "T2" || value === "T3" || value === "SEMI_PRO" || value === "FREE_AGENT";
}

function validateEquipment(value: unknown): value is ProPlayerCurrentEquipmentV1 {
  const equipment = asRecord(value);
  if (!equipment) return false;
  if (!hasOnlyFields(equipment, new Set(["shoeSize", "shoeSizeSystem", "bootBrand", "bootModel"]))) return false;
  return (
    isPositiveFiniteNumber(equipment.shoeSize) &&
    (equipment.shoeSizeSystem === "EU" || equipment.shoeSizeSystem === "UK" || equipment.shoeSizeSystem === "US") &&
    isTrimmedText(equipment.bootBrand, 80) &&
    isTrimmedText(equipment.bootModel, 120)
  );
}

function validateExpectedSalary(value: unknown): value is ProPlayerExpectedSalaryV1 {
  const salary = asRecord(value);
  if (!salary) return false;
  if (!hasOnlyFields(salary, new Set(["monthlyAmount", "currency", "visibility"]))) return false;
  return (
    isPositiveFiniteNumber(salary.monthlyAmount) &&
    Number.isInteger(salary.monthlyAmount) &&
    salary.currency === "THB" &&
    (salary.visibility === "PRIVATE" || salary.visibility === "AUTHORIZED_CLUB_ONLY")
  );
}

function validateCareerEntry(value: unknown): value is ProPlayerCareerHistoryEntryV1 {
  const entry = asRecord(value);
  if (!entry) return false;
  if (!hasOnlyFields(entry, new Set([
    "clubName",
    "leagueLevel",
    "fromDate",
    "toDate",
    "position",
    "appearances",
    "starts",
    "substituteAppearances",
    "minutesPlayed",
    "goals",
    "assists",
  ]))) return false;

  if (
    !isTrimmedText(entry.clubName, 120) ||
    !(entry.leagueLevel === "T1" || entry.leagueLevel === "T2" || entry.leagueLevel === "T3" || entry.leagueLevel === "SEMI_PRO") ||
    !isIsoDate(entry.fromDate) ||
    !isNullableIsoDate(entry.toDate) ||
    !isTrimmedText(entry.position, 32) ||
    !isNonNegativeInteger(entry.appearances) ||
    !isNonNegativeInteger(entry.starts) ||
    !isNonNegativeInteger(entry.substituteAppearances) ||
    !isNonNegativeInteger(entry.minutesPlayed) ||
    !isNonNegativeInteger(entry.goals) ||
    !isNonNegativeInteger(entry.assists)
  ) {
    return false;
  }

  if (entry.toDate !== null && entry.toDate < entry.fromDate) return false;
  if (entry.starts + entry.substituteAppearances > entry.appearances) return false;
  return true;
}

export function validateProPlayerOnboardingV1(value: unknown): value is ProPlayerOnboardingV1 {
  const profile = asRecord(value);
  if (!profile || !hasOnlyFields(profile, ROOT_FIELDS)) return false;

  if (
    profile.schemaVersion !== PRO_PLAYER_ONBOARDING_SCHEMA_VERSION ||
    !isTrimmedText(profile.firstName, 80) ||
    !isTrimmedText(profile.lastName, 80) ||
    !isTrimmedText(profile.nickname, 80) ||
    !isTrimmedText(profile.nationality, 80) ||
    !isIsoDate(profile.dateOfBirth) ||
    !isTrimmedText(profile.primaryPosition, 32) ||
    !isNullableTrimmedText(profile.secondaryPosition, 32) ||
    !isPositiveFiniteNumber(profile.heightCm) ||
    !isPositiveFiniteNumber(profile.weightKg) ||
    !isPreferredFoot(profile.preferredFoot) ||
    !validateEquipment(profile.currentEquipment) ||
    !isLeagueLevel(profile.leagueLevel) ||
    !isNullableTrimmedText(profile.currentClubName, 120) ||
    !isNullableIsoDate(profile.contractExpiryDate) ||
    !validateExpectedSalary(profile.expectedSalary) ||
    !isNullableTrimmedText(profile.profileImageUrl, 2048) ||
    !Array.isArray(profile.careerHistory) ||
    !profile.careerHistory.every(validateCareerEntry)
  ) {
    return false;
  }

  if (profile.secondaryPosition !== null && profile.secondaryPosition === profile.primaryPosition) return false;

  const isFreeAgent = profile.leagueLevel === "FREE_AGENT";
  if (isFreeAgent) {
    if (profile.currentClubName !== null || profile.contractExpiryDate !== null) return false;
  } else if (profile.currentClubName === null) {
    return false;
  }

  return true;
}

export function containsLegacyMarketValueField(value: unknown): boolean {
  const profile = asRecord(value);
  return Boolean(profile && Object.prototype.hasOwnProperty.call(profile, "marketValue"));
}
