import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  getDocs,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { createProClubSuperAdminOnboardingControlRepository } from "../src/lib/firestore/proClubSuperAdminOnboardingControlRepository";
import { resolveProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import type { ProClubReadOps } from "../src/lib/firestore/proClubReadAdapter";
import { loadOwnProClubMembershipDiscoveries } from "../src/lib/firestore/proClubMembershipDiscoveryRepository";
import { resolveProClubRuntimeAuthority } from "../src/lib/organizationRuntimeProClubAuthorityBridge";
import {
  applyOrganizationResolution,
  beginOrganizationResolution,
  bindOrganizationRuntimeUid,
  createOrganizationRuntime,
  getOrganizationResolutionRequest,
  isOrganizationRuntimeAuthorized,
  selectOrganization,
} from "../src/lib/organizationRuntimeSelection";
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

function readOps(uid: string): ProClubReadOps {
  return {
    async readDocument(path) {
      const snapshot = await getDocFromServer(doc(db(uid), path.join("/")));
      return {
        id: snapshot.id,
        exists: snapshot.exists(),
        data: snapshot.exists() ? snapshot.data() : undefined,
      };
    },
  };
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

async function inviteCount(): Promise<number> {
  let count = 0;
  await environment.withSecurityRulesDisabled(async (context) => {
    count = (await getDocs(collection(context.firestore(), "proClubInvites"))).size;
  });
  return count;
}

async function createPendingClaim(inviteCode: string): Promise<string> {
  const claimId = proClubClaimId(TARGET, inviteCode);
  await setDoc(doc(db(TARGET), "proClubs", CLUB, "onboardingClaims", claimId), {
    schemaVersion: 1,
    type: "PRO_CLUB_STAFF_JOIN",
    userId: TARGET,
    claimantIdentity: {
      displayName: "Runtime Head Coach",
      email: "runtime.head.coach@example.invalid",
    },
    clubId: CLUB,
    inviteCode,
    membershipAuthorizationRole: "MEMBER",
    staffRole: "HEAD_COACH",
    status: "PENDING",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return claimId;
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
  assert.equal(invite.status, "ACTIVE");
  assert.equal((await raw(`proClubInvites/${invite.inviteCode}`))?.inviteCode, invite.inviteCode);
  assert.equal((await raw(`proClubOnboardingControlAudits/INVITE-${invite.inviteCode}`))?.actorUid, SUPERADMIN);
});

test("issuance success boundary is the batch acknowledgement, not a follow-up invite read", () => {
  const source = readFileSync("src/lib/firestore/proClubSuperAdminOnboardingControlRepository.ts", "utf8");
  const issueStart = source.indexOf("async function issueInvitation(");
  const loadPendingStart = source.indexOf("async function loadPending(");
  assert.ok(issueStart >= 0 && loadPendingStart > issueStart);
  const issueSource = source.slice(issueStart, loadPendingStart);
  const commitIndex = issueSource.indexOf("await batch.commit();");
  assert.ok(commitIndex >= 0);
  const afterCommit = issueSource.slice(commitIndex);
  assert.match(afterCommit, /return\s*\{[\s\S]*inviteCode/);
  assert.doesNotMatch(afterCommit, /getDocFromServer\s*\(\s*inviteRef\s*\)/);
});

test("runtime adapter rejects ordinary USER before any invitation write", async () => {
  const repository = createProClubSuperAdminOnboardingControlRepository(db(USER), () => USER);
  await assert.rejects(repository.issueInvitation({
    clubId: CLUB,
    targetUid: TARGET,
    staffRole: "HEAD_COACH",
  }, USER));
  assert.equal(await inviteCount(), 0);
});

test("runtime adapter rejects a missing Account Reference without partial invite or audit", async () => {
  const repository = createProClubSuperAdminOnboardingControlRepository(db(SUPERADMIN), () => SUPERADMIN);
  await assert.rejects(repository.issueInvitation({
    clubId: CLUB,
    targetUid: "missing-account-reference",
    staffRole: "HEAD_COACH",
  }, SUPERADMIN));
  assert.equal(await inviteCount(), 0);
});

test("runtime adapter fails closed when presented actor differs from authenticated actor", async () => {
  const repository = createProClubSuperAdminOnboardingControlRepository(db(SUPERADMIN), () => USER);
  await assert.rejects(repository.issueInvitation({
    clubId: CLUB,
    targetUid: TARGET,
    staffRole: "HEAD_COACH",
  }, SUPERADMIN));
  assert.equal(await inviteCount(), 0);
});

test("active SuperAdmin can read the Pro Club selector inventory while ordinary users cannot", async () => {
  const clubs = await getDocsFromServer(collection(db(SUPERADMIN), "proClubs"));
  assert.deepEqual(clubs.docs.map((club) => club.id), [CLUB]);

  await assert.rejects(
    getDocsFromServer(collection(db(USER), "proClubs")),
  );
});

test("approved user passes post-login membership discovery and Pro Club entry guards", async () => {
  const repository = createProClubSuperAdminOnboardingControlRepository(db(SUPERADMIN), () => SUPERADMIN);
  const invite = await repository.issueInvitation({
    clubId: CLUB,
    targetUid: TARGET,
    staffRole: "HEAD_COACH",
  }, SUPERADMIN);
  const claimId = await createPendingClaim(invite.inviteCode);

  const pending = await repository.loadPending(CLUB, SUPERADMIN);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].claimId, claimId);

  await repository.reviewClaim(CLUB, claimId, "APPROVED", SUPERADMIN);

  const approvedClaim = await raw(`proClubs/${CLUB}/onboardingClaims/${claimId}`);
  assert.equal(approvedClaim?.status, "APPROVED");
  assert.equal(approvedClaim?.userId, TARGET);
  assert.equal(approvedClaim?.clubId, CLUB);
  assert.equal(approvedClaim?.approvedBy, SUPERADMIN);

  const approval = await raw(`proClubs/${CLUB}/onboardingApprovals/${TARGET}`);
  assert.equal(approval?.status, "APPROVED");
  assert.equal(approval?.userId, TARGET);
  assert.equal(approval?.clubId, CLUB);
  assert.equal(approval?.claimId, claimId);
  assert.equal(approval?.inviteCode, invite.inviteCode);
  assert.equal(approval?.approvedBy, SUPERADMIN);

  assert.equal((await raw(`proClubs/${CLUB}/members/${TARGET}`))?.authorizationRole, "MEMBER");
  assert.equal((await raw(`proClubs/${CLUB}/staff/${TARGET}`))?.staffRole, "HEAD_COACH");
  assert.deepEqual(await raw(`users/${TARGET}/proClubMemberships/${CLUB}`), {
    schemaVersion: 1,
    clubId: CLUB,
  });
  assert.equal((await raw(`proClubInvites/${invite.inviteCode}`))?.status, "CONSUMED");
  const audit = await raw(`proClubOnboardingControlAudits/APPROVE-${claimId}`);
  assert.equal(audit?.actionType, "CLAIM_APPROVED");
  assert.equal(audit?.actorUid, SUPERADMIN);
  assert.equal(audit?.targetUid, TARGET);
  assert.equal(audit?.clubId, CLUB);
  assert.equal((await raw(`users/${SUPERADMIN}`))?.role, "SUPERADMIN");
  assert.equal((await raw(`users/${SUPERADMIN}`))?.status, "ACTIVE");

  const discoveries = await loadOwnProClubMembershipDiscoveries(TARGET, {
    getCurrentUid: () => TARGET,
    async readOwnMembershipDiscoveries(uid) {
      assert.equal(uid, TARGET);
      const pointer = await raw(`users/${uid}/proClubMemberships/${CLUB}`);
      return pointer === null ? [] : [{ id: CLUB, data: pointer }];
    },
  });
  assert.deepEqual(discoveries, [{ clubId: CLUB }]);

  const entryGeneration = bindOrganizationRuntimeUid(
    createOrganizationRuntime(),
    TARGET,
  );
  const selected = selectOrganization(entryGeneration, "PRO_CLUB", discoveries[0].clubId);
  const resolving = beginOrganizationResolution(selected);
  const request = getOrganizationResolutionRequest(resolving);
  assert.ok(request, "post-login entry must resolve a trusted selected-club request");
  const entry = await resolveProClubRuntimeAuthority(request, readOps(TARGET));
  assert.equal(entry.sourceState, "FOUND");
  assert.equal(entry.runtimeResult?.status, "AUTHORIZED");
  assert.equal(entry.authority?.organizationId, CLUB);
  assert.equal(entry.authority?.userId, TARGET);
  assert.equal(entry.authority?.hasMembershipAuthority, true);
  assert.equal(entry.authority?.membershipStatus, "ACTIVE");
  assert.equal(entry.authority?.staffRole, "HEAD_COACH");
  assert.ok(entry.runtimeResult);
  const authorizedRuntime = applyOrganizationResolution(resolving, entry.runtimeResult);
  assert.equal(isOrganizationRuntimeAuthorized(authorizedRuntime), true);
  assert.ok(authorizedRuntime.generation > entryGeneration.generation);
  assert.equal(authorizedRuntime.uid, TARGET);
  assert.equal(authorizedRuntime.selection?.organizationType, "PRO_CLUB");
  assert.equal(authorizedRuntime.selection?.organizationId, CLUB);

  const authority = await resolveProClubOrganizationAuthority(CLUB, TARGET, readOps(TARGET));
  assert.equal(authority.state, "FOUND");
  if (authority.state === "FOUND") {
    assert.equal(authority.value.hasMembershipAuthority, true);
    assert.equal(authority.value.membershipStatus, "ACTIVE");
    assert.equal(authority.value.staffRole, "HEAD_COACH");
  }
});

test("runtime adapter denies ordinary users and active members from approving a pending request", async () => {
  const repository = createProClubSuperAdminOnboardingControlRepository(db(SUPERADMIN), () => SUPERADMIN);
  const invite = await repository.issueInvitation({
    clubId: CLUB,
    targetUid: TARGET,
    staffRole: "HEAD_COACH",
  }, SUPERADMIN);
  const claimId = await createPendingClaim(invite.inviteCode);

  await seed([
    [`users/normal-member-runtime`, { uid: "normal-member-runtime", role: "USER", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/normal-member-runtime`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
  ]);

  for (const actorUid of [USER, "normal-member-runtime"]) {
    const unauthorized = createProClubSuperAdminOnboardingControlRepository(
      db(actorUid),
      () => actorUid,
    );
    await assert.rejects(
      unauthorized.reviewClaim(CLUB, claimId, "APPROVED", actorUid),
    );
  }

  assert.equal((await raw(`proClubs/${CLUB}/onboardingClaims/${claimId}`))?.status, "PENDING");
  assert.equal((await raw(`proClubs/${CLUB}/members/${TARGET}`)), null);
  assert.equal((await raw(`proClubs/${CLUB}/staff/${TARGET}`)), null);
  assert.equal((await raw(`proClubInvites/${invite.inviteCode}`))?.status, "ACTIVE");
  assert.equal(await raw(`proClubOnboardingControlAudits/APPROVE-${claimId}`), null);
});

test("runtime adapter rejects pending claim atomically without membership or staff", async () => {
  const repository = createProClubSuperAdminOnboardingControlRepository(db(SUPERADMIN), () => SUPERADMIN);
  const invite = await repository.issueInvitation({
    clubId: CLUB,
    targetUid: TARGET,
    staffRole: "HEAD_COACH",
  }, SUPERADMIN);
  const claimId = await createPendingClaim(invite.inviteCode);

  await repository.reviewClaim(CLUB, claimId, "REJECTED", SUPERADMIN);

  assert.equal((await raw(`proClubs/${CLUB}/onboardingClaims/${claimId}`))?.status, "REJECTED");
  assert.equal((await raw(`proClubInvites/${invite.inviteCode}`))?.status, "REVOKED");
  assert.equal(await raw(`proClubs/${CLUB}/members/${TARGET}`), null);
  assert.equal(await raw(`proClubs/${CLUB}/staff/${TARGET}`), null);
  assert.equal(await raw(`proClubs/${CLUB}/onboardingApprovals/${TARGET}`), null);
  assert.equal((await raw(`proClubOnboardingControlAudits/REJECT-${claimId}`))?.actionType, "CLAIM_REJECTED");
});
