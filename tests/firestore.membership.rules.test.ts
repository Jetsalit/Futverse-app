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
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import {
  MAX_INVITE_CODE_LENGTH,
  normalizeAndValidateInviteCode,
  validateApprovedMembershipActivation,
} from "../src/services/membershipValidation";
import type {
  AcademyInvite,
  AcademyJoinClaim,
  Membership,
} from "../src/types/Membership";

const PROJECT_ID = "demo-futverse-membership";
const ACADEMY_A = "academy-a";
const ACADEMY_B = "academy-b";
const ADMIN_A = "admin-a";
const ADMIN_B = "admin-b";
const COACH_A = "coach-a";
const USER_A = "user-a";
const INVITE_A = "FUT-ACADEMY-A";
const INVITE_B = "FUT-ACADEMY-B";

let testEnv: RulesTestEnvironment;

function userData(
  uid: string,
  role = "USER",
  academyId: string | null = null,
) {
  return {
    uid,
    name: uid,
    email: `${uid}@example.com`,
    role,
    status: role === "USER" ? "Inactive" : "Active",
    academyId,
    activeAcademyId: academyId,
    tenantRole: role === "ADMIN" || role === "COACH" ? role : null,
    updatedAt: new Date(),
  };
}

function membershipData(
  uid: string,
  academyId: string,
  role: "ADMIN" | "COACH" = "ADMIN",
  status: Membership["status"] = "ACTIVE",
  joinedBy = ADMIN_A,
  source: Membership["source"] = "CLAIM_APPROVAL",
  approvalClaimId = "claim-a",
) {
  return {
    userId: uid,
    academyId,
    role,
    status,
    source,
    ...(source === "CLAIM_APPROVAL" ? { approvalClaimId } : {}),
    joinedAt: new Date(),
    joinedBy,
    updatedAt: new Date(),
  };
}

function pendingClaim(
  uid: string,
  inviteCode: string,
  role: "ADMIN" | "COACH" = "ADMIN",
) {
  const requestedAcademyId = inviteCode === INVITE_A ? ACADEMY_A : ACADEMY_B;
  return {
    type: "ACADEMY_JOIN",
    userId: uid,
    userEmail: `${uid}@example.com`,
    userName: uid,
    requestedRole: role,
    inviteCode,
    requestedAcademyId,
    status: "PENDING",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function inviteData(
  inviteCode: string,
  academyId: string,
  status: AcademyInvite["status"] = "ACTIVE",
) {
  return {
    inviteCode,
    academyId,
    status,
    createdAt: new Date(),
    createdBy: "superadmin",
    updatedAt: new Date(),
    updatedBy: "superadmin",
  };
}

function approvedClaim(
  id: string,
  uid: string,
  academyId: string,
  inviteCode: string,
  role: "ADMIN" | "COACH" = "ADMIN",
): AcademyJoinClaim {
  return {
    id,
    ...pendingClaim(uid, inviteCode, role),
    status: "APPROVED",
    approvedAcademyId: academyId,
    approvedRole: role,
    approvedAt: new Date(),
    approvedBy: ADMIN_A,
  } as AcademyJoinClaim;
}

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function anonymousDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)),
    );
  });
}

async function seedAcademies() {
  await seed([
    [`academies/${ACADEMY_A}`, { name: "Academy A", inviteCode: INVITE_A }],
    [`academies/${ACADEMY_B}`, { name: "Academy B", inviteCode: INVITE_B }],
    [`academy_invites/${INVITE_A}`, inviteData(INVITE_A, ACADEMY_A)],
    [`academy_invites/${INVITE_B}`, inviteData(INVITE_B, ACADEMY_B)],
  ]);
}

