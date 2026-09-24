import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID =
  "demo-futverse-academy-fitness-results-rules-v1";

const ACADEMY_A = "academy-a";
const ACADEMY_B = "academy-b";

const ADMIN_A = "admin-a";
const ADMIN_B = "admin-b";
const COACH_A = "coach-a";
const COACH_B = "coach-b";
const SUSPENDED_COACH = "coach-suspended";
const SUPERADMIN = "superadmin";

const PLAYER_A = "player-a";
const PLAYER_B = "player-b";

let testEnv: RulesTestEnvironment;

function userData(
  uid: string,
  role: "ADMIN" | "COACH" | "SUPERADMIN",
  academyId: string | null,
) {
  return {
    uid,
    name: uid,
    email: `${uid}@example.com`,
    role,
    status: "ACTIVE",
    academyId,
    activeAcademyId: academyId,
    tenantRole:
      role === "ADMIN" || role === "COACH"
        ? role
        : null,
  };
}

function membershipData(
  uid: string,
  academyId: string,
  role: "ADMIN" | "COACH",
  status:
    | "ACTIVE"
    | "SUSPENDED"
    | "LEFT"
    | "REVOKED" = "ACTIVE",
) {
  return {
    userId: uid,
    academyId,
    role,
    status,
    source: "SUPERADMIN_ASSIGNMENT",
    joinedAt: new Date(),
    joinedBy: SUPERADMIN,
    updatedAt: new Date(),
  };
}

function fitnessResultData(
  actorUid: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    playerId: PLAYER_A,
    definitionId: "football:speed_10m:v1",
    definitionVersion: 1,
    value: 1.82,
    observedOn: "2026-09-24",
    source: "ACADEMY_BULK_ENTRY",
    recordedAt: serverTimestamp(),
    recordedBy: actorUid,
    ...overrides,
  };
}

function fitnessResultDocumentId(data: Record<string, unknown>): string {
  const playerId = data.playerId;
  const definitionId = data.definitionId;
  const observedOn = data.observedOn;
  const definitionVersion = data.definitionVersion;
  if (
    typeof playerId !== "string" ||
    typeof definitionId !== "string" ||
    typeof observedOn !== "string" ||
    typeof definitionVersion !== "number"
  ) {
    throw new Error("Cannot calculate a Fitness result ID for invalid data.");
  }

  const seed =
    `fitness-result-v1|${Buffer.byteLength(playerId, "utf8")}:${playerId}|` +
    `${observedOn}|${Buffer.byteLength(definitionId, "utf8")}:${definitionId}|` +
    String(definitionVersion);
  return `fit-v1-${createHash("sha256").update(seed, "utf8").digest("hex")}`;
}

function storedFitnessResult(
  actorUid: string,
  playerId: string,
) {
  return {
    schemaVersion: 1,
    playerId,
    definitionId: "football:speed_10m:v1",
    definitionVersion: 1,
    value: 1.82,
    observedOn: "2026-09-24",
    source: "ACADEMY_BULK_ENTRY",
    recordedAt: new Date(),
    recordedBy: actorUid,
  };
}

function authedDb(uid: string): Firestore {
  return testEnv
    .authenticatedContext(uid)
    .firestore() as unknown as Firestore;
}

function unauthDb(): Firestore {
  return testEnv
    .unauthenticatedContext()
    .firestore() as unknown as Firestore;
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

async function seedBase() {
  await seed([
    [`users/${ADMIN_A}`, userData(ADMIN_A, "ADMIN", ACADEMY_A)],
    [`users/${ADMIN_B}`, userData(ADMIN_B, "ADMIN", ACADEMY_B)],
    [`users/${COACH_A}`, userData(COACH_A, "COACH", ACADEMY_A)],
    [`users/${COACH_B}`, userData(COACH_B, "COACH", ACADEMY_B)],
    [
      `users/${SUSPENDED_COACH}`,
      userData(SUSPENDED_COACH, "COACH", ACADEMY_A),
    ],
    [
      `users/${SUPERADMIN}`,
      userData(SUPERADMIN, "SUPERADMIN", null),
    ],

    [`academies/${ACADEMY_A}`, { name: "Academy A" }],
    [`academies/${ACADEMY_B}`, { name: "Academy B" }],

    [
      `academies/${ACADEMY_A}/members/${ADMIN_A}`,
      membershipData(ADMIN_A, ACADEMY_A, "ADMIN"),
    ],
    [
      `academies/${ACADEMY_B}/members/${ADMIN_B}`,
      membershipData(ADMIN_B, ACADEMY_B, "ADMIN"),
    ],
    [
      `academies/${ACADEMY_A}/members/${COACH_A}`,
      membershipData(COACH_A, ACADEMY_A, "COACH"),
    ],
    [
      `academies/${ACADEMY_B}/members/${COACH_B}`,
      membershipData(COACH_B, ACADEMY_B, "COACH"),
    ],
    [
      `academies/${ACADEMY_A}/members/${SUSPENDED_COACH}`,
      membershipData(
        SUSPENDED_COACH,
        ACADEMY_A,
        "COACH",
        "SUSPENDED",
      ),
    ],

    [
      `academies/${ACADEMY_A}/players/${PLAYER_A}`,
      {
        firstName: "Player",
        lastName: "A",
      },
    ],
    [
      `academies/${ACADEMY_B}/players/${PLAYER_B}`,
      {
        firstName: "Player",
        lastName: "B",
      },
    ],
  ]);
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
  await seedBase();
});

