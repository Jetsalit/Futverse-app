import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  cleanupAdminApp,
  initializeAdminServices,
} from "../functions/src/lib/firebaseAdmin.ts";
import { createServerAuthTokenVerifier } from "../functions/src/lib/serverAuthTokenVerifier.ts";
import {
  RENAME_ERROR_CODES,
  ProClubRenameError,
} from "../functions/src/proClubRename/core.ts";
import {
  createProClubRenameService,
  type ProClubRenameService,
} from "../functions/src/proClubRename/service.ts";

const PROJECT_ID = "demo-futverse-pro-club-rename";
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, "SAFETY GATE: FIRESTORE_EMULATOR_HOST is required");
const [host] = EMULATOR_HOST.split(":");
assert.ok(host === "127.0.0.1" || host === "localhost");
assert.ok(PROJECT_ID.startsWith("demo-"));

let firestore: Firestore;
let service: ProClubRenameService;

const tokenVerifier = createServerAuthTokenVerifier({
  async verifyIdToken(token: string) {
    const uidByToken: Record<string, string> = {
      "token-superadmin": "superadmin-active",
      "token-inactive": "superadmin-inactive",
      "token-admin": "ordinary-admin",
    };
    const uid = uidByToken[token];
    if (!uid) throw new Error("Invalid token");
    return { uid };
  },
});

