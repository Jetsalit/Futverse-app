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
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-player-claim-v1";
const PLAYER_A = "player-a";
const PLAYER_B = "player-b";
const SUPERADMIN = "superadmin";
const ADMIN = "admin";
const INACTIVE_PLAYER = "inactive-player";
const INACTIVE_SUPERADMIN = "inactive-superadmin";

let testEnv: RulesTestEnvironment;

function db(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function userData(uid: string, role: string, status = "ACTIVE") {
  return {
    uid,
    role,
    status,
    name: uid,
    email: `${uid}@example.com`,
  };
}

async function seed(entries: Array<[string, DocumentData]>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
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
      rules: readFileSync(
        new URL("./fixtures/firestore.pro-player-claim-v1.rules", import.meta.url),
        "utf8",
      ),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed([
    [`users/${PLAYER_A}`, userData(PLAYER_A, "PLAYER")],
    [`users/${PLAYER_B}`, userData(PLAYER_B, "PLAYER")],
    [`users/${SUPERADMIN}`, userData(SUPERADMIN, "SUPERADMIN")],
    [`users/${ADMIN}`, userData(ADMIN, "ADMIN")],
    [`users/${INACTIVE_PLAYER}`, userData(INACTIVE_PLAYER, "PLAYER", "INACTIVE")],
    [`users/${INACTIVE_SUPERADMIN}`, userData(INACTIVE_SUPERADMIN, "SUPERADMIN", "INACTIVE")],
    [`proPlayerOnboardingClaims/${PLAYER_A}`, { schemaVersion: 1, userId: PLAYER_A, status: "PENDING", profile: { expectedSalary: { monthlyAmount: 45000 } } }],
    [`proPlayerOnboardingClaims/${PLAYER_B}`, { schemaVersion: 1, userId: PLAYER_B, status: "PENDING", profile: { expectedSalary: { monthlyAmount: 55000 } } }],
    [`proPlayerAccountBindings/${PLAYER_A}`, { schemaVersion: 1, userId: PLAYER_A, playerKey: "player-key-a", futId: "FUT-TH-A" }],
    [`proPlayerPrivateMarketPreferences/player-key-a`, { schemaVersion: 1, playerKey: "player-key-a", expectedSalary: { monthlyAmount: 45000, currency: "THB", visibility: "PRIVATE" } }],
  ]);
});

test("active PLAYER can exact-get only their own onboarding claim", async () => {
  await assertSucceeds(getDoc(doc(db(PLAYER_A), "proPlayerOnboardingClaims", PLAYER_A)));
  await assertFails(getDoc(doc(db(PLAYER_A), "proPlayerOnboardingClaims", PLAYER_B)));
  await assertFails(getDocs(collection(db(PLAYER_A), "proPlayerOnboardingClaims")));
});

test("inactive PLAYER cannot read even their own claim", async () => {
  await seed([[`proPlayerOnboardingClaims/${INACTIVE_PLAYER}`, { schemaVersion: 1, userId: INACTIVE_PLAYER, status: "PENDING", profile: {} }]]);
  await assertFails(getDoc(doc(db(INACTIVE_PLAYER), "proPlayerOnboardingClaims", INACTIVE_PLAYER)));
});

test("ACTIVE SUPERADMIN can read individual claims and review queue", async () => {
  await assertSucceeds(getDoc(doc(db(SUPERADMIN), "proPlayerOnboardingClaims", PLAYER_A)));
  await assertSucceeds(getDocs(collection(db(SUPERADMIN), "proPlayerOnboardingClaims")));
});

test("ordinary ADMIN and inactive SUPERADMIN cannot read claim queue", async () => {
  await assertFails(getDoc(doc(db(ADMIN), "proPlayerOnboardingClaims", PLAYER_A)));
  await assertFails(getDocs(collection(db(ADMIN), "proPlayerOnboardingClaims")));
  await assertFails(getDoc(doc(db(INACTIVE_SUPERADMIN), "proPlayerOnboardingClaims", PLAYER_A)));
  await assertFails(getDocs(collection(db(INACTIVE_SUPERADMIN), "proPlayerOnboardingClaims")));
});

test("all client claim mutations are denied including claimant and SUPERADMIN", async () => {
  const claimantClaim = doc(db(PLAYER_A), "proPlayerOnboardingClaims", PLAYER_A);
  const reviewerClaim = doc(db(SUPERADMIN), "proPlayerOnboardingClaims", PLAYER_A);
  await assertFails(setDoc(doc(db(PLAYER_A), "proPlayerOnboardingClaims", "new-player"), { status: "PENDING" }));
  await assertFails(updateDoc(claimantClaim, { status: "REJECTED" }));
  await assertFails(deleteDoc(claimantClaim));
  await assertFails(updateDoc(reviewerClaim, { status: "APPROVED" }));
  await assertFails(deleteDoc(reviewerClaim));
});

test("player can exact-get own account binding but cannot list or mutate bindings", async () => {
  await assertSucceeds(getDoc(doc(db(PLAYER_A), "proPlayerAccountBindings", PLAYER_A)));
  await assertFails(getDocs(collection(db(PLAYER_A), "proPlayerAccountBindings")));
  await assertFails(setDoc(doc(db(PLAYER_A), "proPlayerAccountBindings", PLAYER_B), { playerKey: "forged" }));
  await assertFails(updateDoc(doc(db(PLAYER_A), "proPlayerAccountBindings", PLAYER_A), { futId: "FORGED" }));
  await assertFails(deleteDoc(doc(db(PLAYER_A), "proPlayerAccountBindings", PLAYER_A)));
});

test("private salary/market preference is hidden from PLAYER and ADMIN", async () => {
  const path = ["proPlayerPrivateMarketPreferences", "player-key-a"] as const;
  await assertFails(getDoc(doc(db(PLAYER_A), ...path)));
  await assertFails(getDoc(doc(db(ADMIN), ...path)));
  await assertFails(getDocs(collection(db(PLAYER_A), "proPlayerPrivateMarketPreferences")));
  await assertSucceeds(getDoc(doc(db(SUPERADMIN), ...path)));
  await assertSucceeds(getDocs(collection(db(SUPERADMIN), "proPlayerPrivateMarketPreferences")));
});

test("anonymous access fails closed", async () => {
  const anon = testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
  await assertFails(getDoc(doc(anon, "proPlayerOnboardingClaims", PLAYER_A)));
  await assertFails(getDoc(doc(anon, "proPlayerAccountBindings", PLAYER_A)));
  await assertFails(getDoc(doc(anon, "proPlayerPrivateMarketPreferences", "player-key-a")));
});
