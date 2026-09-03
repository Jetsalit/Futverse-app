import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-onboarding-v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const CLUB_A = "club-a";
const CLUB_B = "club-b";
const OWNER = "owner-a";
const ADMIN = "admin-a";
const MEMBER = "member-a";
const ADMIN_B = "admin-b";
const STAFF_ONLY = "staff-only";
const GLOBAL_SUPERADMIN = "global-superadmin";
const TARGET = "coach-target";
const OTHER = "other-user";
const PROOF_ONLY = "proof-only-user";

type StaffRole =
  | "HEAD_COACH" | "ASSISTANT_COACH" | "FITNESS_COACH"
  | "ANALYST" | "PHYSIO" | "TEAM_MANAGER" | "STAFF";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}
function anonymousDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}
async function assertExplicitSecurityDenial<T>(promise: Promise<T>): Promise<unknown> {
  const error = await assertFails(promise);
  const msg = (error as { message?: string } | undefined)?.message ?? String(error);
  assert.ok(
    !msg.includes("maximum of 1000 expressions") &&
    !msg.includes("too many calls") &&
    !msg.includes("service call limit") &&
    !msg.includes("evaluation limit"),
    `Expected explicit security denial, but got engine resource exhaustion: ${msg}`
  );
  return error;
}
function inviteCode(letter = "A"): string {
  return `FUT-PC-${letter.repeat(24)}`;
}
function claimIdFor(uid: string, code: string): string {
  return `${uid}_PRO_CLUB_${code}`;
}
function clubData(name: string): DocumentData {
  return { name, level: "T3", status: "ACTIVE" };
}
function membershipData(
  authorizationRole: "OWNER" | "ADMIN" | "MEMBER",
  status: "ACTIVE" | "INACTIVE" | "LEFT" | "REVOKED" = "ACTIVE",
): DocumentData {
  return { authorizationRole, status };
}
function staffData(
  staffRole: StaffRole,
  status: "ACTIVE" | "INACTIVE" | "LEFT" = "ACTIVE",
): DocumentData {
  return { staffRole, status };
}
function storedActiveInvite(
  code: string,
  targetUid = TARGET,
  clubId = CLUB_A,
  staffRole: StaffRole = "HEAD_COACH",
): DocumentData {
  const now = Date.now();
  return {
    schemaVersion: 1, inviteCode: code, clubId, targetUid,
    membershipAuthorizationRole: "MEMBER", staffRole,
    createdAt: Timestamp.fromMillis(now - 60_000), createdBy: OWNER,
    expiresAt: Timestamp.fromMillis(now + DAY_MS),
    status: "ACTIVE",
    updatedAt: Timestamp.fromMillis(now - 60_000), updatedBy: OWNER,
  };
}
function inviteCreateData(
  code: string,
  reviewer: string,
  targetUid = TARGET,
  clubId = CLUB_A,
  staffRole: StaffRole = "HEAD_COACH",
  authorizationRole: "OWNER" | "ADMIN" | "MEMBER" = "MEMBER",
): DocumentData {
  return {
    schemaVersion: 1, inviteCode: code, clubId, targetUid,
    membershipAuthorizationRole: authorizationRole, staffRole,
    createdAt: serverTimestamp(), createdBy: reviewer,
    expiresAt: Timestamp.fromMillis(Date.now() + DAY_MS),
    status: "ACTIVE",
    updatedAt: serverTimestamp(), updatedBy: reviewer,
  };
}
function storedPendingClaim(
  code: string,
  targetUid = TARGET,
  clubId = CLUB_A,
  staffRole: StaffRole = "HEAD_COACH",
): DocumentData {
  const now = Date.now();
  return {
    schemaVersion: 1, type: "PRO_CLUB_STAFF_JOIN",
    userId: targetUid, clubId, inviteCode: code,
    claimantIdentity: { displayName: `Claimant ${targetUid}`, email: `${targetUid}@example.test` },
    membershipAuthorizationRole: "MEMBER", staffRole, status: "PENDING",
    createdAt: Timestamp.fromMillis(now - 30_000),
    updatedAt: Timestamp.fromMillis(now - 30_000),
  };
}
function pendingClaimCreateData(
  code: string,
  targetUid = TARGET,
  clubId = CLUB_A,
  staffRole: StaffRole = "HEAD_COACH",
): DocumentData {
  return {
    schemaVersion: 1, type: "PRO_CLUB_STAFF_JOIN",
    userId: targetUid, clubId, inviteCode: code,
    claimantIdentity: { displayName: `Claimant ${targetUid}`, email: `${targetUid}@example.test` },
    membershipAuthorizationRole: "MEMBER", staffRole, status: "PENDING",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
}
async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) =>
      setDoc(doc(context.firestore(), path), data),
    ));
  });
}
async function seedBaseline(): Promise<void> {
  await seed([
    [`proClubs/${CLUB_A}`, clubData("Club A")],
    [`proClubs/${CLUB_B}`, clubData("Club B")],
    [`proClubs/${CLUB_A}/members/${OWNER}`, membershipData("OWNER")],
    [`proClubs/${CLUB_A}/members/${ADMIN}`, membershipData("ADMIN")],
    [`proClubs/${CLUB_A}/members/${MEMBER}`, membershipData("MEMBER")],
    [`proClubs/${CLUB_B}/members/${ADMIN_B}`, membershipData("ADMIN")],
    [`proClubs/${CLUB_A}/staff/${STAFF_ONLY}`, staffData("PHYSIO")],
    [`users/${OWNER}`, { role: "USER", status: "Active" }],
    [`users/${ADMIN}`, { role: "USER", status: "ACTIVE" }],
    [`users/${ADMIN_B}`, { role: "USER", status: "ACTIVE" }],
    [`users/${TARGET}`, { name: `Claimant ${TARGET}`, email: `${TARGET}@example.test`, role: "USER", status: "Inactive" }],
    [`users/${OTHER}`, { name: `Claimant ${OTHER}`, email: `${OTHER}@example.test`, role: "USER", status: "Inactive" }],
    [`users/${PROOF_ONLY}`, { name: `Claimant ${PROOF_ONLY}`, email: `${PROOF_ONLY}@example.test`, role: "USER", status: "Inactive" }],
    [`users/${GLOBAL_SUPERADMIN}`, { role: "SUPERADMIN", status: "ACTIVE" }],
  ]);
}
async function seedInviteAndPending(
  code = inviteCode("A"),
  targetUid = TARGET,
  staffRole: StaffRole = "HEAD_COACH",
): Promise<void> {
  await seed([
    [`proClubInvites/${code}`, storedActiveInvite(code, targetUid, CLUB_A, staffRole)],
    [`proClubs/${CLUB_A}/onboardingClaims/${claimIdFor(targetUid, code)}`,
      storedPendingClaim(code, targetUid, CLUB_A, staffRole)],
  ]);
}

