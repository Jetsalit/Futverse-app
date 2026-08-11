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
  setDoc,
  updateDoc,
  where,
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

function userDoc(uid: string, role: string): DocumentData {
  return { uid, role, status: "Active" };
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
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertFails(getDoc(doc(anonymousDb(), "drills", "owned-1")));
});

test("2. signed-in USER GET drill allowed", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertSucceeds(getDoc(doc(authedDb(USER_UID), "drills", "owned-1")));
});

test("3. PLAYER GET drill allowed", async () => {
  await seed([[`drills/owned-1`, drillDoc(PLAYER_UID)]])
  await assertSucceeds(getDoc(doc(authedDb(PLAYER_UID), "drills", "owned-1")));
});

test("4. PARENT GET drill allowed", async () => {
  await seed([[`drills/owned-1`, drillDoc(PARENT_UID)]])
  await assertSucceeds(getDoc(doc(authedDb(PARENT_UID), "drills", "owned-1")));
});

test("5. COACH GET drill allowed", async () => {
  await seed([[`drills/owned-1`, drillDoc(COACH_UID)]])
  await assertSucceeds(getDoc(doc(authedDb(COACH_UID), "drills", "owned-1")));
});

test("6. ADMIN GET drill allowed", async () => {
  await seed([[`drills/owned-1`, drillDoc(ADMIN_UID)]])
  await assertSucceeds(getDoc(doc(authedDb(ADMIN_UID), "drills", "owned-1")));
});

test("7. SUPERADMIN GET drill allowed", async () => {
  await seed([[`drills/owned-1`, drillDoc(SUPERADMIN_UID)]])
  await assertSucceeds(getDoc(doc(authedDb(SUPERADMIN_UID), "drills", "owned-1")));
});

test("8. signed-in LIST drills allowed", async () => {
  await seed([
    [`drills/owned-1`, drillDoc(USER_UID)],
    [`drills/owned-2`, drillDoc(OTHER_UID)],
  ]);
  await assertSucceeds(getDocs(collection(authedDb(USER_UID), "drills")));
});

test("9. anonymous LIST denied", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertFails(getDocs(collection(anonymousDb(), "drills")));
});

test("10. USER can create drill when created_by == auth.uid", async () => {
  await assertSucceeds(setDoc(doc(authedDb(USER_UID), "drills", "new-1"), drillDoc(USER_UID)));
});

test("11. USER cannot create drill owned by another uid", async () => {
  await assertFails(setDoc(doc(authedDb(USER_UID), "drills", "new-1"), drillDoc(OTHER_UID)));
});

test("12. create missing created_by denied", async () => {
  await assertFails(setDoc(doc(authedDb(USER_UID), "drills", "new-1"), {
    title: "Missing owner",
    category: "Tactical",
    canvas_data: { elements: [], lines: [], fieldType: "half" },
    is_shared: false,
  }));
});

test("13. PLAYER can create own drill if current app model allows any signed-in creator", async () => {
  await assertSucceeds(setDoc(doc(authedDb(PLAYER_UID), "drills", "new-player"), drillDoc(PLAYER_UID)));
});

test("14. PARENT can create own drill if rules intentionally allow all signed-in creators", async () => {
  await assertSucceeds(setDoc(doc(authedDb(PARENT_UID), "drills", "new-parent"), drillDoc(PARENT_UID)));
});

test("15. owner can update own drill", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertSucceeds(updateDoc(doc(authedDb(USER_UID), "drills", "owned-1"), { title: "Updated title" }));
});

test("16. non-owner cannot update another user's drill", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertFails(updateDoc(doc(authedDb(OTHER_UID), "drills", "owned-1"), { title: "Hijack" }));
});

test("17. owner cannot change created_by", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertFails(updateDoc(doc(authedDb(USER_UID), "drills", "owned-1"), { created_by: OTHER_UID }));
});

test("18. ADMIN cannot update another user's drill merely because ADMIN", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertFails(updateDoc(doc(authedDb(ADMIN_UID), "drills", "owned-1"), { title: "Admin edit" }));
});

test("19. SUPERADMIN cannot update another user's drill merely because SUPERADMIN", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertFails(updateDoc(doc(authedDb(SUPERADMIN_UID), "drills", "owned-1"), { title: "Superadmin edit" }));
});

test("20. owner can delete own drill", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertSucceeds(deleteDoc(doc(authedDb(USER_UID), "drills", "owned-1")));
});

test("21. non-owner cannot delete another user's drill", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertFails(deleteDoc(doc(authedDb(OTHER_UID), "drills", "owned-1")));
});

test("22. ADMIN cannot delete another user's drill", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertFails(deleteDoc(doc(authedDb(ADMIN_UID), "drills", "owned-1")));
});

test("23. SUPERADMIN cannot delete another user's drill", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]])
  await assertFails(deleteDoc(doc(authedDb(SUPERADMIN_UID), "drills", "owned-1")));
});

test("24. signed-in nested /drills/{id}/... read denied", async () => {
  await seed([[`drills/owned-1/nested/x`, { ok: true }]])
  await assertFails(getDoc(doc(authedDb(USER_UID), "drills", "owned-1", "nested", "x")));
});

test("25. signed-in nested write denied", async () => {
  await assertFails(setDoc(doc(authedDb(USER_UID), "drills", "owned-1", "nested", "x"), { ok: true }));
});

test("26. anonymous nested denied", async () => {
  await assertFails(setDoc(doc(anonymousDb(), "drills", "owned-1", "nested", "x"), { ok: true }));
});

test("27. owner can change is_shared on own drill", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]]);
  await assertSucceeds(updateDoc(doc(authedDb(USER_UID), "drills", "owned-1"), { is_shared: true }));
});

test("28. non-owner cannot change is_shared on another user's drill", async () => {
  await seed([[`drills/owned-1`, drillDoc(USER_UID)]]);
  await assertFails(updateDoc(doc(authedDb(OTHER_UID), "drills", "owned-1"), { is_shared: true }));
});