async function seedAdminA() {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_A}`, userData(ADMIN_A, "ADMIN", ACADEMY_A)],
    [
      `academies/${ACADEMY_A}/members/${ADMIN_A}`,
      membershipData(ADMIN_A, ACADEMY_A, "ADMIN"),
    ],
  ]);
}

async function approveClaimTransaction(
  db: Firestore,
  claimId: string,
  uid: string,
  academyId: string,
  role: "ADMIN" | "COACH",
  createCoach = false,
) {
  await runTransaction(db, async (transaction) => {
    const membershipRef = doc(db, "academies", academyId, "members", uid);
    const claimRef = doc(db, "profile_claims", claimId);
    const coachRef = doc(db, "academies", academyId, "coaches", uid);
    const membershipSnapshot = await transaction.get(membershipRef);
    const claimSnapshot = await transaction.get(claimRef);
    const coachSnapshot = createCoach ? await transaction.get(coachRef) : null;
    const timestamp = serverTimestamp();

    transaction.set(membershipRef, {
      userId: uid,
      academyId,
      role,
      status: "ACTIVE",
      source: "CLAIM_APPROVAL",
      approvalClaimId: claimId,
      joinedAt: membershipSnapshot.exists()
        ? membershipSnapshot.data().joinedAt
        : timestamp,
      joinedBy: membershipSnapshot.exists()
        ? membershipSnapshot.data().joinedBy
        : ADMIN_A,
      updatedAt: timestamp,
    });
    transaction.update(claimRef, {
      status: "APPROVED",
      approvedAt: claimSnapshot.data()?.status === "APPROVED"
        ? claimSnapshot.data()?.approvedAt
        : timestamp,
      approvedBy: claimSnapshot.data()?.status === "APPROVED"
        ? claimSnapshot.data()?.approvedBy
        : ADMIN_A,
      approvedAcademyId: academyId,
      approvedRole: role,
      updatedAt: timestamp,
    });
    if (createCoach) {
      transaction.set(coachRef, coachSnapshot?.exists()
        ? { userId: uid }
        : {
            userId: uid,
            firstName: "Coach",
            lastName: uid,
            email: `${uid}@example.com`,
          }, { merge: true });
    }
  });
}

function activatePointers(uid: string, academyId: string, role: "ADMIN" | "COACH") {
  return updateDoc(doc(authedDb(uid), "users", uid), {
    activeAcademyId: academyId,
    academyId,
    tenantRole: role,
    role,
    status: "Active",
    updatedAt: serverTimestamp(),
  });
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
      host,
      port,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test("1. anonymous user is denied Academy data", async () => {
  await seedAcademies();
  await assertFails(getDoc(doc(anonymousDb(), "academies", ACADEMY_A)));
});

test("2. user cannot self-create ACTIVE Membership", async () => {
  await seedAcademies();
  await seed([[`users/${USER_A}`, userData(USER_A)]]);
  const db = authedDb(USER_A);
  await assertFails(setDoc(
    doc(db, "academies", ACADEMY_A, "members", USER_A),
    {
      ...membershipData(USER_A, ACADEMY_A, "ADMIN", "ACTIVE", USER_A),
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  ));
});

test("3. user cannot self-approve Claim", async () => {
  await seed([[`users/${USER_A}`, userData(USER_A)]]);
  const claimId = `${USER_A}_ADMIN_${INVITE_A}`;
  await seed([[`profile_claims/${claimId}`, pendingClaim(USER_A, INVITE_A)]]);
  await assertFails(updateDoc(doc(authedDb(USER_A), "profile_claims", claimId), {
    status: "APPROVED",
    approvedAt: serverTimestamp(),
    approvedBy: USER_A,
    approvedAcademyId: ACADEMY_A,
    approvedRole: "ADMIN",
    updatedAt: serverTimestamp(),
  }));
});

test("4. user can create their own PENDING Claim", async () => {
  await seedAcademies();
  await seed([[`users/${USER_A}`, userData(USER_A)]]);
  const db = authedDb(USER_A);
  await assertSucceeds(setDoc(doc(db, "profile_claims", `${USER_A}_ADMIN_${INVITE_A}`), {
    ...pendingClaim(USER_A, INVITE_A),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
});

test("5. user cannot read another user's unrelated Claim", async () => {
  await seed([
    [`users/${USER_A}`, userData(USER_A)],
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`profile_claims/other-claim`, pendingClaim(ADMIN_B, INVITE_B)],
  ]);
  await assertFails(getDoc(doc(authedDb(USER_A), "profile_claims", "other-claim")));
});

test("6. Academy A Admin can review Academy A matching Claim", async () => {
  await seedAdminA();
  await seed([[`profile_claims/claim-a`, pendingClaim(ADMIN_B, INVITE_A)]]);
  const claims = query(
    collection(authedDb(ADMIN_A), "profile_claims"),
    where("inviteCode", "==", INVITE_A),
    where("status", "==", "PENDING"),
  );
  const snapshot = await assertSucceeds(getDocs(claims));
  assert.equal(snapshot.size, 1);
});

test("7. Academy A Admin cannot approve Academy B Claim", async () => {
  await seedAdminA();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`profile_claims/claim-b`, pendingClaim(ADMIN_B, INVITE_B)],
  ]);
  const db = authedDb(ADMIN_A);
  await assertFails(runTransaction(db, async (transaction) => {
    transaction.set(
      doc(db, "academies", ACADEMY_B, "members", ADMIN_B),
      {
        ...membershipData(
          ADMIN_B,
          ACADEMY_B,
          "ADMIN",
          "ACTIVE",
          ADMIN_A,
          "CLAIM_APPROVAL",
          "claim-b",
        ),
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
    transaction.update(doc(db, "profile_claims", "claim-b"), {
      status: "APPROVED",
      approvedAt: serverTimestamp(),
      approvedBy: ADMIN_A,
      approvedAcademyId: ACADEMY_B,
      approvedRole: "ADMIN",
      updatedAt: serverTimestamp(),
    });
  }));
});

test("8. Academy A Admin atomically approves Claim and creates Membership without updating User", async () => {
  await seedAdminA();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`profile_claims/claim-a`, pendingClaim(ADMIN_B, INVITE_A)],
  ]);
  const db = authedDb(ADMIN_A);
  await assertSucceeds(runTransaction(db, async (transaction) => {
    transaction.set(
      doc(db, "academies", ACADEMY_A, "members", ADMIN_B),
      {
        ...membershipData(ADMIN_B, ACADEMY_A),
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
    transaction.update(doc(db, "profile_claims", "claim-a"), {
      status: "APPROVED",
      approvedAt: serverTimestamp(),
      approvedBy: ADMIN_A,
      approvedAcademyId: ACADEMY_A,
      approvedRole: "ADMIN",
      updatedAt: serverTimestamp(),
    });
  }));
  let activatedAcademyId: string | null | undefined;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(
      context.firestore() as unknown as Firestore,
      "users",
      ADMIN_B,
    ));
    activatedAcademyId = snapshot.data()?.activeAcademyId;
  });
  assert.equal(activatedAcademyId, null);
});

test("9. Academy A Admin cannot update Admin B User document", async () => {
  await seedAdminA();
  await seed([[`users/${ADMIN_B}`, userData(ADMIN_B)]]);
  await assertFails(updateDoc(doc(authedDb(ADMIN_A), "users", ADMIN_B), {
    activeAcademyId: ACADEMY_A,
    academyId: ACADEMY_A,
    role: "ADMIN",
    tenantRole: "ADMIN",
    status: "Active",
    updatedAt: serverTimestamp(),
  }));
});

test("10. approved user activates own pointers with matching ACTIVE Membership", async () => {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`academies/${ACADEMY_A}/members/${ADMIN_B}`, membershipData(ADMIN_B, ACADEMY_A)],
    [`profile_claims/claim-a`, approvedClaim("claim-a", ADMIN_B, ACADEMY_A, INVITE_A)],
  ]);
  await assertSucceeds(updateDoc(doc(authedDb(ADMIN_B), "users", ADMIN_B), {
    activeAcademyId: ACADEMY_A,
    academyId: ACADEMY_A,
    tenantRole: "ADMIN",
    role: "ADMIN",
    status: "Active",
    updatedAt: serverTimestamp(),
  }));
});

test("11. user cannot activate pointers for another Academy", async () => {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`academies/${ACADEMY_A}/members/${ADMIN_B}`, membershipData(ADMIN_B, ACADEMY_A)],
  ]);
  await assertFails(updateDoc(doc(authedDb(ADMIN_B), "users", ADMIN_B), {
    activeAcademyId: ACADEMY_B,
    academyId: ACADEMY_B,
    tenantRole: "ADMIN",
    role: "ADMIN",
    status: "Active",
    updatedAt: serverTimestamp(),
  }));
});

test("12. user cannot assign themselves ADMIN without matching Membership", async () => {
  await seed([[`users/${USER_A}`, userData(USER_A)]]);
  await assertFails(updateDoc(doc(authedDb(USER_A), "users", USER_A), {
    role: "ADMIN",
    status: "Active",
    updatedAt: serverTimestamp(),
  }));
});

test("13. suspended Member cannot access tenant data", async () => {
  await seedAcademies();
  await seed([
    [`users/${COACH_A}`, userData(COACH_A, "COACH", ACADEMY_A)],
    [
      `academies/${ACADEMY_A}/members/${COACH_A}`,
      membershipData(COACH_A, ACADEMY_A, "COACH", "SUSPENDED"),
    ],
    [`academies/${ACADEMY_A}/players/player-1`, { name: "Player 1" }],
  ]);
  await assertFails(getDoc(doc(authedDb(COACH_A), "academies", ACADEMY_A, "players", "player-1")));
});

test("14. Tenant A Member cannot read Tenant B players or matches", async () => {
  await seedAcademies();
  await seed([
    [`users/${COACH_A}`, userData(COACH_A, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${COACH_A}`, membershipData(COACH_A, ACADEMY_A, "COACH")],
    [`academies/${ACADEMY_B}/players/player-b`, { name: "Player B" }],
    [`academies/${ACADEMY_B}/matches/match-b`, { opponent: "B" }],
  ]);
  const db = authedDb(COACH_A);
  await assertFails(getDoc(doc(db, "academies", ACADEMY_B, "players", "player-b")));
  await assertFails(getDoc(doc(db, "academies", ACADEMY_B, "matches", "match-b")));
});

