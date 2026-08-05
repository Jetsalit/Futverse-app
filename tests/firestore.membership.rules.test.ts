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
import type { AcademyJoinClaim, Membership } from "../src/types/Membership";

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
) {
  return {
    userId: uid,
    academyId,
    role,
    status,
    source: "CLAIM_APPROVAL",
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
  return {
    type: "ACADEMY_JOIN",
    userId: uid,
    userEmail: `${uid}@example.com`,
    userName: uid,
    requestedRole: role,
    inviteCode,
    status: "PENDING",
    createdAt: new Date(),
    updatedAt: new Date(),
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
        ...membershipData(ADMIN_B, ACADEMY_B),
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
    ...membershipData(ADMIN_B, ACADEMY_A),
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