interface ApprovalOptions {
  omitClaim?: boolean;
  omitProof?: boolean;
  omitMembership?: boolean;
  omitStaff?: boolean;
  omitInvite?: boolean;
  proofOverrides?: DocumentData;
  membershipRole?: "OWNER" | "ADMIN" | "MEMBER";
  staffRole?: StaffRole;
}

function approvalBatch(
  db: Firestore,
  reviewer: string,
  code = inviteCode("A"),
  targetUid = TARGET,
  options: ApprovalOptions = {},
): WriteBatch {
  const claimId = claimIdFor(targetUid, code);
  const expectedStaffRole = "HEAD_COACH";
  const writtenStaffRole = options.staffRole ?? expectedStaffRole;
  const batch = writeBatch(db);

  if (!options.omitClaim) {
    batch.update(doc(db, "proClubs", CLUB_A, "onboardingClaims", claimId), {
      status: "APPROVED", approvedAt: serverTimestamp(),
      approvedBy: reviewer, updatedAt: serverTimestamp(),
    });
  }
  if (!options.omitProof) {
    batch.set(doc(db, "proClubs", CLUB_A, "onboardingApprovals", targetUid), {
      schemaVersion: 1, userId: targetUid, clubId: CLUB_A, claimId,
      inviteCode: code, membershipAuthorizationRole: "MEMBER",
      staffRole: expectedStaffRole, status: "APPROVED",
      approvedAt: serverTimestamp(), approvedBy: reviewer,
      ...(options.proofOverrides ?? {}),
    });
  }
  if (!options.omitMembership) {
    batch.set(doc(db, "proClubs", CLUB_A, "members", targetUid),
      membershipData(options.membershipRole ?? "MEMBER"));
  }
  if (!options.omitStaff) {
    batch.set(doc(db, "proClubs", CLUB_A, "staff", targetUid),
      staffData(writtenStaffRole));
  }
  if (!options.omitInvite) {
    batch.update(doc(db, "proClubInvites", code), {
      status: "CONSUMED", consumedAt: serverTimestamp(),
      consumedBy: reviewer, claimId,
      updatedAt: serverTimestamp(), updatedBy: reviewer,
    });
  }
  return batch;
}

