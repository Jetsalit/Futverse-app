import { Timestamp } from "firebase/firestore";
import type { AcademyStaffSpecialtyAssignment } from "../types/AcademyStaff";

const RECORD_FIELDS = new Set([
  "schemaVersion",
  "specialty",
  "status",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
]);

function isExactDocumentId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/");
}

/** A cached, locally pending, or malformed record cannot elevate Fitness capability. */
export function resolveAuthoritativeAcademySpecialty(
  exists: boolean,
  data: unknown,
  fromCache: boolean,
  hasPendingWrites: boolean,
): AcademyStaffSpecialtyAssignment | null {
  if (!exists || fromCache || hasPendingWrites || !data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const candidate = data as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length !== RECORD_FIELDS.size || keys.some((key) => !RECORD_FIELDS.has(key))) {
    return null;
  }
  if (
    candidate.schemaVersion !== 1 ||
    candidate.specialty !== "FITNESS_COACH" ||
    candidate.status !== "ACTIVE" ||
    !(candidate.createdAt instanceof Timestamp) ||
    !isExactDocumentId(candidate.createdBy) ||
    !(candidate.updatedAt instanceof Timestamp) ||
    !isExactDocumentId(candidate.updatedBy)
  ) {
    return null;
  }
  return { specialty: "FITNESS_COACH", status: "ACTIVE" };
}
