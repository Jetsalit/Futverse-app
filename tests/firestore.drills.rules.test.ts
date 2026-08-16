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

const PROJECT_ID = "demo-futverse-drills";
const USER_UID = "user-1";
const PLAYER_UID = "player-1";
const PARENT_UID = "parent-1";
const OTHER_UID = "other-user";
const COACH_UID = "coach-1";
const ADMIN_UID = "admin-1";
const SUPERADMIN_UID = "superadmin-1";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function anonymousDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)),
    );
  });
}

function userDoc(uid: string, role: string, status = "Active"): DocumentData {
  return { uid, role, status };
}

function drillDoc(createdBy: string, isShared = false): DocumentData {
  return {
    title: "Drill title",
    category: "Tactical",
    canvas_data: { elements: [], lines: [], fieldType: "half" },
    created_by: createdBy,
    is_shared: isShared,
    createdAt: new Date().toISOString(),
  };
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
  await seed([
    [`users/${USER_UID}`, userDoc(USER_UID, "USER")],
    [`users/${PLAYER_UID}`, userDoc(PLAYER_UID, "PLAYER")],
    [`users/${PARENT_UID}`, userDoc(PARENT_UID, "PARENT")],
    [`users/${COACH_UID}`, userDoc(COACH_UID, "COACH")],
    [`users/${ADMIN_UID}`, userDoc(ADMIN_UID, "ADMIN")],
    [`users/${SUPERADMIN_UID}`, userDoc(SUPERADMIN_UID, "SUPERADMIN")],
    [`users/${OTHER_UID}`, userDoc(OTHER_UID, "USER")],
  ]);
});

after(async () => {
  await testEnv.cleanup();
});

test("1. anonymous GET drill denied", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]]);
  await assertFails(getDoc(doc(anonymousDb(), "drills", "owned-1")));
});

test("2. signed-in identities can read drills", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]]);
  for (const uid of [USER_UID, PLAYER_UID, PARENT_UID, COACH_UID, ADMIN_UID, SUPERADMIN_UID]) {
    await assertSucceeds(getDoc(doc(authedDb(uid), "drills", "owned-1")));
  }
});

test("3. signed-in LIST drills allowed and anonymous denied", async () => {
  await seed([
    [`drills/owned-1`, drillDoc(USER_UID)],
    [`drills/owned-2`, drillDoc(OTHER_UID)],
  ]);
  await assertSucceeds(getDocs(collection(authedDb(USER_UID), "drills")));
  await assertFails(getDocs(collection(anonymousDb(), "drills")));
});

test("4. normal user can create only own drill", async () => {
  await assertSucceeds(setDoc(doc(authedDb(USER_UID), "drills", "new-own"), drillDoc(USER_UID)));
  await assertFails(setDoc(doc(authedDb(USER_UID), "drills", "new-other"), drillDoc(OTHER_UID)));
});

test("5. missing created_by is denied", async () => {
  await assertFails(setDoc(doc(authedDb(USER_UID), "drills", "missing-owner"), {
    title: "Missing owner",
    category: "Tactical",
    canvas_data: { elements: [], lines: [], fieldType: "half" },
    is_shared: false,
  }));
});

test("6. active SUPERADMIN may create an assisted drill for an existing active target", async () => {
  await assertSucceeds(
    setDoc(doc(authedDb(SUPERADMIN_UID), "drills", "assisted-coach"), {
      ...drillDoc(COACH_UID),
      recorded_by: SUPERADMIN_UID,
      entry_mode: "ASSISTED",
    }),
  );
});

test("7. SUPERADMIN assisted create fails for missing or inactive target owner", async () => {
  await seed([[`users/inactive-coach`, userDoc("inactive-coach", "COACH", "Inactive")]]);
  await assertFails(
    setDoc(doc(authedDb(SUPERADMIN_UID), "drills", "missing-target"), drillDoc("missing-target-user")),
  );
  await assertFails(
    setDoc(doc(authedDb(SUPERADMIN_UID), "drills", "inactive-target"), drillDoc("inactive-coach")),
  );
});