after(async () => {
  await testEnv.cleanup();
});

test(
  "same-Academy active Admin can create exact append-only Fitness result",
  async () => {
    const data = fitnessResultData(ADMIN_A);
    const resultId = fitnessResultDocumentId(data);
    await assertSucceeds(
      setDoc(
        doc(
          authedDb(ADMIN_A),
          "academies",
          ACADEMY_A,
          "fitnessResults",
          resultId,
        ),
        data,
      ),
    );
  },
);

test(
  "Fitness result document ID is bound to player, date, and test identity",
  async () => {
    const db = authedDb(COACH_A);
    const data = fitnessResultData(COACH_A);
    const resultId = fitnessResultDocumentId(data);

    await assertFails(
      setDoc(
        doc(
          db,
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "caller-chosen-random-id",
        ),
        data,
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(
          db,
          "academies",
          ACADEMY_A,
          "fitnessResults",
          resultId,
        ),
        data,
      ),
    );
    await assertFails(
      setDoc(
        doc(
          db,
          "academies",
          ACADEMY_A,
          "fitnessResults",
          resultId,
        ),
        data,
      ),
    );
  },
);

test(
  "same-Academy active Coach can record Fitness results",
  async () => {
    const data = fitnessResultData(COACH_A);
    await assertSucceeds(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "fitnessResults",
          fitnessResultDocumentId(data),
        ),
        data,
      ),
    );
  },
);

test(
  "active SuperAdmin can record Academy Fitness result",
  async () => {
    const data = fitnessResultData(SUPERADMIN);
    await assertSucceeds(
      setDoc(
        doc(
          authedDb(SUPERADMIN),
          "academies",
          ACADEMY_A,
          "fitnessResults",
          fitnessResultDocumentId(data),
        ),
        data,
      ),
    );
  },
);

test(
  "unauthenticated suspended and cross-Academy actors cannot create",
  async () => {
    await assertFails(
      setDoc(
        doc(
          unauthDb(),
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "result-unauth",
        ),
        fitnessResultData("anonymous"),
      ),
    );

    await assertFails(
      setDoc(
        doc(
          authedDb(SUSPENDED_COACH),
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "result-suspended",
        ),
        fitnessResultData(SUSPENDED_COACH),
      ),
    );

    await assertFails(
      setDoc(
        doc(
          authedDb(ADMIN_B),
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "result-cross-admin",
        ),
        fitnessResultData(ADMIN_B),
      ),
    );

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_B),
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "result-cross-coach",
        ),
        fitnessResultData(COACH_B),
      ),
    );
  },
);

test(
  "Fitness result must target existing exact Academy player",
  async () => {
    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "missing-player",
        ),
        fitnessResultData(
          COACH_A,
          { playerId: "missing-player" },
        ),
      ),
    );

    const invalidPlayers = [
      "",
      " player-a",
      "player-a ",
      "players/player-a",
      "\u00a0player-a",
      "player-a\u00a0",
      " player-\na",
      "\n\nplayer-a",
      "\ufeffplayer-a",
    ];

    await seed(
      invalidPlayers
        .filter((playerId) => playerId !== "" && !playerId.includes("/"))
        .map((playerId) => [
          `academies/${ACADEMY_A}/players/${playerId}`,
          { playerId },
        ]),
    );

    for (let i = 0; i < invalidPlayers.length; i += 1) {
      await assertFails(
        setDoc(
          doc(
            authedDb(COACH_A),
            "academies",
            ACADEMY_A,
            "fitnessResults",
            `invalid-player-${i}`,
          ),
          fitnessResultData(
            COACH_A,
            { playerId: invalidPlayers[i] },
          ),
        ),
      );
    }
  },
);

test(
  "schema rejects extra missing source and audit spoofing",
  async () => {
    const db = authedDb(COACH_A);

    await assertFails(
      setDoc(
        doc(
          db,
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "extra",
        ),
        fitnessResultData(
          COACH_A,
          { note: "not allowed" },
        ),
      ),
    );

    const missing =
      fitnessResultData(COACH_A);

    delete (
      missing as Record<string, unknown>
    ).value;

    await assertFails(
      setDoc(
        doc(
          db,
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "missing",
        ),
        missing,
      ),
    );

    await assertFails(
      setDoc(
        doc(
          db,
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "source",
        ),
        fitnessResultData(
          COACH_A,
          { source: "MANUAL_IMPORT" },
        ),
      ),
    );

    await assertFails(
      setDoc(
        doc(
          db,
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "actor",
        ),
        fitnessResultData(
          COACH_A,
          { recordedBy: ADMIN_A },
        ),
      ),
    );

    await assertFails(
      setDoc(
        doc(
          db,
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "time",
        ),
        fitnessResultData(
          COACH_A,
          {
            recordedAt:
              new Date(
                "2026-01-01T00:00:00Z",
              ),
          },
        ),
      ),
    );
  },
);

