export type SuperAdminSupportMode =
  | "ACADEMY_WORKSPACE"
  | "WORK_AS_STAFF";

export type SuperAdminSupportSubjectRole =
  | "ADMIN"
  | "COACH";

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
