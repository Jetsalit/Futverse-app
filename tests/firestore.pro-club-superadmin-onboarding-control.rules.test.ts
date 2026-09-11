import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  doc,
  getDocFromServer,
  setDoc,
  Timestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT = "demo-pro-club-superadmin-onboarding-control-v1";
const CLUB = "club-a";
const SUPERADMIN = "superadmin-a";
const INACTIVE_SUPERADMIN = "superadmin-inactive";
const ADMIN = "global-admin";
const OWNER = "owner-a";
const USER = "user-a";
const TARGET = "coach-a";
const TARGET_2 = "coach-b";
const EXISTING_MEMBER = "existing-member";
const WRONG = "wrong-user";
const ROLE = "HEAD_COACH";
const CODE = `FUT-PC-${"A".repeat(24)}`;
const CODE_2 = `FUT-PC-${"B".repeat(24)}`;
const CLAIM = `${TARGET}_PRO_CLUB_${CODE}`;
const CLAIM_2 = `${TARGET_2}_PRO_CLUB_${CODE_2}`;

let environment: RulesTestEnvironment;

function db(uid: string): Firestore {
  return environment.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
}

async function readRaw(path: string): Promise<DocumentData | null> {
  let value: DocumentData | null = null;
  await environment.withSecurityRulesDisabled(async (context) => {
    const snap = await getDocFromServer(doc(context.firestore(), path));
    value = snap.exists() ? snap.data() : null;
  });
  return value;
}

function inviteData(code: string, clubId: string, targetUid: string, actorUid: string, role = ROLE) {
  return {
    schemaVersion: 1,
    inviteCode: code,
    clubId,
    targetUid,
    membershipAuthorizationRole: "MEMBER",
    staffRole: role,
    status: "ACTIVE",
    createdAt: Timestamp.now(),
    createdBy: actorUid,
    updatedAt: Timestamp.now(),
    updatedBy: actorUid,
    expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  };
}

function inviteAudit(actionId: string, actorUid: string, clubId: string, targetUid: string, code: string, role = ROLE) {
  return {
    schemaVersion: 1,
    actionId,
    actionType: "INVITE_ISSUED",
    actorUid,
    clubId,
    targetUid,
    inviteCode: code,
    claimId: null,
    staffRole: role,
    createdAt: Timestamp.now(),
  };
}

function pendingClaim(uid: string, code: string, role = ROLE) {
  return {
    schemaVersion: 1,
    type: "PRO_CLUB_STAFF_JOIN",
    userId: uid,
    clubId: CLUB,
    inviteCode: code,
    membershipAuthorizationRole: "MEMBER",
    staffRole: role,
    status: "PENDING",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

async function createInviteAsSuperAdmin(code = CODE, targetUid = TARGET) {
  const firestore = db(SUPERADMIN);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "proClubInvites", code), inviteData(code, CLUB, targetUid, SUPERADMIN));
  batch.set(
    doc(firestore, "proClubOnboardingControlAudits", `INVITE-${code}`),
    inviteAudit(`INVITE-${code}`, SUPERADMIN, CLUB, targetUid, code),
  );
  await batch.commit();
}

async function createPendingClaim(uid = TARGET, code = CODE, claimId = CLAIM) {
  const firestore = db(uid);
  await setDoc(doc(firestore, "proClubs", CLUB, "onboardingClaims", claimId), pendingClaim(uid, code));
}

function approvalAudit(actorUid: string, uid = TARGET, code = CODE, claimId = CLAIM) {
  return {
    schemaVersion: 1,
    actionId: `APPROVE-${claimId}`,
    actionType: "CLAIM_APPROVED",
    actorUid,
    clubId: CLUB,
    targetUid: uid,
    inviteCode: code,
    claimId,
    staffRole: ROLE,
    createdAt: Timestamp.now(),
  };
}

function rejectionAudit(actorUid: string, uid = TARGET, code = CODE, claimId = CLAIM) {
  return {
    schemaVersion: 1,
    actionId: `REJECT-${claimId}`,
    actionType: "CLAIM_REJECTED",
    actorUid,
    clubId: CLUB,
    targetUid: uid,
    inviteCode: code,
    claimId,
    staffRole: ROLE,
    createdAt: Timestamp.now(),
  };
}

