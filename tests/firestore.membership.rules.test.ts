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
} from "../src/services/membershipValidation.ts";
import type {
  AcademyInvite,
  AcademyJoinClaim,
  Membership,
} from "../src/types/Membership.ts";

const PROJECT_ID = "demo-futverse-membership";
const ACADEMY_A = "academy-a";
const ACADEMY_B = "academy-b";
const ADMIN_A = "admin-a";
const ADMIN_B = "admin-b";
const COACH_A = "coach-a";
const USER_A = "user-a";
const PLAYER_A = "player-user-a";
const PARENT_A = "parent-a";
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

test("41. PLAYER can query only the Player profile linked to their Firebase UID", async () => {
  await seedAcademies();
  await seed([
    [`users/${PLAYER_A}`, userData(PLAYER_A, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/player-1`, { firstName: "Linked", linkedUserId: PLAYER_A }],
    [`academies/${ACADEMY_A}/players/player-2`, { firstName: "Other", linkedUserId: "another-user" }],
  ]);
  const db = authedDb(PLAYER_A);
  const linkedProfiles = await assertSucceeds(getDocs(query(
    collection(db, "academies", ACADEMY_A, "players"),
    where("linkedUserId", "==", PLAYER_A),
  )));
  assert.equal(linkedProfiles.size, 1);
  assert.equal(linkedProfiles.docs[0].id, "player-1");
  await assertFails(getDoc(doc(db, "academies", ACADEMY_A)));
  await assertFails(getDoc(doc(db, "academies", ACADEMY_A, "players", "player-2")));
});

test("42. PLAYER can read and write only their linked Player subtree", async () => {
  await seedAcademies();
  await seed([
    [`users/${PLAYER_A}`, userData(PLAYER_A, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/player-1`, { linkedUserId: PLAYER_A }],
    [`academies/${ACADEMY_A}/players/player-2`, { linkedUserId: "another-user" }],
    [`academies/${ACADEMY_A}/players/player-1/goals/goal-1`, { title: "Own goal" }],
    [`academies/${ACADEMY_A}/players/player-2/goals/goal-2`, { title: "Other goal" }],
    [`academies/${ACADEMY_A}/player_evaluations/evaluation-own`, { player_id: "player-1" }],
    [`academies/${ACADEMY_A}/player_evaluations/evaluation-other`, { player_id: "player-2" }],
    [`academies/${ACADEMY_A}/idps/idp-own`, { playerId: "player-1" }],
    [`academies/${ACADEMY_A}/idps/idp-other`, { playerId: "player-2" }],
    [`academies/${ACADEMY_A}/fitness_tests/fitness-own`, { playerId: "player-1" }],
  ]);
  const db = authedDb(PLAYER_A);
  await assertSucceeds(getDoc(doc(db, "academies", ACADEMY_A, "players", "player-1", "goals", "goal-1")));
  const ownGoals = await assertSucceeds(getDocs(collection(
    db,
    "academies",
    ACADEMY_A,
    "players",
    "player-1",
    "goals",
  )));
  assert.equal(ownGoals.size, 1);
  await assertSucceeds(setDoc(doc(db, "academies", ACADEMY_A, "players", "player-1", "goals", "goal-2"), {
    title: "New own goal",
  }));
  await assertFails(getDoc(doc(db, "academies", ACADEMY_A, "players", "player-2", "goals", "goal-2")));
  const ownEvaluations = await assertSucceeds(getDocs(query(
    collection(db, "academies", ACADEMY_A, "player_evaluations"),
    where("player_id", "==", "player-1"),
  )));
  assert.equal(ownEvaluations.size, 1);
  const ownIdps = await assertSucceeds(getDocs(query(
    collection(db, "academies", ACADEMY_A, "idps"),
    where("playerId", "==", "player-1"),
  )));
  assert.equal(ownIdps.size, 1);
  const ownFitness = await assertSucceeds(getDocs(query(
    collection(db, "academies", ACADEMY_A, "fitness_tests"),
    where("playerId", "==", "player-1"),
  )));
  assert.equal(ownFitness.size, 1);
});

test("43. PARENT can read only the exact linked Player, not staff Academy data", async () => {
  await seedAcademies();
  await seed([
    [`users/${PARENT_A}`, { ...userData(PARENT_A, "PARENT", ACADEMY_A), linkedPlayerId: "player-1" }],
    [`academies/${ACADEMY_A}/players/player-1`, { firstName: "Child" }],
    [`academies/${ACADEMY_A}/players/player-2`, { firstName: "Other" }],
  ]);
  const db = authedDb(PARENT_A);
  await assertSucceeds(getDoc(doc(db, "academies", ACADEMY_A, "players", "player-1")));
  await assertFails(getDoc(doc(db, "academies", ACADEMY_A, "players", "player-2")));
  await assertFails(getDoc(doc(db, "academies", ACADEMY_A)));
});

test("44. PARENT can read an exact linked match but cannot list the Academy schedule", async () => {
  await seedAcademies();
  await seed([
    [`users/${PARENT_A}`, { ...userData(PARENT_A, "PARENT", ACADEMY_A), linkedPlayerId: "player-1" }],
    [`academies/${ACADEMY_A}/players/player-1`, { firstName: "Child" }],
    [`academies/${ACADEMY_A}/matches/match-own`, { playerIds: ["player-1"] }],
    [`academies/${ACADEMY_A}/matches/match-other`, { playerIds: ["player-2"] }],
  ]);
  const db = authedDb(PARENT_A);
  await assertSucceeds(getDoc(doc(db, "academies", ACADEMY_A, "matches", "match-own")));
  await assertFails(getDocs(query(
    collection(db, "academies", ACADEMY_A, "matches"),
    where("playerIds", "array-contains", "player-1"),
  )));
  await assertFails(getDoc(doc(db, "academies", ACADEMY_A, "matches", "match-other")));
});

test("45. COACH without Membership cannot access Academy data", async () => {
  await seedAcademies();
  await seed([[`users/${COACH_A}`, userData(COACH_A, "COACH", ACADEMY_A)]]);
  await assertFails(getDoc(doc(authedDb(COACH_A), "academies", ACADEMY_A)));
});

test("46. ACTIVE ADMIN and ACTIVE COACH Memberships can read their Academy", async () => {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_A}`, userData(ADMIN_A, "ADMIN", ACADEMY_A)],
    [`users/${COACH_A}`, userData(COACH_A, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${ADMIN_A}`, membershipData(ADMIN_A, ACADEMY_A, "ADMIN")],
    [`academies/${ACADEMY_A}/members/${COACH_A}`, membershipData(COACH_A, ACADEMY_A, "COACH")],
  ]);
  await assertSucceeds(getDoc(doc(authedDb(ADMIN_A), "academies", ACADEMY_A)));
  await assertSucceeds(getDoc(doc(authedDb(COACH_A), "academies", ACADEMY_A)));
});