test("15. ACTIVE ADMIN can manage Academy settings and Memberships", async () => {
  await seedAdminA();
  const db = authedDb(ADMIN_A);
  await assertSucceeds(updateDoc(doc(db, "academies", ACADEMY_A), { shortName: "A" }));
  await assertSucceeds(setDoc(doc(db, "academies", ACADEMY_A, "members", ADMIN_B), {
    ...membershipData(
      ADMIN_B,
      ACADEMY_A,
      "ADMIN",
      "ACTIVE",
      ADMIN_A,
      "INVITE",
    ),
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
});

test("16. ACTIVE COACH can use approved football write paths", async () => {
  await seedAcademies();
  await seed([
    [`users/${COACH_A}`, userData(COACH_A, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${COACH_A}`, membershipData(COACH_A, ACADEMY_A, "COACH")],
  ]);
  const db = authedDb(COACH_A);
  await assertSucceeds(setDoc(doc(db, "academies", ACADEMY_A, "players", "player-1"), {
    name: "Player 1",
  }));
  await assertSucceeds(setDoc(doc(db, "academies", ACADEMY_A, "matches", "match-1"), {
    opponent: "Academy B",
  }));
});

test("17. Parent global role does not grant all-Academy access", async () => {
  await seedAcademies();
  await seed([
    [`users/parent-a`, userData("parent-a", "PARENT", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/player-1`, { name: "Player 1" }],
  ]);
  await assertFails(getDoc(doc(
    authedDb("parent-a"),
    "academies",
    ACADEMY_A,
    "players",
    "player-1",
  )));
});

test("18. rejected Claim cannot pass application activation validation", () => {
  const membership = membershipData(ADMIN_B, ACADEMY_A) as Membership;
  const claim = {
    ...approvedClaim("claim-a", ADMIN_B, ACADEMY_A, INVITE_A),
    status: "REJECTED",
  } as AcademyJoinClaim;
  assert.throws(() => validateApprovedMembershipActivation({
    academyId: ACADEMY_A,
    uid: ADMIN_B,
    membership,
    claim,
    invite: inviteData(INVITE_A, ACADEMY_A) as AcademyInvite,
  }), /not APPROVED/);
});

test("19. invite code over 32 characters is rejected by application and Rules", async () => {
  const oversized = `FUT-${"A".repeat(MAX_INVITE_CODE_LENGTH - 3)}`;
  assert.equal(oversized.length, MAX_INVITE_CODE_LENGTH + 1);
  assert.throws(() => normalizeAndValidateInviteCode(oversized), /32 characters or fewer/);

  await seed([[`users/${USER_A}`, userData(USER_A)]]);
  await assertFails(setDoc(doc(authedDb(USER_A), "profile_claims", "oversized"), {
    ...pendingClaim(USER_A, oversized),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
});

test("20. repeated pointer activation is idempotent", async () => {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`academies/${ACADEMY_A}/members/${ADMIN_B}`, membershipData(ADMIN_B, ACADEMY_A)],
    [`profile_claims/claim-a`, approvedClaim("claim-a", ADMIN_B, ACADEMY_A, INVITE_A)],
  ]);
  const userRef = doc(authedDb(ADMIN_B), "users", ADMIN_B);
  const activation = {
    activeAcademyId: ACADEMY_A,
    academyId: ACADEMY_A,
    tenantRole: "ADMIN",
    role: "ADMIN",
    status: "Active",
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(updateDoc(userRef, activation));
  await assertSucceeds(updateDoc(userRef, {
    ...activation,
    updatedAt: serverTimestamp(),
  }));
});

test("21. ACTIVE Membership without approvalClaimId cannot activate", async () => {
  await seedAcademies();
  const membership = membershipData(ADMIN_B, ACADEMY_A);
  delete (membership as Partial<Membership>).approvalClaimId;
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`academies/${ACADEMY_A}/members/${ADMIN_B}`, membership],
  ]);
  await assertFails(activatePointers(ADMIN_B, ACADEMY_A, "ADMIN"));
});

test("22. ACTIVE Membership with missing Claim cannot activate", async () => {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`academies/${ACADEMY_A}/members/${ADMIN_B}`,
      membershipData(ADMIN_B, ACADEMY_A, "ADMIN", "ACTIVE", ADMIN_A, "CLAIM_APPROVAL", "missing-claim")],
  ]);
  await assertFails(activatePointers(ADMIN_B, ACADEMY_A, "ADMIN"));
});

