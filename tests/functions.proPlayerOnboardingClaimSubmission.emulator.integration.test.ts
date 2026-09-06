import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";

import {
  cleanupAdminApp,
  initializeAdminServices,
} from "../functions/src/lib/firebaseAdmin.ts";
import { createFirestoreProPlayerClaimSubmissionSourceV1 } from "../functions/src/proPlayerOnboardingClaimSubmission/firestoreDataSource.ts";
import { createFirestoreProPlayerClaimSubmissionRateLimiterV1 } from "../functions/src/proPlayerOnboardingClaimSubmission/rateLimiter.ts";
import {
  createProPlayerClaimSubmissionServiceV1,
  PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES,
  ProPlayerClaimSubmissionServiceError,
} from "../functions/src/proPlayerOnboardingClaimSubmission/service.ts";
import type { ProPlayerOnboardingV1 } from "../functions/src/proPlayerOnboardingClaimSubmission/contract.ts";

const PROJECT_ID = "demo-futverse-pro-player-claim-submission";
const APP_NAME = "pro-player-claim-submission-emulator-acceptance-v1";
const FIXED_NOW = new Date("2026-09-06T13:00:00.000Z");

const KNOWN_COLLECTIONS = [
  "users",
  "proPlayerOnboardingClaims",
  "proPlayerAccountBindings",
  "proPlayers",
  "playerIdentities",
  "futIdRegistry",
  "internalRateLimits",
] as const;

let firestore: Firestore;

function profile(overrides: Partial<ProPlayerOnboardingV1> = {}): ProPlayerOnboardingV1 {
  return {
    schemaVersion: 1,
    firstName: "Somchai",
    lastName: "Player",
    nickname: "Champ",
    nationality: "Thai",
    dateOfBirth: "2000-01-15",
    primaryPosition: "ST",
    secondaryPosition: null,
    heightCm: 180,
    weightKg: 75,
    preferredFoot: "RIGHT",
    currentEquipment: {
      shoeSize: 42,
      shoeSizeSystem: "EU",
      bootBrand: "Generic Brand",
      bootModel: "Model A",
    },
    currentClubName: null,
    leagueLevel: "FREE_AGENT",
    contractExpiryDate: null,
    expectedSalary: {
      monthlyAmount: 50000,
      currency: "THB",
      visibility: "PRIVATE",
    },
    profileImageUrl: null,
    careerHistory: [],
    ...overrides,
  };
}

function service() {
  return createProPlayerClaimSubmissionServiceV1(
    createFirestoreProPlayerClaimSubmissionSourceV1(firestore),
    createFirestoreProPlayerClaimSubmissionRateLimiterV1(firestore, { maxAttempts: 50 }),
  );
}

async function clearKnownCollections(): Promise<void> {
  for (const collectionName of KNOWN_COLLECTIONS) {
    const snapshot = await firestore.collection(collectionName).get();
    if (snapshot.empty) continue;
    const batch = firestore.batch();
    snapshot.docs.forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
  }
}

async function seedActivePlayer(uid: string): Promise<void> {
  await firestore.collection("users").doc(uid).set({ uid, role: "PLAYER", status: "ACTIVE" });
}

async function assertServiceError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof ProPlayerClaimSubmissionServiceError && error.code === code,
  );
}

async function assertCanonicalIdentityCollectionsEmpty(): Promise<void> {
  for (const collectionName of ["proPlayers", "playerIdentities", "futIdRegistry"] as const) {
    assert.equal((await firestore.collection(collectionName).get()).empty, true, `${collectionName} must stay empty`);
  }
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required.");
  assert.match(PROJECT_ID, /^demo-/);
  const services = initializeAdminServices({
    projectId: PROJECT_ID,
    requireEmulator: true,
    appName: APP_NAME,
  });
  firestore = services.firestore;
  await clearKnownCollections();
});

beforeEach(async () => {
  await clearKnownCollections();
});

after(async () => {
  if (firestore) await clearKnownCollections();
  await cleanupAdminApp(APP_NAME);
});

test("real Firestore Emulator transaction creates one exact private PENDING self claim", async () => {
  const uid = "player-emulator-single";
  const submittedProfile = profile();
  await seedActivePlayer(uid);

  const result = await service().submitClaim({
    requesterUid: uid,
    requestBody: { profile: submittedProfile },
    now: FIXED_NOW,
  });

  assert.deepEqual(result, { status: "PENDING", created: true, idempotent: false });

  const claim = await firestore.collection("proPlayerOnboardingClaims").doc(uid).get();
  assert.equal(claim.exists, true);
  assert.deepEqual(claim.data(), {
    schemaVersion: 1,
    type: "PRO_PLAYER_SELF_SERVICE_ONBOARDING",
    userId: uid,
    status: "PENDING",
    profile: submittedProfile,
  });
  await assertCanonicalIdentityCollectionsEmpty();
});

