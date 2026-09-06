import { FieldValue, type Firestore } from "firebase-admin/firestore";

export const STAFF_MANAGEMENT_RATE_LIMIT_DEFAULT_MAX_ATTEMPTS_V1 = 30;

export interface ProClubStaffManagementRateLimitResultV1 {
  allowed: boolean;
  attempts: number;
  limit: number;
  bucketId: string;
}

export interface ProClubStaffManagementRateLimiterV1 {
  consumeQuota(
    requesterUid: string,
    now?: Date,
  ): Promise<ProClubStaffManagementRateLimitResultV1>;
}

export interface FirestoreProClubStaffManagementRateLimiterOptionsV1 {
  maxAttempts?: number;
  collectionName?: string;
}

function isCanonicalRequesterUid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

export function getProClubStaffManagementRateLimitBucketIdV1(
  requesterUid: string,
  now: Date = new Date(),
): string {
  if (!isCanonicalRequesterUid(requesterUid)) {
    throw new Error("INVALID_STAFF_MANAGEMENT_RATE_LIMIT_REQUESTER");
  }

  const utcYear = now.getUTCFullYear();
  const utcMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
  const utcDate = String(now.getUTCDate()).padStart(2, "0");
  const utcHour = String(now.getUTCHours()).padStart(2, "0");
  const hourKey = `${utcYear}${utcMonth}${utcDate}_${utcHour}`;
  return `proClubStaffManagement_${requesterUid}_${hourKey}`;
}

export function createFirestoreProClubStaffManagementRateLimiterV1(
  firestore: Firestore,
  options: FirestoreProClubStaffManagementRateLimiterOptionsV1 = {},
): ProClubStaffManagementRateLimiterV1 {
  const maxAttempts =
    options.maxAttempts ?? STAFF_MANAGEMENT_RATE_LIMIT_DEFAULT_MAX_ATTEMPTS_V1;
  const collectionName = options.collectionName ?? "internalRateLimits";

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("INVALID_STAFF_MANAGEMENT_RATE_LIMIT_CONFIGURATION");
  }

  return {
    async consumeQuota(
      requesterUid: string,
      now: Date = new Date(),
    ): Promise<ProClubStaffManagementRateLimitResultV1> {
      const bucketId = getProClubStaffManagementRateLimitBucketIdV1(
        requesterUid,
        now,
      );
      const docRef = firestore.collection(collectionName).doc(bucketId);

      return await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(docRef);
        const currentAttempts = snapshot.exists
          ? Number(snapshot.data()?.attempts) || 0
          : 0;

        if (currentAttempts >= maxAttempts) {
          return {
            allowed: false,
            attempts: currentAttempts,
            limit: maxAttempts,
            bucketId,
          };
        }

        const attempts = currentAttempts + 1;
        transaction.set(
          docRef,
          {
            requesterUid,
            attempts,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        return {
          allowed: true,
          attempts,
          limit: maxAttempts,
          bucketId,
        };
      });
    },
  };
}
