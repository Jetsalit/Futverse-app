import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteField, serverTimestamp, Timestamp, writeBatch, type Firestore, type DocumentData } from "firebase/firestore";

const CLUB = "club-a", TARGET = "claimant", CODE = `FUT-PC-${"I".repeat(24)}`;
const CLAIM = `${TARGET}_PRO_CLUB_${CODE}`;
const IDENTITY = { displayName: "Ada Coach", email: "ada@example.test" };
let env: RulesTestEnvironment;
const db = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore() as unknown as Firestore;
const claimRef = (client: Firestore) => doc(client, "proClubs", CLUB, "onboardingClaims", CLAIM);
function pending(identity: unknown = IDENTITY) {
  return { schemaVersion: 1, type: "PRO_CLUB_STAFF_JOIN", userId: TARGET, clubId: CLUB, inviteCode: CODE,
    membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH", status: "PENDING",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), claimantIdentity: identity };
}
async function seed(entries: Array<[string, DocumentData]>) {
  await env.withSecurityRulesDisabled(async (context) => {
    for (const [path, data] of entries) await setDoc(doc(context.firestore(), path), data);
  });
}
async function storedClaim() {
  return (await getDoc(claimRef(db(TARGET)))).data()!;
}
async function createClaim() { await assertSucceeds(setDoc(claimRef(db(TARGET)), pending())); }
function decision(client: Firestore, reviewer: string, outcome: "APPROVED" | "REJECTED", patch: DocumentData = {}) {
  const batch = writeBatch(client);
  const at = serverTimestamp();
  const approved = outcome === "APPROVED";
  batch.update(claimRef(client), { status: outcome, updatedAt: at,
    ...(approved ? { approvedAt: at, approvedBy: reviewer } : { rejectedAt: at, rejectedBy: reviewer }), ...patch });
  batch.update(doc(client, "proClubInvites", CODE), approved
    ? { status: "CONSUMED", consumedAt: at, consumedBy: reviewer, claimId: CLAIM, updatedAt: at, updatedBy: reviewer }
    : { status: "REVOKED", revokedAt: at, revokedBy: reviewer, updatedAt: at, updatedBy: reviewer });
  if (approved) {
    batch.set(doc(client, "proClubs", CLUB, "onboardingApprovals", TARGET), {
      schemaVersion: 1, userId: TARGET, clubId: CLUB, claimId: CLAIM, inviteCode: CODE,
      membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH", status: "APPROVED", approvedAt: at, approvedBy: reviewer,
    });
    batch.set(doc(client, "proClubs", CLUB, "members", TARGET), { authorizationRole: "MEMBER", status: "ACTIVE" });
    batch.set(doc(client, "proClubs", CLUB, "staff", TARGET), { staffRole: "HEAD_COACH", status: "ACTIVE" });
  }
  return batch.commit();
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  env = await initializeTestEnvironment({ projectId: "demo-pro-club-claimant-identity-rules",
    firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed([
    [`users/${TARGET}`, { uid: TARGET, name: IDENTITY.displayName, email: IDENTITY.email, role: "USER", status: "Active" }],
    [`proClubs/${CLUB}`, { name: "Test United", status: "ACTIVE", level: "T3" }],
    ["proClubs/club-b", { name: "Other United", status: "ACTIVE", level: "T3" }],
    [`proClubs/${CLUB}/members/owner`, { authorizationRole: "OWNER", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/admin`, { authorizationRole: "ADMIN", status: "ACTIVE" }],
    ["proClubs/club-b/members/outsider", { authorizationRole: "OWNER", status: "ACTIVE" }],
    ["users/owner", { role: "USER", status: "ACTIVE" }],
    ["users/admin", { role: "USER", status: "ACTIVE" }],
    [`proClubInvites/${CODE}`, { schemaVersion: 1, inviteCode: CODE, clubId: CLUB, targetUid: TARGET,
      membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH", status: "ACTIVE", createdAt: Timestamp.now(),
      createdBy: "owner", updatedAt: Timestamp.now(), updatedBy: "owner", expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000) }],
  ]);
});
after(async () => { await env?.cleanup(); });

test("P2 Rules: exact canonical name and email are accepted", async () => {
  await createClaim(); assert.deepEqual((await storedClaim()).claimantIdentity, IDENTITY);
});
for (const [label, identity] of Object.entries({
  "forged display name": { ...IDENTITY, displayName: "Someone Else" },
  "forged email": { ...IDENTITY, email: "elsewhere@example.test" },
  "omitted available email": { displayName: IDENTITY.displayName },
  "omitted available name": { email: IDENTITY.email },
  "extra identity field": { ...IDENTITY, role: "OWNER" },
  "blank identity": { displayName: " \t\n" },
  "empty map": {}, "null": null, "array": [IDENTITY],
})) {
  test(`P2 Rules: ${label} is denied`, async () => {
    await assertFails(setDoc(claimRef(db(TARGET)), pending(identity)));
  });
}
test("P2 Rules: new claims cannot omit the snapshot", async () => {
  const { claimantIdentity: _, ...legacy } = pending();
  await assertFails(setDoc(claimRef(db(TARGET)), legacy));
});
for (const field of ["name", "email"] as const) {
  test(`P2 Rules: canonical ${field}-only account can supply only that existing field`, async () => {
    const identity = field === "name" ? { displayName: IDENTITY.displayName } : { email: IDENTITY.email };
    await seed([[`users/${TARGET}`, { [field]: field === "name" ? IDENTITY.displayName : IDENTITY.email }]]);
    await assertSucceeds(setDoc(claimRef(db(TARGET)), pending(identity)));
  });
}
test("P2 Rules: missing canonical account cannot create a claim", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(context.firestore(), "users", TARGET));
  });
  await assertFails(setDoc(claimRef(db(TARGET)), pending()));
});
test("P2 Rules: no usable canonical identity cannot create a claim", async () => {
  await seed([[`users/${TARGET}`, { name: " \t\n", email: null }]]);
  await assertFails(setDoc(claimRef(db(TARGET)), pending()));
});
test("P2 Rules: claimant UID must equal the authenticated actor", async () => {
  await assertFails(setDoc(claimRef(db("outsider")), pending()));
  const forged = { ...pending(), userId: "outsider" };
  await assertFails(setDoc(doc(db(TARGET), "proClubs", CLUB, "onboardingClaims", `outsider_PRO_CLUB_${CODE}`), forged));
});
test("P2 Rules: unauthenticated claim creation is denied", async () => {
  await assertFails(setDoc(claimRef(db(null)), pending()));
});
test("P2 Rules: claimant cannot edit the snapshot after creation", async () => {
  await createClaim();
  await assertFails(updateDoc(claimRef(db(TARGET)), { claimantIdentity: { ...IDENTITY, displayName: "Changed" } }));
});
for (const outcome of ["APPROVED", "REJECTED"] as const) {
  for (const reviewer of ["owner", "admin"]) {
    test(`P2 Rules: ${reviewer} ${outcome} preserves original identity after profile changes`, async () => {
      await createClaim();
      await seed([[`users/${TARGET}`, { name: "Later Name", email: "later@example.test" }]]);
      await assertSucceeds(decision(db(reviewer), reviewer, outcome));
      assert.deepEqual((await storedClaim()).claimantIdentity, IDENTITY);
    });
  }
  for (const [label, value] of [["replacement", { ...IDENTITY, displayName: "Changed" }], ["removal", deleteField()]] as const) {
    test(`P2 Rules: snapshot ${label} during ${outcome} is denied atomically`, async () => {
      await createClaim();
      await assertFails(decision(db("owner"), "owner", outcome, { claimantIdentity: value }));
      assert.equal((await storedClaim()).status, "PENDING");
      assert.deepEqual((await storedClaim()).claimantIdentity, IDENTITY);
      assert.equal((await getDoc(doc(db(TARGET), "proClubInvites", CODE))).data()?.status, "ACTIVE");
    });
  }
  test(`P2 Rules: legacy claim stays readable but ${outcome} is denied`, async () => {
    const { claimantIdentity: _, ...legacy } = pending();
    await seed([[`proClubs/${CLUB}/onboardingClaims/${CLAIM}`, { ...legacy, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }]]);
    await assertSucceeds(getDoc(claimRef(db("owner"))));
    await assertFails(decision(db("owner"), "owner", outcome));
    await assertFails(decision(db("owner"), "owner", outcome, { claimantIdentity: IDENTITY }));
    assert.equal((await storedClaim()).status, "PENDING");
  });
}
test("P2 Rules: another tenant cannot read or list claimant identity", async () => {
  await createClaim(); const other = db("outsider");
  await assertFails(getDoc(claimRef(other)));
  await assertFails(getDocs(query(collection(other, "proClubs", CLUB, "onboardingClaims"), where("clubId", "==", CLUB), where("status", "==", "PENDING"))));
});
for (const reviewer of ["owner", "admin"]) {
  test(`P2 Rules: ${reviewer} can read the claim but cannot get claimant user or list users`, async () => {
    await createClaim(); const client = db(reviewer);
    await assertSucceeds(getDoc(claimRef(client)));
    await assertFails(getDoc(doc(client, "users", TARGET)));
    await assertFails(getDocs(collection(client, "users")));
  });
}
