import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDocFromServer, setDoc, Timestamp, type DocumentData, type Firestore } from "firebase/firestore";
import { createProClubOnboardingRepository } from "../src/lib/firestore/proClubOnboardingRepository";
import { OnboardingError, onboardingErrorMessage, proClubClaimId, visibleInviteStatus } from "../src/lib/proClubOnboarding";
import { applyOrganizationResolution, beginOrganizationResolution, bindOrganizationRuntimeUid, createOrganizationRuntime, getOrganizationResolutionRequest, isOrganizationRuntimeAuthorized, selectOrganization } from "../src/lib/organizationRuntimeSelection";
import { resolveProClubRuntimeAuthority } from "../src/lib/organizationRuntimeProClubAuthorityBridge";

const CLUB = "club-a", OTHER_CLUB = "club-b", TARGET = "coach", OWNER = "owner", ADMIN = "admin";
const CODE = `FUT-PC-${"A".repeat(24)}`;
const CLAIM_ID = `${TARGET}_PRO_CLUB_${CODE}`;
let environment: RulesTestEnvironment;
function db(uid: string): Firestore { return environment.authenticatedContext(uid).firestore() as unknown as Firestore; }
function repository(uid: string) { return createProClubOnboardingRepository(db(uid), () => uid); }
async function seed(entries: Array<[string, DocumentData]>) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
}
function invite(patch: DocumentData = {}): DocumentData {
  const at = Timestamp.fromMillis(Date.now() - 1000);
  return { schemaVersion: 1, inviteCode: CODE, clubId: CLUB, targetUid: TARGET,
    membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH", status: "ACTIVE",
    createdAt: at, createdBy: OWNER, updatedAt: at, updatedBy: OWNER,
    expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000), ...patch };
}
async function snapshot(path: string) {
  let data: DocumentData | null = null;
  await environment.withSecurityRulesDisabled(async (context) => {
    const result = await getDocFromServer(doc(context.firestore(), path));
    data = result.exists() ? result.data() : null;
  });
  return data;
}
async function assertCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error) => error instanceof OnboardingError && error.code === code);
}
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Emulator required");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  environment = await initializeTestEnvironment({ projectId: "demo-pro-club-ui-runtime", firestore: { host, port: Number(port), rules: readFileSync("firestore.rules", "utf8") } });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await seed([
    [`proClubs/${CLUB}`, { name: "Club A", level: "T3", status: "ACTIVE" }],
    [`proClubs/${OTHER_CLUB}`, { name: "Club B", level: "T3", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/${OWNER}`, { authorizationRole: "OWNER", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/${ADMIN}`, { authorizationRole: "ADMIN", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/member`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${OTHER_CLUB}/members/other-owner`, { authorizationRole: "OWNER", status: "ACTIVE" }],
    [`users/${TARGET}`, { name: "Coach", email: "coach@example.test", role: "USER", status: "Inactive" }],
    [`proClubInvites/${CODE}`, invite()],
  ]);
});
after(async () => { await environment?.cleanup(); });

