import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { REGISTRATION_INTENTS } from "../src/lib/accountRolePolicy.js";

const PROJECT_ID = "demo-futverse-requested-role";
const LOG_PREFIX = "user_registered_";
let testEnv: RulesTestEnvironment;

function authedDb(uid: string, email = `${uid}@example.test`): Firestore {
  return testEnv.authenticatedContext(uid, { email }).firestore() as unknown as Firestore;
}

function registrationUser(
  uid: string,
  email: string,
  requestedRole: unknown,
  overrides: DocumentData = {},
): DocumentData {
  return {
    uid,
    email,
    requestedRole,
    role: requestedRole === "PLAYER" ? "PLAYER" : "USER",
    status: requestedRole === "PLAYER" ? "Active" : "Inactive",
    academyId: null,
    activeAcademyId: null,
    subscriptionPlan: "FREE",
    name: "Rules Test User",
    ...overrides,
  };
}

function registrationLog(
  uid: string,
  email: string,
  requestedRole: unknown,
): DocumentData {
  return {
    action: "USER_REGISTERED",
    userId: uid,
    email,
    requestedRole,
    timestamp: serverTimestamp(),
  };
}

function atomicRegistration(
  uid: string,
  requestedRole: unknown,
  options: {
    userOverrides?: DocumentData;
    omitUserRequestedRole?: boolean;
    logRequestedRole?: unknown;
  } = {},
) {
  const email = `${uid}@example.test`;
  const db = authedDb(uid, email);
  const userData = registrationUser(uid, email, requestedRole, options.userOverrides);
  if (options.omitUserRequestedRole) delete userData.requestedRole;
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), userData);
  batch.set(
    doc(db, "logs", `${LOG_PREFIX}${uid}`),
    registrationLog(
      uid,
      email,
      options.logRequestedRole === undefined
        ? requestedRole
        : options.logRequestedRole,
    ),
  );
  return batch.commit();
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
});

after(async () => {
  await testEnv.cleanup();
});

test("1 USER / Inactive registration succeeds for every non-PLAYER Login intent", async () => {
  for (const intent of REGISTRATION_INTENTS.filter((value) => value !== "PLAYER")) {
    await assertSucceeds(atomicRegistration(`valid-${intent.toLowerCase()}`, intent));
  }
});

test("2 PLAYER / Active registration succeeds for PLAYER intent", async () => {
  await assertSucceeds(atomicRegistration("valid-player", "PLAYER"));
});

test("3 SUPERADMIN, DATA_ADMIN, ADMIN, and arbitrary strings are denied as requestedRole metadata", async () => {
  for (const requestedRole of ["SUPERADMIN", "DATA_ADMIN", "ADMIN", "UNKNOWN", "", " player ", "player"]) {
    await assertFails(atomicRegistration(
      `denied-${requestedRole.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "empty"}`,
      requestedRole,
    ));
  }
});

test("4 null, number, boolean, object, and array requestedRole values are denied", async () => {
  for (const [label, requestedRole] of [
    ["null", null],
    ["number", 1],
    ["boolean", true],
    ["object", { role: "PLAYER" }],
    ["array", ["PLAYER"]],
  ] as const) {
    await assertFails(atomicRegistration(`malformed-${label}`, requestedRole));
  }
});

test("5 missing requestedRole is denied", async () => {
  await assertFails(atomicRegistration("missing-intent", "SCOUT", {
    omitUserRequestedRole: true,
    logRequestedRole: "SCOUT",
  }));
});

test("6 registration intent cannot create ADMIN, COACH, SUPERADMIN, or DATA_ADMIN authority", async () => {
  for (const role of ["ADMIN", "COACH", "SUPERADMIN", "DATA_ADMIN"]) {
    await assertFails(atomicRegistration(`authority-${role.toLowerCase()}`, "COACH", {
      userOverrides: { role, status: "Active" },
    }));
  }
});

test("7 valid requested intent cannot alter the USER / Inactive or PLAYER / Active invariant", async () => {
  await assertFails(atomicRegistration("scout-as-scout", "SCOUT", {
    userOverrides: { role: "SCOUT", status: "Active" },
  }));
  await assertFails(atomicRegistration("player-as-user", "PLAYER", {
    userOverrides: { role: "USER", status: "Inactive" },
  }));
});
