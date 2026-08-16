export type SuperAdminSupportMode =
  | "ACADEMY_WORKSPACE"
  | "WORK_AS_STAFF"
  | "WORK_AS_NONSTAFF";

export type SuperAdminSupportSubjectRole =
  | "ADMIN"
  | "COACH"
  | "PARENT"
  | "PLAYER";

export interface SuperAdminSupportSubject {
  uid: string;
  role: SuperAdminSupportSubjectRole;
  displayName?: string;
  email?: string;
  tenantRole?: "ADMIN" | "COACH";
  playerId?: string;
}

export interface SuperAdminSupportSession {
  academyId: string;
  mode: SuperAdminSupportMode;
  subject?: SuperAdminSupportSubject;
  startedAt: number;
}
