import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
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

const PROJECT = "demo-futverse-pro-club-superadmin-runtime-v1";
const CLUB = "club-runtime";
const SUPERADMIN = "superadmin-runtime";
const USER = "ordinary-runtime";
const TARGET = "head-coach-runtime";

let environment: RulesTestEnvironment;

function db(uid: string): Firestore {
  return environment.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
}

async function raw(path: string): Promise<DocumentData | null> {
  let result: DocumentData | null = null;
  await environment.withSecurityRulesDisabled(async (context) => {
    const snap = await getDocFromServer(doc(context.firestore(), path));
    result = snap.exists() ? snap.data() : null;
  });
  return result;
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Firestore emulator required");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  environment = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seed([
    [`proClubs/${CLUB}`, { name: "Runtime Club", level: "T3", status: "ACTIVE" }],
    [`users/${SUPERADMIN}`, { uid: SUPERADMIN, role: "SUPERADMIN", status: "ACTIVE" }],
    [`users/${USER}`, { uid: USER, role: "USER", status: "ACTIVE" }],
    [`users/${TARGET}`, {
      uid: TARGET,
      role: "USER",
      status: "ACTIVE",
      name: "Runtime Head Coach",
      email: "runtime.head.coach@example.invalid",
    }],
  ]);
});

after(async () => environment?.cleanup());

test("runtime adapter issues exact HEAD_COACH invite with same-commit audit", async () => {
  const repository = createProClubSuperAdminOnboardingControlRepository(db(SUPERADMIN), () => SUPERADMIN);
  const invite = await repository.issueInvitation({
    clubId: CLUB,
    targetUid: TARGET,
    staffRole: "HEAD_COACH",
  }, SUPERADMIN);

  assert.equal(invite.targetUid, TARGET);
  assert.equal(invite.staffRole, "HEAD_COACH");
  assert.equal(invite.membershipAuthorizationRole, "MEMBER");
  assert.equal((await raw(`proClubOnboardingControlAudits/INVITE-${invite.inviteCode}`))?.actorUid, SUPERADMIN);
});

test("runtime adapter rejects ordinary USER before any invitation write", async () => {
  const repository = createProClubSuperAdminOnboardingControlRepository(db(USER), () => USER);
  await assert.rejects(repository.issueInvitation({
    clubId: CLUB,
    targetUid: TARGET,
    staffRole: "HEAD_COACH",
  }, USER));

  let inviteCount = 0;
  await environment.withSecurityRulesDisabled(async (context) => {
    const { getDocs, collection } = await import("firebase/firestore");
    inviteCount = (await getDocs(collection(context.firestore(), "proClubInvites"))).size;
  });
  assert.equal(inviteCount, 0);
});

test("runtime adapter approves pending claim atomically as MEMBER plus HEAD_COACH plus audit", async () => {
  const repository = createProClubSuperAdminOnboardingControlRepository(db(SUPERADMIN), () => SUPERADMIN);
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
      displayName: "Runtime Head Coach",
      email: "runtime.head.coach@example.invalid",
    },
    clubId: CLUB,
    inviteCode: invite.inviteCode,
    membershipAuthorizationRole: "MEMBER",
    staffRole: "HEAD_COACH",
    status: "PENDING",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const pending = await repository.loadPending(CLUB, SUPERADMIN);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].claimId, claimId);

  await repository.reviewClaim(CLUB, claimId, "APPROVED", SUPERADMIN);

  assert.equal((await raw(`proClubs/${CLUB}/members/${TARGET}`))?.authorizationRole, "MEMBER");
  assert.equal((await raw(`proClubs/${CLUB}/staff/${TARGET}`))?.staffRole, "HEAD_COACH");
  assert.equal((await raw(`proClubInvites/${invite.inviteCode}`))?.status, "CONSUMED");
  assert.equal((await raw(`proClubOnboardingControlAudits/APPROVE-${claimId}`))?.actionType, "CLAIM_APPROVED");
});
