import type { Firestore } from "firebase-admin/firestore";
import type {
  ProPlayerClaimSubmissionSourceV1,
  ProPlayerClaimSubmissionTransactionV1,
} from "./service.js";

export function createFirestoreProPlayerClaimSubmissionSourceV1(
  firestore: Firestore,
): ProPlayerClaimSubmissionSourceV1 {
  return {
    async runSubmissionTransaction<T>(
      operation: (transaction: ProPlayerClaimSubmissionTransactionV1) => Promise<T>,
    ): Promise<T> {
      return firestore.runTransaction(async (transaction) => {
        return operation({
          async getUser(uid) {
            const snapshot = await transaction.get(firestore.collection("users").doc(uid));
            return snapshot.exists
              ? { exists: true, data: snapshot.data() as Record<string, unknown> }
              : { exists: false };
          },
          async getClaim(uid) {
            const snapshot = await transaction.get(firestore.collection("proPlayerOnboardingClaims").doc(uid));
            return snapshot.exists
              ? { exists: true, data: snapshot.data() as Record<string, unknown> }
              : { exists: false };
          },
          async getBinding(uid) {
            const snapshot = await transaction.get(firestore.collection("proPlayerAccountBindings").doc(uid));
            return snapshot.exists
              ? { exists: true, data: snapshot.data() as Record<string, unknown> }
              : { exists: false };
          },
          createClaim(uid, data) {
            const ref = firestore.collection("proPlayerOnboardingClaims").doc(uid);
            transaction.create(ref, data);
          },
        });
      });
    },
  };
}