async function clearEmulator() {
  const response = await fetch(
    `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  assert.equal(response.ok, true);
}

async function seed() {
  await Promise.all([
    firestore.collection("users").doc("superadmin-active").set({
      role: "SUPERADMIN", status: "ACTIVE",
    }),
    firestore.collection("users").doc("superadmin-inactive").set({
      role: "SUPERADMIN", status: "INACTIVE",
    }),
    firestore.collection("users").doc("ordinary-admin").set({
      role: "ADMIN", status: "ACTIVE",
    }),
    firestore.collection("proClubs").doc("club-alpha").set({
      name: "Alpha FC",
      shortName: "AFC",
      level: "T1",
      status: "ACTIVE",
      country: "TH",
      logoUrl: "https://example.com/alpha.png",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }),
    firestore.collection("proClubs").doc("club-legacy").set({
      name: "Legacy FC", level: "T3", status: "ACTIVE",
    }),
  ]);
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    clubId: "club-alpha",
    newName: "Alpha United",
    shortNameChange: { action: "SET", value: "AU" },
    reason: "TAKEOVER",
    reasonNote: null,
    effectiveAt: "2026-09-07T00:00:00.000Z",
    expectedCurrentName: "Alpha FC",
    expectedCurrentShortName: "AFC",
    expectedUpdatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function priorHistory(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    clubId: "club-alpha",
    previousName: "Alpha Athletic",
    previousShortName: "AA",
    newName: "Alpha FC",
    newShortName: "AFC",
    reason: "REBRAND",
    reasonNote: null,
    effectiveAt: "2026-09-06T00:00:00.000Z",
    changedAt: "2026-09-06T01:00:00.000Z",
    changedBy: "superadmin-active",
    ...overrides,
  };
}

async function captureClubState() {
  const club = await firestore.collection("proClubs").doc("club-alpha").get();
  const history = await club.ref.collection("nameHistory").get();
  return {
    root: club.data(),
    history: history.docs.map((entry) => ({ id: entry.id, data: entry.data() }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

async function expectRejectedWithoutMutation(
  expectedCode: string,
  body = request(),
): Promise<void> {
  const before = await captureClubState();
  await assert.rejects(
    rename(body),
    (error) => error instanceof ProClubRenameError && error.code === expectedCode,
  );
  assert.deepEqual(await captureClubState(), before);
}

async function rename(body = request(), token = "token-superadmin") {
  return service.renameProClub({
    authorizationHeader: `Bearer ${token}`,
    requestBody: body,
  });
}

before(async () => {
  const services = initializeAdminServices({ projectId: PROJECT_ID, requireEmulator: true });
  firestore = services.firestore;
  service = createProClubRenameService({
    firestore,
    authTokenVerifier: tokenVerifier,
    trustedClock: () => new Date("2026-09-07T01:02:03.000Z"),
  });
});

beforeEach(async () => {
  await clearEmulator();
  await seed();
});

after(async () => cleanupAdminApp());

test("ACTIVE SUPERADMIN atomically updates root and appends trusted history", async () => {
  const result = await rename();
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.clubId, "club-alpha");
  assert.equal(result.name, "Alpha United");
  assert.equal(result.shortName, "AU");
  assert.equal(result.changedBy, "superadmin-active");
  assert.equal(result.changedAt, "2026-09-07T01:02:03.000Z");

  const clubSnap = await firestore.collection("proClubs").doc("club-alpha").get();
  assert.deepEqual(clubSnap.data(), {
    name: "Alpha United",
    shortName: "AU",
    level: "T1",
    status: "ACTIVE",
    country: "TH",
    logoUrl: "https://example.com/alpha.png",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-09-07T01:02:03.000Z",
  });

  const historySnap = await firestore.collection("proClubs").doc("club-alpha")
    .collection("nameHistory").get();
  assert.equal(historySnap.size, 1);
  assert.deepEqual(historySnap.docs[0].data(), {
    schemaVersion: 1,
    clubId: "club-alpha",
    previousName: "Alpha FC",
    previousShortName: "AFC",
    newName: "Alpha United",
    newShortName: "AU",
    reason: "TAKEOVER",
    reasonNote: null,
    effectiveAt: "2026-09-07T00:00:00.000Z",
    changedAt: "2026-09-07T01:02:03.000Z",
    changedBy: "superadmin-active",
  });
});

test("unauthenticated, inactive, and non-SUPERADMIN callers are rejected without writes", async () => {
  await assert.rejects(
    service.renameProClub({ authorizationHeader: undefined, requestBody: request() }),
    (error) => error instanceof ProClubRenameError &&
      error.code === RENAME_ERROR_CODES.UNAUTHORIZED,
  );
  for (const token of ["token-inactive", "token-admin"]) {
    await assert.rejects(
      rename(request(), token),
      (error) => error instanceof ProClubRenameError &&
        error.code === RENAME_ERROR_CODES.UNAUTHORIZED,
    );
  }
  const club = await firestore.collection("proClubs").doc("club-alpha").get();
  const history = await club.ref.collection("nameHistory").get();
  assert.equal(club.data()?.name, "Alpha FC");
  assert.equal(history.empty, true);
});

test("missing club is rejected without history", async () => {
  await assert.rejects(
    rename(request({
      clubId: "club-missing",
      expectedCurrentName: "Missing FC",
      expectedCurrentShortName: null,
      expectedUpdatedAt: null,
    })),
    (error) => error instanceof ProClubRenameError &&
      error.code === RENAME_ERROR_CODES.CLUB_NOT_FOUND,
  );
  const history = await firestore.collection("proClubs").doc("club-missing")
    .collection("nameHistory").get();
  assert.equal(history.empty, true);
});

test("stale request loses without root-only or history-only partial state", async () => {
  await assert.rejects(
    rename(request({ expectedCurrentName: "Stale FC" })),
    (error) => error instanceof ProClubRenameError &&
      error.code === RENAME_ERROR_CODES.STALE_REQUEST,
  );
  const club = await firestore.collection("proClubs").doc("club-alpha").get();
  const history = await club.ref.collection("nameHistory").get();
  assert.equal(club.data()?.name, "Alpha FC");
  assert.equal(history.empty, true);
});

test("future effectiveAt is rejected without root or history writes", async () => {
  await assert.rejects(
    rename(request({ effectiveAt: "2026-09-07T01:02:03.001Z" })),
    (error) => error instanceof ProClubRenameError &&
      error.code === RENAME_ERROR_CODES.EFFECTIVE_AT_FUTURE,
  );
  const club = await firestore.collection("proClubs").doc("club-alpha").get();
  const history = await club.ref.collection("nameHistory").get();
  assert.equal(club.data()?.name, "Alpha FC");
  assert.equal(club.data()?.updatedAt, "2026-09-01T00:00:00.000Z");
  assert.equal(history.empty, true);
});

test("first rename before canonical createdAt is rejected without writes", async () => {
  await expectRejectedWithoutMutation(
    RENAME_ERROR_CODES.EFFECTIVE_AT_OUT_OF_ORDER,
    request({ effectiveAt: "2025-12-31T23:59:59.999Z" }),
  );
});

test("first rename exactly at or after canonical createdAt is accepted", async () => {
  for (const effectiveAt of [
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.001Z",
  ]) {
    await clearEmulator();
    await seed();
    const result = await rename(request({ effectiveAt }));
    assert.equal(result.status, "COMPLETED");
    assert.equal((await captureClubState()).history.length, 1);
  }
});

test("concurrent requests allow exactly one atomic rename", async () => {
  const outcomes = await Promise.allSettled([rename(), rename()]);
  assert.equal(outcomes.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((entry) => entry.status === "rejected" &&
    entry.reason instanceof ProClubRenameError &&
    entry.reason.code === RENAME_ERROR_CODES.STALE_REQUEST).length, 1);
  const club = await firestore.collection("proClubs").doc("club-alpha").get();
  const history = await club.ref.collection("nameHistory").get();
  assert.equal(club.data()?.name, "Alpha United");
  assert.equal(history.size, 1);
});

test("second rename appends history and never changes the first record", async () => {
  const first = await rename();
  const firstBefore = await firestore.collection("proClubs").doc("club-alpha")
    .collection("nameHistory").doc(first.changeId).get();

  await rename(request({
    newName: "Alpha City",
    shortNameChange: { action: "REMOVE" },
    reason: "LEGAL_NAME_CHANGE",
    effectiveAt: "2026-09-07T00:30:00.000Z",
    expectedCurrentName: "Alpha United",
    expectedCurrentShortName: "AU",
    expectedUpdatedAt: "2026-09-07T01:02:03.000Z",
  }));

  const club = await firestore.collection("proClubs").doc("club-alpha").get();
  assert.equal(club.data()?.name, "Alpha City");
  assert.equal("shortName" in (club.data() ?? {}), false);
  const history = await club.ref.collection("nameHistory").get();
  assert.equal(history.size, 2);
  const firstAfter = await firstBefore.ref.get();
  assert.deepEqual(firstAfter.data(), firstBefore.data());
});

test("complete continuous prior history permits a strictly later transition", async () => {
  await firestore.collection("proClubs").doc("club-alpha")
    .collection("nameHistory").doc("prior-change").set(priorHistory());
  const result = await rename();
  assert.equal(result.status, "COMPLETED");
  const state = await captureClubState();
  assert.equal(state.root?.name, "Alpha United");
  assert.equal(state.history.length, 2);
});

test("malformed prior history fails integrity without mutation", async () => {
  const malformed = priorHistory() as Record<string, unknown>;
  delete malformed.changedBy;
  await firestore.collection("proClubs").doc("club-alpha")
    .collection("nameHistory").doc("prior-change").set(malformed);
  await expectRejectedWithoutMutation(RENAME_ERROR_CODES.INTEGRITY);
});

test("prior name or short-name discontinuity fails integrity without mutation", async () => {
  for (const override of [
    { newName: "Different Root Name" },
    { newShortName: "DIFFERENT" },
  ]) {
    await clearEmulator();
    await seed();
    await firestore.collection("proClubs").doc("club-alpha")
      .collection("nameHistory").doc("prior-change").set(priorHistory(override));
    await expectRejectedWithoutMutation(RENAME_ERROR_CODES.INTEGRITY);
  }
});

test("equal prior effectiveAt fails ordering without mutation", async () => {
  await firestore.collection("proClubs").doc("club-alpha")
    .collection("nameHistory").doc("prior-change").set(priorHistory({
      effectiveAt: "2026-09-07T00:00:00.000Z",
    }));
  await expectRejectedWithoutMutation(RENAME_ERROR_CODES.EFFECTIVE_AT_OUT_OF_ORDER);
});

test("second rename with earlier effectiveAt is atomically rejected", async () => {
  const first = await rename();
  const firstBefore = await firestore.collection("proClubs").doc("club-alpha")
    .collection("nameHistory").doc(first.changeId).get();

  await assert.rejects(
    rename(request({
      newName: "Alpha City",
      effectiveAt: "2026-09-06T23:59:59.999Z",
      expectedCurrentName: "Alpha United",
      expectedCurrentShortName: "AU",
      expectedUpdatedAt: "2026-09-07T01:02:03.000Z",
    })),
    (error) => error instanceof ProClubRenameError &&
      error.code === RENAME_ERROR_CODES.EFFECTIVE_AT_OUT_OF_ORDER,
  );

  const club = await firestore.collection("proClubs").doc("club-alpha").get();
  const history = await club.ref.collection("nameHistory").get();
  assert.equal(club.data()?.name, "Alpha United");
  assert.equal(club.data()?.shortName, "AU");
  assert.equal(history.size, 1);
  assert.deepEqual((await firstBefore.ref.get()).data(), firstBefore.data());
});

test("legacy club without nameHistory or timestamps renames without migration", async () => {
  const result = await rename(request({
    clubId: "club-legacy",
    newName: "Legacy United",
    shortNameChange: { action: "UNCHANGED" },
    reason: "REBRAND",
    expectedCurrentName: "Legacy FC",
    expectedCurrentShortName: null,
    expectedUpdatedAt: null,
  }));
  assert.equal(result.name, "Legacy United");
  const club = await firestore.collection("proClubs").doc("club-legacy").get();
  assert.equal(club.data()?.level, "T3");
  assert.equal(club.data()?.status, "ACTIVE");
  assert.equal((await club.ref.collection("nameHistory").get()).size, 1);
});