function rejectionBatch(
  db: Firestore,
  reviewer: string,
  code = inviteCode("A"),
  targetUid = TARGET,
  omitInvite = false,
): WriteBatch {
  const claimId = claimIdFor(targetUid, code);
  const batch = writeBatch(db);
  batch.update(doc(db, "proClubs", CLUB_A, "onboardingClaims", claimId), {
    status: "REJECTED", rejectedAt: serverTimestamp(),
    rejectedBy: reviewer, updatedAt: serverTimestamp(),
  });
  if (!omitInvite) {
    batch.update(doc(db, "proClubInvites", code), {
      status: "REVOKED", revokedAt: serverTimestamp(),
      revokedBy: reviewer, updatedAt: serverTimestamp(), updatedBy: reviewer,
    });
  }
  return batch;
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Rules tests must run through the Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  assert.ok(host && Number.isInteger(port), "Invalid FIRESTORE_EMULATOR_HOST.");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host, port,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBaseline();
});
after(async () => {
  await testEnv.cleanup();
});

test("1. V1 ACTIVE invite exact-code read requires authentication", async () => {
  const code = inviteCode("A");
  await seed([[`proClubInvites/${code}`, storedActiveInvite(code)]]);
  await assertFails(getDoc(doc(anonymousDb(), "proClubInvites", code)));
  // Slice 3A-R permits authenticated exact-code lookup; claim writes remain targeted.
  await assertSucceeds(getDoc(doc(authedDb(OTHER), "proClubInvites", code)));
  await assertSucceeds(getDoc(doc(authedDb(TARGET), "proClubInvites", code)));
  await assertSucceeds(getDoc(doc(authedDb(OWNER), "proClubInvites", code)));
});

test("2. invite registry cannot be listed", async () => {
  const code = inviteCode("A");
  await seed([[`proClubInvites/${code}`, storedActiveInvite(code)]]);
  await assertFails(getDocs(collection(authedDb(TARGET), "proClubInvites")));
  await assertFails(getDocs(collection(authedDb(OWNER), "proClubInvites")));
});

test("3. canonical OWNER and ADMIN can issue exact MEMBER invite", async () => {
  await assertSucceeds(setDoc(
    doc(authedDb(OWNER), "proClubInvites", inviteCode("A")),
    inviteCreateData(inviteCode("A"), OWNER),
  ));
  await assertSucceeds(setDoc(
    doc(authedDb(ADMIN), "proClubInvites", inviteCode("B")),
    inviteCreateData(inviteCode("B"), ADMIN, OTHER),
  ));
});

test("4. MEMBER staff-only unrelated admin and global SUPERADMIN cannot issue Club A invite", async () => {
  const actors: Array<[string, string]> = [
    [MEMBER, "C"], [STAFF_ONLY, "D"], [ADMIN_B, "E"], [GLOBAL_SUPERADMIN, "F"],
  ];
  for (const [actor, letter] of actors) {
    const code = inviteCode(letter);
    await assertFails(setDoc(
      doc(authedDb(actor), "proClubInvites", code),
      inviteCreateData(code, actor),
    ));
  }
});

test("5. invite cannot grant OWNER or ADMIN authority", async () => {
  for (const role of ["OWNER", "ADMIN"] as const) {
    const code = role === "OWNER" ? inviteCode("G") : inviteCode("H");
    await assertFails(setDoc(
      doc(authedDb(OWNER), "proClubInvites", code),
      inviteCreateData(code, OWNER, TARGET, CLUB_A, "HEAD_COACH", role),
    ));
  }
});

