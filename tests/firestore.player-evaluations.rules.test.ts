import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

import {
  readAcademyPlayerEvaluations,
} from "../src/services/playerEvaluationReadAdapter";

const PROJECT_ID = "demo-futverse-player-evaluations";

const ACADEMY_A = "academy-a";
const ACADEMY_B = "academy-b";

const ADMIN_A = "admin-a";
const COACH_A = "coach-a";
const SUPERADMIN = "superadmin";
const GLOBAL_ADMIN = "global-admin";
const OTHER_COACH = "coach-b";
const PLAYER_UID = "player-user";
const PARENT_UID = "parent-user";

const EVALUATION_ID = "evaluation-1";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function anonymousDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

function userData(
  uid: string,
  role: string,
  status = "Active",
) {
  return {
    uid,
    role,
    status,
  };
}

function membershipData(
  uid: string,
  academyId: string,
  role: "ADMIN" | "COACH",
  status = "ACTIVE",
) {
  return {
    userId: uid,
    academyId,
    role,
    status,
  };
}

function evaluationData() {
  return {
    academy_id: "",
    coach_id: COACH_A,
    player_id: "player-1",
    evaluation_date: "2026-07-27",
    scores: {
      Passing: 2,
      Dribbling: 3,
    },
    timestamp: "2026-07-27T14:49:32.236Z",
  };
}

function evaluationRef(
  db: Firestore,
  academyId = ACADEMY_A,
  evaluationId = EVALUATION_ID,
) {
  return doc(
    db,
    "academies",
    academyId,
    "player_evaluations",
    evaluationId,
  );
}

async function seed(entries: Array<[string, DocumentData]>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) =>
        setDoc(doc(context.firestore(), path), data),
      ),
    );
  });
}

async function seedBaseline() {
  await seed([
    [`academies/${ACADEMY_A}`, { name: "Academy A" }],
    [`academies/${ACADEMY_B}`, { name: "Academy B" }],

    [`users/${ADMIN_A}`, userData(ADMIN_A, "ADMIN")],
    [`users/${COACH_A}`, userData(COACH_A, "COACH")],
    [`users/${SUPERADMIN}`, userData(SUPERADMIN, "SUPERADMIN")],
    [`users/${GLOBAL_ADMIN}`, userData(GLOBAL_ADMIN, "ADMIN")],
    [`users/${OTHER_COACH}`, userData(OTHER_COACH, "COACH")],
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER")],
    [`users/${PARENT_UID}`, userData(PARENT_UID, "PARENT")],

    [
      `academies/${ACADEMY_A}/members/${ADMIN_A}`,
      membershipData(ADMIN_A, ACADEMY_A, "ADMIN"),
    ],
    [
      `academies/${ACADEMY_A}/members/${COACH_A}`,
      membershipData(COACH_A, ACADEMY_A, "COACH"),
    ],
    [
      `academies/${ACADEMY_B}/members/${OTHER_COACH}`,
      membershipData(OTHER_COACH, ACADEMY_B, "COACH"),
    ],

    [
      `academies/${ACADEMY_A}/player_evaluations/${EVALUATION_ID}`,
      evaluationData(),
    ],
  ]);
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  if (!emulatorHost) {
    throw new Error(
      "Rules tests must run through the Firestore Emulator.",
    );
  }

  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));

  if (!host || !Number.isInteger(port)) {
    throw new Error("Invalid FIRESTORE_EMULATOR_HOST.");
  }

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync(
        new URL("../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBaseline();
});

after(async () => {
  await testEnv.cleanup();
});

test("1. ACTIVE Academy ADMIN can GET legacy Evaluation with blank academy_id", async () => {
  const snapshot = await assertSucceeds(
    getDoc(evaluationRef(authedDb(ADMIN_A))),
  );

  if (snapshot.data()?.academy_id !== "") {
    throw new Error("Expected preserved blank legacy academy_id.");
  }
});

test("2. ACTIVE Academy COACH can GET and LIST Evaluations", async () => {
  const db = authedDb(COACH_A);

  await assertSucceeds(getDoc(evaluationRef(db)));

  const snapshot = await assertSucceeds(
    getDocs(
      collection(
        db,
        "academies",
        ACADEMY_A,
        "player_evaluations",
      ),
    ),
  );

  if (snapshot.size !== 1) {
    throw new Error("Expected exactly one Evaluation.");
  }
});

