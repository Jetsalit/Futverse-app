import type {
  ProClubAuthorizationRole,
  ProClubMembershipStatus,
  ProClubStaffRole,
  ProClubStaffStatus,
} from "../types/ProClub";
import {
  isProClubAuthorizationRole,
  isProClubMembershipStatus,
  isProClubStaffRole,
  isProClubStaffStatus,
  isValidDocumentIdentifier,
} from "./proClubModel";

export interface ProClubStaffLifecycleEntryV1 {
  schemaVersion: 1;
  clubId: string;
  userId: string;
  displayName: string | null;
  authorizationRole: ProClubAuthorizationRole;
  membershipStatus: "INACTIVE" | "LEFT";
  staffRole: ProClubStaffRole;
  staffStatus: "INACTIVE" | "LEFT";
}

export interface ProClubStaffLifecycleEventV1 {
  schemaVersion: 1;
  eventId: string;
  clubId: string;
  userId: string;
  action: "CHANGE_ROLE" | "DEACTIVATE" | "REACTIVATE" | "MARK_LEFT";
  previousAuthorizationRole: ProClubAuthorizationRole;
  nextAuthorizationRole: ProClubAuthorizationRole;
  previousMembershipStatus: ProClubMembershipStatus;
  nextMembershipStatus: ProClubMembershipStatus;
  previousStaffRole: ProClubStaffRole;
  nextStaffRole: ProClubStaffRole;
  previousStaffStatus: ProClubStaffStatus;
  nextStaffStatus: ProClubStaffStatus;
  changedAtMs: number;
}

export interface ProClubStaffLifecycleReviewResponseV1 {
  schemaVersion: 1;
  clubId: string;
  inactiveEntries: ProClubStaffLifecycleEntryV1[];
  leftEntries: ProClubStaffLifecycleEntryV1[];
  events: ProClubStaffLifecycleEventV1[];
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  return actual.length === keys.length && actual.every((key) => keys.includes(key)) ? record : null;
}

function validDisplayName(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string" && value.length > 0 && value.length <= 120 && value.trim() === value
  );
}

function parseEntry(value: unknown, clubId: string, expectedStatus: "INACTIVE" | "LEFT"): ProClubStaffLifecycleEntryV1 {
  const record = exactRecord(value, [
    "schemaVersion", "clubId", "userId", "displayName", "authorizationRole",
    "membershipStatus", "staffRole", "staffStatus",
  ]);
  if (
    !record || record.schemaVersion !== 1 || record.clubId !== clubId ||
    !isValidDocumentIdentifier(record.userId) || !validDisplayName(record.displayName) ||
    !isProClubAuthorizationRole(record.authorizationRole) ||
    record.membershipStatus !== expectedStatus || record.staffStatus !== expectedStatus ||
    !isProClubStaffRole(record.staffRole)
  ) throw new Error("INVALID_LIFECYCLE_ENTRY");
  return record as unknown as ProClubStaffLifecycleEntryV1;
}

function parseEvent(value: unknown, clubId: string): ProClubStaffLifecycleEventV1 {
  const record = exactRecord(value, [
    "schemaVersion", "eventId", "clubId", "userId", "action",
    "previousAuthorizationRole", "nextAuthorizationRole",
    "previousMembershipStatus", "nextMembershipStatus",
    "previousStaffRole", "nextStaffRole", "previousStaffStatus", "nextStaffStatus", "changedAtMs",
  ]);
  if (
    !record || record.schemaVersion !== 1 || record.clubId !== clubId ||
    !isValidDocumentIdentifier(record.eventId) || !isValidDocumentIdentifier(record.userId) ||
    !["CHANGE_ROLE", "DEACTIVATE", "REACTIVATE", "MARK_LEFT"].includes(record.action as string) ||
    !isProClubAuthorizationRole(record.previousAuthorizationRole) ||
    !isProClubAuthorizationRole(record.nextAuthorizationRole) ||
    record.previousAuthorizationRole !== record.nextAuthorizationRole ||
    !isProClubMembershipStatus(record.previousMembershipStatus) ||
    !isProClubMembershipStatus(record.nextMembershipStatus) ||
    !isProClubStaffRole(record.previousStaffRole) || !isProClubStaffRole(record.nextStaffRole) ||
    !isProClubStaffStatus(record.previousStaffStatus) || !isProClubStaffStatus(record.nextStaffStatus) ||
    typeof record.changedAtMs !== "number" || !Number.isFinite(record.changedAtMs)
  ) throw new Error("INVALID_LIFECYCLE_EVENT");
  return record as unknown as ProClubStaffLifecycleEventV1;
}

export function parseProClubStaffLifecycleReviewResponseV1(
  value: unknown,
  expectedClubId: string,
): ProClubStaffLifecycleReviewResponseV1 {
  if (!isValidDocumentIdentifier(expectedClubId)) throw new Error("INVALID_LIFECYCLE_RESPONSE");
  const record = exactRecord(value, ["schemaVersion", "clubId", "inactiveEntries", "leftEntries", "events"]);
  if (
    !record || record.schemaVersion !== 1 || record.clubId !== expectedClubId ||
    !Array.isArray(record.inactiveEntries) || !Array.isArray(record.leftEntries) || !Array.isArray(record.events) ||
    record.inactiveEntries.length > 200 || record.leftEntries.length > 200 || record.events.length > 500
  ) throw new Error("INVALID_LIFECYCLE_RESPONSE");

  const seen = new Set<string>();
  const inactiveEntries = record.inactiveEntries.map((item) => parseEntry(item, expectedClubId, "INACTIVE"));
  const leftEntries = record.leftEntries.map((item) => parseEntry(item, expectedClubId, "LEFT"));
  for (const entry of [...inactiveEntries, ...leftEntries]) {
    if (seen.has(entry.userId)) throw new Error("INVALID_LIFECYCLE_RESPONSE");
    seen.add(entry.userId);
  }
  const events = record.events.map((item) => parseEvent(item, expectedClubId));
  return { schemaVersion: 1, clubId: expectedClubId, inactiveEntries, leftEntries, events };
}
