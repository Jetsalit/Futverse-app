import assert from "node:assert/strict";
import {
  after,
  before,
  beforeEach,
  test,
} from "node:test";
import { readFileSync } from "node:fs";

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

import {
  collection,
  doc,
  getCountFromServer,
  query,
  setDoc,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID =
  "demo-futverse-superadmin-dashboard-signals";

const SUPERADMIN_UID = "dashboard-superadmin";
const USER_UID = "ordinary-user";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv
    .authenticatedContext(uid)
    .firestore() as unknown as Firestore;
}

async function seed(
  entries: Array<[string, DocumentData]>,
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(
    async (context) => {
      await Promise.all(
        entries.map(([path, data]) =>
          setDoc(
            doc(context.firestore(), path),
            data,
          ),
        ),
      );
    },
  );
}

function pendingClaimsQuery(db: Firestore) {
  return query(
    collection(db, "profile_claims"),
    where("status", "==", "PENDING"),
  );
}

before(async () => {
  const emulatorHost =
    process.env.FIRESTORE_EMULATOR_HOST;

  assert.ok(
    emulatorHost,
    "Dashboard signal rules tests require the Firestore Emulator.",
  );

  const separator =
    emulatorHost.lastIndexOf(":");

  const host =
    emulatorHost.slice(0, separator);

  const port = Number(
    emulatorHost.slice(separator + 1),
  );

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync(
        "firestore.rules",
        "utf8",
      ),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  await seed([
    [
      `users/${SUPERADMIN_UID}`,
      {
        uid: SUPERADMIN_UID,
        email: "superadmin@example.test",
        role: "SUPERADMIN",
        status: "Active",
      },
    ],
    [
      `users/${USER_UID}`,
      {
        uid: USER_UID,
        email: "user@example.test",
        role: "USER",
        status: "Active",
      },
    ],
    [
      "profile_claims/claim-a",
      {
        userId: "claim-owner-a",
        status: "PENDING",
      },
    ],
    [
      "profile_claims/claim-b",
      {
        userId: "claim-owner-b",
        status: "PENDING",
      },
    ],
    [
      "profile_claims/claim-c",
      {
        userId: "claim-owner-c",
        status: "APPROVED",
      },
    ],
  ]);
});

after(async () => {
  await testEnv.cleanup();
});

test(
  "active SuperAdmin can aggregate the authoritative global pending Profile Claim count",
  async () => {
    const snapshot =
      await getCountFromServer(
        pendingClaimsQuery(
          authedDb(SUPERADMIN_UID),
        ),
      );

    assert.equal(
      snapshot.data().count,
      2,
    );
  },
);

test(
  "ordinary user cannot aggregate the global pending Profile Claim queue",
  async () => {
    await assert.rejects(
      getCountFromServer(
        pendingClaimsQuery(
          authedDb(USER_UID),
        ),
      ),
    );
  },
);
