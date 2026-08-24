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
  collectionGroup,
  doc,
  getCountFromServer,
  getDocs,
  query,
  setDoc,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID =
  "demo-futverse-superadmin-membership-review";

const SUPERADMIN_UID =
  "membership-review-superadmin";

const ORDINARY_UID =
  "membership-review-user";

const INACTIVE_SUPERADMIN_UID =
  "membership-review-inactive-superadmin";

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

function globalPendingMembershipQuery(
  db: Firestore,
) {
  return query(
    collectionGroup(db, "members"),
    where("status", "==", "PENDING"),
  );
}

function academyPendingMembershipQuery(
  db: Firestore,
  academyId: string,
) {
  return query(
    collection(
      db,
      "academies",
      academyId,
      "members",
    ),
    where("status", "==", "PENDING"),
  );
}

before(async () => {
  const emulatorHost =
    process.env.FIRESTORE_EMULATOR_HOST;

  assert.ok(
    emulatorHost,
    "Membership review rules tests require the Firestore Emulator.",
  );

  const separator =
    emulatorHost.lastIndexOf(":");

  const host =
    emulatorHost.slice(0, separator);

  const port =
    Number(
      emulatorHost.slice(separator + 1),
    );

  testEnv =
    await initializeTestEnvironment({
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
      `users/${ORDINARY_UID}`,
      {
        uid: ORDINARY_UID,
        email: "user@example.test",
        role: "USER",
        status: "Active",
      },
    ],
    [
      `users/${INACTIVE_SUPERADMIN_UID}`,
      {
        uid: INACTIVE_SUPERADMIN_UID,
        email: "inactive@example.test",
        role: "SUPERADMIN",
        status: "Inactive",
      },
    ],
    [
      "academies/academy-alpha/members/coach-alpha",
      {
        userId: "coach-alpha",
        academyId: "academy-alpha",
        role: "COACH",
        status: "PENDING",
        source: "INVITE",
        joinedAt: "seed",
        joinedBy: SUPERADMIN_UID,
        updatedAt: "seed",
      },
    ],
    [
      "academies/academy-beta/members/admin-beta",
      {
        userId: "admin-beta",
        academyId: "academy-beta",
        role: "ADMIN",
        status: "ACTIVE",
        source: "SUPERADMIN_ASSIGNMENT",
        joinedAt: "seed",
        joinedBy: SUPERADMIN_UID,
        updatedAt: "seed",
      },
    ],

    // Deliberately malformed PENDING evidence.
    // A status-only query can still see this as PENDING
    // if its read scope is otherwise authorized.
    [
      "academies/academy-beta/members/wrong-document-id",
      {
        userId: "different-user-id",
        academyId: "academy-beta",
        role: "COACH",
        status: "PENDING",
        source: "INVITE",
        joinedAt: "seed",
        joinedBy: SUPERADMIN_UID,
        updatedAt: "seed",
      },
    ],
  ]);
});

after(async () => {
  await testEnv.cleanup();
});

test(
  "current Rules deny active SuperAdmin global Membership aggregate",
  async () => {
    await assert.rejects(
      getCountFromServer(
        globalPendingMembershipQuery(
          authedDb(SUPERADMIN_UID),
        ),
      ),
    );
  },
);

test(
  "current Rules deny active SuperAdmin global Membership document query",
  async () => {
    await assert.rejects(
      getDocs(
        globalPendingMembershipQuery(
          authedDb(SUPERADMIN_UID),
        ),
      ),
    );
  },
);

test(
  "ordinary user cannot execute global Membership aggregate",
  async () => {
    await assert.rejects(
      getCountFromServer(
        globalPendingMembershipQuery(
          authedDb(ORDINARY_UID),
        ),
      ),
    );
  },
);

test(
  "inactive SuperAdmin cannot execute global Membership aggregate",
  async () => {
    await assert.rejects(
      getCountFromServer(
        globalPendingMembershipQuery(
          authedDb(INACTIVE_SUPERADMIN_UID),
        ),
      ),
    );
  },
);

test(
  "active SuperAdmin can aggregate pending Memberships inside one Academy",
  async () => {
    const snapshot =
      await getCountFromServer(
        academyPendingMembershipQuery(
          authedDb(SUPERADMIN_UID),
          "academy-alpha",
        ),
      );

    assert.equal(
      snapshot.data().count,
      1,
    );
  },
);

test(
  "Academy-scoped status-only aggregate can still count malformed pending evidence",
  async () => {
    const snapshot =
      await getCountFromServer(
        academyPendingMembershipQuery(
          authedDb(SUPERADMIN_UID),
          "academy-beta",
        ),
      );

    assert.equal(
      snapshot.data().count,
      1,
    );
  },
);

test(
  "ordinary user cannot aggregate another Academy Membership collection",
  async () => {
    await assert.rejects(
      getCountFromServer(
        academyPendingMembershipQuery(
          authedDb(ORDINARY_UID),
          "academy-alpha",
        ),
      ),
    );
  },
);
