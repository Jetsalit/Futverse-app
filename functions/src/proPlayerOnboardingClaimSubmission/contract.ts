export const PRO_PLAYER_ONBOARDING_SCHEMA_VERSION = 1 as const;

export type ProPlayerPreferredFoot = "RIGHT" | "LEFT" | "BOTH";
export type ProPlayerLeagueLevel = "T1" | "T2" | "T3" | "SEMI_PRO" | "FREE_AGENT";
export type ProPlayerShoeSizeSystem = "EU" | "UK" | "US";
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

export interface ProPlayerOnboardingV1 {
  schemaVersion: 1;
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
  currentEquipment: {
    shoeSize: number;
    shoeSizeSystem: ProPlayerShoeSizeSystem;
    bootBrand: string;
    bootModel: string;
  };
  currentClubName: string | null;
  leagueLevel: ProPlayerLeagueLevel;
  contractExpiryDate: string | null;
  expectedSalary: {
    monthlyAmount: number;
    currency: "THB";
    visibility: ProPlayerSalaryVisibility;
  };
  profileImageUrl: string | null;
  careerHistory: ProPlayerCareerHistoryEntryV1[];
}

const ROOT_FIELDS = new Set([
  "schemaVersion", "firstName", "lastName", "nickname", "nationality", "dateOfBirth",
  "primaryPosition", "secondaryPosition", "heightCm", "weightKg", "preferredFoot",
  "currentEquipment", "currentClubName", "leagueLevel", "contractExpiryDate",
  "expectedSalary", "profileImageUrl", "careerHistory",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isTrimmedText(value: unknown, maxLength = 120): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && value.trim() === value;
}

function isNullableTrimmedText(value: unknown, maxLength = 120): value is string | null {
  return value === null || isTrimmedText(value, maxLength);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
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

function validateEquipment(value: unknown): boolean {
  const equipment = asRecord(value);
  return Boolean(
    equipment &&
    hasOnlyFields(equipment, new Set(["shoeSize", "shoeSizeSystem", "bootBrand", "bootModel"])) &&
    isPositiveFiniteNumber(equipment.shoeSize) &&
    ["EU", "UK", "US"].includes(equipment.shoeSizeSystem as string) &&
    isTrimmedText(equipment.bootBrand, 80) &&
    isTrimmedText(equipment.bootModel, 120)
  );
}

function validateExpectedSalary(value: unknown): boolean {
  const salary = asRecord(value);
  return Boolean(
    salary &&
    hasOnlyFields(salary, new Set(["monthlyAmount", "currency", "visibility"])) &&
    isPositiveFiniteNumber(salary.monthlyAmount) &&
    Number.isInteger(salary.monthlyAmount) &&
    salary.currency === "THB" &&
    ["PRIVATE", "AUTHORIZED_CLUB_ONLY"].includes(salary.visibility as string)
  );
}

function validateCareerEntry(value: unknown): value is ProPlayerCareerHistoryEntryV1 {
  const entry = asRecord(value);
  if (!entry || !hasOnlyFields(entry, new Set([
    "clubName", "leagueLevel", "fromDate", "toDate", "position", "appearances", "starts",
    "substituteAppearances", "minutesPlayed", "goals", "assists",
  ]))) return false;

  if (
    !isTrimmedText(entry.clubName, 120) ||
    !["T1", "T2", "T3", "SEMI_PRO"].includes(entry.leagueLevel as string) ||
    !isIsoDate(entry.fromDate) || !isNullableIsoDate(entry.toDate) ||
    !isTrimmedText(entry.position, 32) ||
    !isNonNegativeInteger(entry.appearances) || !isNonNegativeInteger(entry.starts) ||
    !isNonNegativeInteger(entry.substituteAppearances) || !isNonNegativeInteger(entry.minutesPlayed) ||
    !isNonNegativeInteger(entry.goals) || !isNonNegativeInteger(entry.assists)
  ) return false;

  if (entry.toDate !== null && entry.toDate < entry.fromDate) return false;
  if (entry.starts + entry.substituteAppearances > entry.appearances) return false;
  return true;
}

export function validateProPlayerOnboardingV1Server(value: unknown): value is ProPlayerOnboardingV1 {
  const profile = asRecord(value);
  if (!profile || !hasOnlyFields(profile, ROOT_FIELDS)) return false;

  if (
    profile.schemaVersion !== PRO_PLAYER_ONBOARDING_SCHEMA_VERSION ||
    !isTrimmedText(profile.firstName, 80) || !isTrimmedText(profile.lastName, 80) ||
    !isTrimmedText(profile.nickname, 80) || !isTrimmedText(profile.nationality, 80) ||
    !isIsoDate(profile.dateOfBirth) || !isTrimmedText(profile.primaryPosition, 32) ||
    !isNullableTrimmedText(profile.secondaryPosition, 32) ||
    !isPositiveFiniteNumber(profile.heightCm) || !isPositiveFiniteNumber(profile.weightKg) ||
    !["RIGHT", "LEFT", "BOTH"].includes(profile.preferredFoot as string) ||
    !validateEquipment(profile.currentEquipment) ||
    !["T1", "T2", "T3", "SEMI_PRO", "FREE_AGENT"].includes(profile.leagueLevel as string) ||
    !isNullableTrimmedText(profile.currentClubName, 120) ||
    !isNullableIsoDate(profile.contractExpiryDate) || !validateExpectedSalary(profile.expectedSalary) ||
    !isNullableTrimmedText(profile.profileImageUrl, 2048) ||
    !Array.isArray(profile.careerHistory) || !profile.careerHistory.every(validateCareerEntry)
  ) return false;

  if (profile.secondaryPosition !== null && profile.secondaryPosition === profile.primaryPosition) return false;
  const freeAgent = profile.leagueLevel === "FREE_AGENT";
  if (freeAgent) return profile.currentClubName === null && profile.contractExpiryDate === null;
  return profile.currentClubName !== null;
}