test("8. PLAYER and PARENT keep existing ability to create their own drills", async () => {
  await assertSucceeds(setDoc(doc(authedDb(PLAYER_UID), "drills", "new-player"), drillDoc(PLAYER_UID)));
  await assertSucceeds(setDoc(doc(authedDb(PARENT_UID), "drills", "new-parent"), drillDoc(PARENT_UID)));
});

test("9. owner can update own drill and non-owner cannot", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]]);
  await assertSucceeds(updateDoc(doc(authedDb(USER_UID), "drills", "owned-1"), { title: "Updated title" }));
  await assertFails(updateDoc(doc(authedDb(OTHER_UID), "drills", "owned-1"), { title: "Hijack" }));
});

test("10. owner cannot change created_by", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]]);
  await assertFails(updateDoc(doc(authedDb(USER_UID), "drills", "owned-1"), { created_by: OTHER_UID }));
});

test("11. ADMIN still cannot update another user's drill merely because ADMIN", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]]);
  await assertFails(updateDoc(doc(authedDb(ADMIN_UID), "drills", "owned-1"), { title: "Admin edit" }));
});

test("12. active SUPERADMIN may update assisted owner drill without changing ownership", async () => {
  await seed([[`drills/coach-owned`, drillDoc(COACH_UID)]]);
  await assertSucceeds(
    updateDoc(doc(authedDb(SUPERADMIN_UID), "drills", "coach-owned"), {
      title: "Assisted update",
      last_updated_by: SUPERADMIN_UID,
    }),
  );
  await assertFails(
    updateDoc(doc(authedDb(SUPERADMIN_UID), "drills", "coach-owned"), {
      created_by: SUPERADMIN_UID,
    }),
  );
});

test("13. owner can delete own drill and non-owner cannot", async () => {
  await seed([
    [`drills/owned-1`, drillDoc(USER_UID)],
    [`drills/owned-2`, drillDoc(USER_UID)],
  ]);
  await assertSucceeds(deleteDoc(doc(authedDb(USER_UID), "drills", "owned-1")));
  await assertFails(deleteDoc(doc(authedDb(OTHER_UID), "drills", "owned-2")));
});

test("14. ADMIN still cannot delete another user's drill", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]]);
  await assertFails(deleteDoc(doc(authedDb(ADMIN_UID), "drills", "owned-1")));
});

test("15. active SUPERADMIN may delete a drill while assisting its owner", async () => {
  await seed([[`drills/coach-owned`, drillDoc(COACH_UID)]]);
  await assertSucceeds(deleteDoc(doc(authedDb(SUPERADMIN_UID), "drills", "coach-owned")));
});

test("16. nested drill documents remain denied", async () => {
  await seed([[`drills/owned-1/nested/x`, { ok: true }]]);
  await assertFails(getDoc(doc(authedDb(USER_UID), "drills", "owned-1", "nested", "x")));
  await assertFails(setDoc(doc(authedDb(SUPERADMIN_UID), "drills", "owned-1", "nested", "y"), { ok: true }));
});

test("17. owner can change is_shared; ordinary non-owner cannot", async () => {
  await seed([
    [`drills/owned-1`, drillDoc(USER_UID)],
    [`drills/owned-2`, drillDoc(USER_UID)],
  ]);
  await assertSucceeds(updateDoc(doc(authedDb(USER_UID), "drills", "owned-1"), { is_shared: true }));
  await assertFails(updateDoc(doc(authedDb(OTHER_UID), "drills", "owned-2"), { is_shared: true }));
});

test("18. inactive SUPERADMIN receives no assisted override", async () => {
  const inactiveSuper = "inactive-super";
  await seed([
    [`users/${inactiveSuper}`, userDoc(inactiveSuper, "SUPERADMIN", "Inactive")],
    [`drills/coach-owned`, drillDoc(COACH_UID)],
  ]);
  await assertFails(
    setDoc(doc(authedDb(inactiveSuper), "drills", "assisted"), drillDoc(COACH_UID)),
  );
  await assertFails(
    updateDoc(doc(authedDb(inactiveSuper), "drills", "coach-owned"), { title: "No" }),
  );
  await assertFails(deleteDoc(doc(authedDb(inactiveSuper), "drills", "coach-owned")));
});
