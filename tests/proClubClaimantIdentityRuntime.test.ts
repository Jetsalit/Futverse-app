import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDocFromServer, Timestamp, type Firestore, type DocumentData } from "firebase/firestore";
import { createProClubOnboardingRepository } from "../src/lib/firestore/proClubOnboardingRepository";
import { OnboardingError } from "../src/lib/proClubOnboarding";

const CLUB = "club-a", TARGET = "claimant", CODE = `FUT-PC-${"R".repeat(24)}`;
const CLAIM = `${TARGET}_PRO_CLUB_${CODE}`;
const IDENTITY = { displayName: "Ada Coach", email: "ada@example.test" };
let env: RulesTestEnvironment;
const db = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const repo = (uid: string) => createProClubOnboardingRepository(db(uid), () => uid);
async function seed(entries: Array<[string, DocumentData]>) {
  await env.withSecurityRulesDisabled(async (context) => {
    for (const [path, data] of entries) await setDoc(doc(context.firestore(), path), data);
  });
}
async function claimData() { return (await getDocFromServer(doc(db(TARGET), "proClubs", CLUB, "onboardingClaims", CLAIM))).data()!; }
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  env = await initializeTestEnvironment({ projectId: "demo-pro-club-claimant-identity-runtime",
    firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed([
    [`users/${TARGET}`, { uid: TARGET, name: IDENTITY.displayName, displayName: "Unused alias", email: IDENTITY.email, role: "USER", status: "Active" }],
    ["users/owner", { role: "USER", status: "Active" }],
    ["users/admin", { role: "USER", status: "ACTIVE" }],
    ["users/outsider", { role: "USER", status: "Active" }],
    [`proClubs/${CLUB}`, { name: "Test United", level: "T3", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/owner`, { authorizationRole: "OWNER", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/admin`, { authorizationRole: "ADMIN", status: "ACTIVE" }],
    ["proClubs/club-b", { name: "Other Club", level: "T3", status: "ACTIVE" }],
    ["proClubs/club-b/members/outsider", { authorizationRole: "OWNER", status: "ACTIVE" }],
    [`proClubInvites/${CODE}`, { schemaVersion: 1, inviteCode: CODE, clubId: CLUB, targetUid: TARGET,
      membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH", status: "ACTIVE", createdAt: Timestamp.now(),
      createdBy: "owner", updatedAt: Timestamp.now(), updatedBy: "owner", expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000) }],
  ]);
});
after(async () => { await env?.cleanup(); });