test(
  "definition identifier and version are validated",
  async () => {
    const db = authedDb(COACH_A);

    const invalidDefinitions = [
      "",
      " football:speed_10m:v1",
      "football:speed_10m:v1 ",
      "football/speed_10m/v1",
      "\u00a0football:speed_10m:v1",
      "football:speed_10m:v1\u00a0",
      "\ufefffootball:speed_10m:v1",
      " football:\nspeed_10m:v1",
      "\n\nfootball:speed_10m:v1",
      "football:\nspeed_10m:v1 ",
    ];

    for (let i = 0; i < invalidDefinitions.length; i += 1) {
      await assertFails(
        setDoc(
          doc(
            db,
            "academies",
            ACADEMY_A,
            "fitnessResults",
            `definition-${i}`,
          ),
          fitnessResultData(
            COACH_A,
            {
              definitionId:
                invalidDefinitions[i],
            },
          ),
        ),
      );
    }

    const invalidVersions = [
      0,
      -1,
      1.5,
      "1",
    ];

    for (let i = 0; i < invalidVersions.length; i += 1) {
      await assertFails(
        setDoc(
          doc(
            db,
            "academies",
            ACADEMY_A,
            "fitnessResults",
            `version-${i}`,
          ),
          fitnessResultData(
            COACH_A,
            {
              definitionVersion:
                invalidVersions[i],
            },
          ),
        ),
      );
    }
  },
);

test(
  "observedOn requires a real canonical Gregorian calendar date",
  async () => {
    const db = authedDb(COACH_A);

    const invalidDates = [
      "",
      "24-09-2026",
      "2026-9-24",
      "2026-00-24",
      "2026-13-24",
      "2026-09-00",
      "2026-09-31",
      "2026-02-29",
      "1900-02-29",
    ];

    for (let i = 0; i < invalidDates.length; i += 1) {
      await assertFails(
        setDoc(
          doc(
            db,
            "academies",
            ACADEMY_A,
            "fitnessResults",
            `date-${i}`,
          ),
          fitnessResultData(
            COACH_A,
            {
              observedOn:
                invalidDates[i],
            },
          ),
        ),
      );
    }

    for (const observedOn of [
      "2024-02-29",
      "2000-02-29",
    ]) {
      const data = fitnessResultData(
        COACH_A,
        { observedOn },
      );
      await assertSucceeds(
        setDoc(
          doc(
            db,
            "academies",
            ACADEMY_A,
            "fitnessResults",
            fitnessResultDocumentId(data),
          ),
          data,
        ),
      );
    }
  },
);

test(
  "only finite numeric observations are accepted",
  async () => {
    const db = authedDb(COACH_A);

    for (const [index, value] of [
      0,
      -1,
      12.34,
    ].entries()) {
      const data = fitnessResultData(
        COACH_A,
        {
          value,
          definitionId: `football:finite_${index}:v1`,
        },
      );
      await assertSucceeds(
        setDoc(
          doc(
            db,
            "academies",
            ACADEMY_A,
            "fitnessResults",
            fitnessResultDocumentId(data),
          ),
          data,
        ),
      );
    }

    for (const [index, value] of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "1",
    ].entries()) {
      await assertFails(
        setDoc(
          doc(
            db,
            "academies",
            ACADEMY_A,
            "fitnessResults",
            `non-finite-${index}`,
          ),
          fitnessResultData(
            COACH_A,
            { value },
          ),
        ),
      );
    }
  },
);

test(
  "same-Academy active staff can read while cross-Academy staff cannot",
  async () => {
    await seed([
      [
        `academies/${ACADEMY_A}/fitnessResults/stored-a`,
        storedFitnessResult(
          COACH_A,
          PLAYER_A,
        ),
      ],
    ]);

    await assertSucceeds(
      getDoc(
        doc(
          authedDb(ADMIN_A),
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "stored-a",
        ),
      ),
    );

    await assertSucceeds(
      getDocs(
        collection(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "fitnessResults",
        ),
      ),
    );

    await assertFails(
      getDoc(
        doc(
          authedDb(ADMIN_B),
          "academies",
          ACADEMY_A,
          "fitnessResults",
          "stored-a",
        ),
      ),
    );

    await assertFails(
      getDocs(
        collection(
          authedDb(COACH_B),
          "academies",
          ACADEMY_A,
          "fitnessResults",
        ),
      ),
    );
  },
);

test(
  "Fitness Results V1 is append-only",
  async () => {
    await seed([
      [
        `academies/${ACADEMY_A}/fitnessResults/immutable`,
        storedFitnessResult(
          COACH_A,
          PLAYER_A,
        ),
      ],
    ]);

    const ref = doc(
      authedDb(ADMIN_A),
      "academies",
      ACADEMY_A,
      "fitnessResults",
      "immutable",
    );

    await assertFails(
      updateDoc(
        ref,
        { value: 1.75 },
      ),
    );

    await assertFails(
      deleteDoc(ref),
    );
  },
);