test("ACTIVE invitation creates exact deterministic PENDING claim and no membership", async () => {
  const result = await repository(TARGET).requestMembership(CODE, TARGET);
  assert.equal(proClubClaimId(TARGET, CODE), CLAIM_ID);
  assert.equal(result.status, "PENDING");
  assert.equal(result.clubId, CLUB);
  assert.equal(result.staffRole, "HEAD_COACH");
  assert.equal(result.membershipAuthorizationRole, "MEMBER");
  assert.deepEqual(Object.keys(result).sort(), ["schemaVersion", "type", "userId", "claimantIdentity", "clubId", "inviteCode", "membershipAuthorizationRole", "staffRole", "status", "createdAt", "updatedAt"].sort());
  assert.ok(result.createdAt.toMillis() > Date.now() - 30_000);
  assert.equal(await snapshot(`proClubs/${CLUB}/members/${TARGET}`), null);
});
for (const state of ["EXPIRED", "REVOKED", "CONSUMED"] as const) {
  test(`${state} invitation is visible but cannot create a claim`, async () => {
    const at = Timestamp.now();
    const patch = state === "EXPIRED" ? { expiresAt: Timestamp.fromMillis(Date.now() - 1000) } :
      state === "REVOKED" ? { status: state, revokedAt: at, revokedBy: OWNER } :
      { status: state, consumedAt: at, consumedBy: OWNER, claimId: CLAIM_ID };
    await seed([[`proClubInvites/${CODE}`, invite(patch)]]);
    const inspection = await repository(TARGET).inspectInvitation(CODE, TARGET);
    assert.equal(visibleInviteStatus(inspection.invite), state);
    await assertCode(repository(TARGET).requestMembership(CODE, TARGET), state);
    assert.equal(await snapshot(`proClubs/${CLUB}/onboardingClaims/${CLAIM_ID}`), null);
  });
}
test("pending retries and simultaneous submissions preserve one claim and original timestamps", async () => {
  const repo = repository(TARGET);
  const [first, concurrent] = await Promise.all([repo.requestMembership(CODE, TARGET), repo.requestMembership(CODE, TARGET)]);
  const retry = await repo.requestMembership(CODE, TARGET);
  assert.equal(first.createdAt.toMillis(), concurrent.createdAt.toMillis());
  assert.equal(first.createdAt.toMillis(), retry.createdAt.toMillis());
});
test("another authenticated code holder cannot claim for the invited user", async () => {
  const inspection = await repository("outsider").inspectInvitation(CODE, "outsider");
  assert.equal(inspection.claim, null);
  await assertCode(repository("outsider").requestMembership(CODE, "outsider"), "WRONG_RECIPIENT");
});
test("submit re-reads invite so modifying inspected club/role cannot forge claim fields", async () => {
  const repo = repository(TARGET);
  const inspected = await repo.inspectInvitation(CODE, TARGET);
  inspected.invite.clubId = OTHER_CLUB;
  inspected.invite.staffRole = "PHYSIO";
  const result = await repo.requestMembership(CODE, TARGET);
  assert.equal(result.clubId, CLUB); assert.equal(result.staffRole, "HEAD_COACH");
});
test("existing membership blocks new claim", async () => {
  await seed([[`proClubs/${CLUB}/members/${TARGET}`, { authorizationRole: "MEMBER", status: "ACTIVE" }]]);
  await assertCode(repository(TARGET).requestMembership(CODE, TARGET), "MEMBERSHIP_EXISTS");
});
test("malformed and missing codes return safe errors", async () => {
  await assertCode(repository(TARGET).inspectInvitation("../../club", TARGET), "INVALID_INVITE");
  await assertCode(repository(TARGET).inspectInvitation(`FUT-PC-${"Z".repeat(24)}`, TARGET), "UNAVAILABLE");
  assert.ok(!onboardingErrorMessage(new Error("raw firestore document path secret")).includes("secret"));
});
for (const reviewer of [OWNER, ADMIN]) {
  test(`${reviewer} loads scoped pending claims and completes the exact atomic five writes`, async () => {
    await repository(TARGET).requestMembership(CODE, TARGET);
    const repo = repository(reviewer);
    const pending = await repo.loadPending(CLUB, reviewer);
    assert.equal(pending.length, 1); assert.equal(pending[0].claimId, CLAIM_ID);
    await repo.reviewClaim(CLUB, CLAIM_ID, "APPROVED", reviewer);
    const claim = await snapshot(`proClubs/${CLUB}/onboardingClaims/${CLAIM_ID}`);
    const proof = await snapshot(`proClubs/${CLUB}/onboardingApprovals/${TARGET}`);
    const membership = await snapshot(`proClubs/${CLUB}/members/${TARGET}`);
    const staff = await snapshot(`proClubs/${CLUB}/staff/${TARGET}`);
    const consumed = await snapshot(`proClubInvites/${CODE}`);
    assert.equal(claim?.status, "APPROVED"); assert.equal(claim?.approvedBy, reviewer);
    assert.deepEqual(membership, { authorizationRole: "MEMBER", status: "ACTIVE" });
    assert.deepEqual(staff, { staffRole: "HEAD_COACH", status: "ACTIVE" });
    assert.equal(proof?.status, "APPROVED"); assert.equal(proof?.claimId, CLAIM_ID);
    assert.equal(proof?.membershipAuthorizationRole, "MEMBER"); assert.equal(proof?.approvedBy, reviewer);
    assert.equal(consumed?.status, "CONSUMED"); assert.equal(consumed?.claimId, CLAIM_ID);
    assert.equal(claim?.approvedAt.toMillis(), proof?.approvedAt.toMillis());
    assert.equal(claim?.approvedAt.toMillis(), consumed?.consumedAt.toMillis());
    assert.equal((await repo.loadPending(CLUB, reviewer)).length, 0);
    assert.equal((await repository(TARGET).inspectInvitation(CODE, TARGET)).claim?.status, "APPROVED");
  });
}
test("batch denied by existing staff leaves all five documents unchanged", async () => {
  await repository(TARGET).requestMembership(CODE, TARGET);
  await seed([[`proClubs/${CLUB}/staff/${TARGET}`, { staffRole: "PHYSIO", status: "INACTIVE" }]]);
  await assertCode(repository(OWNER).reviewClaim(CLUB, CLAIM_ID, "APPROVED", OWNER), "STALE_REQUEST");
  assert.equal((await snapshot(`proClubs/${CLUB}/onboardingClaims/${CLAIM_ID}`))?.status, "PENDING");
  assert.equal((await snapshot(`proClubInvites/${CODE}`))?.status, "ACTIVE");
  assert.equal(await snapshot(`proClubs/${CLUB}/members/${TARGET}`), null);
  assert.equal(await snapshot(`proClubs/${CLUB}/onboardingApprovals/${TARGET}`), null);
  assert.deepEqual(await snapshot(`proClubs/${CLUB}/staff/${TARGET}`), { staffRole: "PHYSIO", status: "INACTIVE" });
});
test("rejection preserves immutable request information and creates no membership staff or proof", async () => {
  const original = await repository(TARGET).requestMembership(CODE, TARGET);
  await repository(OWNER).reviewClaim(CLUB, CLAIM_ID, "REJECTED", OWNER);
  const rejected = (await repository(TARGET).inspectInvitation(CODE, TARGET)).claim!;
  for (const field of ["userId", "clubId", "inviteCode", "staffRole", "membershipAuthorizationRole"] as const) assert.equal(rejected[field], original[field]);
  assert.equal(rejected.createdAt.toMillis(), original.createdAt.toMillis());
  assert.equal(rejected.status, "REJECTED"); assert.equal(rejected.rejectedBy, OWNER);
  assert.equal((await snapshot(`proClubInvites/${CODE}`))?.status, "REVOKED");
  for (const kind of ["members", "staff", "onboardingApprovals"]) assert.equal(await snapshot(`proClubs/${CLUB}/${kind}/${TARGET}`), null);
});
test("expired pending request cannot be approved but can be rejected", async () => {
  await repository(TARGET).requestMembership(CODE, TARGET);
  await seed([[`proClubInvites/${CODE}`, invite({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })]]);
  await assertCode(repository(ADMIN).reviewClaim(CLUB, CLAIM_ID, "APPROVED", ADMIN), "EXPIRED");
  await repository(ADMIN).reviewClaim(CLUB, CLAIM_ID, "REJECTED", ADMIN);
});
test("non-reviewer and wrong-tenant actors cannot load or decide requests", async () => {
  await repository(TARGET).requestMembership(CODE, TARGET);
  for (const actor of ["member", "other-owner", TARGET]) {
    await assert.rejects(repository(actor).loadPending(CLUB, actor));
    await assert.rejects(repository(actor).reviewClaim(CLUB, CLAIM_ID, "APPROVED", actor));
  }
});
test("reviewer authority is re-read after loading and denied after revocation", async () => {
  await repository(TARGET).requestMembership(CODE, TARGET);
  await repository(OWNER).loadPending(CLUB, OWNER);
  await seed([[`proClubs/${CLUB}/members/${OWNER}`, { authorizationRole: "OWNER", status: "REVOKED" }]]);
  await assert.rejects(repository(OWNER).reviewClaim(CLUB, CLAIM_ID, "APPROVED", OWNER));
  assert.equal((await snapshot(`proClubs/${CLUB}/onboardingClaims/${CLAIM_ID}`))?.status, "PENDING");
});
test("stale approval/rejection cannot overwrite a completed decision", async () => {
  await repository(TARGET).requestMembership(CODE, TARGET);
  await repository(OWNER).reviewClaim(CLUB, CLAIM_ID, "APPROVED", OWNER);
  await assertCode(repository(ADMIN).reviewClaim(CLUB, CLAIM_ID, "REJECTED", ADMIN), "STALE_REQUEST");
});
test("actor mismatch and auth changes fail closed", async () => {
  await assertCode(repository(TARGET).requestMembership(CODE, OWNER), "AUTH_CHANGED");
  let reads = 0;
  const repo = createProClubOnboardingRepository(db(TARGET), () => ++reads === 1 ? TARGET : "successor");
  await assertCode(repo.inspectInvitation(CODE, TARGET), "AUTH_CHANGED");
});
test("approved membership reloads through existing selection and canonical authority bridge", async () => {
  let runtime = bindOrganizationRuntimeUid(createOrganizationRuntime(), TARGET);
  const ops = { async readDocument(path: readonly string[]) {
    const value = await getDocFromServer(doc(db(TARGET), path[0], ...path.slice(1)));
    return { id: value.id, exists: value.exists(), data: value.data() };
  } };
  const select = async () => {
    runtime = beginOrganizationResolution(selectOrganization(runtime, "PRO_CLUB", CLUB));
    const result = await resolveProClubRuntimeAuthority(getOrganizationResolutionRequest(runtime), ops);
    runtime = applyOrganizationResolution(runtime, result.runtimeResult);
  };
  await select(); assert.equal(isOrganizationRuntimeAuthorized(runtime), false);
  await repository(TARGET).requestMembership(CODE, TARGET);
  await repository(OWNER).reviewClaim(CLUB, CLAIM_ID, "APPROVED", OWNER);
  await select(); assert.equal(isOrganizationRuntimeAuthorized(runtime), true);
  const workspace = await repository(TARGET).loadWorkspace(CLUB, TARGET);
  assert.equal(workspace.organizationName, "Club A"); assert.equal(workspace.membershipAuthorizationRole, "MEMBER");
});
