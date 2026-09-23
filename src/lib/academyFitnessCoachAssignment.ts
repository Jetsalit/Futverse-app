import { Timestamp } from "firebase/firestore";
import type { AcademyStaffSpecialtyRecord } from "../types/AcademyStaff";
import {
  isExactActiveStaffMembershipForRole,
  isExactActiveSuperAdmin,
  isExactDocumentId,
} from "./superAdminSupportModel";

type DocumentValue = { id: string; data: unknown };
export type FitnessCoachAssignmentRow = {
  uid: string;
  status: "NONE" | "ACTIVE" | "INACTIVE" | "LEFT";
  canActivate: boolean;
  canDeactivate: boolean;
};

export function canManageFitnessCoachAssignments(
  actualActor: unknown,
  actorMembership: unknown,
  academyId: unknown,
): boolean {
  if (!isExactDocumentId(academyId) || !actualActor || typeof actualActor !== "object") return false;
  const actor = actualActor as Record<string, unknown>;
  if (!isExactDocumentId(actor.uid)) return false;
  if (isExactActiveSuperAdmin(actor)) return true;
  return (actor.status === "ACTIVE" || actor.status === "Active")
    && isExactActiveStaffMembershipForRole(actorMembership, actor.uid, academyId, actor.uid, "ADMIN");
}

export function isValidFitnessCoachSpecialtyRecord(value: unknown): value is AcademyStaffSpecialtyRecord {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const fields = ["schemaVersion", "specialty", "status", "createdAt", "createdBy", "updatedAt", "updatedBy"];
  return Object.keys(data).length === fields.length
    && fields.every((field) => Object.hasOwn(data, field))
    && data.schemaVersion === 1
    && data.specialty === "FITNESS_COACH"
    && (data.status === "ACTIVE" || data.status === "INACTIVE" || data.status === "LEFT")
    && data.createdAt instanceof Timestamp
    && data.updatedAt instanceof Timestamp
    && isExactDocumentId(data.createdBy)
    && isExactDocumentId(data.updatedBy);
}

export function resolveFitnessCoachAssignmentRows(
  academyId: string,
  membershipDocs: readonly DocumentValue[],
  specialtyDocs: readonly DocumentValue[],
): FitnessCoachAssignmentRow[] {
  if (!isExactDocumentId(academyId)) throw new Error("An exact Academy ID is required.");
  const activeCoachUids = new Set(
    membershipDocs
      .filter(({ id, data }) => isExactActiveStaffMembershipForRole(data, id, academyId, id, "COACH"))
      .map(({ id }) => id),
  );
  const specialties = new Map<string, AcademyStaffSpecialtyRecord>();
  for (const { id, data } of specialtyDocs) {
    if (!isExactDocumentId(id) || !isValidFitnessCoachSpecialtyRecord(data)) {
      throw new Error("An invalid specialty record prevents assignment changes.");
    }
    specialties.set(id, data);
  }
  const uids = new Set([...activeCoachUids, ...specialties.keys()]);
  return [...uids].sort().map((uid) => {
    const status = specialties.get(uid)?.status ?? "NONE";
    const eligible = activeCoachUids.has(uid);
    return {
      uid,
      status,
      canActivate: eligible && (status === "NONE" || status === "INACTIVE"),
      canDeactivate: status === "ACTIVE",
    };
  });
}

export function validateFitnessCoachTransition(
  nextStatus: "ACTIVE" | "INACTIVE",
  targetMembership: unknown,
  targetUid: string,
  academyId: string,
  currentRecord: unknown,
): "CREATE" | "UPDATE" {
  if (!isExactDocumentId(targetUid) || !isExactDocumentId(academyId)) {
    throw new Error("Exact Academy and Coach IDs are required.");
  }
  if (currentRecord !== null && !isValidFitnessCoachSpecialtyRecord(currentRecord)) {
    throw new Error("The current specialty record is invalid.");
  }
  if (currentRecord !== null && isValidFitnessCoachSpecialtyRecord(currentRecord)
    && currentRecord.status === "LEFT") throw new Error("LEFT is a terminal specialty status.");
  if (nextStatus === "ACTIVE" && !isExactActiveStaffMembershipForRole(
    targetMembership, targetUid, academyId, targetUid, "COACH",
  )) {
    throw new Error("Assignment requires an exact active Coach membership.");
  }
  if (currentRecord === null) {
    if (nextStatus !== "ACTIVE") throw new Error("Deactivation requires an existing assignment.");
    return "CREATE";
  }
  return "UPDATE";
}
