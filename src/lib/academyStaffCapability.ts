import type {
  AcademyFitnessCapability,
  AcademyStaffCapabilityContext,
} from "../types/AcademyStaff";

export const ACADEMY_FITNESS_CAPABILITIES = Object.freeze([
  "FITNESS_VIEW",
  "FITNESS_RECORD_RESULTS",
  "FITNESS_MANAGE_TESTING",
  "FITNESS_MANAGE_CATALOGUE",
  "FITNESS_USE_IN_TRAINING",
] as const satisfies readonly AcademyFitnessCapability[]);

const COACH_BASE_FITNESS_CAPABILITIES = Object.freeze([
  "FITNESS_VIEW",
  "FITNESS_RECORD_RESULTS",
  "FITNESS_USE_IN_TRAINING",
] as const satisfies readonly AcademyFitnessCapability[]);

function isActiveFitnessCoachAssignment(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.specialty === "FITNESS_COACH" && candidate.status === "ACTIVE";
}

function isActiveAcademyMembershipContext(
  value: unknown,
): value is AcademyStaffCapabilityContext {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.membershipStatus === "ACTIVE" &&
    (candidate.membershipRole === "ADMIN" || candidate.membershipRole === "COACH")
  );
}

export function resolveAcademyFitnessCapabilities(
  context: unknown,
): readonly AcademyFitnessCapability[] {
  if (!isActiveAcademyMembershipContext(context)) return Object.freeze([]);

  if (context.membershipRole === "ADMIN") {
    return ACADEMY_FITNESS_CAPABILITIES;
  }

  const specialties = Array.isArray(context.specialties)
    ? context.specialties
    : [];

  return specialties.some(isActiveFitnessCoachAssignment)
    ? ACADEMY_FITNESS_CAPABILITIES
    : COACH_BASE_FITNESS_CAPABILITIES;
}

export function hasAcademyFitnessCapability(
  context: unknown,
  capability: AcademyFitnessCapability,
): boolean {
  return resolveAcademyFitnessCapabilities(context).includes(capability);
}

export function isActiveAcademyFitnessCoach(context: unknown): boolean {
  if (!isActiveAcademyMembershipContext(context)) return false;
  if (context.membershipRole !== "COACH") return false;
  const specialties = Array.isArray(context.specialties)
    ? context.specialties
    : [];
  return specialties.some(isActiveFitnessCoachAssignment);
}
