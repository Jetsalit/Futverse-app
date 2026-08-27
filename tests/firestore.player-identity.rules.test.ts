import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-player-identity";

const SUPERADMIN = "superadmin";
const ADMIN = "admin";
const INACTIVE_SUPERADMIN = "inactive-superadmin";

const FUT_ID_A = "FUT-26-AAA001";
const FUT_ID_B = "FUT-26-BBB002";

const PLAYER_KEY_A = "player-key-a";
const PLAYER_KEY_B = "player-key-b";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function userData(
  uid: string,
  role: string,
  status = "Active",
) {
  return {
    uid,
    name: uid,
    email: `${uid}@example.com`,
    role,
    status,
    academyId: null,
    activeAcademyId: null,
    tenantRole: null,
    updatedAt: new Date(),
  };
}

async function seed(
  entries: Array<[string, DocumentData]>,
) {
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

async function seedActors() {
  await seed([
    [
      `users/${SUPERADMIN}`,
      userData(SUPERADMIN, "SUPERADMIN"),
    ],
    [
      `users/${ADMIN}`,
      userData(ADMIN, "ADMIN"),
    ],
    [
      `users/${INACTIVE_SUPERADMIN}`,
      userData(
        INACTIVE_SUPERADMIN,
        "SUPERADMIN",
        "INACTIVE",
      ),
    ],
  ]);
}

function identityWriteData(
  actorUid: string,
  futId: string,
  source:
    | "SUPERADMIN_ISSUANCE"
    | "LEGACY_MIGRATION" =
      "SUPERADMIN_ISSUANCE",
) {
  return {
    schemaVersion: 1,
    futId,
    source,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
  };
}

function registryWriteData(
  actorUid: string,
  futId: string,
  playerKey: string,
) {
  return {
    schemaVersion: 1,
    futId,
    playerKey,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
  };
}

async function issueIdentityPair(
  actorUid: string,
  playerKey: string,
  futId: string,
  source:
    | "SUPERADMIN_ISSUANCE"
    | "LEGACY_MIGRATION" =
      "SUPERADMIN_ISSUANCE",
) {
  const db = authedDb(actorUid);

  const identityRef =
    doc(
      db,
      "playerIdentities",
      playerKey,
    );

  const registryRef =
    doc(
      db,
      "futIdRegistry",
      futId,
    );

  return runTransaction(
    db,
    async (transaction) => {
      transaction.set(
        identityRef,
        identityWriteData(
          actorUid,
          futId,
          source,
        ),
      );

      transaction.set(
        registryRef,
        registryWriteData(
          actorUid,
          futId,
          playerKey,
        ),
      );
    },
  );
}

before(async () => {
  const emulatorHost =
    process.env.FIRESTORE_EMULATOR_HOST;

  assert.ok(
    emulatorHost,
    "Rules tests must run through the Firestore Emulator.",
  );

  const separator =
    emulatorHost.lastIndexOf(":");

  const host =
    emulatorHost.slice(0, separator);

  const port =
    Number(
      emulatorHost.slice(separator + 1),
    );

  assert.ok(
    host && Number.isInteger(port),
    "Invalid FIRESTORE_EMULATOR_HOST.",
  );

  testEnv =
    await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host,
        port,
        rules: readFileSync(
          new URL(
            "../firestore.rules",
            import.meta.url,
          ),
          "utf8",
        ),
      },
    });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedActors();
});

after(async () => {
  await testEnv.cleanup();
});

test(
  "1. ACTIVE SUPERADMIN can atomically issue identity and FUTID registry",
  async () => {
    await assertSucceeds(
      issueIdentityPair(
        SUPERADMIN,
        PLAYER_KEY_A,
        FUT_ID_A,
      ),
    );
  },
);

test(
  "2. concurrent claims for one FUTID allow exactly one playerKey",
  async () => {
    const results =
      await Promise.allSettled([
        issueIdentityPair(
          SUPERADMIN,
          PLAYER_KEY_A,
          FUT_ID_A,
        ),
        issueIdentityPair(
          SUPERADMIN,
          PLAYER_KEY_B,
          FUT_ID_A,
        ),
      ]);

    const successful =
      results.filter(
        (result) =>
          result.status === "fulfilled",
      );

    assert.equal(
      successful.length,
      1,
      "Exactly one concurrent FUTID claim must succeed.",
    );
  },
);