test("23. ACTIVE Membership with PENDING Claim cannot activate", async () => {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`academies/${ACADEMY_A}/members/${ADMIN_B}`,
      membershipData(ADMIN_B, ACADEMY_A, "ADMIN", "ACTIVE", ADMIN_A, "CLAIM_APPROVAL", "claim-pending")],
    [`profile_claims/claim-pending`, pendingClaim(ADMIN_B, INVITE_A)],
  ]);
  await assertFails(activatePointers(ADMIN_B, ACADEMY_A, "ADMIN"));
});

test("24. ACTIVE Membership with APPROVED Claim for another user cannot activate", async () => {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`academies/${ACADEMY_A}/members/${ADMIN_B}`,
      membershipData(ADMIN_B, ACADEMY_A, "ADMIN", "ACTIVE", ADMIN_A, "CLAIM_APPROVAL", "claim-other-user")],
    [`profile_claims/claim-other-user`, approvedClaim("claim-other-user", USER_A, ACADEMY_A, INVITE_A)],
  ]);
  await assertFails(activatePointers(ADMIN_B, ACADEMY_A, "ADMIN"));
});

test("25. ACTIVE Membership with APPROVED Claim for another Academy cannot activate", async () => {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`academies/${ACADEMY_A}/members/${ADMIN_B}`,
      membershipData(ADMIN_B, ACADEMY_A, "ADMIN", "ACTIVE", ADMIN_A, "CLAIM_APPROVAL", "claim-other-academy")],
    [`profile_claims/claim-other-academy`, approvedClaim("claim-other-academy", ADMIN_B, ACADEMY_B, INVITE_B)],
  ]);
  await assertFails(activatePointers(ADMIN_B, ACADEMY_A, "ADMIN"));
});

