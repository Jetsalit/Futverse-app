import {
  collection,
  getCountFromServer,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

export interface SuperAdminDashboardSignalReadOps {
  countPendingProfileClaims: () => Promise<number>;
}

export type PendingProfileClaimCountResult =
  | {
      state: "READY";
      count: number;
    }
  | {
      state: "UNAVAILABLE";
      error: Error;
    };

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(String(error));
}

function isValidAggregateCount(
  count: number,
): boolean {
  return (
    Number.isFinite(count) &&
    Number.isInteger(count) &&
    count >= 0
  );
}

export async function loadPendingProfileClaimCount(
  ops: SuperAdminDashboardSignalReadOps,
): Promise<PendingProfileClaimCountResult> {
  try {
    const count =
      await ops.countPendingProfileClaims();

    if (!isValidAggregateCount(count)) {
      return {
        state: "UNAVAILABLE",
        error: new Error(
          "Invalid pending Profile Claim count returned by authoritative aggregate read.",
        ),
      };
    }

    return {
      state: "READY",
      count,
    };
  } catch (error) {
    return {
      state: "UNAVAILABLE",
      error: toError(error),
    };
  }
}

export const firestoreSuperAdminDashboardSignalReadOps:
  SuperAdminDashboardSignalReadOps = {
    async countPendingProfileClaims() {
      const pendingClaimsQuery = query(
        collection(db, "profile_claims"),
        where("status", "==", "PENDING"),
      );

      const snapshot =
        await getCountFromServer(
          pendingClaimsQuery,
        );

      return snapshot.data().count;
    },
  };