test(
  "3. ordinary ADMIN cannot issue lifelong Player identity",
  async () => {
    await assertFails(
      issueIdentityPair(
        ADMIN,
        PLAYER_KEY_A,
        FUT_ID_A,
      ),
    );
  },
);

test(
  "4. inactive SUPERADMIN cannot issue lifelong Player identity",
  async () => {
    await assertFails(
      issueIdentityPair(
        INACTIVE_SUPERADMIN,
        PLAYER_KEY_A,
        FUT_ID_A,
      ),
    );
  },
);

test(
  "5. Player identity cannot be created without its FUTID registry pair",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    await assertFails(
      setDoc(
        doc(
          db,
          "playerIdentities",
          PLAYER_KEY_A,
        ),
        identityWriteData(
          SUPERADMIN,
          FUT_ID_A,
        ),
      ),
    );
  },
);

test(
  "6. FUTID registry cannot be created without its Player identity pair",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    await assertFails(
      setDoc(
        doc(
          db,
          "futIdRegistry",
          FUT_ID_A,
        ),
        registryWriteData(
          SUPERADMIN,
          FUT_ID_A,
          PLAYER_KEY_A,
        ),
      ),
    );
  },
);

test(
  "7. mismatched registry playerKey fails closed",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            identityWriteData(
              SUPERADMIN,
              FUT_ID_A,
            ),
          );

          transaction.set(
            registryRef,
            registryWriteData(
              SUPERADMIN,
              FUT_ID_A,
              PLAYER_KEY_B,
            ),
          );
        },
      ),
    );
  },
);

test(
  "8. newly issued FUTID must use strict canonical uppercase V1 format",
  async () => {
    await assertFails(
      issueIdentityPair(
        SUPERADMIN,
        PLAYER_KEY_A,
        "fut-26-aaa001",
      ),
    );

    await assertFails(
      issueIdentityPair(
        SUPERADMIN,
        PLAYER_KEY_B,
        "FUT--BAD",
      ),
    );
  },
);

test(
  "9. identity payload rejects unknown fields",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            {
              ...identityWriteData(
                SUPERADMIN,
                FUT_ID_A,
              ),
              unexpected: true,
            },
          );

          transaction.set(
            registryRef,
            registryWriteData(
              SUPERADMIN,
              FUT_ID_A,
              PLAYER_KEY_A,
            ),
          );
        },
      ),
    );
  },
);

test(
  "10. createdBy cannot impersonate another actor",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            identityWriteData(
              ADMIN,
              FUT_ID_A,
            ),
          );

          transaction.set(
            registryRef,
            registryWriteData(
              ADMIN,
              FUT_ID_A,
              PLAYER_KEY_A,
            ),
          );
        },
      ),
    );
  },
);

test(
  "11. issued identity and registry are immutable",
  async () => {
    await seed([
      [
        `playerIdentities/${PLAYER_KEY_A}`,
        {
          schemaVersion: 1,
          futId: FUT_ID_A,
          source: "SUPERADMIN_ISSUANCE",
          createdAt: new Date(
            "2026-08-27T00:00:00.000Z",
          ),
          createdBy: SUPERADMIN,
        },
      ],
      [
        `futIdRegistry/${FUT_ID_A}`,
        {
          schemaVersion: 1,
          futId: FUT_ID_A,
          playerKey: PLAYER_KEY_A,
          createdAt: new Date(
            "2026-08-27T00:00:00.000Z",
          ),
          createdBy: SUPERADMIN,
        },
      ],
    ]);

    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      updateDoc(
        identityRef,
        {
          futId: FUT_ID_B,
        },
      ),
    );

    await assertFails(
      updateDoc(
        registryRef,
        {
          playerKey: PLAYER_KEY_B,
        },
      ),
    );

    await assertFails(
      deleteDoc(identityRef),
    );

    await assertFails(
      deleteDoc(registryRef),
    );
  },
);

test(
  "12. controlled LEGACY_MIGRATION pair is allowed only through SUPERADMIN authority",
  async () => {
    await assertSucceeds(
      issueIdentityPair(
        SUPERADMIN,
        PLAYER_KEY_A,
        FUT_ID_A,
        "LEGACY_MIGRATION",
      ),
    );

    await assertFails(
      issueIdentityPair(
        ADMIN,
        PLAYER_KEY_B,
        FUT_ID_B,
        "LEGACY_MIGRATION",
      ),
    );
  },
);