async function approve(actorUid: string, withAudit = true, options?: { omitStaff?: boolean; forgedAuditActor?: string }) {
  const firestore = db(actorUid);
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "proClubs", CLUB, "onboardingClaims", CLAIM), {
    status: "APPROVED",
    approvedAt: Timestamp.now(),
    approvedBy: actorUid,
    updatedAt: Timestamp.now(),
  });
  batch.update(doc(firestore, "proClubInvites", CODE), {
    status: "CONSUMED",
    consumedAt: Timestamp.now(),
    consumedBy: actorUid,
    claimId: CLAIM,
    updatedAt: Timestamp.now(),
    updatedBy: actorUid,
  });
  batch.set(doc(firestore, "proClubs", CLUB, "onboardingApprovals", TARGET), {
    schemaVersion: 1,
    userId: TARGET,
    clubId: CLUB,
    claimId: CLAIM,
    inviteCode: CODE,
    membershipAuthorizationRole: "MEMBER",
    staffRole: ROLE,
    status: "APPROVED",
    approvedAt: Timestamp.now(),
    approvedBy: actorUid,
  });
  batch.set(doc(firestore, "proClubs", CLUB, "members", TARGET), {
    authorizationRole: "MEMBER",
    status: "ACTIVE",
  });
  if (!options?.omitStaff) {
    batch.set(doc(firestore, "proClubs", CLUB, "staff", TARGET), {
      staffRole: ROLE,
      status: "ACTIVE",
    });
  }
  if (withAudit) {
    batch.set(
      doc(firestore, "proClubOnboardingControlAudits", `APPROVE-${CLAIM}`),
      approvalAudit(options?.forgedAuditActor ?? actorUid),
    );
  }
  await batch.commit();
}