test("47. requestedRole and email do not grant staff Academy access", async () => {
  await seedAcademies();
  await seed([[`users/${PLAYER_A}`, {
    ...userData(PLAYER_A, "PLAYER", ACADEMY_A),
    email: "futverse.coach@gmail.com",
    requestedRole: "ADMIN",
  }]]);
  await assertFails(getDoc(doc(authedDb(PLAYER_A), "academies", ACADEMY_A)));
});

test("48. PARENT observation sessions are scoped to owner and linked Player", async () => {
  await seedAcademies();
  await seed([
    [`users/${PARENT_A}`, { ...userData(PARENT_A, "PARENT", ACADEMY_A), linkedPlayerId: "player-1" }],
    [`academies/${ACADEMY_A}/players/player-1`, { firstName: "Child" }],
  ]);
  const db = authedDb(PARENT_A);
  const ownSession = doc(db, "academies", ACADEMY_A, "observation_sessions", "session-own");
  await assertSucceeds(setDoc(ownSession, {
    academyId: ACADEMY_A,
    playerId: "player-1",
    creatorId: PARENT_A,
    source: "PARENT",
    contextId: "match-1",
    sessionStatus: "IN_PROGRESS",
  }));
  await assertSucceeds(getDoc(ownSession));
  const ownSessions = await assertSucceeds(getDocs(query(
    collection(db, "academies", ACADEMY_A, "observation_sessions"),
    where("academyId", "==", ACADEMY_A),
    where("creatorId", "==", PARENT_A),
    where("playerId", "==", "player-1"),
    where("source", "==", "PARENT"),
  )));
  assert.equal(ownSessions.size, 1);
  await assertFails(setDoc(doc(db, "academies", ACADEMY_A, "observation_sessions", "session-other"), {
    academyId: ACADEMY_A,
    playerId: "player-2",
    creatorId: PARENT_A,
    source: "PARENT",
    contextId: "match-1",
    sessionStatus: "IN_PROGRESS",
  }));
});

