import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT = "demo-futverse-pro-club-superadmin-root-rules-v1";
const CLUB = "club-a";
const SUPERADMIN = "superadmin-a";
const INACTIVE_SUPERADMIN = "superadmin-inactive";
const OWNER = "owner-a";
const TARGET = "coach-a";
const ROLE = "HEAD_COACH";
const CODE = `FUT-PC-${"A".repeat(24)}`;
const CLAIM = `${TARGET}_PRO_CLUB_${CODE}`;

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

function invite(actorUid: string) {
  return {
    schemaVersion: 1,
    inviteCode: CODE,
    clubId: CLUB,
    targetUid: TARGET,
    membershipAuthorizationRole: "MEMBER",
    staffRole: ROLE,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
    status: "ACTIVE",
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

function audit(
  actionId: string,
  actionType: "INVITE_ISSUED" | "CLAIM_APPROVED" | "CLAIM_REJECTED",
  actorUid: string,
  claimId: string | null,
) {
  return {
    schemaVersion: 1,
    actionId,
    actionType,
    actorUid,
    clubId: CLUB,
    targetUid: TARGET,
    inviteCode: CODE,
    claimId,
    staffRole: ROLE,
    createdAt: serverTimestamp(),
  };
}

function pendingClaim() {
  return {
    schemaVersion: 1,
    type: "PRO_CLUB_STAFF_JOIN",
    userId: TARGET,
    claimantIdentity: {
      displayName: "Coach Test",
      email: "coach.test@example.invalid",
    },
    clubId: CLUB,
    inviteCode: CODE,
    membershipAuthorizationRole: "MEMBER",
    staffRole: ROLE,
    status: "PENDING",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

async function superAdminInvite(actorUid = SUPERADMIN, includeAudit = true) {
  const firestore = db(actorUid);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "proClubInvites", CODE), invite(actorUid));
  if (includeAudit) {
    batch.set(
      doc(firestore, "proClubOnboardingControlAudits", `INVITE-${CODE}`),
      audit(`INVITE-${CODE}`, "INVITE_ISSUED", actorUid, null),
    );
  }
  await batch.commit();
}

async function claimantRequest() {
  await setDoc(
    doc(db(TARGET), "proClubs", CLUB, "onboardingClaims", CLAIM),
    pendingClaim(),
  );
}

async function approve(actorUid: string, includeAudit = true) {
  const firestore = db(actorUid);
  const batch = writeBatch(firestore);

  batch.update(doc(firestore, "proClubs", CLUB, "onboardingClaims", CLAIM), {
    status: "APPROVED",
    approvedAt: serverTimestamp(),
    approvedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(firestore, "proClubInvites", CODE), {
    status: "CONSUMED",
    consumedAt: serverTimestamp(),
    consumedBy: actorUid,
    claimId: CLAIM,
    updatedAt: serverTimestamp(),
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
    approvedAt: serverTimestamp(),
    approvedBy: actorUid,
  });
  batch.set(doc(firestore, "proClubs", CLUB, "members", TARGET), {
    authorizationRole: "MEMBER",
    status: "ACTIVE",
  });
  batch.set(doc(firestore, "proClubs", CLUB, "staff", TARGET), {
    staffRole: ROLE,
    status: "ACTIVE",
  });
  if (includeAudit) {
    batch.set(
      doc(firestore, "proClubOnboardingControlAudits", `APPROVE-${CLAIM}`),
      audit(`APPROVE-${CLAIM}`, "CLAIM_APPROVED", actorUid, CLAIM),
    );
  }

  await batch.commit();
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
    [`proClubs/${CLUB}`, { name: "Club A", level: "T3", status: "ACTIVE" }],
    [`users/${SUPERADMIN}`, { uid: SUPERADMIN, role: "SUPERADMIN", status: "ACTIVE" }],
    [`users/${INACTIVE_SUPERADMIN}`, { uid: INACTIVE_SUPERADMIN, role: "SUPERADMIN", status: "INACTIVE" }],
    [`users/${OWNER}`, { uid: OWNER, role: "USER", status: "ACTIVE" }],
    [`users/${TARGET}`, {
      uid: TARGET,
      role: "USER",
      status: "ACTIVE",
      name: "Coach Test",
      email: "coach.test@example.invalid",
    }],
    [`proClubs/${CLUB}/members/${OWNER}`, { authorizationRole: "OWNER", status: "ACTIVE" }],
  ]);
});

after(async () => environment?.cleanup());

test("root rules allow ACTIVE SuperAdmin targeted invite only with same-commit audit", async () => {
  await superAdminInvite();
  assert.equal((await raw(`proClubInvites/${CODE}`))?.staffRole, ROLE);
  assert.equal((await raw(`proClubInvites/${CODE}`))?.membershipAuthorizationRole, "MEMBER");
  assert.equal((await raw(`proClubOnboardingControlAudits/INVITE-${CODE}`))?.actorUid, SUPERADMIN);
});

test("root rules deny SuperAdmin invite without audit and leave no partial invite", async () => {
  await assert.rejects(superAdminInvite(SUPERADMIN, false));
  assert.equal(await raw(`proClubInvites/${CODE}`), null);
});

test("root rules deny inactive SuperAdmin control-plane invite", async () => {
  await assert.rejects(superAdminInvite(INACTIVE_SUPERADMIN, true));
  assert.equal(await raw(`proClubInvites/${CODE}`), null);
});

test("exact target can create canonical pending claim from SuperAdmin invite", async () => {
  await superAdminInvite();
  await claimantRequest();
  const claim = await raw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`);
  assert.equal(claim?.status, "PENDING");
  assert.equal(claim?.claimantIdentity?.displayName, "Coach Test");
});

test("root rules allow SuperAdmin approval only as one atomic audited bundle", async () => {
  await superAdminInvite();
  await claimantRequest();
  await approve(SUPERADMIN, true);

  assert.equal((await raw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`))?.status, "APPROVED");
  assert.equal((await raw(`proClubInvites/${CODE}`))?.status, "CONSUMED");
  assert.equal((await raw(`proClubs/${CLUB}/members/${TARGET}`))?.authorizationRole, "MEMBER");
  assert.equal((await raw(`proClubs/${CLUB}/staff/${TARGET}`))?.staffRole, ROLE);
  assert.equal((await raw(`proClubOnboardingControlAudits/APPROVE-${CLAIM}`))?.actionType, "CLAIM_APPROVED");
});

test("root rules roll back complete-looking SuperAdmin approval when audit is missing", async () => {
  await superAdminInvite();
  await claimantRequest();
  await assert.rejects(approve(SUPERADMIN, false));

  assert.equal((await raw(`proClubs/${CLUB}/onboardingClaims/${CLAIM}`))?.status, "PENDING");
  assert.equal((await raw(`proClubInvites/${CODE}`))?.status, "ACTIVE");
  assert.equal(await raw(`proClubs/${CLUB}/members/${TARGET}`), null);
  assert.equal(await raw(`proClubs/${CLUB}/staff/${TARGET}`), null);
  assert.equal(await raw(`proClubs/${CLUB}/onboardingApprovals/${TARGET}`), null);
});

test("existing canonical OWNER invite path still works without SuperAdmin audit", async () => {
  await setDoc(doc(db(OWNER), "proClubInvites", CODE), invite(OWNER));
  assert.equal((await raw(`proClubInvites/${CODE}`))?.createdBy, OWNER);
  assert.equal(await raw(`proClubOnboardingControlAudits/INVITE-${CODE}`), null);
});
