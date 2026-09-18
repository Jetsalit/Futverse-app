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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-staff-submissions-v1";
const CLUB_A = "club-a";
const CLUB_B = "club-b";

const HEAD_COACH = "head-coach";
const ASSISTANT = "assistant";
const FITNESS = "fitness";
const ANALYST = "analyst";
const OWNER = "owner";
const OUTSIDER = "outsider";
const INACTIVE = "inactive";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function anonymousDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

function userData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return { role: "USER", status };
}

function clubData(): DocumentData {
  return { name: "Club", level: "T3", status: "ACTIVE" };
}

function membershipData(
  authorizationRole: "OWNER" | "ADMIN" | "MEMBER" = "MEMBER",
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): DocumentData {
  return { authorizationRole, status };
}

function staffData(
  staffRole:
    | "HEAD_COACH"
    | "ASSISTANT_COACH"
    | "FITNESS_COACH"
    | "ANALYST",
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): DocumentData {
  return { staffRole, status };
}

function governanceData(): DocumentData {
  return {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: HEAD_COACH,
    authorityRole: "HEAD_COACH",
  };
}

function draftData(
  authorUid: string,
  authorRole: "ASSISTANT_COACH" | "FITNESS_COACH" | "ANALYST",
  workType: "TRAINING_SUPPORT" | "FITNESS" | "ANALYSIS",
  overrides: DocumentData = {},
): DocumentData {
  return {
    schemaVersion: 1,
    authorUid,
    authorRole,
    workType,
    title: "Staff work",
    summary: "Role-specific football work for review.",
    module: "TRAINING",
    targetPlanId: null,
    targetSessionDate: null,
    status: "DRAFT",
    reviewerUid: null,
    reviewerRole: null,
    reviewNote: null,
    createdAt: serverTimestamp(),
    createdBy: authorUid,
    updatedAt: serverTimestamp(),
    updatedBy: authorUid,
    submittedAt: null,
    submittedBy: null,
    reviewStartedAt: null,
    reviewStartedBy: null,
    revisionRequestedAt: null,
    revisionRequestedBy: null,
    approvedAt: null,
    approvedBy: null,
    ...overrides,
  };
}

function storedDraftData(
  authorUid: string,
  authorRole: "ASSISTANT_COACH" | "FITNESS_COACH" | "ANALYST",
  workType: "TRAINING_SUPPORT" | "FITNESS" | "ANALYSIS",
  overrides: DocumentData = {},
): DocumentData {
  const created = new Date("2026-09-18T00:00:00.000Z");
  return {
    ...draftData(authorUid, authorRole, workType),
    createdAt: created,
    updatedAt: created,
    ...overrides,
  };
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) =>
        setDoc(doc(context.firestore(), path), data),
      ),
    );
  });
}

async function seedBaseline(): Promise<void> {
  await seed([
    [`users/${HEAD_COACH}`, userData()],
    [`users/${ASSISTANT}`, userData()],
    [`users/${FITNESS}`, userData()],
    [`users/${ANALYST}`, userData()],
    [`users/${OWNER}`, userData()],
    [`users/${OUTSIDER}`, userData()],
    [`users/${INACTIVE}`, userData("INACTIVE")],

    [`proClubs/${CLUB_A}`, clubData()],
    [`proClubs/${CLUB_B}`, clubData()],

    [`proClubs/${CLUB_A}/members/${HEAD_COACH}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${HEAD_COACH}`, staffData("HEAD_COACH")],

    [`proClubs/${CLUB_A}/members/${ASSISTANT}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${ASSISTANT}`, staffData("ASSISTANT_COACH")],

    [`proClubs/${CLUB_A}/members/${FITNESS}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${FITNESS}`, staffData("FITNESS_COACH")],

    [`proClubs/${CLUB_A}/members/${ANALYST}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${ANALYST}`, staffData("ANALYST")],

    [`proClubs/${CLUB_A}/members/${OWNER}`, membershipData("OWNER")],

    [`proClubs/${CLUB_A}/members/${INACTIVE}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${INACTIVE}`, staffData("FITNESS_COACH")],

    [`proClubs/${CLUB_A}/technicalGovernance/current`, governanceData()],
  ]);
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Rules tests must run through the Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  assert.ok(host && Number.isInteger(port), "Invalid FIRESTORE_EMULATOR_HOST.");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
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

test("eligible staff creates own role-compatible DRAFT", async () => {
  await assertSucceeds(
    setDoc(
      doc(authedDb(FITNESS), "proClubs", CLUB_A, "staffSubmissions", "work-1"),
      draftData(FITNESS, "FITNESS_COACH", "FITNESS"),
    ),
  );
});

test("create rejects role/work-type impersonation, spoofed author, and unknown fields", async () => {
  const db = authedDb(FITNESS);

  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "staffSubmissions", "wrong-type"),
      draftData(FITNESS, "FITNESS_COACH", "ANALYSIS"),
    ),
  );

  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "staffSubmissions", "spoof"),
      draftData(ANALYST, "ANALYST", "ANALYSIS"),
    ),
  );

  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "staffSubmissions", "unknown-field"),
      draftData(FITNESS, "FITNESS_COACH", "FITNESS", { clubId: CLUB_A }),
    ),
  );
});