test(
  "13. legacy root players collection remains closed",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    await assertFails(
      getDoc(
        doc(
          db,
          "players",
          "legacy-player",
        ),
      ),
    );

    await assertFails(
      setDoc(
        doc(
          db,
          "players",
          "new-global-player",
        ),
        {
          futId: FUT_ID_A,
        },
      ),
    );
  },
);
test(
  "14. identity and registry FUTIDs must mutually match",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_B,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            identityWriteData(
              SUPERADMIN,
              FUT_ID_A,
            ),
          );

          transaction.set(
            registryRef,
            registryWriteData(
              SUPERADMIN,
              FUT_ID_B,
              PLAYER_KEY_A,
            ),
          );
        },
      ),
    );
  },
);

test(
  "15. registry path FUTID must equal stored futId",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            identityWriteData(
              SUPERADMIN,
              FUT_ID_A,
            ),
          );

          transaction.set(
            registryRef,
            registryWriteData(
              SUPERADMIN,
              FUT_ID_B,
              PLAYER_KEY_A,
            ),
          );
        },
      ),
    );
  },
);

test(
  "16. identity rejects unsupported schemaVersion",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            {
              ...identityWriteData(
                SUPERADMIN,
                FUT_ID_A,
              ),
              schemaVersion: 2,
            },
          );

          transaction.set(
            registryRef,
            registryWriteData(
              SUPERADMIN,
              FUT_ID_A,
              PLAYER_KEY_A,
            ),
          );
        },
      ),
    );
  },
);

test(
  "17. identity rejects unsupported issuance source",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            {
              ...identityWriteData(
                SUPERADMIN,
                FUT_ID_A,
              ),
              source: "ADMIN_IMPORT",
            },
          );

          transaction.set(
            registryRef,
            registryWriteData(
              SUPERADMIN,
              FUT_ID_A,
              PLAYER_KEY_A,
            ),
          );
        },
      ),
    );
  },
);

test(
  "18. identity createdAt cannot be forged",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            {
              ...identityWriteData(
                SUPERADMIN,
                FUT_ID_A,
              ),
              createdAt:
                new Date(
                  "2026-01-01T00:00:00.000Z",
                ),
            },
          );

          transaction.set(
            registryRef,
            registryWriteData(
              SUPERADMIN,
              FUT_ID_A,
              PLAYER_KEY_A,
            ),
          );
        },
      ),
    );
  },
);

test(
  "19. registry payload rejects unknown fields",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            identityWriteData(
              SUPERADMIN,
              FUT_ID_A,
            ),
          );

          transaction.set(
            registryRef,
            {
              ...registryWriteData(
                SUPERADMIN,
                FUT_ID_A,
                PLAYER_KEY_A,
              ),
              unexpected: true,
            },
          );
        },
      ),
    );
  },
);

test(
  "20. playerKey must be an exact canonical document identifier",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const malformedPlayerKey =
      " player-key-a ";

    const identityRef =
      doc(
        db,
        "playerIdentities",
        malformedPlayerKey,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            identityWriteData(
              SUPERADMIN,
              FUT_ID_A,
            ),
          );

          transaction.set(
            registryRef,
            registryWriteData(
              SUPERADMIN,
              FUT_ID_A,
              malformedPlayerKey,
            ),
          );
        },
      ),
    );
  },
);
test(
  "21. COACH cannot issue lifelong Player identity",
  async () => {
    const uid = "identity-coach";

    await seed([
      [
        `users/${uid}`,
        userData(uid, "COACH"),
      ],
    ]);

    await assertFails(
      issueIdentityPair(
        uid,
        PLAYER_KEY_A,
        FUT_ID_A,
      ),
    );
  },
);

test(
  "22. PLAYER cannot issue lifelong Player identity",
  async () => {
    const uid = "identity-player";

    await seed([
      [
        `users/${uid}`,
        userData(uid, "PLAYER"),
      ],
    ]);

    await assertFails(
      issueIdentityPair(
        uid,
        PLAYER_KEY_A,
        FUT_ID_A,
      ),
    );
  },
);

