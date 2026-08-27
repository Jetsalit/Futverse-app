import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  FUTID_REGISTRY_COLLECTION,
  PLAYER_IDENTITY_COLLECTION,
} from "../src/lib/playerIdentityFoundation";


const repositoryPath =
  fileURLToPath(
    new URL(
      "../src/lib/firestore/playerIdentityRepository.ts",
      import.meta.url,
    ),
  );

const repositoryExists =
  fs.existsSync(repositoryPath);

const SERVER_TIMESTAMP =
  "SERVER_TIMESTAMP";


type Snapshot =
  | {
      exists: true;
      data: Record<string, unknown>;
    }
  | {
      exists: false;
    };


interface AtomicPlayerIdentityTransaction {
  getUser(
    uid: string,
  ): Promise<Snapshot>;

  createIdentity(
    playerKey: string,
    data: Record<string, unknown>,
  ): void;

  createRegistry(
    futId: string,
    data: Record<string, unknown>,
  ): void;
}


interface RuntimeClosedReadTraps {
  getIdentity(
    playerKey: string,
  ): Promise<Snapshot>;

  getRegistry(
    futId: string,
  ): Promise<Snapshot>;
}


interface PlayerIdentityRepositoryDependencies {
  getAuthenticatedUid(): string | null;

  runPlayerIdentityTransaction<T>(
    operation: (
      transaction:
        AtomicPlayerIdentityTransaction,
    ) => Promise<T>,
  ): Promise<T>;

  timestamp(): unknown;
}


interface PlayerIdentityRepositoryModule {
  issuePlayerIdentityAtomically(
    input: unknown,
    dependencies?:
      PlayerIdentityRepositoryDependencies,
  ): Promise<{
    schemaVersion: 1;
    playerKey: string;
    futId: string;
    source:
      | "SUPERADMIN_ISSUANCE"
      | "LEGACY_MIGRATION";
    createdBy: string;
  }>;
}


async function loadRepository():
  Promise<PlayerIdentityRepositoryModule> {

  const module =
    await import(
      "../src/lib/firestore/playerIdentityRepository"
    );

  return module as unknown as
    PlayerIdentityRepositoryModule;
}


function actorData(
  overrides:
    Record<string, unknown> = {},
): Record<string, unknown> {

  return {
    uid: "superadmin",
    role: "SUPERADMIN",
    status: "Active",
    ...overrides,
  };
}


interface HarnessOptions {
  authenticatedUid?:
    string | null;

  actor?:
    Record<string, unknown> | null;

  transactionError?:
    Error | null;
}


function createHarness(
  options:
    HarnessOptions = {},
) {

  const authenticatedUid =
    options.authenticatedUid === undefined
      ? "superadmin"
      : options.authenticatedUid;

  const actor =
    options.actor === undefined
      ? actorData()
      : options.actor;

  const transactionError =
    options.transactionError === undefined
      ? null
      : options.transactionError;


  const identityWrites:
    Array<{
      playerKey: string;
      data: Record<string, unknown>;
    }> = [];

  const registryWrites:
    Array<{
      futId: string;
      data: Record<string, unknown>;
    }> = [];


  let transactionRuns = 0;

  let timestampCalls = 0;

  let closedReadAttempts = 0;


  const dependencies:
    PlayerIdentityRepositoryDependencies = {

    getAuthenticatedUid() {
      return authenticatedUid;
    },


    async runPlayerIdentityTransaction(
      operation,
    ) {

      transactionRuns += 1;


      /*
       * getIdentity/getRegistry intentionally exis
       * only as runtime traps.
       *
       * They are NOT part of the corrected
       * AtomicPlayerIdentityTransaction contract.
       *
       * The current pre-correction repository will
       * hit these traps and therefore RED.
       */
      const transaction:
        AtomicPlayerIdentityTransaction &
        RuntimeClosedReadTraps = {

        async getUser(uid) {

          assert.equal(
            uid,
            "superadmin",
          );

          return actor === null
            ? {
                exists: false,
              }
            : {
                exists: true,
                data: actor,
              };
        },


        async getIdentity() {

          closedReadAttempts += 1;

          throw new Error(
            "CLOSED_IDENTITY_READ_FORBIDDEN",
          );
        },


        async getRegistry() {

          closedReadAttempts += 1;

          throw new Error(
            "CLOSED_REGISTRY_READ_FORBIDDEN",
          );
        },


        createIdentity(
          playerKey,
          data,
        ) {

          identityWrites.push({
            playerKey,
            data,
          });
        },


        createRegistry(
          futId,
          data,
        ) {

          registryWrites.push({
            futId,
            data,
          });
        },
      };


      const result =
        await operation(
          transaction,
        );


      /*
       * Simulate a transaction commit / Rules rejection.
       * Firestore transactions are atomic, so attempted
       * writes are rolled back when the commit is denied.
       */
      if (transactionError) {

        identityWrites.length =
          0;

        registryWrites.length =
          0;

        throw transactionError;
      }


      return result;
    },


    timestamp() {

      timestampCalls += 1;

      return SERVER_TIMESTAMP;
    },
  };


  return {
    dependencies,
    identityWrites,
    registryWrites,

    get transactionRuns() {
      return transactionRuns;
    },

    get timestampCalls() {
      return timestampCalls;
    },

    get closedReadAttempts() {
      return closedReadAttempts;
    },
  };
}


