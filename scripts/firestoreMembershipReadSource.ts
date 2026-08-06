import { cert, deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type {
  ExportAcademy,
  ExportAcademyInvite,
  ExportMembership,
  ExportUser,
  MembershipExportReadSource,
} from "./membershipExportReadOnlyCore";

export interface InMemoryServiceAccountCredential {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function plainData(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

class FirestoreMembershipReadSource implements MembershipExportReadSource {
  constructor(
    private readonly app: App,
    private readonly database: Firestore,
  ) {}

  async listAcademies(): Promise<ExportAcademy[]> {
    const snapshot = await this.database
      .collection("academies")
      .select("id", "name", "inviteCode", "status")
      .get();
    return snapshot.docs.map((document) => ({
      documentId: document.id,
      data: plainData(document.data()),
    }));
  }

  async listUsers(): Promise<ExportUser[]> {
    const snapshot = await this.database
      .collection("users")
      .select(
        "uid",
        "id",
        "email",
        "name",
        "role",
        "requestedRole",
        "status",
        "academyId",
        "activeAcademyId",
        "tenantRole",
        "academyName",
        "requestedAcademyName",
        "deleted",
        "disabled",
      )
      .get();
    return snapshot.docs.map((document) => ({
      documentId: document.id,
      data: plainData(document.data()),
    }));
  }

  async listMembershipsForAcademy(academyId: string): Promise<ExportMembership[]> {
    const snapshot = await this.database
      .collection("academies")
      .doc(academyId)
      .collection("members")
      .select("userId", "academyId", "role", "status", "source", "approvalClaimId")
      .get();
    return snapshot.docs.map((document) => ({
      parentAcademyId: academyId,
      documentId: document.id,
      data: plainData(document.data()),
    }));
  }

  async listAcademyInvites(): Promise<ExportAcademyInvite[]> {
    const snapshot = await this.database
      .collection("academy_invites")
      .select("inviteCode", "academyId", "status")
      .get();
    return snapshot.docs.map((document) => ({
      documentId: document.id,
      data: plainData(document.data()),
    }));
  }

  async close(): Promise<void> {
    await deleteApp(this.app);
  }
}

export function createFirestoreMembershipReadSource(
  projectId: string,
  databaseId: string,
  credential: InMemoryServiceAccountCredential,
): MembershipExportReadSource {
  const app = initializeApp({
    credential: cert({
      projectId: credential.projectId,
      clientEmail: credential.clientEmail,
      privateKey: credential.privateKey,
    }),
    projectId,
  }, `membership-export-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return new FirestoreMembershipReadSource(app, getFirestore(app, databaseId));
}