test("anonymous outsider inactive account and OWNER-without-football-role fail closed", async () => {
  for (const db of [
    anonymousDb(),
    authedDb(OUTSIDER),
    authedDb(INACTIVE),
    authedDb(OWNER),
  ]) {
    await assertFails(
      setDoc(
        doc(db, "proClubs", CLUB_A, "staffSubmissions", "work-x"),
        draftData(FITNESS, "FITNESS_COACH", "FITNESS"),
      ),
    );
  }
});

test("author may get own work and list only with authorUid constraint", async () => {
  await seed([
    [
      `proClubs/${CLUB_A}/staffSubmissions/fitness-work`,
      storedDraftData(FITNESS, "FITNESS_COACH", "FITNESS"),
    ],
    [
      `proClubs/${CLUB_A}/staffSubmissions/analyst-work`,
      storedDraftData(ANALYST, "ANALYST", "ANALYSIS"),
    ],
  ]);

  const db = authedDb(FITNESS);

  assert.equal(
    (
      await assertSucceeds(
        getDoc(
          doc(db, "proClubs", CLUB_A, "staffSubmissions", "fitness-work"),
        ),
      )
    ).exists(),
    true,
  );

  await assertFails(
    getDoc(doc(db, "proClubs", CLUB_A, "staffSubmissions", "analyst-work")),
  );

  const ownQuery = query(
    collection(db, "proClubs", CLUB_A, "staffSubmissions"),
    where("authorUid", "==", FITNESS),
  );
  assert.equal((await assertSucceeds(getDocs(ownQuery))).docs.length, 1);

  await assertFails(
    getDocs(collection(db, "proClubs", CLUB_A, "staffSubmissions")),
  );
});

test("exact technical authority gets tenant review inbox but OWNER does not", async () => {
  await seed([
    [
      `proClubs/${CLUB_A}/staffSubmissions/fitness-work`,
      storedDraftData(FITNESS, "FITNESS_COACH", "FITNESS"),
    ],
  ]);

  const reviewer = authedDb(HEAD_COACH);
  assert.equal(
    (
      await assertSucceeds(
        getDocs(collection(reviewer, "proClubs", CLUB_A, "staffSubmissions")),
      )
    ).docs.length,
    1,
  );

  await assertFails(
    getDocs(
      collection(authedDb(OWNER), "proClubs", CLUB_A, "staffSubmissions"),
    ),
  );
});

test("author edits DRAFT content and submits while immutable identity is preserved", async () => {
  await seed([
    [
      `proClubs/${CLUB_A}/staffSubmissions/work-1`,
      storedDraftData(FITNESS, "FITNESS_COACH", "FITNESS"),
    ],
  ]);
  const ref = doc(
    authedDb(FITNESS),
    "proClubs",
    CLUB_A,
    "staffSubmissions",
    "work-1",
  );

  await assertSucceeds(
    updateDoc(ref, {
      title: "Updated conditioning",
      summary: "Adjusted conditioning support.",
      updatedAt: serverTimestamp(),
      updatedBy: FITNESS,
    }),
  );

  await assertFails(
    updateDoc(ref, {
      authorUid: ANALYST,
      updatedAt: serverTimestamp(),
      updatedBy: FITNESS,
    }),
  );

  await assertSucceeds(
    updateDoc(ref, {
      status: "SUBMITTED",
      submittedAt: serverTimestamp(),
      submittedBy: FITNESS,
      updatedAt: serverTimestamp(),
      updatedBy: FITNESS,
    }),
  );
});

