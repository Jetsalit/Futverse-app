import { FieldValue, type Firestore } from "firebase-admin/firestore";

export interface RateLimitResult {
  allowed: boolean;
  attempts: number;
  limit: number;
  bucketId: string;
}

export interface ProClubStaffResolutionRateLimiter {
  consumeQuota(requesterUid: string, now?: Date): Promise<RateLimitResult>;
}

export function getResolutionRateLimitBucketId(
  requesterUid: string,
  now: Date = new Date(),
): string {
  const utcYear = now.getUTCFullYear();
  const utcMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
  const utcDate = String(now.getUTCDate()).padStart(2, "0");
  const utcHour = String(now.getUTCHours()).padStart(2, "0");
  const hourKey = `${utcYear}${utcMonth}${utcDate}_${utcHour}`;
  return `proClubStaffCandidateResolution_${requesterUid}_${hourKey}`;
}

export interface FirestoreRateLimiterOptions {
  maxAttempts?: number;
  collectionName?: string;
}

export function createFirestoreRateLimiter(
  firestore: Firestore,
  options: FirestoreRateLimiterOptions = {},
): ProClubStaffResolutionRateLimiter {
  const maxAttempts = options.maxAttempts ?? 10;
  const collectionName = options.collectionName ?? "internalRateLimits";

  return {
    async consumeQuota(
      requesterUid: string,
      now: Date = new Date(),
    ): Promise<RateLimitResult> {
      const bucketId = getResolutionRateLimitBucketId(requesterUid, now);
      const docRef = firestore.collection(collectionName).doc(bucketId);

      return await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(docRef);
        const currentAttempts = snapshot.exists
          ? (Number(snapshot.data()?.attempts) || 0)
          : 0;

        if (currentAttempts >= maxAttempts) {
          return {
            allowed: false,
            attempts: currentAttempts,
            limit: maxAttempts,
            bucketId,
          };
        }

        const newAttempts = currentAttempts + 1;
        transaction.set(
          docRef,
          {
            requesterUid,
            attempts: newAttempts,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        return {
          allowed: true,
          attempts: newAttempts,
          limit: maxAttempts,
          bucketId,
        };
      });
    },
  };
}
