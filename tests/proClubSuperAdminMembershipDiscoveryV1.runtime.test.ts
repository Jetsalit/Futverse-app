import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { createProClubSuperAdminOnboardingControlRepository } from "../src/lib/firestore/proClubSuperAdminOnboardingControlRepository";
import { proClubClaimId } from "../src/lib/proClubOnboarding";

const PROJECT = "demo-futverse-pro-club-superadmin-discovery-v1";
const CLUB = "club-discovery";
const SUPERADMIN = "superadmin-discovery";
const TARGET = "head-coach-discovery";

let environment: RulesTestEnvironment;

function db(uid: string): Firestore {
  return environment.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await environment.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)),
    );
  });
}

async function raw(path: string): Promise<DocumentData | null> {
  let result: DocumentData | null = null;
  await environment.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDocFromServer(doc(context.firestore(), path));
    result = snapshot.exists() ? snapshot.data() : null;
  });
  return result;
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Firestore emulator required");

  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  assert.ok(host && Number.isInteger(port), "Invalid FIRESTORE_EMULATOR_HOST");

  environment = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host,
      port,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seed([
    [`proClubs/${CLUB}`, { name: "Discovery Club", level: "T3", status: "ACTIVE" }],
    [`users/${SUPERADMIN}`, { uid: SUPERADMIN, role: "SUPERADMIN", status: "ACTIVE" }],
    [`users/${TARGET}`, {
      uid: TARGET,
      role: "USER",
      status: "ACTIVE",
      name: "Discovery Head Coach",
      email: "discovery.head.coach@example.invalid",
    }],
  ]);
});

after(async () => {
  await environment?.cleanup();
});

test("SuperAdmin approval atomically creates the exact membership discovery pointer", async () => {
  const repository = createProClubSuperAdminOnboardingControlRepository(
    db(SUPERADMIN),
    () => SUPERADMIN,
  );

  const invite = await repository.issueInvitation({
    clubId: CLUB,
    targetUid: TARGET,
    staffRole: "HEAD_COACH",
  }, SUPERADMIN);

  const claimId = proClubClaimId(TARGET, invite.inviteCode);
  await setDoc(doc(db(TARGET), "proClubs", CLUB, "onboardingClaims", claimId), {
    schemaVersion: 1,
    type: "PRO_CLUB_STAFF_JOIN",
    userId: TARGET,
    claimantIdentity: {
      displayName: "Discovery Head Coach",
      email: "discovery.head.coach@example.invalid",
    },
    clubId: CLUB,
    inviteCode: invite.inviteCode,
    membershipAuthorizationRole: "MEMBER",
    staffRole: "HEAD_COACH",
    status: "PENDING",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await repository.reviewClaim(CLUB, claimId, "APPROVED", SUPERADMIN);

  assert.deepEqual(
    await raw(`users/${TARGET}/proClubMemberships/${CLUB}`),
    { schemaVersion: 1, clubId: CLUB },
  );
});
