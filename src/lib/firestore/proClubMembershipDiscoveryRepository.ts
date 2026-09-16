import {
  collection,
  getDocsFromServer,
} from "firebase/firestore";

import { auth, db } from "../firebase";
import { isValidDocumentIdentifier } from "../proClubModel";

export interface ProClubMembershipDiscoveryRecord {
  clubId: string;
}

export interface ProClubMembershipDiscoveryDocument {
  id: string;
  data: unknown;
}

export interface ProClubMembershipDiscoveryReadOps {
  getCurrentUid(): string | null;
  readOwnMembershipDiscoveries(
    uid: string,
  ): Promise<readonly ProClubMembershipDiscoveryDocument[]>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function assertStableActor(
  expectedUid: string,
  ops: ProClubMembershipDiscoveryReadOps,
): void {
  if (ops.getCurrentUid() !== expectedUid) {
    throw new Error("Pro Club membership discovery actor changed.");
  }
}

export const firestoreProClubMembershipDiscoveryReadOps:
  ProClubMembershipDiscoveryReadOps = {
    getCurrentUid() {
      return auth.currentUser?.uid ?? null;
    },

    async readOwnMembershipDiscoveries(uid) {
      const snapshot = await getDocsFromServer(
        collection(db, "users", uid, "proClubMemberships"),
      );

      return snapshot.docs.map((document) => ({
        id: document.id,
        data: document.data(),
      }));
    },
  };

export async function loadOwnProClubMembershipDiscoveries(
  uid: string,
  ops: ProClubMembershipDiscoveryReadOps =
    firestoreProClubMembershipDiscoveryReadOps,
): Promise<ProClubMembershipDiscoveryRecord[]> {
  if (!isValidDocumentIdentifier(uid)) {
    throw new Error("Invalid Pro Club membership discovery user identity.");
  }

  assertStableActor(uid, ops);
  const documents = await ops.readOwnMembershipDiscoveries(uid);
  assertStableActor(uid, ops);

  return documents.map((document) => {
    if (!isValidDocumentIdentifier(document.id)) {
      throw new Error("Invalid Pro Club membership discovery document identity.");
    }

    const raw = asRecord(document.data);
    const clubId = raw?.clubId;

    if (
      raw?.schemaVersion !== 1 ||
      !isValidDocumentIdentifier(clubId) ||
      clubId !== document.id
    ) {
      throw new Error("Invalid Pro Club membership discovery document data.");
    }

    return { clubId };
  });
}
