import type { User } from "../contexts/AuthContext";
import { isExactDocumentId } from "./superAdminSupportModel";

export type NonStaffSupportRole = "PARENT" | "PLAYER";

export interface NonStaffSupportSubject {
  uid: string;
  role: NonStaffSupportRole;
  displayName?: string;
  email?: string;
}

export interface NonStaffSupportSession {
  academyId: string;
  subject: NonStaffSupportSubject;
  startedAt: number;
}

export function isNonStaffSupportRole(
  role: unknown,
): role is NonStaffSupportRole {
  return role === "PARENT" || role === "PLAYER";
}

export function isExactActiveNonStaffSupportUser(
  user: unknown,
  expectedUid?: unknown,
): user is User & { role: NonStaffSupportRole } {
  if (!user || typeof user !== "object") return false;
  const candidate = user as Record<string, unknown>;
  const uid = candidate.uid || candidate.id;

  if (!isExactDocumentId(uid)) return false;
  if (expectedUid !== undefined && uid !== expectedUid) return false;
  if (!isNonStaffSupportRole(candidate.role)) return false;

  return candidate.status === "ACTIVE" || candidate.status === "Active";
}

export function resolveNonStaffPresentationRole(
  session: NonStaffSupportSession | null,
): NonStaffSupportRole | "NONE" {
  if (!session) return "NONE";
  if (!isExactDocumentId(session.academyId)) return "NONE";
  if (!isExactDocumentId(session.subject?.uid)) return "NONE";
  return isNonStaffSupportRole(session.subject?.role)
    ? session.subject.role
    : "NONE";
}

export function buildNonStaffSupportSubject(
  user: User,
): NonStaffSupportSubject | null {
  if (!isExactActiveNonStaffSupportUser(user)) return null;
  const uid = user.uid || user.id;
  if (!isExactDocumentId(uid)) return null;

  return {
    uid,
    role: user.role,
    displayName: user.name,
    email: user.email,
  };
}