test("26. Membership role and approvedRole mismatch cannot activate", async () => {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`academies/${ACADEMY_A}/members/${ADMIN_B}`,
      membershipData(ADMIN_B, ACADEMY_A, "ADMIN", "ACTIVE", ADMIN_A, "CLAIM_APPROVAL", "claim-role-mismatch")],
    [`profile_claims/claim-role-mismatch`, approvedClaim("claim-role-mismatch", ADMIN_B, ACADEMY_A, INVITE_A, "COACH")],
  ]);
  await assertFails(activatePointers(ADMIN_B, ACADEMY_A, "ADMIN"));
});

test("27. duplicate invite codes cannot map to two Academies", async () => {
  await seedAcademies();
  await seed([[`users/superadmin`, userData("superadmin", "SUPERADMIN")]]);
  await assertFails(setDoc(
    doc(authedDb("superadmin"), "academy_invites", "FUT-DUPLICATE-SLOT"),
    {
      ...inviteData(INVITE_A, ACADEMY_B),
      createdAt: serverTimestamp(),
      createdBy: "superadmin",
      updatedAt: serverTimestamp(),
      updatedBy: "superadmin",
    },
  ));
});

test("28. Claim requestedAcademyId must match canonical invite registry", async () => {
  await seedAcademies();
  await seed([[`users/${USER_A}`, userData(USER_A)]]);
  await assertFails(setDoc(
    doc(authedDb(USER_A), "profile_claims", `${USER_A}_ADMIN_${INVITE_A}`),
    {
      ...pendingClaim(USER_A, INVITE_A),
      requestedAcademyId: ACADEMY_B,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  ));
});

test("29. Academy A Admin cannot read or approve Academy B exact-bound Claim", async () => {
  await seedAdminA();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`profile_claims/claim-b`, pendingClaim(ADMIN_B, INVITE_B)],
  ]);
  const db = authedDb(ADMIN_A);
  await assertFails(getDoc(doc(db, "profile_claims", "claim-b")));
  await assertFails(approveClaimTransaction(db, "claim-b", ADMIN_B, ACADEMY_B, "ADMIN"));
});