test(
  "23. PARENT cannot issue lifelong Player identity",
  async () => {
    const uid = "identity-parent";

    await seed([
      [
        `users/${uid}`,
        userData(uid, "PARENT"),
      ],
    ]);

    await assertFails(
      issueIdentityPair(
        uid,
        PLAYER_KEY_A,
        FUT_ID_A,
      ),
    );
  },
);

test(
  "24. USER cannot issue lifelong Player identity",
  async () => {
    const uid = "identity-user";

    await seed([
      [
        `users/${uid}`,
        userData(uid, "USER"),
      ],
    ]);

    await assertFails(
      issueIdentityPair(
        uid,
        PLAYER_KEY_A,
        FUT_ID_A,
      ),
    );
  },
);

test(
  "25. anonymous caller cannot issue lifelong Player identity",
  async () => {
    const db =
      testEnv
        .unauthenticatedContext()
        .firestore() as unknown as Firestore;

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            identityWriteData(
              "anonymous",
              FUT_ID_A,
            ),
          );

          transaction.set(
            registryRef,
            registryWriteData(
              "anonymous",
              FUT_ID_A,
              PLAYER_KEY_A,
            ),
          );
        },
      ),
    );
  },
);

test(
  "26. one playerKey cannot concurrently claim two different FUTIDs",
  async () => {
    const results =
      await Promise.allSettled([
        issueIdentityPair(
          SUPERADMIN,
          PLAYER_KEY_A,
          FUT_ID_A,
        ),
        issueIdentityPair(
          SUPERADMIN,
          PLAYER_KEY_A,
          FUT_ID_B,
        ),
      ]);

    const successful =
      results.filter(
        (result) =>
          result.status === "fulfilled",
      );

    assert.equal(
      successful.length,
      1,
      "Exactly one FUTID may bind to one playerKey.",
    );
  },
);

test(
  "27. two independent playerKey and FUTID pairs may issue concurrently",
  async () => {
    const results =
      await Promise.allSettled([
        issueIdentityPair(
          SUPERADMIN,
          PLAYER_KEY_A,
          FUT_ID_A,
        ),
        issueIdentityPair(
          SUPERADMIN,
          PLAYER_KEY_B,
          FUT_ID_B,
        ),
      ]);

    const successful =
      results.filter(
        (result) =>
          result.status === "fulfilled",
      );

    assert.equal(
      successful.length,
      2,
      "Independent identity pairs must not block each other.",
    );
  },
);

test(
  "28. pre-existing FUTID registry cannot be adopted by a later identity",
  async () => {
    await seed([
      [
        `futIdRegistry/${FUT_ID_A}`,
        {
          schemaVersion: 1,
          futId: FUT_ID_A,
          playerKey: PLAYER_KEY_A,
          createdAt: new Date(
            "2026-08-27T00:00:00.000Z",
          ),
          createdBy: SUPERADMIN,
        },
      ],
    ]);

    const db =
      authedDb(SUPERADMIN);

    await assertFails(
      setDoc(
        doc(
          db,
          "playerIdentities",
          PLAYER_KEY_A,
        ),
        identityWriteData(
          SUPERADMIN,
          FUT_ID_A,
        ),
      ),
    );
  },
);

test(
  "29. pre-existing identity cannot be adopted by a later FUTID registry",
  async () => {
    await seed([
      [
        `playerIdentities/${PLAYER_KEY_A}`,
        {
          schemaVersion: 1,
          futId: FUT_ID_A,
          source: "SUPERADMIN_ISSUANCE",
          createdAt: new Date(
            "2026-08-27T00:00:00.000Z",
          ),
          createdBy: SUPERADMIN,
        },
      ],
    ]);

    const db =
      authedDb(SUPERADMIN);

    await assertFails(
      setDoc(
        doc(
          db,
          "futIdRegistry",
          FUT_ID_A,
        ),
        registryWriteData(
          SUPERADMIN,
          FUT_ID_A,
          PLAYER_KEY_A,
        ),
      ),
    );
  },
);

test(
  "30. forged registry createdAt fails even when identity side is valid",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            identityWriteData(
              SUPERADMIN,
              FUT_ID_A,
            ),
          );

          transaction.set(
            registryRef,
            {
              ...registryWriteData(
                SUPERADMIN,
                FUT_ID_A,
                PLAYER_KEY_A,
              ),
              createdAt:
                new Date(
                  "2026-01-01T00:00:00.000Z",
                ),
            },
          );
        },
      ),
    );
  },
);