test("P2 runtime: new claim contains canonical name/email bound to its claimant UID", async () => {
  const claim = await repo(TARGET).requestMembership(CODE, TARGET);
  assert.equal(claim.userId, TARGET);
  assert.deepEqual(claim.claimantIdentity, IDENTITY);
  assert.deepEqual((await claimData()).claimantIdentity, IDENTITY);
});
test("P2 runtime: extra caller identity cannot override the internal canonical read", async () => {
  const repository = repo(TARGET);
  // JavaScript callers can pass extra arguments; these must never be used as identity inputs.
  // @ts-expect-error The repository intentionally accepts no identity argument.
  const claim = await repository.requestMembership(CODE, TARGET, { displayName: "Forged", email: "forged@example.test" });
  assert.deepEqual(claim.claimantIdentity, IDENTITY);
});
test("P2 runtime: altering an inspected claim cannot change the persisted review target", async () => {
  await repo(TARGET).requestMembership(CODE, TARGET);
  const [pending] = await repo("owner").loadPending(CLUB, "owner");
  pending.claim.claimantIdentity!.displayName = "Forged";
  pending.claim.userId = "outsider";
  await repo("owner").reviewClaim(CLUB, pending.claimId, "APPROVED", "owner");
  const stored = await claimData();
  assert.equal(stored.userId, TARGET);
  assert.deepEqual(stored.claimantIdentity, IDENTITY);
});
for (const decision of ["APPROVED", "REJECTED"] as const) {
  test(`P2 runtime: ${decision} preserves the creation snapshot after a profile rename`, async () => {
    await repo(TARGET).requestMembership(CODE, TARGET);
    await seed([[`users/${TARGET}`, { name: "New Name", email: "new@example.test" }]]);
    await repo("admin").reviewClaim(CLUB, CLAIM, decision, "admin");
    assert.deepEqual((await claimData()).claimantIdentity, IDENTITY);
  });
  test(`P2 runtime: legacy snapshot absence blocks ${decision} without a write`, async () => {
    await repo(TARGET).requestMembership(CODE, TARGET);
    const { claimantIdentity: _, ...legacy } = await claimData();
    await seed([[`proClubs/${CLUB}/onboardingClaims/${CLAIM}`, legacy]]);
    const [pending] = await repo("owner").loadPending(CLUB, "owner");
    assert.equal(pending.claim.claimantIdentity, undefined);
    await assert.rejects(repo("owner").reviewClaim(CLUB, CLAIM, decision, "owner"),
      (error) => error instanceof OnboardingError && error.code === "IDENTITY_UNAVAILABLE");
    assert.equal((await claimData()).status, "PENDING");
  });
}
test("P2 runtime: malformed snapshot remains visible but unavailable for decisions", async () => {
  await repo(TARGET).requestMembership(CODE, TARGET);
  await seed([[`proClubs/${CLUB}/onboardingClaims/${CLAIM}`, { ...await claimData(), claimantIdentity: { displayName: " ", email: 42 } }]]);
  const [pending] = await repo("owner").loadPending(CLUB, "owner");
  assert.equal(pending.claim.claimantIdentity, undefined);
  await assert.rejects(repo("owner").reviewClaim(CLUB, CLAIM, "APPROVED", "owner"),
    (error) => error instanceof OnboardingError && error.code === "IDENTITY_UNAVAILABLE");
});
for (const status of ["APPROVED", "REJECTED"] as const) {
  test(`P2 runtime: legacy ${status} history remains readable without migration`, async () => {
    await repo(TARGET).requestMembership(CODE, TARGET);
    const { claimantIdentity: _, ...legacy } = await claimData();
    const at = Timestamp.now();
    await seed([[`proClubs/${CLUB}/onboardingClaims/${CLAIM}`, { ...legacy, status,
      ...(status === "APPROVED" ? { approvedAt: at, approvedBy: "owner" } : { rejectedAt: at, rejectedBy: "owner" }) }]]);
    const inspection = await repo(TARGET).inspectInvitation(CODE, TARGET);
    assert.equal(inspection.claim?.status, status);
    assert.equal(inspection.claim?.claimantIdentity, undefined);
  });
}
test("P2 runtime: missing human identity blocks creation instead of inventing one", async () => {
  await seed([[`users/${TARGET}`, { name: null, email: " \t\n", role: "USER", status: "Active" }]]);
  await assert.rejects(repo(TARGET).requestMembership(CODE, TARGET),
    (error) => error instanceof OnboardingError && error.code === "IDENTITY_UNAVAILABLE");
});
for (const field of ["name", "email"] as const) {
  test(`P2 runtime: canonical ${field}-only legacy account uses its one available field`, async () => {
    await seed([[`users/${TARGET}`, { [field]: field === "name" ? IDENTITY.displayName : IDENTITY.email }]]);
    const claim = await repo(TARGET).requestMembership(CODE, TARGET);
    assert.deepEqual(claim.claimantIdentity, field === "name" ? { displayName: IDENTITY.displayName } : { email: IDENTITY.email });
  });
}
test("P2 runtime: retry preserves the old snapshot instead of taking a new profile identity", async () => {
  await repo(TARGET).requestMembership(CODE, TARGET);
  await seed([[`users/${TARGET}`, { name: "Changed", email: "changed@example.test" }]]);
  assert.deepEqual((await repo(TARGET).requestMembership(CODE, TARGET)).claimantIdentity, IDENTITY);
});
test("P2 runtime: other-tenant reviewer cannot fetch pending identity", async () => {
  await repo(TARGET).requestMembership(CODE, TARGET);
  await assert.rejects(repo("outsider").loadPending(CLUB, "outsider"));
});
test("P2 runtime: identity read is exact actor get and introduces no users-directory query", () => {
  const source = readFileSync("src/lib/firestore/proClubOnboardingRepository.ts", "utf8");
  assert.match(source, /getDocFromServer\(doc\(firestore, "users", uid\)\)/);
  assert.doesNotMatch(source, /collection(?:Group)?\([^)]*["']users["']/);
  assert.doesNotMatch(source, /claimantDisplayName|claimantEmail/);
});