test("6. invite expiry must be future and bounded to seven days", async () => {
  const expiredCode = inviteCode("I");
  await assertFails(setDoc(
    doc(authedDb(OWNER), "proClubInvites", expiredCode),
    { ...inviteCreateData(expiredCode, OWNER),
      expiresAt: Timestamp.fromMillis(Date.now() - DAY_MS) },
  ));
  const longCode = inviteCode("J");
  await assertFails(setDoc(
    doc(authedDb(OWNER), "proClubInvites", longCode),
    { ...inviteCreateData(longCode, OWNER),
      expiresAt: Timestamp.fromMillis(Date.now() + 8 * DAY_MS) },
  ));
});

test("7. claimant creates only deterministic exact PENDING claim", async () => {
  const code = inviteCode("A");
  await seed([[`proClubInvites/${code}`, storedActiveInvite(code)]]);
  await assertSucceeds(setDoc(
    doc(authedDb(TARGET), "proClubs", CLUB_A, "onboardingClaims",
      claimIdFor(TARGET, code)),
    pendingClaimCreateData(code),
  ));
});

test("8. expired revoked and consumed invites cannot create claim", async () => {
  for (const [status, letter] of [
    ["EXPIRED", "K"], ["REVOKED", "L"], ["CONSUMED", "M"],
  ] as const) {
    const code = inviteCode(letter);
    const base = storedActiveInvite(code);
    let data: DocumentData = base;
    if (status === "EXPIRED") {
      data = { ...base, expiresAt: Timestamp.fromMillis(Date.now() - DAY_MS) };
    } else if (status === "REVOKED") {
      data = { ...base, status: "REVOKED",
        revokedAt: Timestamp.fromMillis(Date.now() - 1000), revokedBy: OWNER };
    } else {
      data = { ...base, status: "CONSUMED",
        consumedAt: Timestamp.fromMillis(Date.now() - 1000), consumedBy: OWNER,
        claimId: claimIdFor(TARGET, code) };
    }
    await seed([[`proClubInvites/${code}`, data]]);
    await assertFails(setDoc(
      doc(authedDb(TARGET), "proClubs", CLUB_A, "onboardingClaims",
        claimIdFor(TARGET, code)),
      pendingClaimCreateData(code),
    ));
  }
});

test("9. wrong UID club claim ID or role copy cannot create claim", async () => {
  const code = inviteCode("A");
  await seed([[`proClubInvites/${code}`, storedActiveInvite(code)]]);
  await assertFails(setDoc(
    doc(authedDb(OTHER), "proClubs", CLUB_A, "onboardingClaims",
      claimIdFor(OTHER, code)),
    pendingClaimCreateData(code, OTHER),
  ));
  await assertFails(setDoc(
    doc(authedDb(TARGET), "proClubs", CLUB_B, "onboardingClaims",
      claimIdFor(TARGET, code)),
    pendingClaimCreateData(code, TARGET, CLUB_B),
  ));
  await assertFails(setDoc(
    doc(authedDb(TARGET), "proClubs", CLUB_A, "onboardingClaims",
      `wrong-${claimIdFor(TARGET, code)}`),
    pendingClaimCreateData(code),
  ));
  await assertFails(setDoc(
    doc(authedDb(TARGET), "proClubs", CLUB_A, "onboardingClaims",
      claimIdFor(TARGET, code)),
    pendingClaimCreateData(code, TARGET, CLUB_A, "ANALYST"),
  ));
});

test("10. claimant and non-reviewer authorities cannot approve", async () => {
  for (const actor of [TARGET, MEMBER, STAFF_ONLY, ADMIN_B, GLOBAL_SUPERADMIN]) {
    await seedInviteAndPending();
    await assertFails(approvalBatch(authedDb(actor), actor).commit());
    await testEnv.clearFirestore();
    await seedBaseline();
  }
});

test("11. every partial approval is denied", async () => {
  await seedInviteAndPending();
  for (const options of [
    { omitClaim: true }, { omitProof: true }, { omitMembership: true },
    { omitStaff: true }, { omitInvite: true },
  ] satisfies ApprovalOptions[]) {
    await assertFails(
      approvalBatch(authedDb(OWNER), OWNER, inviteCode("A"), TARGET, options).commit(),
    );
  }
});