test(
  "31. forged registry createdBy fails when identity actor is correct",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            identityWriteData(
              SUPERADMIN,
              FUT_ID_A,
            ),
          );

          transaction.set(
            registryRef,
            registryWriteData(
              ADMIN,
              FUT_ID_A,
              PLAYER_KEY_A,
            ),
          );
        },
      ),
    );
  },
);

test(
  "32. forged identity createdBy fails when registry actor is correct",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    const identityRef =
      doc(
        db,
        "playerIdentities",
        PLAYER_KEY_A,
      );

    const registryRef =
      doc(
        db,
        "futIdRegistry",
        FUT_ID_A,
      );

    await assertFails(
      runTransaction(
        db,
        async (transaction) => {
          transaction.set(
            identityRef,
            identityWriteData(
              ADMIN,
              FUT_ID_A,
            ),
          );

          transaction.set(
            registryRef,
            registryWriteData(
              SUPERADMIN,
              FUT_ID_A,
              PLAYER_KEY_A,
            ),
          );
        },
      ),
    );
  },
);

test(
  "33. successful identity issuance cannot be replayed as an overwrite",
  async () => {
    await assertSucceeds(
      issueIdentityPair(
        SUPERADMIN,
        PLAYER_KEY_A,
        FUT_ID_A,
      ),
    );

    await assertFails(
      issueIdentityPair(
        SUPERADMIN,
        PLAYER_KEY_A,
        FUT_ID_A,
      ),
    );
  },
);

test(
  "34. Rules accept a canonical issued FUTID exactly 64 characters long",
  async () => {
    const futId =
      "FUT-" + "A".repeat(60);

    assert.equal(
      futId.length,
      64,
    );

    await assertSucceeds(
      issueIdentityPair(
        SUPERADMIN,
        PLAYER_KEY_A,
        futId,
      ),
    );
  },
);

test(
  "35. Rules reject an issued FUTID longer than 64 characters",
  async () => {
    const futId =
      "FUT-" + "A".repeat(61);

    assert.equal(
      futId.length,
      65,
    );

    await assertFails(
      issueIdentityPair(
        SUPERADMIN,
        PLAYER_KEY_A,
        futId,
      ),
    );
  },
);

test(
  "36. Player Identity and FUTID registry are not globally readable or listable",
  async () => {
    await seed([
      [
        `playerIdentities/${PLAYER_KEY_A}`,
        {
          schemaVersion: 1,
          futId: FUT_ID_A,
          source: "SUPERADMIN_ISSUANCE",
          createdAt: new Date(
            "2026-08-27T00:00:00.000Z",
          ),
          createdBy: SUPERADMIN,
        },
      ],
      [
        `futIdRegistry/${FUT_ID_A}`,
        {
          schemaVersion: 1,
          futId: FUT_ID_A,
          playerKey: PLAYER_KEY_A,
          createdAt: new Date(
            "2026-08-27T00:00:00.000Z",
          ),
          createdBy: SUPERADMIN,
        },
      ],
    ]);

    const db =
      authedDb(SUPERADMIN);

    await assertFails(
      getDoc(
        doc(
          db,
          "playerIdentities",
          PLAYER_KEY_A,
        ),
      ),
    );

    await assertFails(
      getDoc(
        doc(
          db,
          "futIdRegistry",
          FUT_ID_A,
        ),
      ),
    );

    await assertFails(
      getDocs(
        collection(
          db,
          "playerIdentities",
        ),
      ),
    );

    await assertFails(
      getDocs(
        collection(
          db,
          "futIdRegistry",
        ),
      ),
    );
  },
);

test(
  "37. arbitrary Player Identity descendant collections remain closed",
  async () => {
    const db =
      authedDb(SUPERADMIN);

    await assertFails(
      setDoc(
        doc(
          db,
          "playerIdentities",
          PLAYER_KEY_A,
          "audit",
          "entry-1",
        ),
        {
          note: "must remain closed",
        },
      ),
    );

    await assertFails(
      setDoc(
        doc(
          db,
          "futIdRegistry",
          FUT_ID_A,
          "audit",
          "entry-1",
        ),
        {
          note: "must remain closed",
        },
      ),
    );
  },
);