test("concurrent identical submissions produce exactly one create and idempotent retries", async () => {
  const uid = "player-emulator-concurrent-same";
  const submittedProfile = profile();
  await seedActivePlayer(uid);
  const submissionService = service();

  const results = await Promise.all(
    Array.from({ length: 8 }, () => submissionService.submitClaim({
      requesterUid: uid,
      requestBody: { profile: submittedProfile },
      now: FIXED_NOW,
    })),
  );

  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(results.filter((result) => result.idempotent).length, 7);
  assert.equal((await firestore.collection("proPlayerOnboardingClaims").get()).size, 1);
  assert.deepEqual(
    (await firestore.collection("proPlayerOnboardingClaims").doc(uid).get()).data()?.profile,
    submittedProfile,
  );
});

test("concurrent different submissions allow one winner and reject overwrite of the winner", async () => {
  const uid = "player-emulator-concurrent-conflict";
  const profileA = profile();
  const profileB = profile({
    currentEquipment: {
      ...profile().currentEquipment,
      bootModel: "Model B",
    },
  });
  await seedActivePlayer(uid);
  const submissionService = service();

  const settled = await Promise.allSettled([
    submissionService.submitClaim({ requesterUid: uid, requestBody: { profile: profileA }, now: FIXED_NOW }),
    submissionService.submitClaim({ requesterUid: uid, requestBody: { profile: profileB }, now: FIXED_NOW }),
  ]);

  const fulfilled = settled.filter((entry): entry is PromiseFulfilledResult<Awaited<ReturnType<typeof submissionService.submitClaim>>> => entry.status === "fulfilled");
  const rejected = settled.filter((entry): entry is PromiseRejectedResult => entry.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(fulfilled[0].value.created, true);
  assert.ok(rejected[0].reason instanceof ProPlayerClaimSubmissionServiceError);
  assert.equal(rejected[0].reason.code, PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.CONFLICT);

  const finalProfile = (await firestore.collection("proPlayerOnboardingClaims").doc(uid).get()).data()?.profile;
  assert.ok(
    JSON.stringify(finalProfile) === JSON.stringify(profileA) || JSON.stringify(finalProfile) === JSON.stringify(profileB),
    "final claim must equal exactly one submitted profile",
  );
  assert.equal((await firestore.collection("proPlayerOnboardingClaims").get()).size, 1);
});

test("binding or inactive canonical account blocks claim without partial Pro Player writes", async () => {
  const boundUid = "player-emulator-bound";
  await seedActivePlayer(boundUid);
  await firestore.collection("proPlayerAccountBindings").doc(boundUid).set({
    userId: boundUid,
    playerKey: "player-existing",
  });

  await assertServiceError(
    service().submitClaim({ requesterUid: boundUid, requestBody: { profile: profile() }, now: FIXED_NOW }),
    PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.CONFLICT,
  );
  assert.equal((await firestore.collection("proPlayerOnboardingClaims").doc(boundUid).get()).exists, false);

  const inactiveUid = "player-emulator-inactive";
  await firestore.collection("users").doc(inactiveUid).set({ uid: inactiveUid, role: "PLAYER", status: "INACTIVE" });
  await assertServiceError(
    service().submitClaim({ requesterUid: inactiveUid, requestBody: { profile: profile() }, now: FIXED_NOW }),
    PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.FORBIDDEN,
  );
  assert.equal((await firestore.collection("proPlayerOnboardingClaims").doc(inactiveUid).get()).exists, false);

  assert.equal((await firestore.collection("internalRateLimits").get()).size, 2, "quota bookkeeping is expected even when domain transaction is rejected");
  await assertCanonicalIdentityCollectionsEmpty();
});

test("conflicting existing claim remains byte-for-byte unchanged after rejected retry", async () => {
  const uid = "player-emulator-preserve-existing";
  const existingProfile = profile();
  const existingClaim = {
    schemaVersion: 1,
    type: "PRO_PLAYER_SELF_SERVICE_ONBOARDING",
    userId: uid,
    status: "PENDING",
    profile: existingProfile,
  } as const;
  await seedActivePlayer(uid);
  await firestore.collection("proPlayerOnboardingClaims").doc(uid).set(existingClaim);

  const changedProfile = profile({ nickname: "Different" });
  await assertServiceError(
    service().submitClaim({ requesterUid: uid, requestBody: { profile: changedProfile }, now: FIXED_NOW }),
    PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.CONFLICT,
  );

  assert.deepEqual(
    (await firestore.collection("proPlayerOnboardingClaims").doc(uid).get()).data(),
    existingClaim,
  );
  assert.equal((await firestore.collection("proPlayerOnboardingClaims").get()).size, 1);
  await assertCanonicalIdentityCollectionsEmpty();
});