async function reject(actorUid: string, withAudit = true) {
  const firestore = db(actorUid);
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "proClubs", CLUB, "onboardingClaims", CLAIM), {
    status: "REJECTED",
    rejectedAt: Timestamp.now(),
    rejectedBy: actorUid,
    updatedAt: Timestamp.now(),
  });
  batch.update(doc(firestore, "proClubInvites", CODE), {
    status: "REVOKED",
    revokedAt: Timestamp.now(),
    revokedBy: actorUid,
    updatedAt: Timestamp.now(),
    updatedBy: actorUid,
  });
  if (withAudit) {
    batch.set(
      doc(firestore, "proClubOnboardingControlAudits", `REJECT-${CLAIM}`),
      rejectionAudit(actorUid),
    );
  }
  await batch.commit();
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Firestore emulator required");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  environment = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync("tests/fixtures/firestore.pro-club-superadmin-onboarding-control-v1.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seed([
    [`proClubs/${CLUB}`, { name: "Club A", status: "ACTIVE" }],
    [`users/${SUPERADMIN}`, { role: "SUPERADMIN", status: "ACTIVE" }],
    [`users/${INACTIVE_SUPERADMIN}`, { role: "SUPERADMIN", status: "INACTIVE" }],
    [`users/${ADMIN}`, { role: "ADMIN", status: "ACTIVE" }],
    [`users/${OWNER}`, { role: "USER", status: "ACTIVE" }],
    [`users/${USER}`, { role: "USER", status: "ACTIVE" }],
    [`users/${TARGET}`, { role: "USER", status: "ACTIVE" }],
    [`users/${TARGET_2}`, { role: "USER", status: "ACTIVE" }],
    [`users/${EXISTING_MEMBER}`, { role: "USER", status: "ACTIVE" }],
    [`users/${WRONG}`, { role: "USER", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/${OWNER}`, { authorizationRole: "OWNER", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/${EXISTING_MEMBER}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
  ]);
});

after(async () => environment?.cleanup());

test("ACTIVE SuperAdmin creates targeted HEAD_COACH invite only with same-commit matching audit", async () => {
  await createInviteAsSuperAdmin();
  const invite = await readRaw(`proClubInvites/${CODE}`);
  const audit = await readRaw(`proClubOnboardingControlAudits/INVITE-${CODE}`);
  assert.equal(invite?.membershipAuthorizationRole, "MEMBER");
  assert.equal(invite?.staffRole, ROLE);
  assert.equal(audit?.actionType, "INVITE_ISSUED");
  assert.equal(audit?.actorUid, SUPERADMIN);
});

test("SuperAdmin invite without audit is denied and leaves no invite", async () => {
  const firestore = db(SUPERADMIN);
  await assert.rejects(setDoc(doc(firestore, "proClubInvites", CODE), inviteData(CODE, CLUB, TARGET, SUPERADMIN)));
  assert.equal(await readRaw(`proClubInvites/${CODE}`), null);
});

test("mismatched or forged invitation audit denies the whole batch", async () => {
  const firestore = db(SUPERADMIN);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "proClubInvites", CODE), inviteData(CODE, CLUB, TARGET, SUPERADMIN));
  batch.set(
    doc(firestore, "proClubOnboardingControlAudits", `INVITE-${CODE}`),
    inviteAudit(`INVITE-${CODE}`, ADMIN, CLUB, TARGET_2, CODE),
  );
  await assert.rejects(batch.commit());
  assert.equal(await readRaw(`proClubInvites/${CODE}`), null);
  assert.equal(await readRaw(`proClubOnboardingControlAudits/INVITE-${CODE}`), null);
});

test("inactive SuperAdmin, global ADMIN and normal USER cannot use SuperAdmin invite path", async () => {
  for (const actor of [INACTIVE_SUPERADMIN, ADMIN, USER]) {
    const code = actor === INACTIVE_SUPERADMIN ? CODE : CODE_2;
    const target = actor === USER ? TARGET_2 : TARGET;
    const firestore = db(actor);
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, "proClubInvites", code), inviteData(code, CLUB, target, actor));
    batch.set(
      doc(firestore, "proClubOnboardingControlAudits", `INVITE-${code}`),
      inviteAudit(`INVITE-${code}`, actor, CLUB, target, code),
    );
    await assert.rejects(batch.commit());
  }
});

test("SuperAdmin cannot escalate invitation membership authority above MEMBER", async () => {
  const firestore = db(SUPERADMIN);
  const malicious = { ...inviteData(CODE, CLUB, TARGET, SUPERADMIN), membershipAuthorizationRole: "OWNER" };
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "proClubInvites", CODE), malicious);
  batch.set(
    doc(firestore, "proClubOnboardingControlAudits", `INVITE-${CODE}`),
    inviteAudit(`INVITE-${CODE}`, SUPERADMIN, CLUB, TARGET, CODE),
  );
  await assert.rejects(batch.commit());
});

test("SuperAdmin invite rejects missing, self, global-SuperAdmin and existing-member targets", async () => {
  const cases = ["missing-user", SUPERADMIN, INACTIVE_SUPERADMIN, EXISTING_MEMBER];
  for (let i = 0; i < cases.length; i += 1) {
    const code = `FUT-PC-${String(i + 1).repeat(24)}`;
    const target = cases[i];
    const firestore = db(SUPERADMIN);
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, "proClubInvites", code), inviteData(code, CLUB, target, SUPERADMIN));
    batch.set(
      doc(firestore, "proClubOnboardingControlAudits", `INVITE-${code}`),
      inviteAudit(`INVITE-${code}`, SUPERADMIN, CLUB, target, code),
    );
    await assert.rejects(batch.commit());
  }
});

test("canonical tenant OWNER invite remains available without SuperAdmin audit", async () => {
  const firestore = db(OWNER);
  await setDoc(doc(firestore, "proClubInvites", CODE), inviteData(CODE, CLUB, TARGET, OWNER));
  assert.ok(await readRaw(`proClubInvites/${CODE}`));
  assert.equal(await readRaw(`proClubOnboardingControlAudits/INVITE-${CODE}`), null);
});

test("only exact invitation recipient can create deterministic PENDING claim", async () => {
  await createInviteAsSuperAdmin();
  const wrong = db(WRONG);
  await assert.rejects(
    setDoc(doc(wrong, "proClubs", CLUB, "onboardingClaims", `${WRONG}_PRO_CLUB_${CODE}`), pendingClaim(WRONG, CODE)),
  );
  await createPendingClaim();
  const claim = await readRaw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`);
  assert.equal(claim?.status, "PENDING");
  assert.equal(claim?.userId, TARGET);
});

test("ACTIVE SuperAdmin approves in one atomic bundle with matching audit", async () => {
  await createInviteAsSuperAdmin();
  await createPendingClaim();
  await approve(SUPERADMIN, true);
  assert.equal((await readRaw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`))?.status, "APPROVED");
  assert.equal((await readRaw(`proClubInvites/${CODE}`))?.status, "CONSUMED");
  assert.equal((await readRaw(`proClubs/${CLUB}/members/${TARGET}`))?.authorizationRole, "MEMBER");
  assert.equal((await readRaw(`proClubs/${CLUB}/staff/${TARGET}`))?.staffRole, ROLE);
  assert.equal((await readRaw(`proClubOnboardingControlAudits/APPROVE-${CLAIM}`))?.actionType, "CLAIM_APPROVED");
});

test("SuperAdmin approval without audit rolls back every authority/domain write", async () => {
  await createInviteAsSuperAdmin();
  await createPendingClaim();
  await assert.rejects(approve(SUPERADMIN, false));
  assert.equal((await readRaw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`))?.status, "PENDING");
  assert.equal((await readRaw(`proClubInvites/${CODE}`))?.status, "ACTIVE");
  assert.equal(await readRaw(`proClubs/${CLUB}/members/${TARGET}`), null);
  assert.equal(await readRaw(`proClubs/${CLUB}/staff/${TARGET}`), null);
  assert.equal(await readRaw(`proClubs/${CLUB}/onboardingApprovals/${TARGET}`), null);
});

