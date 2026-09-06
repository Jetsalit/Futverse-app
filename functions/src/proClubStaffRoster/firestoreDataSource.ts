import type { Firestore } from "firebase-admin/firestore";
import type {
  ProClubStaffRosterDataSource,
  ProClubStaffRosterDocument,
} from "./service.ts";

const SERVER_ROSTER_QUERY_LIMIT_V1 = 201;

function snapshotValue(snapshot: { exists: boolean; data(): unknown }): unknown | null {
  return snapshot.exists ? snapshot.data() : null;
}

export function createFirestoreProClubStaffRosterDataSource(
  firestore: Firestore,
): ProClubStaffRosterDataSource {
  return {
    async readClub(clubId) {
      const snapshot = await firestore.collection("proClubs").doc(clubId).get();
      return snapshotValue(snapshot);
    },

    async readMembership(clubId, uid) {
      const snapshot = await firestore
        .collection("proClubs")
        .doc(clubId)
        .collection("members")
        .doc(uid)
        .get();
      return snapshotValue(snapshot);
    },

    async listStaffAssignments(clubId): Promise<readonly ProClubStaffRosterDocument[]> {
      const snapshot = await firestore
        .collection("proClubs")
        .doc(clubId)
        .collection("staff")
        .limit(SERVER_ROSTER_QUERY_LIMIT_V1)
        .get();

      return snapshot.docs.map((document) => ({
        id: document.id,
        data: document.data(),
      }));
    },

    async readUser(uid) {
      const snapshot = await firestore.collection("users").doc(uid).get();
      return snapshotValue(snapshot);
    },
  };
}
