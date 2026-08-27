import {
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

import { auth, db } from "../firebase";
import { isActivePrivilegedActor } from "../privilegedAuthorization";

import {
  FUTID_REGISTRY_COLLECTION,
  PLAYER_IDENTITY_COLLECTION,
  PLAYER_IDENTITY_SCHEMA_VERSION,
  validatePlayerIdentityIssuance,
  type PlayerIdentitySource,
} from "../playerIdentityFoundation";

import {
  requireExactDocumentId,
} from "../../services/membershipValidation";



export interface AuthoritativePlayerIdentitySnapshot {
  exists: boolean;
  data?: Record<string, unknown>;
}


export interface AtomicPlayerIdentityTransaction {
  getUser(
    uid: string,
  ): Promise<AuthoritativePlayerIdentitySnapshot>;


  createIdentity(
    playerKey: string,
    data: DocumentData,
  ): void;

  createRegistry(
    futId: string,
    data: DocumentData,
  ): void;
}


export interface PlayerIdentityRepositoryDependencies {
  getAuthenticatedUid(): string | null;

  runPlayerIdentityTransaction<T>(
    operation: (
      transaction: AtomicPlayerIdentityTransaction,
    ) => Promise<T>,
  ): Promise<T>;

  timestamp(): unknown;
}


export interface IssuedPlayerIdentityResult {
  schemaVersion: 1;
  playerKey: string;
  futId: string;
  source: PlayerIdentitySource;
  createdBy: string;
}


function hasOwn(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    value,
    key,
  );
}


function assertActiveSuperAdminActor(
  actorUid: string,
  snapshot: AuthoritativePlayerIdentitySnapshot,
): void {
  if (
    !snapshot.exists ||
    !snapshot.data
  ) {
    throw new Error(
      "The authoritative SuperAdmin User document does not exist.",
    );
  }

  const actor =
    snapshot.data;

  if (
    hasOwn(actor, "uid") &&
    actor.uid !== actorUid
  ) {
    throw new Error(
      "The authoritative SuperAdmin User UID is non-canonical.",
    );
  }

  if (
    !isActivePrivilegedActor(
      {
        id: actorUid,
        role: actor.role,
        status: actor.status,
      },
      ["SUPERADMIN"],
    )
  ) {
    throw new Error(
      "Player Identity issuance requires an active SUPERADMIN actor.",
    );
  }
}


function createFirestoreDependencies(
  firestore: Firestore,
  getAuthenticatedUid:
    () => string | null,
): PlayerIdentityRepositoryDependencies {
  return {
    getAuthenticatedUid,

    async runPlayerIdentityTransaction<T>(
      operation: (
        transaction: AtomicPlayerIdentityTransaction,
      ) => Promise<T>,
    ): Promise<T> {
      return runTransaction(
        firestore,
        async (transaction) =>
          operation({
            async getUser(uid) {
              const snapshot =
                await transaction.get(
                  doc(
                    firestore,
                    "users",
                    uid,
                  ),
                );

              if (!snapshot.exists()) {
                return {
                  exists: false,
                };
              }

              return {
                exists: true,
                data:
                  snapshot.data(),
              };
            },



            createIdentity(
              playerKey,
              data,
            ) {
              transaction.set(
                doc(
                  firestore,
                  PLAYER_IDENTITY_COLLECTION,
                  playerKey,
                ),
                data,
              );
            },

            createRegistry(
              futId,
              data,
            ) {
              transaction.set(
                doc(
                  firestore,
                  FUTID_REGISTRY_COLLECTION,
                  futId,
                ),
                data,
              );
            },
          }),
      );
    },

    timestamp() {
      return serverTimestamp();
    },
  };
}


export function createFirestorePlayerIdentityRepositoryDependencies(
  firestore: Firestore,
  getAuthenticatedUid:
    () => string | null =
      () => auth.currentUser?.uid ?? null,
): PlayerIdentityRepositoryDependencies {
  return createFirestoreDependencies(
    firestore,
    getAuthenticatedUid,
  );
}


const FIRESTORE_DEPENDENCIES =
  createFirestoreDependencies(
    db,
    () => auth.currentUser?.uid ?? null,
  );


export async function issuePlayerIdentityAtomically(
  input: unknown,
  dependencies:
    PlayerIdentityRepositoryDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<IssuedPlayerIdentityResult> {

  const validation =
    validatePlayerIdentityIssuance(
      input,
    );

  if (validation.ok === false) {
    throw new Error(
      `Invalid Player Identity issuance: ${validation.errors.join(" ")}`,
    );
  }

  const issuance =
    validation.value;

  requireExactDocumentId(
    issuance.playerKey,
    "playerKey",
  );

  const playerKey =
    issuance.playerKey;

  const authenticatedUid =
    dependencies.getAuthenticatedUid();

  if (authenticatedUid === null) {
    throw new Error(
      "Authenticated Firebase actor is required for Player Identity issuance.",
    );
  }

  requireExactDocumentId(
    authenticatedUid,
    "Authenticated Firebase actor",
  );

  const actorUid =
    authenticatedUid;

  return dependencies
    .runPlayerIdentityTransaction(
      async (transaction) => {

        const actorSnapshot =
          await transaction.getUser(
            actorUid,
          );

        assertActiveSuperAdminActor(
          actorUid,
          actorSnapshot,
        );



        const timestamp =
          dependencies.timestamp();

        transaction.createIdentity(
          playerKey,
          {
            schemaVersion:
              PLAYER_IDENTITY_SCHEMA_VERSION,
            futId:
              issuance.futId,
            source:
              issuance.source,
            createdAt:
              timestamp,
            createdBy:
              actorUid,
          },
        );

        transaction.createRegistry(
          issuance.futId,
          {
            schemaVersion:
              PLAYER_IDENTITY_SCHEMA_VERSION,
            futId:
              issuance.futId,
            playerKey,
            createdAt:
              timestamp,
            createdBy:
              actorUid,
          },
        );

        return {
          schemaVersion:
            PLAYER_IDENTITY_SCHEMA_VERSION,
          playerKey,
          futId:
            issuance.futId,
          source:
            issuance.source,
          createdBy:
            actorUid,
        };
      },
    );
}