test("12. direct Membership/Staff create without fresh proof is denied", async () => {
  await assertFails(setDoc(
    doc(authedDb(OWNER), "proClubs", CLUB_A, "members", TARGET),
    membershipData("MEMBER"),
  ));
  await assertFails(setDoc(
    doc(authedDb(OWNER), "proClubs", CLUB_A, "staff", TARGET),
    staffData("HEAD_COACH"),
  ));
});

test("13. approval cannot escalate claimant to OWNER or ADMIN", async () => {
  await seedInviteAndPending();
  for (const membershipRole of ["OWNER", "ADMIN"] as const) {
    await assertFails(approvalBatch(
      authedDb(OWNER), OWNER, inviteCode("A"), TARGET, { membershipRole },
    ).commit());
  }
});

test("14. malformed approval-proof identity/role/staff evidence is denied", async () => {
  await seedInviteAndPending();
  for (const proofOverrides of [
    { userId: OTHER }, { clubId: CLUB_B }, { claimId: "wrong-claim" },
    { inviteCode: inviteCode("B") }, { membershipAuthorizationRole: "ADMIN" },
    { staffRole: "ANALYST" },
  ] as DocumentData[]) {
    await assertFails(approvalBatch(
      authedDb(OWNER), OWNER, inviteCode("A"), TARGET, { proofOverrides },
    ).commit());
  }
});

test("15. exact five-way atomic approval succeeds", async () => {
  const code = inviteCode("A");
  const claimId = claimIdFor(TARGET, code);
  await seedInviteAndPending(code);
  await assertSucceeds(approvalBatch(authedDb(OWNER), OWNER, code).commit());
  const targetDb = authedDb(TARGET);
  const membership = await assertSucceeds(
    getDoc(doc(targetDb, "proClubs", CLUB_A, "members", TARGET)),
  );
  assert.deepEqual(membership.data(), { authorizationRole: "MEMBER", status: "ACTIVE" });
  const staff = await assertSucceeds(
    getDoc(doc(targetDb, "proClubs", CLUB_A, "staff", TARGET)),
  );
  assert.deepEqual(staff.data(), { staffRole: "HEAD_COACH", status: "ACTIVE" });
  const proof = await assertSucceeds(
    getDoc(doc(targetDb, "proClubs", CLUB_A, "onboardingApprovals", TARGET)),
  );
  assert.equal(proof.data()?.claimId, claimId);
  const claim = await assertSucceeds(
    getDoc(doc(targetDb, "proClubs", CLUB_A, "onboardingClaims", claimId)),
  );
  assert.equal(claim.data()?.status, "APPROVED");
  await assertSucceeds(getDoc(doc(targetDb, "proClubs", CLUB_A)));
});

test("16. consumed invite and approved claim cannot be replayed", async () => {
  const code = inviteCode("A");
  const claimId = claimIdFor(TARGET, code);
  await seedInviteAndPending(code);
  await assertSucceeds(approvalBatch(authedDb(OWNER), OWNER, code).commit());
  await assertFails(approvalBatch(authedDb(OWNER), OWNER, code).commit());
  await assertFails(setDoc(
    doc(authedDb(TARGET), "proClubs", CLUB_A, "onboardingClaims", claimId),
    pendingClaimCreateData(code),
  ));
  await assertFails(setDoc(
    doc(authedDb(TARGET), "proClubs", CLUB_A, "onboardingClaims", `second-${claimId}`),
    pendingClaimCreateData(code),
  ));
});

test("17. claim identity mutation is denied", async () => {
  const code = inviteCode("A");
  const claimId = claimIdFor(TARGET, code);
  await seedInviteAndPending(code);
  await assertFails(updateDoc(
    doc(authedDb(OWNER), "proClubs", CLUB_A, "onboardingClaims", claimId),
    {
      staffRole: "ANALYST", status: "REJECTED",
      rejectedAt: serverTimestamp(), rejectedBy: OWNER, updatedAt: serverTimestamp(),
    },
  ));
});

test("18. invite identity mutation is denied", async () => {
  const code = inviteCode("A");
  await seed([[`proClubInvites/${code}`, storedActiveInvite(code)]]);
  await assertFails(updateDoc(doc(authedDb(OWNER), "proClubInvites", code), {
    targetUid: OTHER, status: "REVOKED",
    revokedAt: serverTimestamp(), revokedBy: OWNER,
    updatedAt: serverTimestamp(), updatedBy: OWNER,
  }));
});