test("49. PLAYER cannot enumerate roster, cross users, Academies, or Player identity", async () => {
  await seedAcademies();
  await seed([
    [`users/${PLAYER_A}`, userData(PLAYER_A, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/player-1`, { linkedUserId: PLAYER_A, firstName: "Own" }],
    [`academies/${ACADEMY_A}/players/player-2`, { linkedUserId: "another-user", firstName: "Other" }],
    [`academies/${ACADEMY_B}/players/player-1`, { linkedUserId: PLAYER_A, firstName: "Cross Academy" }],
  ]);
  const db = authedDb(PLAYER_A);

  await assertFails(getDocs(collection(db, "academies", ACADEMY_A, "players")));
  await assertFails(getDocs(query(
    collection(db, "academies", ACADEMY_A, "players"),
    where("linkedUserId", "==", "another-user"),
  )));
  await assertFails(getDocs(query(
    collection(db, "academies", ACADEMY_B, "players"),
    where("linkedUserId", "==", PLAYER_A),
  )));
  await assertFails(setDoc(
    doc(db, "academies", ACADEMY_A, "players", "player-2", "goals", "forged"),
    { title: "Other player's goal" },
  ));
  await assertFails(setDoc(
    doc(db, "academies", ACADEMY_B, "players", "player-1", "goals", "forged"),
    { title: "Cross-Academy goal" },
  ));
  await assertFails(updateDoc(
    doc(db, "academies", ACADEMY_A, "players", "player-1"),
    { linkedUserId: "another-user" },
  ));
  await assertFails(updateDoc(
    doc(db, "academies", ACADEMY_A, "players", "player-1"),
    { academyId: ACADEMY_B },
  ));
});

test("50. PARENT cannot enumerate Players or write a linked Player subtree", async () => {
  await seedAcademies();
  await seed([
    [`users/${PARENT_A}`, { ...userData(PARENT_A, "PARENT", ACADEMY_A), linkedPlayerId: "player-1" }],
    [`academies/${ACADEMY_A}/players/player-1`, { firstName: "Child" }],
    [`academies/${ACADEMY_A}/players/player-2`, { firstName: "Other" }],
    [`academies/${ACADEMY_B}/players/player-1`, { firstName: "Cross Academy" }],
  ]);
  const db = authedDb(PARENT_A);

  await assertFails(getDocs(collection(db, "academies", ACADEMY_A, "players")));
  await assertFails(getDocs(query(
    collection(db, "academies", ACADEMY_A, "players"),
    where("firstName", "==", "Child"),
  )));
  await assertFails(getDoc(doc(db, "academies", ACADEMY_B, "players", "player-1")));
  await assertFails(setDoc(
    doc(db, "academies", ACADEMY_A, "players", "player-1", "goals", "forged"),
    { title: "Parent cannot write child goals" },
  ));
});

test("51. PARENT cannot read cross-Academy matches or substitute arbitrary links", async () => {
  await seedAcademies();
  await seed([
    [`users/${PARENT_A}`, { ...userData(PARENT_A, "PARENT", ACADEMY_A), linkedPlayerId: "player-1" }],
    [`academies/${ACADEMY_A}/players/player-1`, { firstName: "Child" }],
    [`academies/${ACADEMY_B}/players/player-1`, { firstName: "Cross Academy" }],
    [`academies/${ACADEMY_B}/matches/match-cross`, { playerIds: ["player-1"] }],
  ]);
  const db = authedDb(PARENT_A);

  await assertFails(getDoc(doc(db, "academies", ACADEMY_B, "matches", "match-cross")));
  await assertFails(updateDoc(doc(db, "users", PARENT_A), {
    linkedPlayerId: "player-2",
    academyId: ACADEMY_B,
    activeAcademyId: ACADEMY_B,
  }));
});

test("52. PARENT observation session identity is immutable", async () => {
  await seedAcademies();
  await seed([
    [`users/${PARENT_A}`, { ...userData(PARENT_A, "PARENT", ACADEMY_A), linkedPlayerId: "player-1" }],
    [`academies/${ACADEMY_A}/players/player-1`, { firstName: "Child" }],
    [`academies/${ACADEMY_A}/players/player-2`, { firstName: "Other" }],
    [`academies/${ACADEMY_B}/players/player-1`, { firstName: "Cross Academy" }],
  ]);
  const db = authedDb(PARENT_A);
  const session = doc(db, "academies", ACADEMY_A, "observation_sessions", "session-own");
  await assertSucceeds(setDoc(session, {
    academyId: ACADEMY_A,
    playerId: "player-1",
    creatorId: PARENT_A,
    source: "PARENT",
    contextId: "match-1",
    sessionStatus: "IN_PROGRESS",
  }));

  await assertFails(updateDoc(session, { playerId: "player-2" }));
  await assertFails(updateDoc(session, { creatorId: "another-parent" }));
  await assertFails(updateDoc(session, { academyId: ACADEMY_B }));
  await assertFails(updateDoc(session, { source: "COACH" }));
  await assertFails(setDoc(
    doc(db, "academies", ACADEMY_B, "observation_sessions", "session-cross"),
    {
      academyId: ACADEMY_B,
      playerId: "player-1",
      creatorId: PARENT_A,
      source: "PARENT",
    },
  ));
});

test("53. PARENT observation documents require complete owner query constraints", async () => {
  await seedAcademies();
  await seed([
    [`users/${PARENT_A}`, { ...userData(PARENT_A, "PARENT", ACADEMY_A), linkedPlayerId: "player-1" }],
    [`academies/${ACADEMY_A}/players/player-1`, { firstName: "Child" }],
    [`academies/${ACADEMY_A}/players/player-2`, { firstName: "Other" }],
  ]);
  const db = authedDb(PARENT_A);
  const reflection = doc(db, "academies", ACADEMY_A, "observation_reflections", "reflection-own");
  const liveEvent = doc(db, "academies", ACADEMY_A, "observation_live_events", "event-own");
  const ownerData = {
    academyId: ACADEMY_A,
    playerId: "player-1",
    creatorId: PARENT_A,
    source: "PARENT",
    sessionId: "session-own",
  };
  await assertSucceeds(setDoc(reflection, { ...ownerData, text: "Own reflection" }));
  await assertSucceeds(setDoc(liveEvent, { ...ownerData, type: "NOTE" }));

  const ownerReflections = await assertSucceeds(getDocs(query(
    collection(db, "academies", ACADEMY_A, "observation_reflections"),
    where("academyId", "==", ACADEMY_A),
    where("sessionId", "==", "session-own"),
    where("playerId", "==", "player-1"),
    where("creatorId", "==", PARENT_A),
    where("source", "==", "PARENT"),
  )));
  assert.equal(ownerReflections.size, 1);
  const ownerLiveEvents = await assertSucceeds(getDocs(query(
    collection(db, "academies", ACADEMY_A, "observation_live_events"),
    where("academyId", "==", ACADEMY_A),
    where("sessionId", "==", "session-own"),
    where("playerId", "==", "player-1"),
    where("creatorId", "==", PARENT_A),
    where("source", "==", "PARENT"),
  )));
  assert.equal(ownerLiveEvents.size, 1);
  await assertFails(getDocs(query(
    collection(db, "academies", ACADEMY_A, "observation_reflections"),
    where("sessionId", "==", "session-own"),
  )));
  await assertFails(updateDoc(reflection, { playerId: "player-2" }));
  await assertFails(updateDoc(reflection, { creatorId: "another-parent" }));
  await assertFails(updateDoc(reflection, { academyId: ACADEMY_B }));
  await assertFails(updateDoc(reflection, { source: "COACH" }));
  await assertFails(updateDoc(liveEvent, { playerId: "player-2" }));
  await assertFails(setDoc(
    doc(db, "academies", ACADEMY_A, "observation_live_events", "event-other-child"),
    { ...ownerData, playerId: "player-2" },
  ));
});

test("54. PENDING ADMIN and COACH Memberships cannot access tenant data", async () => {
  await seedAcademies();
  await seed([
    [`users/${ADMIN_A}`, userData(ADMIN_A, "ADMIN", ACADEMY_A)],
    [`users/${COACH_A}`, userData(COACH_A, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${ADMIN_A}`, membershipData(ADMIN_A, ACADEMY_A, "ADMIN", "PENDING")],
    [`academies/${ACADEMY_A}/members/${COACH_A}`, membershipData(COACH_A, ACADEMY_A, "COACH", "PENDING")],
  ]);

  await assertFails(getDoc(doc(authedDb(ADMIN_A), "academies", ACADEMY_A)));
  await assertFails(getDoc(doc(authedDb(COACH_A), "academies", ACADEMY_A)));
});

test("55. SUPERADMIN Academy access remains unchanged without tenant Membership", async () => {
  await seedAcademies();
  await seed([
    ["users/superadmin-access-audit", userData("superadmin-access-audit", "SUPERADMIN")],
    [`academies/${ACADEMY_A}/players/player-1`, { firstName: "Tenant Player" }],
  ]);
  const db = authedDb("superadmin-access-audit");

  await assertSucceeds(getDoc(doc(db, "academies", ACADEMY_A)));
  await assertSucceeds(getDoc(doc(db, "academies", ACADEMY_A, "players", "player-1")));
});