test("30. Claim approval atomically writes matching approvalClaimId", async () => {
  await seedAdminA();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`profile_claims/claim-a`, pendingClaim(ADMIN_B, INVITE_A)],
  ]);
  await assertSucceeds(approveClaimTransaction(
    authedDb(ADMIN_A),
    "claim-a",
    ADMIN_B,
    ACADEMY_A,
    "ADMIN",
  ));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const membership = await getDoc(doc(
      context.firestore() as unknown as Firestore,
      "academies",
      ACADEMY_A,
      "members",
      ADMIN_B,
    ));
    assert.equal(membership.data()?.approvalClaimId, "claim-a");
  });
});

test("31. Global ADMIN without Membership cannot access Academy data", async () => {
  await seedAcademies();
  await seed([[`users/${ADMIN_B}`, userData(ADMIN_B, "ADMIN", ACADEMY_A)]]);
  await assertFails(getDoc(doc(authedDb(ADMIN_B), "academies", ACADEMY_A)));
});

test("32. REVOKED Membership cannot access tenant data", async () => {
  await seedAcademies();
  await seed([
    [`users/${COACH_A}`, userData(COACH_A, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${COACH_A}`,
      membershipData(COACH_A, ACADEMY_A, "COACH", "REVOKED")],
    [`academies/${ACADEMY_A}/players/player-1`, { name: "Player 1" }],
  ]);
  await assertFails(getDoc(doc(authedDb(COACH_A), "academies", ACADEMY_A, "players", "player-1")));
});

test("33. LEFT Membership cannot access tenant data", async () => {
  await seedAcademies();
  await seed([
    [`users/${COACH_A}`, userData(COACH_A, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${COACH_A}`,
      membershipData(COACH_A, ACADEMY_A, "COACH", "LEFT")],
    [`academies/${ACADEMY_A}/players/player-1`, { name: "Player 1" }],
  ]);
  await assertFails(getDoc(doc(authedDb(COACH_A), "academies", ACADEMY_A, "players", "player-1")));
});

test("34. ADMIN approval produces no Coach profile", async () => {
  await seedAdminA();
  await seed([
    [`users/${ADMIN_B}`, userData(ADMIN_B)],
    [`profile_claims/claim-a`, pendingClaim(ADMIN_B, INVITE_A)],
  ]);
  const db = authedDb(ADMIN_A);
  await assertSucceeds(approveClaimTransaction(db, "claim-a", ADMIN_B, ACADEMY_A, "ADMIN"));
  const coaches = await assertSucceeds(getDocs(collection(db, "academies", ACADEMY_A, "coaches")));
  assert.equal(coaches.size, 0);
});

test("35. repeated COACH approval does not produce duplicate Coach profiles", async () => {
  await seedAdminA();
  await seed([
    [`users/${COACH_A}`, userData(COACH_A)],
    [`profile_claims/claim-coach`, pendingClaim(COACH_A, INVITE_A, "COACH")],
  ]);
  const db = authedDb(ADMIN_A);
  await assertSucceeds(approveClaimTransaction(db, "claim-coach", COACH_A, ACADEMY_A, "COACH", true));
  await assertSucceeds(approveClaimTransaction(db, "claim-coach", COACH_A, ACADEMY_A, "COACH", true));
  const coaches = await assertSucceeds(getDocs(collection(db, "academies", ACADEMY_A, "coaches")));
  assert.equal(coaches.size, 1);
  assert.equal(coaches.docs[0].id, COACH_A);
});

test("36. Owner cannot modify subscriptionPlan", async () => {
  await seed([[`users/${USER_A}`, userData(USER_A)]]);
  await assertFails(updateDoc(doc(authedDb(USER_A), "users", USER_A), {
    subscriptionPlan: "size_unlimited",
  }));
});

test("37. Owner cannot modify maxPlayers", async () => {
  await seed([[`users/${USER_A}`, userData(USER_A)]]);
  await assertFails(updateDoc(doc(authedDb(USER_A), "users", USER_A), {
    maxPlayers: 9999,
  }));
});

test("38. Owner cannot modify trusted paymentDetails", async () => {
  await seed([[`users/${USER_A}`, userData(USER_A)]]);
  await assertFails(updateDoc(doc(authedDb(USER_A), "users", USER_A), {
    paymentDetails: { slipUrl: "https://example.com/forged.png" },
  }));
});

test("39. signed-in user cannot create arbitrary notification for another user", async () => {
  await seed([[`users/${USER_A}`, userData(USER_A)]]);
  await assertFails(setDoc(doc(authedDb(USER_A), "notifications", "forged"), {
    userId: ADMIN_B,
    title: "Forged",
    message: "Forged notification",
    type: "System",
    isRead: false,
    createdAt: serverTimestamp(),
  }));
});

test("40. signed-in user cannot read another user's protected observation data", async () => {
  await seedAcademies();
  await seed([
    [`users/${USER_A}`, userData(USER_A)],
    [`parent_match_observations/protected`, {
      academyId: ACADEMY_A,
      matchId: "match-1",
      playerId: "player-1",
      parentId: ADMIN_B,
      metrics: {},
      comment: "private",
    }],
  ]);
  await assertFails(getDoc(doc(
    authedDb(USER_A),
    "parent_match_observations",
    "protected",
  )));
});

test("41. SuperAdmin legacy bootstrap transaction is allowed atomically", async () => {
  const superAdminUid = "superadmin-bootstrap";

  await seed([
    [`users/${superAdminUid}`, {
      uid: superAdminUid,
      name: "Bootstrap SuperAdmin",
      email: "bootstrap-superadmin@example.com",
      role: "SUPERADMIN",
      status: "Active",
    }],
    [`academies/${ACADEMY_A}`, {
      name: "Academy A",
      inviteCode: INVITE_A,
    }],
    [`users/${ADMIN_B}`, {
      uid: ADMIN_B,
      name: ADMIN_B,
      email: `${ADMIN_B}@example.com`,
      role: "ADMIN",
      status: "Active",
    }],
  ]);

  const db = authedDb(superAdminUid);

  await assertSucceeds(runTransaction(db, async (transaction) => {
    const academyRef = doc(db, "academies", ACADEMY_A);
    const userRef = doc(db, "users", ADMIN_B);
    const memberRef = doc(db, "academies", ACADEMY_A, "members", ADMIN_B);
    const inviteRef = doc(db, "academy_invites", INVITE_A);

    await transaction.get(academyRef);
    await transaction.get(userRef);
    await transaction.get(memberRef);
    await transaction.get(inviteRef);

    const timestamp = serverTimestamp();

    transaction.set(memberRef, {
      userId: ADMIN_B,
      academyId: ACADEMY_A,
      role: "ADMIN",
      status: "ACTIVE",
      source: "LEGACY_MIGRATION",
      joinedAt: timestamp,
      joinedBy: superAdminUid,
      updatedAt: timestamp,
    });

    transaction.set(userRef, {
      activeAcademyId: ACADEMY_A,
      academyId: ACADEMY_A,
      tenantRole: "ADMIN",
      role: "ADMIN",
      status: "Active",
      updatedAt: timestamp,
    }, { merge: true });

    transaction.set(inviteRef, {
      inviteCode: INVITE_A,
      academyId: ACADEMY_A,
      status: "ACTIVE",
      createdAt: timestamp,
      createdBy: superAdminUid,
      updatedAt: timestamp,
      updatedBy: superAdminUid,
    });
  }));

  const membership = await assertSucceeds(getDoc(
    doc(db, "academies", ACADEMY_A, "members", ADMIN_B)
  ));
  assert.equal(membership.data()?.source, "LEGACY_MIGRATION");
  assert.equal(membership.data()?.joinedBy, superAdminUid);

  const targetUser = await assertSucceeds(getDoc(doc(db, "users", ADMIN_B)));
  assert.equal(targetUser.data()?.activeAcademyId, ACADEMY_A);
  assert.equal(targetUser.data()?.tenantRole, "ADMIN");

  const invite = await assertSucceeds(getDoc(doc(db, "academy_invites", INVITE_A)));
  assert.equal(invite.data()?.academyId, ACADEMY_A);
  assert.equal(invite.data()?.createdBy, superAdminUid);
});