test("2b. ACTIVE Academy COACH adapter query returns only the requested Player Evaluation", async () => {
  await seed([
    [
      `academies/${ACADEMY_A}/player_evaluations/evaluation-player-2`,
      {
        ...evaluationData(),
        player_id: "player-2",
      },
    ],
  ]);

  const db = authedDb(COACH_A);

  const records = await assertSucceeds(
    readAcademyPlayerEvaluations(
      ACADEMY_A,
      collection(
        db,
        "academies",
        ACADEMY_A,
        "player_evaluations",
      ),
      "player-1",
    ),
  );

  if (
    records.length !== 1 ||
    records[0].id !== EVALUATION_ID ||
    records[0].player_id !== "player-1"
  ) {
    throw new Error(
      "Expected adapter query to return only player-1 Evaluation.",
    );
  }
});

test("3. ACTIVE SUPERADMIN can GET and LIST Academy Evaluations without fake Membership", async () => {
  const db = authedDb(SUPERADMIN);

  await assertSucceeds(getDoc(evaluationRef(db)));

  await assertSucceeds(
    getDocs(
      collection(
        db,
        "academies",
        ACADEMY_A,
        "player_evaluations",
      ),
    ),
  );
});

test("4. cross-tenant COACH cannot read another Academy Evaluation", async () => {
  await assertFails(
    getDoc(evaluationRef(authedDb(OTHER_COACH), ACADEMY_A)),
  );
});

test("5. global ADMIN without ACTIVE Membership cannot read Academy Evaluation", async () => {
  await assertFails(
    getDoc(evaluationRef(authedDb(GLOBAL_ADMIN))),
  );
});

test("6. SUSPENDED, REVOKED, and LEFT COACH Memberships are denied", async () => {
  for (const status of ["SUSPENDED", "REVOKED", "LEFT"]) {
    const uid = `coach-${status.toLowerCase()}`;

    await seed([
      [`users/${uid}`, userData(uid, "COACH")],
      [
        `academies/${ACADEMY_A}/members/${uid}`,
        membershipData(uid, ACADEMY_A, "COACH", status),
      ],
    ]);

    await assertFails(
      getDoc(evaluationRef(authedDb(uid))),
    );
  }
});

test("7. PLAYER, PARENT, and anonymous users cannot read Academy Evaluations", async () => {
  await assertFails(
    getDoc(evaluationRef(authedDb(PLAYER_UID))),
  );

  await assertFails(
    getDoc(evaluationRef(authedDb(PARENT_UID))),
  );

  await assertFails(
    getDoc(evaluationRef(anonymousDb())),
  );
});

test("8. Evaluation writes remain denied to ADMIN", async () => {
  const db = authedDb(ADMIN_A);

  await assertFails(
    setDoc(
      evaluationRef(db, ACADEMY_A, "new-evaluation"),
      evaluationData(),
    ),
  );

  await assertFails(
    updateDoc(evaluationRef(db), {
      evaluation_date: "2026-08-19",
    }),
  );

  await assertFails(
    deleteDoc(evaluationRef(db)),
  );
});

test("9. Evaluation writes remain denied to COACH", async () => {
  const db = authedDb(COACH_A);

  await assertFails(
    setDoc(
      evaluationRef(db, ACADEMY_A, "new-coach-evaluation"),
      evaluationData(),
    ),
  );

  await assertFails(
    updateDoc(evaluationRef(db), {
      evaluation_date: "2026-08-19",
    }),
  );

  await assertFails(
    deleteDoc(evaluationRef(db)),
  );
});

test("10. Evaluation writes remain denied to SUPERADMIN during read-only recovery", async () => {
  const db = authedDb(SUPERADMIN);

  await assertFails(
    setDoc(
      evaluationRef(db, ACADEMY_A, "new-super-evaluation"),
      evaluationData(),
    ),
  );

  await assertFails(
    updateDoc(evaluationRef(db), {
      evaluation_date: "2026-08-19",
    }),
  );

  await assertFails(
    deleteDoc(evaluationRef(db)),
  );
});
