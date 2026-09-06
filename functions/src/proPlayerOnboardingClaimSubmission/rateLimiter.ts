import { FieldValue, type Firestore } from "firebase-admin/firestore";

export const PRO_PLAYER_CLAIM_SUBMISSION_RATE_LIMIT_DEFAULT_MAX_ATTEMPTS_V1 = 10;

export interface ProPlayerClaimSubmissionRateLimitResultV1 {
  allowed: boolean;
  attempts: number;
  limit: number;
  bucketId: string;
}

export interface ProPlayerClaimSubmissionRateLimiterV1 {
  consumeQuota(requesterUid: string, now?: Date): Promise<ProPlayerClaimSubmissionRateLimitResultV1>;
}

export interface FirestoreProPlayerClaimSubmissionRateLimiterOptionsV1 {
  maxAttempts?: number;
  collectionName?: string;
}

function isCanonicalUid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !value.includes("/");
}

export function getProPlayerClaimSubmissionRateLimitBucketIdV1(
  requesterUid: string,
  now: Date = new Date(),
): string {
  if (!isCanonicalUid(requesterUid)) throw new Error("INVALID_PRO_PLAYER_CLAIM_RATE_LIMIT_REQUESTER");
  const hour = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("") + `_${String(now.getUTCHours()).padStart(2, "0")}`;
  return `proPlayerClaimSubmission_${requesterUid}_${hour}`;
}

export function createFirestoreProPlayerClaimSubmissionRateLimiterV1(
  firestore: Firestore,
  options: FirestoreProPlayerClaimSubmissionRateLimiterOptionsV1 = {},
): ProPlayerClaimSubmissionRateLimiterV1 {
  const maxAttempts = options.maxAttempts ?? PRO_PLAYER_CLAIM_SUBMISSION_RATE_LIMIT_DEFAULT_MAX_ATTEMPTS_V1;
  const collectionName = options.collectionName ?? "internalRateLimits";
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error("INVALID_PRO_PLAYER_CLAIM_RATE_LIMIT_CONFIGURATION");

  return {
    async consumeQuota(requesterUid: string, now: Date = new Date()) {
      const bucketId = getProPlayerClaimSubmissionRateLimitBucketIdV1(requesterUid, now);
      const ref = firestore.collection(collectionName).doc(bucketId);
      return firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const currentAttempts = snapshot.exists ? Number(snapshot.data()?.attempts) || 0 : 0;
        if (currentAttempts >= maxAttempts) {
          return { allowed: false, attempts: currentAttempts, limit: maxAttempts, bucketId };
        }
        const attempts = currentAttempts + 1;
        transaction.set(ref, {
          requesterUid,
          attempts,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { allowed: true, attempts, limit: maxAttempts, bucketId };
      });
    },
  };
}
