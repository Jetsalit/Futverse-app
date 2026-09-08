import {
  FieldValue,
  type DocumentData,
  type Firestore,
  type UpdateData,
} from "firebase-admin/firestore";
import type { ServerAuthTokenVerifier } from "../lib/serverAuthTokenVerifier.ts";
import {
  RENAME_ERROR_CODES,
  ProClubRenameError,
  assertEffectiveAtFollowsPriorTransition,
  assertEffectiveAtNotBeforeClubCreation,
  assertEffectiveAtNotFuture,
  assertFreshRenameRequest,
  buildNameHistoryRecord,
  resolveNewShortName,
  validateAndNormalizeProClubRenameRequest,
  validateStoredProClubForRename,
} from "./core.ts";

export interface ProClubRenameServiceDependencies {
  firestore: Firestore;
  authTokenVerifier: ServerAuthTokenVerifier;
  trustedClock?: () => Date;
  deleteFieldValue?: unknown;
}

export interface RenameProClubRequestInput {
  authorizationHeader?: unknown;
  requestBody: unknown;
}

export interface RenameProClubResult {
  status: "COMPLETED";
  clubId: string;
  changeId: string;
  name: string;
  shortName: string | null;
  changedAt: string;
  changedBy: string;
}

export class ProClubRenameService {
  constructor(private readonly dependencies: ProClubRenameServiceDependencies) {}

  async renameProClub(
    request: RenameProClubRequestInput,
  ): Promise<RenameProClubResult> {
    let requestingSuperAdminUid: string;
    try {
      requestingSuperAdminUid =
        await this.dependencies.authTokenVerifier.verifyAuthorizationHeader(
          request.authorizationHeader,
        );
    } catch {
      throw new ProClubRenameError(
        RENAME_ERROR_CODES.UNAUTHORIZED,
        "Authentication required",
      );
    }

    const normalized = validateAndNormalizeProClubRenameRequest(request.requestBody);
    const now = this.dependencies.trustedClock?.() ?? new Date();
    const changedAt = now.toISOString();
    assertEffectiveAtNotFuture(normalized, changedAt);

    const { firestore } = this.dependencies;
    const clubRef = firestore.collection("proClubs").doc(normalized.clubId);
    const historyCollection = clubRef.collection("nameHistory");
    const historyRef = historyCollection.doc();

    return firestore.runTransaction(async (transaction) => {
      const requesterRef = firestore.collection("users").doc(requestingSuperAdminUid);
      const latestHistoryQuery = historyCollection
        .orderBy("effectiveAt", "desc")
        .limit(1);
      const [requesterSnap, clubSnap, latestHistorySnap] = await Promise.all([
        transaction.get(requesterRef),
        transaction.get(clubRef),
        transaction.get(latestHistoryQuery),
      ]);

      const requester = requesterSnap.data();
      if (!requesterSnap.exists ||
          (requester?.status !== "ACTIVE" && requester?.status !== "Active") ||
          requester?.role !== "SUPERADMIN") {
        throw new ProClubRenameError(
          RENAME_ERROR_CODES.UNAUTHORIZED,
          "ACTIVE SUPERADMIN authority required",
        );
      }

      if (!clubSnap.exists) {
        throw new ProClubRenameError(
          RENAME_ERROR_CODES.CLUB_NOT_FOUND,
          "Pro Club not found",
        );
      }
      const clubData = clubSnap.data();
      if (!validateStoredProClubForRename(clubData)) {
        throw new ProClubRenameError(
          RENAME_ERROR_CODES.INVALID_EXISTING_CLUB,
          "Existing Pro Club failed canonical validation",
        );
      }

      assertFreshRenameRequest(normalized, clubData);
      assertEffectiveAtNotBeforeClubCreation(normalized, clubData);
      assertEffectiveAtFollowsPriorTransition(
        normalized,
        clubData,
        latestHistorySnap.empty ? null : latestHistorySnap.docs[0].data(),
      );
      const newShortName = resolveNewShortName(
        clubData.shortName,
        normalized.shortNameChange,
      );
      const history = buildNameHistoryRecord(
        normalized,
        clubData,
        requestingSuperAdminUid,
        changedAt,
      );

      const rootUpdate: UpdateData<DocumentData> = {
        name: normalized.newName,
        updatedAt: changedAt,
      };
      if (normalized.shortNameChange.action === "SET") {
        rootUpdate.shortName = normalized.shortNameChange.value;
      } else if (normalized.shortNameChange.action === "REMOVE") {
        rootUpdate.shortName = this.dependencies.deleteFieldValue ?? FieldValue.delete();
      }

      transaction.create(historyRef, history);
      transaction.update(clubRef, rootUpdate);

      return {
        status: "COMPLETED",
        clubId: normalized.clubId,
        changeId: historyRef.id,
        name: normalized.newName,
        shortName: newShortName ?? null,
        changedAt,
        changedBy: requestingSuperAdminUid,
      };
    });
  }
}

export function createProClubRenameService(
  dependencies: ProClubRenameServiceDependencies,
): ProClubRenameService {
  return new ProClubRenameService(dependencies);
}
