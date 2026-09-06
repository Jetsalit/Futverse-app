import type { ProClubStaffRole } from "../types/ProClub";

/**
 * Coach Position V1 is a functional football position only.
 * It never grants OWNER/ADMIN/MEMBER authorization.
 */
export type ProClubCoachPositionV1 =
  | "HEAD_COACH"
  | "ASSISTANT_COACH"
  | "GK_COACH"
  | "FITNESS_COACH";

export const PRO_CLUB_TECHNICAL_LEADERSHIP_ROLE_OPTIONS_V1 = [
  "TECHNICAL_DIRECTOR",
  "MANAGER",
] as const satisfies readonly ProClubStaffRole[];

export const PRO_CLUB_COACH_POSITION_OPTIONS_V1 = [
  "HEAD_COACH",
  "ASSISTANT_COACH",
  "GK_COACH",
  "FITNESS_COACH",
] as const satisfies readonly ProClubCoachPositionV1[];

export const PRO_CLUB_SUPPORT_STAFF_ROLE_OPTIONS_V1 = [
  "ANALYST",
  "PHYSIO",
  "TEAM_MANAGER",
  "STAFF",
] as const satisfies readonly ProClubStaffRole[];

/**
 * Canonical presentation order for every Pro Club staff-role selector.
 * Keep this derived from the three groups so onboarding and management cannot drift.
 */
export const PRO_CLUB_STAFF_ROLE_OPTIONS_V1: readonly ProClubStaffRole[] = [
  ...PRO_CLUB_TECHNICAL_LEADERSHIP_ROLE_OPTIONS_V1,
  ...PRO_CLUB_COACH_POSITION_OPTIONS_V1,
  ...PRO_CLUB_SUPPORT_STAFF_ROLE_OPTIONS_V1,
];

export const PRO_CLUB_STAFF_ROLE_OPTION_GROUPS_V1 = [
  {
    id: "TECHNICAL_LEADERSHIP",
    label: "Technical leadership",
    roles: PRO_CLUB_TECHNICAL_LEADERSHIP_ROLE_OPTIONS_V1,
  },
  {
    id: "COACHING_STAFF",
    label: "Coaching positions",
    roles: PRO_CLUB_COACH_POSITION_OPTIONS_V1,
  },
  {
    id: "SUPPORT_STAFF",
    label: "Support staff",
    roles: PRO_CLUB_SUPPORT_STAFF_ROLE_OPTIONS_V1,
  },
] as const;

export function isProClubCoachPositionV1(
  value: unknown,
): value is ProClubCoachPositionV1 {
  return (
    value === "HEAD_COACH" ||
    value === "ASSISTANT_COACH" ||
    value === "GK_COACH" ||
    value === "FITNESS_COACH"
  );
}
