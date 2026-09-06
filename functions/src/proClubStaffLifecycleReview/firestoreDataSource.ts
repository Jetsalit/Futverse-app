import type { Firestore } from "firebase-admin/firestore";
import type {
  ProClubStaffLifecycleReviewDocumentV1,
  ProClubStaffLifecycleReviewSourceV1,
} from "./service.js";

const STAFF_QUERY_LIMIT_V1 = 201;
const HISTORY_QUERY_LIMIT_V1 = 501;

function snapshotValue(snapshot: { exists: boolean; data(): unknown }): unknown | null {
  return snapshot.exists ? snapshot.data() : null;
}

export function createFirestoreProClubStaffLifecycleReviewSourceV1(
  firestore: Firestore,
): ProClubStaffLifecycleReviewSourceV1 {
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

    async listStaffAssignments(clubId): Promise<readonly ProClubStaffLifecycleReviewDocumentV1[]> {
      const snapshot = await firestore
        .collection("proClubs")
        .doc(clubId)
        .collection("staff")
        .limit(STAFF_QUERY_LIMIT_V1)
        .get();
      return snapshot.docs.map((document) => ({
        id: document.id,
        data: document.data(),
      }));
    },

    async listHistory(clubId): Promise<readonly ProClubStaffLifecycleReviewDocumentV1[]> {
      const snapshot = await firestore
        .collection("proClubs")
        .doc(clubId)
        .collection("staffManagementHistory")
        .limit(HISTORY_QUERY_LIMIT_V1)
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
