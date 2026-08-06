import {
  isExactFirestoreIdentifier,
  isValidInviteCode,
  normalizeInviteCode,
  parseOfflineExport,
  type OfflineAcademy,
  type OfflineAcademyInvite,
  type OfflineExport,
  type OfflineMembership,
  type OfflineUser,
} from "./membershipBackfillDryRunCore";

export class MembershipExportSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipExportSafetyError";
  }
}

export interface ExportAcademy {
  documentId: string;
  data: Record<string, unknown>;
}

export interface ExportUser {
  documentId: string;
  data: Record<string, unknown>;
}

export interface ExportMembership {
  parentAcademyId: string;
  documentId: string;
  data: Record<string, unknown>;
}

export interface ExportAcademyInvite {
  documentId: string;
  data: Record<string, unknown>;
}

export interface MembershipExportReadSource {
  listAcademies(): Promise<ExportAcademy[]>;
  listUsers(): Promise<ExportUser[]>;
  listMembershipsForAcademy(academyId: string): Promise<ExportMembership[]>;
  listAcademyInvites(): Promise<ExportAcademyInvite[]>;
  close(): Promise<void>;
}

export interface CollectedMembershipExport {
  exportData: OfflineExport;
  queriedPaths: string[];
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function requireIdentifier(value: unknown, label: string): asserts value is string {
  if (!isExactFirestoreIdentifier(value)) {
    throw new MembershipExportSafetyError(`${label} is not an exact Firestore identifier.`);
  }
}

function optionalString(data: Record<string, unknown>, field: string): string | undefined {
  return typeof data[field] === "string" ? data[field] as string : undefined;
}

function optionalBoolean(data: Record<string, unknown>, field: string): boolean | undefined {
  return typeof data[field] === "boolean" ? data[field] as boolean : undefined;
}

function compact<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function academyFromDocument(document: ExportAcademy): OfflineAcademy {
  requireIdentifier(document.documentId, "Academy document ID");
  if (document.data.id !== undefined && document.data.id !== document.documentId) {
    throw new MembershipExportSafetyError("Academy id field conflicts with its document ID.");
  }
  return compact({
    id: document.documentId,
    name: optionalString(document.data, "name") ?? "",
    inviteCode: optionalString(document.data, "inviteCode"),
    status: optionalString(document.data, "status"),
  });
}

function userFromDocument(document: ExportUser): OfflineUser {
  requireIdentifier(document.documentId, "User document ID");
  for (const field of ["uid", "id"] as const) {
    if (document.data[field] !== undefined && document.data[field] !== document.documentId) {
      throw new MembershipExportSafetyError(`User ${field} field conflicts with its document ID.`);
    }
  }
  for (const field of ["academyId", "activeAcademyId"] as const) {
    if (document.data[field] !== undefined && document.data[field] !== null) {
      requireIdentifier(document.data[field], `User ${field}`);
    }
  }
  return compact({
    uid: document.documentId,
    id: document.data.id === undefined ? undefined : document.documentId,
    email: optionalString(document.data, "email"),
    name: optionalString(document.data, "name"),
    role: optionalString(document.data, "role"),
    requestedRole: optionalString(document.data, "requestedRole"),
    status: optionalString(document.data, "status"),
    academyId: document.data.academyId === null ? null : optionalString(document.data, "academyId"),
    activeAcademyId: document.data.activeAcademyId === null
      ? null
      : optionalString(document.data, "activeAcademyId"),
    tenantRole: optionalString(document.data, "tenantRole"),
    academyName: optionalString(document.data, "academyName"),
    requestedAcademyName: optionalString(document.data, "requestedAcademyName"),
    deleted: optionalBoolean(document.data, "deleted"),
    disabled: optionalBoolean(document.data, "disabled"),
  });
}

function membershipFromDocument(document: ExportMembership): OfflineMembership {
  requireIdentifier(document.parentAcademyId, "Membership parent Academy ID");
  requireIdentifier(document.documentId, "Membership document ID");
  if (document.data.academyId !== document.parentAcademyId) {
    throw new MembershipExportSafetyError("Membership academyId conflicts with its parent Academy ID.");
  }
  if (document.data.userId !== document.documentId) {
    throw new MembershipExportSafetyError("Membership userId conflicts with its document ID.");
  }
  return compact({
    userId: document.documentId,
    academyId: document.parentAcademyId,
    role: optionalString(document.data, "role"),
    status: optionalString(document.data, "status"),
    source: optionalString(document.data, "source"),
    approvalClaimId: optionalString(document.data, "approvalClaimId"),
  });
}

function inviteFromDocument(document: ExportAcademyInvite): OfflineAcademyInvite {
  const canonicalCode = normalizeInviteCode(document.documentId);
  if (!isExactFirestoreIdentifier(document.documentId)
    || !isValidInviteCode(document.documentId)
    || canonicalCode !== document.documentId) {
    throw new MembershipExportSafetyError("Academy Invite document ID is not an exact canonical invite code.");
  }
  if (document.data.inviteCode !== document.documentId) {
    throw new MembershipExportSafetyError("Academy Invite inviteCode conflicts with its document ID.");
  }
  if (document.data.academyId !== undefined) {
    requireIdentifier(document.data.academyId, "Academy Invite academyId");
  }
  return compact({
    inviteCode: document.documentId,
    academyId: optionalString(document.data, "academyId"),
    status: optionalString(document.data, "status"),
  });
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new MembershipExportSafetyError(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export async function collectMembershipPlanningExport(
  source: MembershipExportReadSource,
  exportedAt: string,
): Promise<CollectedMembershipExport> {
  if (typeof exportedAt !== "string" || !Number.isFinite(Date.parse(exportedAt))) {
    throw new MembershipExportSafetyError("exportedAt must be an ISO-compatible timestamp.");
  }

  const academyDocuments = await source.listAcademies();
  const academies = academyDocuments.map(academyFromDocument)
    .sort((left, right) => compareText(left.id, right.id));
  assertUnique(academies.map((academy) => academy.id), "Academy document ID");

  const userDocuments = await source.listUsers();
  const users = userDocuments.map(userFromDocument)
    .sort((left, right) => compareText(left.uid ?? "", right.uid ?? ""));
  assertUnique(users.map((user) => user.uid ?? ""), "User document ID");

  const memberships: OfflineMembership[] = [];
  const membershipPaths: string[] = [];
  for (const academy of academies) {
    const documents = await source.listMembershipsForAcademy(academy.id);
    for (const document of documents) {
      if (document.parentAcademyId !== academy.id) {
        throw new MembershipExportSafetyError("Membership source returned a record for the wrong Academy.");
      }
      const membership = membershipFromDocument(document);
      memberships.push(membership);
      membershipPaths.push(`${membership.academyId}/${membership.userId}`);
    }
  }
  assertUnique(membershipPaths, "Membership document path");
  memberships.sort((left, right) => compareText(left.academyId ?? "", right.academyId ?? "")
    || compareText(left.role ?? "", right.role ?? "")
    || compareText(left.userId ?? "", right.userId ?? ""));

  const inviteDocuments = await source.listAcademyInvites();
  const academyInvites = inviteDocuments.map(inviteFromDocument)
    .sort((left, right) => compareText(left.inviteCode ?? "", right.inviteCode ?? ""));
  assertUnique(academyInvites.map((invite) => invite.inviteCode ?? ""), "Academy Invite document ID");

  const exportData: OfflineExport = {
    exportedAt,
    academies,
    users,
    memberships,
    academyInvites,
  };
  parseOfflineExport(`${JSON.stringify(exportData)}\n`);

  return {
    exportData,
    queriedPaths: [
      "academies",
      "users",
      ...academies.map((academy) => `academies/${academy.id}/members`),
      "academy_invites",
    ],
  };
}
