export type SuperAdminSupportMode =
  | "ACADEMY_WORKSPACE"
  | "WORK_AS_STAFF"
  | "SUPPORT_PLAYER"
  | "SUPPORT_PARENT";

export type SuperAdminSupportSubjectRole =
  | "ADMIN"
  | "COACH"
  | "PLAYER"
  | "PARENT";

export interface SuperAdminSupportSubject {
  uid: string;
  role: SuperAdminSupportSubjectRole;
  displayName?: string;
  tenantRole?: "ADMIN" | "COACH";
  playerId?: string;
}

export interface SuperAdminSupportSession {
  academyId: string;
  mode: SuperAdminSupportMode;
  subject?: SuperAdminSupportSubject;
  startedAt: number;
}