test("forged SuperAdmin approval audit rolls back the whole batch", async () => {
  await createInviteAsSuperAdmin();
  await createPendingClaim();
  await assert.rejects(approve(SUPERADMIN, true, { forgedAuditActor: ADMIN }));
  assert.equal((await readRaw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`))?.status, "PENDING");
  assert.equal(await readRaw(`proClubs/${CLUB}/members/${TARGET}`), null);
});

test("incomplete SuperAdmin approval bundle rolls back with no partial membership authority", async () => {
  await createInviteAsSuperAdmin();
  await createPendingClaim();
  await assert.rejects(approve(SUPERADMIN, true, { omitStaff: true }));
  assert.equal((await readRaw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`))?.status, "PENDING");
  assert.equal(await readRaw(`proClubs/${CLUB}/members/${TARGET}`), null);
  assert.equal(await readRaw(`proClubs/${CLUB}/onboardingApprovals/${TARGET}`), null);
});

test("claimant cannot self-approve even if it attempts a complete-looking bundle", async () => {
  await createInviteAsSuperAdmin();
  await createPendingClaim();
  await assert.rejects(approve(TARGET, false));
  assert.equal((await readRaw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`))?.status, "PENDING");
});

test("ACTIVE SuperAdmin rejects atomically with matching audit and creates no authority", async () => {
  await createInviteAsSuperAdmin();
  await createPendingClaim();
  await reject(SUPERADMIN, true);
  assert.equal((await readRaw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`))?.status, "REJECTED");
  assert.equal((await readRaw(`proClubInvites/${CODE}`))?.status, "REVOKED");
  assert.equal(await readRaw(`proClubs/${CLUB}/members/${TARGET}`), null);
  assert.equal(await readRaw(`proClubs/${CLUB}/staff/${TARGET}`), null);
  assert.equal((await readRaw(`proClubOnboardingControlAudits/REJECT-${CLAIM}`))?.actionType, "CLAIM_REJECTED");
});

test("SuperAdmin rejection without audit rolls back claim and invitation", async () => {
  await createInviteAsSuperAdmin();
  await createPendingClaim();
  await assert.rejects(reject(SUPERADMIN, false));
  assert.equal((await readRaw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`))?.status, "PENDING");
  assert.equal((await readRaw(`proClubInvites/${CODE}`))?.status, "ACTIVE");
});

test("SuperAdmin control audit is append-only: update and delete are denied", async () => {
  await createInviteAsSuperAdmin();
  const firestore = db(SUPERADMIN);
  const ref = doc(firestore, "proClubOnboardingControlAudits", `INVITE-${CODE}`);
  await assert.rejects(setDoc(ref, { ...inviteAudit(`INVITE-${CODE}`, SUPERADMIN, CLUB, TARGET, CODE), staffRole: "STAFF" }));
  // deleteDoc deliberately omitted: an overwrite attempt already proves update denial in this fixture;
  // delete is explicitly denied by the same match rule and is covered statically below.
  const rules = readFileSync("tests/fixtures/firestore.pro-club-superadmin-onboarding-control-v1.rules", "utf8");
  assert.match(rules, /match \/proClubOnboardingControlAudits\/\{actionId\}[\s\S]*allow update, delete: if false;/);
});

test("canonical tenant OWNER can approve without SuperAdmin audit", async () => {
  const ownerDb = db(OWNER);
  await setDoc(doc(ownerDb, "proClubInvites", CODE), inviteData(CODE, CLUB, TARGET, OWNER));
  await createPendingClaim();
  await approve(OWNER, false);
  assert.equal((await readRaw(`proClubs/${CLUB}/members/${TARGET}`))?.authorizationRole, "MEMBER");
  assert.equal(await readRaw(`proClubOnboardingControlAudits/APPROVE-${CLAIM}`), null);
});

test("foundation preserves exact atomic-audit and default-deny contract markers", () => {
  const rules = readFileSync("tests/fixtures/firestore.pro-club-superadmin-onboarding-control-v1.rules", "utf8");
  assert.match(rules, /matchingAuditAfter\('INVITE-' \+ code/);
  assert.match(rules, /matchingAuditAfter\('APPROVE-' \+ id/);
  assert.match(rules, /matchingAuditAfter\('REJECT-' \+ id/);
  assert.match(rules, /match \/\{document=\*\*\} \{ allow read, write: if false; \}/);
});