test("technical authority performs SUBMITTED -> IN_REVIEW -> NEEDS_REVISION", async () => {
  await seed([
    [
      `proClubs/${CLUB_A}/staffSubmissions/work-1`,
      storedDraftData(FITNESS, "FITNESS_COACH", "FITNESS", {
        status: "SUBMITTED",
        submittedAt: new Date("2026-09-18T01:00:00.000Z"),
        submittedBy: FITNESS,
        updatedAt: new Date("2026-09-18T01:00:00.000Z"),
      }),
    ],
  ]);

  const ref = doc(
    authedDb(HEAD_COACH),
    "proClubs",
    CLUB_A,
    "staffSubmissions",
    "work-1",
  );

  await assertSucceeds(
    updateDoc(ref, {
      status: "IN_REVIEW",
      reviewerUid: HEAD_COACH,
      reviewerRole: "HEAD_COACH",
      reviewStartedAt: serverTimestamp(),
      reviewStartedBy: HEAD_COACH,
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );

  await assertSucceeds(
    updateDoc(ref, {
      status: "NEEDS_REVISION",
      reviewNote: "Reduce volume and clarify recovery.",
      revisionRequestedAt: serverTimestamp(),
      revisionRequestedBy: HEAD_COACH,
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );
});

test("revised author may resubmit and technical authority may approve", async () => {
  await seed([
    [
      `proClubs/${CLUB_A}/staffSubmissions/work-1`,
      storedDraftData(FITNESS, "FITNESS_COACH", "FITNESS", {
        status: "NEEDS_REVISION",
        reviewerUid: HEAD_COACH,
        reviewerRole: "HEAD_COACH",
        reviewNote: "Clarify recovery.",
        submittedAt: new Date("2026-09-18T01:00:00.000Z"),
        submittedBy: FITNESS,
        reviewStartedAt: new Date("2026-09-18T02:00:00.000Z"),
        reviewStartedBy: HEAD_COACH,
        revisionRequestedAt: new Date("2026-09-18T03:00:00.000Z"),
        revisionRequestedBy: HEAD_COACH,
        updatedAt: new Date("2026-09-18T03:00:00.000Z"),
        updatedBy: HEAD_COACH,
      }),
    ],
  ]);

  const authorRef = doc(
    authedDb(FITNESS),
    "proClubs",
    CLUB_A,
    "staffSubmissions",
    "work-1",
  );

  await assertSucceeds(
    updateDoc(authorRef, {
      status: "SUBMITTED",
      submittedAt: serverTimestamp(),
      submittedBy: FITNESS,
      updatedAt: serverTimestamp(),
      updatedBy: FITNESS,
    }),
  );

  const reviewerRef = doc(
    authedDb(HEAD_COACH),
    "proClubs",
    CLUB_A,
    "staffSubmissions",
    "work-1",
  );

  await assertSucceeds(
    updateDoc(reviewerRef, {
      status: "IN_REVIEW",
      reviewerUid: HEAD_COACH,
      reviewerRole: "HEAD_COACH",
      reviewStartedAt: serverTimestamp(),
      reviewStartedBy: HEAD_COACH,
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );

  await assertSucceeds(
    updateDoc(reviewerRef, {
      status: "APPROVED",
      reviewNote: "Approved for the session.",
      approvedAt: serverTimestamp(),
      approvedBy: HEAD_COACH,
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );
});

test("non-authority staff and OWNER cannot review or approve", async () => {
  await seed([
    [
      `proClubs/${CLUB_A}/staffSubmissions/work-1`,
      storedDraftData(FITNESS, "FITNESS_COACH", "FITNESS", {
        status: "SUBMITTED",
        submittedAt: new Date("2026-09-18T01:00:00.000Z"),
        submittedBy: FITNESS,
        updatedAt: new Date("2026-09-18T01:00:00.000Z"),
      }),
    ],
  ]);

  for (const uid of [ASSISTANT, OWNER]) {
    await assertFails(
      updateDoc(
        doc(
          authedDb(uid),
          "proClubs",
          CLUB_A,
          "staffSubmissions",
          "work-1",
        ),
        {
          status: "IN_REVIEW",
          reviewerUid: uid,
          reviewerRole: "HEAD_COACH",
          reviewStartedAt: serverTimestamp(),
          reviewStartedBy: uid,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        },
      ),
    );
  }
});

test("cross-tenant writes and physical deletes are forbidden", async () => {
  await assertFails(
    setDoc(
      doc(
        authedDb(FITNESS),
        "proClubs",
        CLUB_B,
        "staffSubmissions",
        "work-1",
      ),
      draftData(FITNESS, "FITNESS_COACH", "FITNESS"),
    ),
  );

  await seed([
    [
      `proClubs/${CLUB_A}/staffSubmissions/work-1`,
      storedDraftData(FITNESS, "FITNESS_COACH", "FITNESS"),
    ],
  ]);

  await assertFails(
    deleteDoc(
      doc(
        authedDb(HEAD_COACH),
        "proClubs",
        CLUB_A,
        "staffSubmissions",
        "work-1",
      ),
    ),
  );
});
