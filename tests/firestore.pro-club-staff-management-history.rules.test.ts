import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-staff-management-history";
const CLUB_ID = "club-history-a";
const EVENT_ID = "event-existing";
const OWNER = "owner-history";
const ADMIN = "admin-history";
const MEMBER = "member-history";
let testEnv: RulesTestEnvironment;

function client(uid: string | null): Firestore {
  return (uid === null
    ? testEnv.unauthenticatedContext()
    : testEnv.authenticatedContext(uid)
  ).firestore() as unknown as Firestore;
}

function historyEvent(eventId = EVENT_ID): DocumentData {
  return {
    schemaVersion: 1,
    clubId: CLUB_ID,
    userId: "staff-history",
    action: "DEACTIVATE",
    previousAuthorizationRole: "MEMBER",
    nextAuthorizationRole: "MEMBER",
    previousMembershipStatus: "ACTIVE",
    nextMembershipStatus: "INACTIVE",
    previousStaffRole: "HEAD_COACH",
    nextStaffRole: "HEAD_COACH",
    previousStaffStatus: "ACTIVE",
    nextStaffStatus: "INACTIVE",
    changedBy: OWNER,
    eventId,
    changedAt: Timestamp.fromMillis(1_780_000_000_000),
  };
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) =>
      setDoc(doc(context.firestore(), path), data),
    ));
  });
}

before(async () => {
  const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(hostPort, "Rules tests must run through the Firestore Emulator.");
  const separator = hostPort.lastIndexOf(":");
  const host = hostPort.slice(0, separator);
  const port = Number(hostPort.slice(separator + 1));
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
  await seed([
    [`proClubs/${CLUB_ID}`, { name: "History Club", level: "T3", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${OWNER}`, { authorizationRole: "OWNER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${ADMIN}`, { authorizationRole: "ADMIN", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${MEMBER}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staffManagementHistory/${EVENT_ID}`, historyEvent()],
  ]);
});

after(async () => {
  await testEnv?.cleanup();
});

async function assertHistoryClientDenied(db: Firestore): Promise<void> {
  const existing = doc(db, "proClubs", CLUB_ID, "staffManagementHistory", EVENT_ID);
  const collectionRef = collection(db, "proClubs", CLUB_ID, "staffManagementHistory");
  const newEventId = "event-client-attempt";
  const newEvent = doc(db, "proClubs", CLUB_ID, "staffManagementHistory", newEventId);

  await assertFails(getDoc(existing));
  await assertFails(getDocs(collectionRef));
  await assertFails(setDoc(newEvent, historyEvent(newEventId)));
  await assertFails(updateDoc(existing, { action: "MARK_LEFT" }));
  await assertFails(deleteDoc(existing));
}

for (const [label, uid] of [
  ["anonymous", null],
  ["OWNER", OWNER],
  ["ADMIN", ADMIN],
  ["MEMBER", MEMBER],
] as const) {
  test(`${label} cannot get/list/create/update/delete server-only staff management history`, async () => {
    await assertHistoryClientDenied(client(uid));
  });
}

test("rules-disabled trusted test context can seed canonical history without weakening client rules", async () => {
  const eventId = "event-server-seed";
  await seed([[`proClubs/${CLUB_ID}/staffManagementHistory/${eventId}`, historyEvent(eventId)]]);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), "proClubs", CLUB_ID, "staffManagementHistory", eventId));
    assert.equal(snapshot.exists(), true);
    assert.equal(snapshot.data()?.eventId, eventId);
  });

  await assertFails(getDoc(doc(client(OWNER), "proClubs", CLUB_ID, "staffManagementHistory", eventId)));
}
