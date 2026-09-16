import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
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
  getDocFromServer,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

import { createProClubOnboardingRepository } from "../src/lib/firestore/proClubOnboardingRepository";

const PROJECT_ID = "demo-futverse-pro-club-membership-discovery";
const CLUB = "club-a";
const OWNER = "owner-a";
const TARGET = "coach-a";
const OUTSIDER = "outsider-a";
const CODE = `FUT-PC-${"A".repeat(24)}`;
const CLAIM_ID = `${TARGET}_PRO_CLUB_${CODE}`;

let environment: RulesTestEnvironment;

function db(uid: string): Firestore {
  return environment.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function repository(uid: string) {
  return createProClubOnboardingRepository(db(uid), () => uid);
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await environment.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)),
    );
  });
}

async function snapshot(path: string): Promise<DocumentData | null> {
  let data: DocumentData | null = null;
  await environment.withSecurityRulesDisabled(async (context) => {
    const result = await getDocFromServer(doc(context.firestore(), path));
    data = result.exists() ? result.data() : null;
  });
  return data;
}

function invite(): DocumentData {
  const createdAt = Timestamp.fromMillis(Date.now() - 1_000);
  return {
    schemaVersion: 1,
    inviteCode: CODE,
    clubId: CLUB,
    targetUid: TARGET,
    membershipAuthorizationRole: "MEMBER",
    staffRole: "HEAD_COACH",
    status: "ACTIVE",
    createdAt,
    createdBy: OWNER,
    updatedAt: createdAt,
    updatedBy: OWNER,
    expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
  };
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Firestore Emulator is required.");

  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));

  assert.ok(host && Number.isInteger(port), "Invalid FIRESTORE_EMULATOR_HOST.");

  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seed([
    [`proClubs/${CLUB}`, { name: "Club A", level: "T3", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/${OWNER}`, { authorizationRole: "OWNER", status: "ACTIVE" }],
    [`users/${OWNER}`, { role: "USER", status: "ACTIVE" }],
    [`users/${TARGET}`, { name: "Coach A", email: "coach@example.test", role: "USER", status: "ACTIVE" }],
    [`users/${OUTSIDER}`, { role: "USER", status: "ACTIVE" }],
    [`proClubInvites/${CODE}`, invite()],
  ]);
});

after(async () => {
  await environment?.cleanup();
});

test("ACTIVE user can list and get only their own seeded Pro Club discovery pointer", async () => {
  await seed([
    [`users/${TARGET}/proClubMemberships/${CLUB}`, { schemaVersion: 1, clubId: CLUB }],
  ]);

  const ownDb = db(TARGET);
  const listResult = await assertSucceeds(
    getDocs(collection(ownDb, "users", TARGET, "proClubMemberships")),
  );
  assert.equal(listResult.size, 1);
  assert.equal(listResult.docs[0]?.id, CLUB);
  assert.deepEqual(listResult.docs[0]?.data(), { schemaVersion: 1, clubId: CLUB });

  const ownPointer = await assertSucceeds(
    getDoc(doc(ownDb, "users", TARGET, "proClubMemberships", CLUB)),
  );
  assert.deepEqual(ownPointer.data(), { schemaVersion: 1, clubId: CLUB });
});

test("another authenticated user cannot read or list another user's discovery pointers", async () => {
  await seed([
    [`users/${TARGET}/proClubMemberships/${CLUB}`, { schemaVersion: 1, clubId: CLUB }],
  ]);

  const outsiderDb = db(OUTSIDER);
  await assertFails(
    getDoc(doc(outsiderDb, "users", TARGET, "proClubMemberships", CLUB)),
  );
  await assertFails(
    getDocs(collection(outsiderDb, "users", TARGET, "proClubMemberships")),
  );
});

test("INACTIVE user cannot read their own discovery pointers", async () => {
  await seed([
    [`users/${TARGET}`, { name: "Coach A", email: "coach@example.test", role: "USER", status: "INACTIVE" }],
    [`users/${TARGET}/proClubMemberships/${CLUB}`, { schemaVersion: 1, clubId: CLUB }],
  ]);

  await assertFails(
    getDocs(collection(db(TARGET), "users", TARGET, "proClubMemberships")),
  );
});

test("browser actors cannot directly create update or delete a discovery pointer", async () => {
  const pointerRef = doc(db(TARGET), "users", TARGET, "proClubMemberships", CLUB);

  await assertFails(setDoc(pointerRef, { schemaVersion: 1, clubId: CLUB }));

  await seed([
    [`users/${TARGET}/proClubMemberships/${CLUB}`, { schemaVersion: 1, clubId: CLUB }],
  ]);

  await assertFails(updateDoc(pointerRef, { clubId: "club-b" }));
  await assertFails(deleteDoc(pointerRef));
});

test("reviewer cannot create a discovery pointer outside the canonical approval transaction", async () => {
  await assertFails(
    setDoc(
      doc(db(OWNER), "users", TARGET, "proClubMemberships", CLUB),
      { schemaVersion: 1, clubId: CLUB },
    ),
  );
});

test("APPROVED staff onboarding atomically creates the exact discovery pointer", async () => {
  await repository(TARGET).requestMembership(CODE, TARGET);
  await repository(OWNER).reviewClaim(CLUB, CLAIM_ID, "APPROVED", OWNER);

  assert.deepEqual(
    await snapshot(`proClubs/${CLUB}/members/${TARGET}`),
    { authorizationRole: "MEMBER", status: "ACTIVE" },
  );
  assert.deepEqual(
    await snapshot(`proClubs/${CLUB}/staff/${TARGET}`),
    { staffRole: "HEAD_COACH", status: "ACTIVE" },
  );
  assert.deepEqual(
    await snapshot(`users/${TARGET}/proClubMemberships/${CLUB}`),
    { schemaVersion: 1, clubId: CLUB },
  );
});

test("REJECTED staff onboarding creates no discovery pointer", async () => {
  await repository(TARGET).requestMembership(CODE, TARGET);
  await repository(OWNER).reviewClaim(CLUB, CLAIM_ID, "REJECTED", OWNER);

  assert.equal(
    await snapshot(`users/${TARGET}/proClubMemberships/${CLUB}`),
    null,
  );
  assert.equal(
    await snapshot(`proClubs/${CLUB}/members/${TARGET}`),
    null,
  );
});