function normalInput() {

  return {
    playerKey:
      "player-key-1",

    futId:
      "FUT-TH-000001",

    source:
      "SUPERADMIN_ISSUANCE" as const,
  };
}


test(
  "1. Player Identity repository implementation exists",
  () => {

    assert.equal(
      repositoryExists,
      true,
      "P1A.4 production repository is missing.",
    );
  },
);


test(
  "2. valid issuance creates one exact atomic identity and FUTID registry pair without closed reads",
  {
    skip:
      !repositoryExists,
  },
  async () => {

    const repository =
      await loadRepository();

    const harness =
      createHarness();

    const result =
      await repository
        .issuePlayerIdentityAtomically(
          normalInput(),
          harness.dependencies,
        );


    assert.equal(
      harness.transactionRuns,
      1,
    );

    assert.equal(
      harness.timestampCalls,
      1,
    );

    assert.equal(
      harness.closedReadAttempts,
      0,
      "Valid issuance must not client-read closed identity/registry paths.",
    );

    assert.equal(
      harness.identityWrites.length,
      1,
    );

    assert.equal(
      harness.registryWrites.length,
      1,
    );


    assert.deepEqual(
      harness.identityWrites[0],
      {
        playerKey:
          "player-key-1",

        data: {
          schemaVersion:
            1,

          futId:
            "FUT-TH-000001",

          source:
            "SUPERADMIN_ISSUANCE",

          createdAt:
            SERVER_TIMESTAMP,

          createdBy:
            "superadmin",
        },
      },
    );


    assert.deepEqual(
      harness.registryWrites[0],
      {
        futId:
          "FUT-TH-000001",

        data: {
          schemaVersion:
            1,

          futId:
            "FUT-TH-000001",

          playerKey:
            "player-key-1",

          createdAt:
            SERVER_TIMESTAMP,

          createdBy:
            "superadmin",
        },
      },
    );


    assert.deepEqual(
      result,
      {
        schemaVersion:
          1,

        playerKey:
          "player-key-1",

        futId:
          "FUT-TH-000001",

        source:
          "SUPERADMIN_ISSUANCE",

        createdBy:
          "superadmin",
      },
    );
  },
);


test(
  "3. invalid issuance input fails before any transaction",
  {
    skip:
      !repositoryExists,
  },
  async () => {

    const repository =
      await loadRepository();

    const harness =
      createHarness();


    await assert.rejects(
      repository
        .issuePlayerIdentityAtomically(
          {
            ...normalInput(),

            futId:
              "fut-th-000001",
          },
          harness.dependencies,
        ),
      /invalid/i,
    );


    assert.equal(
      harness.transactionRuns,
      0,
    );

    assert.equal(
      harness.timestampCalls,
      0,
    );

    assert.equal(
      harness.closedReadAttempts,
      0,
    );

    assert.equal(
      harness.identityWrites.length,
      0,
    );

    assert.equal(
      harness.registryWrites.length,
      0,
    );
  },
);


test(
  "4. missing authenticated Firebase actor fails before transaction",
  {
    skip:
      !repositoryExists,
  },
  async () => {

    const repository =
      await loadRepository();

    const harness =
      createHarness({
        authenticatedUid:
          null,
      });


    await assert.rejects(
      repository
        .issuePlayerIdentityAtomically(
          normalInput(),
          harness.dependencies,
        ),
      /authenticated|actor/i,
    );


    assert.equal(
      harness.transactionRuns,
      0,
    );

    assert.equal(
      harness.closedReadAttempts,
      0,
    );
  },
);


test(
  "5. authoritative User must still be the authenticated ACTIVE SUPERADMIN",
  {
    skip:
      !repositoryExists,
  },
  async () => {

    const repository =
      await loadRepository();


    const invalidActors:
      Array<
        Record<string, unknown> | null
      > = [

        actorData({
          role:
            "ADMIN",
        }),

        actorData({
          status:
            "INACTIVE",
        }),

        actorData({
          uid:
            "different-user",
        }),

        null,
      ];


    for (
      const actor
      of invalidActors
    ) {

      const harness =
        createHarness({
          actor,
        });


      await assert.rejects(
        repository
          .issuePlayerIdentityAtomically(
            normalInput(),
            harness.dependencies,
          ),
      );


      assert.equal(
        harness.identityWrites.length,
        0,
      );

      assert.equal(
        harness.registryWrites.length,
        0,
      );

      assert.equal(
        harness.closedReadAttempts,
        0,
        "Unauthorized actor must fail before closed identity/registry reads.",
      );
    }
  },
);