test("19. rejection without matching invite revocation is denied", async () => {
  await seedInviteAndPending();
  await assertFails(
    rejectionBatch(authedDb(OWNER), OWNER, inviteCode("A"), TARGET, true).commit(),
  );
});

test("20. exact atomic rejection succeeds without creating authority", async () => {
  const code = inviteCode("A");
  const claimId = claimIdFor(TARGET, code);
  await seedInviteAndPending(code);
  await assertSucceeds(rejectionBatch(authedDb(OWNER), OWNER, code).commit());
  const targetDb = authedDb(TARGET);
  const claim = await assertSucceeds(
    getDoc(doc(targetDb, "proClubs", CLUB_A, "onboardingClaims", claimId)),
  );
  assert.equal(claim.data()?.status, "REJECTED");
  assert.equal((await assertSucceeds(
    getDoc(doc(targetDb, "proClubs", CLUB_A, "members", TARGET)),
  )).exists(), false);
  assert.equal((await assertSucceeds(
    getDoc(doc(targetDb, "proClubs", CLUB_A, "staff", TARGET)),
  )).exists(), false);
  assert.equal((await assertSucceeds(
    getDoc(doc(targetDb, "proClubs", CLUB_A, "onboardingApprovals", TARGET)),
  )).exists(), false);
  await assertFails(getDoc(doc(targetDb, "proClubs", CLUB_A)));
});

test("21. reviewer may revoke unused invite; revoked invite cannot be claimed", async () => {
  const code = inviteCode("A");
  await seed([[`proClubInvites/${code}`, storedActiveInvite(code)]]);
  await assertSucceeds(updateDoc(doc(authedDb(OWNER), "proClubInvites", code), {
    status: "REVOKED", revokedAt: serverTimestamp(), revokedBy: OWNER,
    updatedAt: serverTimestamp(), updatedBy: OWNER,
  }));
  await assertFails(setDoc(
    doc(authedDb(TARGET), "proClubs", CLUB_A, "onboardingClaims",
      claimIdFor(TARGET, code)),
    pendingClaimCreateData(code),
  ));
});

test("22. approval proof alone never grants Pro Club authority", async () => {
  const code = inviteCode("A");
  await seed([[`proClubs/${CLUB_A}/onboardingApprovals/${PROOF_ONLY}`, {
    schemaVersion: 1, userId: PROOF_ONLY, clubId: CLUB_A,
    claimId: claimIdFor(PROOF_ONLY, code), inviteCode: code,
    membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH",
    status: "APPROVED", approvedAt: Timestamp.now(), approvedBy: OWNER,
  }]]);
  const db = authedDb(PROOF_ONLY);
  await assertSucceeds(
    getDoc(doc(db, "proClubs", CLUB_A, "onboardingApprovals", PROOF_ONLY)),
  );
  await assertFails(getDoc(doc(db, "proClubs", CLUB_A)));
});

test("23. approval proof update delete and list remain denied", async () => {
  const code = inviteCode("A");
  await seed([[`proClubs/${CLUB_A}/onboardingApprovals/${PROOF_ONLY}`, {
    schemaVersion: 1, userId: PROOF_ONLY, clubId: CLUB_A,
    claimId: claimIdFor(PROOF_ONLY, code), inviteCode: code,
    membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH",
    status: "APPROVED", approvedAt: Timestamp.now(), approvedBy: OWNER,
  }]]);
  const ownerDb = authedDb(OWNER);
  await assertFails(updateDoc(
    doc(ownerDb, "proClubs", CLUB_A, "onboardingApprovals", PROOF_ONLY),
    { staffRole: "ANALYST" },
  ));
  await assertFails(deleteDoc(
    doc(ownerDb, "proClubs", CLUB_A, "onboardingApprovals", PROOF_ONLY),
  ));
  await assertFails(getDocs(
    collection(ownerDb, "proClubs", CLUB_A, "onboardingApprovals"),
  ));
});