test(
  "6. Firestore transaction or Rules collision rejection propagates fail closed without fallback or partial write",
  {
    skip:
      !repositoryExists,
  },
  async () => {

    const repository =
      await loadRepository();

    const harness =
      createHarness({
        transactionError:
          new Error(
            "permission-denied: identity or FUTID registry collision",
          ),
      });


    await assert.rejects(
      repository
        .issuePlayerIdentityAtomically(
          normalInput(),
          harness.dependencies,
        ),
      /permission-denied/i,
    );


    assert.equal(
      harness.transactionRuns,
      1,
      "Repository must not retry through a second persistence path.",
    );

    assert.equal(
      harness.closedReadAttempts,
      0,
      "Collision handling must not client-read closed collections.",
    );

    assert.equal(
      harness.identityWrites.length,
      0,
      "Denied transaction must leave no identity write.",
    );

    assert.equal(
      harness.registryWrites.length,
      0,
      "Denied transaction must leave no registry write.",
    );
  },
);


test(
  "7. repository preserves the closed identity and FUTID registry read surface",
  {
    skip:
      !repositoryExists,
  },
  () => {

    const source =
      fs.readFileSync(
        repositoryPath,
        "utf8",
      );


    const forbiddenReadPatterns = [
      /\bgetIdentity\b/,
      /\bgetRegistry\b/,
      /\bgetDoc\b/,
      /\bgetDocFromServer\b/,
      /\bgetDocs\b/,
    ];


    for (
      const pattern
      of forbiddenReadPatterns
    ) {

      assert.equal(
        pattern.test(source),
        false,
        `Forbidden closed-read repository surface: ${pattern}`,
      );
    }


    /*
     * The authoritative User read remains required.
     * We intentionally do NOT forbid transaction.get().
     */
    assert.match(
      source,
      /transaction\.get\s*\(/,
    );

    assert.match(
      source,
      /["']users["']/,
    );
  },
);


test(
  "8. LEGACY_MIGRATION uses the same authority and exact atomic persistence contract without closed reads",
  {
    skip:
      !repositoryExists,
  },
  async () => {

    const repository =
      await loadRepository();

    const harness =
      createHarness();


    await repository
      .issuePlayerIdentityAtomically(
        {
          ...normalInput(),

          source:
            "LEGACY_MIGRATION",
        },
        harness.dependencies,
      );


    assert.equal(
      harness.transactionRuns,
      1,
    );

    assert.equal(
      harness.timestampCalls,
      1,
    );

    assert.equal(
      harness.closedReadAttempts,
      0,
    );

    assert.equal(
      harness.identityWrites.length,
      1,
    );

    assert.equal(
      harness.registryWrites.length,
      1,
    );


    assert.equal(
      harness
        .identityWrites[0]
        .data
        .source,
      "LEGACY_MIGRATION",
    );
  },
);


test(
  "9. identity payload never stores playerKey and registry payload never stores source",
  {
    skip:
      !repositoryExists,
  },
  async () => {

    const repository =
      await loadRepository();

    const harness =
      createHarness();


    await repository
      .issuePlayerIdentityAtomically(
        normalInput(),
        harness.dependencies,
      );


    assert.equal(
      harness.closedReadAttempts,
      0,
    );


    assert.deepEqual(
      Object.keys(
        harness
          .identityWrites[0]
          .data,
      ).sort(),
      [
        "createdAt",
        "createdBy",
        "futId",
        "schemaVersion",
        "source",
      ],
    );


    assert.deepEqual(
      Object.keys(
        harness
          .registryWrites[0]
          .data,
      ).sort(),
      [
        "createdAt",
        "createdBy",
        "futId",
        "playerKey",
        "schemaVersion",
      ],
    );
  },
);


test(
  "10. repository exposes no update delete repair list generic overwrite or alternate persistence surface",
  {
    skip:
      !repositoryExists,
  },
  () => {

    const source =
      fs.readFileSync(
        repositoryPath,
        "utf8",
      );


    const forbiddenPatterns = [
      /\bupdateDoc\b/,
      /\bdeleteDoc\b/,
      /\bwriteBatch\b/,
      /\baddDoc\b/,
      /\bsetDoc\b/,
      /\bcollection\s*\(/,

      /export\s+.*\bupdate/i,
      /export\s+.*\bdelete/i,
      /export\s+.*\brepair/i,
      /export\s+.*\bmerge/i,
      /export\s+.*\blist/i,
    ];


    for (
      const pattern
      of forbiddenPatterns
    ) {

      assert.equal(
        pattern.test(source),
        false,
        `Forbidden repository persistence surface: ${pattern}`,
      );
    }


    assert.match(
      source,
      /\brunTransaction\b/,
    );

    assert.match(
      source,
      /\bserverTimestamp\b/,
    );

    assert.match(
      source,
      /\bPLAYER_IDENTITY_COLLECTION\b/,
    );

    assert.match(
      source,
      /\bFUTID_REGISTRY_COLLECTION\b/,
    );

    assert.match(
      source,
      /transaction\.set\s*\(/,
    );
  },
);