test("24. onboarding paths do not weaken unrelated nested default deny", async () => {
  await seed([[`proClubs/${CLUB_A}/private/secret`, { secret: true }]]);
  await assertFails(getDoc(
    doc(authedDb(OWNER), "proClubs", CLUB_A, "private", "secret"),
  ));
  await assertFails(setDoc(
    doc(authedDb(OWNER), "proClubs", CLUB_A, "private", "new-secret"),
    { secret: true },
  ));
});

// ============================================================================
// Reviewer Write Authority Account Status Enforcement (P1 Codex Remediation)
// ============================================================================

for (const role of ["OWNER", "ADMIN"] as const) {
  const actor = `reviewer-write-${role.toLowerCase()}`;

  test(`25. ${role} with REJECTED canonical account status cannot approve or reject claims`, async () => {
    await seedInviteAndPending(inviteCode("A"));
    await seed([
      [`proClubs/${CLUB_A}/members/${actor}`, membershipData(role)],
      [`users/${actor}`, { role: "USER", status: "REJECTED" }],
    ]);
    await assertExplicitSecurityDenial(approvalBatch(authedDb(actor), actor, inviteCode("A")).commit());
    await assertExplicitSecurityDenial(rejectionBatch(authedDb(actor), actor, inviteCode("A")).commit());
  });

  test(`26. ${role} with missing users/{uid} document cannot approve or reject claims`, async () => {
    await seedInviteAndPending(inviteCode("A"));
    await seed([
      [`proClubs/${CLUB_A}/members/${actor}`, membershipData(role)],
    ]);
    await assertExplicitSecurityDenial(approvalBatch(authedDb(actor), actor, inviteCode("A")).commit());
    await assertExplicitSecurityDenial(rejectionBatch(authedDb(actor), actor, inviteCode("A")).commit());
  });

  test(`27. ${role} with missing or malformed or unsupported status cannot approve or reject claims`, async () => {
    const invalidStatuses = [undefined, 42, true, null, { bad: true }, "PENDING", "Inactive", "SUSPENDED", "active"];
    for (const st of invalidStatuses) {
      await seedInviteAndPending(inviteCode("A"));
      await seed([
        [`proClubs/${CLUB_A}/members/${actor}`, membershipData(role)],
        [`users/${actor}`, { role: "USER", ...(st !== undefined ? { status: st } : {}) }],
      ]);
      await assertExplicitSecurityDenial(approvalBatch(authedDb(actor), actor, inviteCode("A")).commit());
      await assertExplicitSecurityDenial(rejectionBatch(authedDb(actor), actor, inviteCode("A")).commit());
    }
  });

  test(`28. ${role} with ACTIVE canonical account status ("Active" and "ACTIVE") can approve and reject`, async () => {
    // Test approval with "Active"
    const codeApprove = inviteCode("A");
    await seedInviteAndPending(codeApprove);
    await seed([
      [`proClubs/${CLUB_A}/members/${actor}`, membershipData(role)],
      [`users/${actor}`, { role: "USER", status: "Active" }],
    ]);
    await assertSucceeds(approvalBatch(authedDb(actor), actor, codeApprove).commit());

    await testEnv.clearFirestore();
    await seedBaseline();

    // Test rejection with "ACTIVE"
    const codeReject = inviteCode("B");
    await seedInviteAndPending(codeReject);
    await seed([
      [`proClubs/${CLUB_A}/members/${actor}`, membershipData(role)],
      [`users/${actor}`, { role: "USER", status: "ACTIVE" }],
    ]);
    await assertSucceeds(rejectionBatch(authedDb(actor), actor, codeReject).commit());
  });
}

test("29. approval batch is explicitly denied when claimant already has existing membership", async () => {
  const code = inviteCode("A");
  await seedInviteAndPending(code);
  await seed([[`proClubs/${CLUB_A}/members/${TARGET}`, membershipData("MEMBER")]]);
  await assertExplicitSecurityDenial(approvalBatch(authedDb(OWNER), OWNER, code).commit());
});

test("30. approval batch is explicitly denied when claimant already has existing staff", async () => {
  const code = inviteCode("A");
  await seedInviteAndPending(code);
  await seed([[`proClubs/${CLUB_A}/staff/${TARGET}`, staffData("PHYSIO")]]);
  await assertExplicitSecurityDenial(approvalBatch(authedDb(OWNER), OWNER, code).commit());
});
