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
  collectionGroup,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-onboarding-read";
const CLUB = "club-a";
const OTHER_CLUB = "club-b";
const TARGET = "claimant-a";
const OTHER_TARGET = "claimant-b";
const HOLDER = "unrelated-code-holder";
const CODE = `FUT-PC-${"A".repeat(24)}`;
const OTHER_CODE = `FUT-PC-${"B".repeat(24)}`;
const CLAIM_ID = `${TARGET}_PRO_CLUB_${CODE}`;
const APPROVED_CODE = `FUT-PC-${"C".repeat(24)}`;
const REJECTED_CODE = `FUT-PC-${"D".repeat(24)}`;
const APPROVED_CLAIM_ID = `${TARGET}_PRO_CLUB_${APPROVED_CODE}`;
const REJECTED_CLAIM_ID = `${TARGET}_PRO_CLUB_${REJECTED_CODE}`;
let testEnv: RulesTestEnvironment;

function client(uid: string | null): Firestore {
  return (uid === null
    ? testEnv.unauthenticatedContext()
    : testEnv.authenticatedContext(uid)
  ).firestore() as unknown as Firestore;
}

function pendingClaim(
  clubId = CLUB,
  userId = TARGET,
  inviteCode = CODE,
): DocumentData {
  return {
    schemaVersion: 1, type: "PRO_CLUB_STAFF_JOIN", clubId, userId, inviteCode,
    membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH",
    status: "PENDING", createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  };
}

function invite(state: "ACTIVE" | "EXPIRED" | "REVOKED" | "CONSUMED"): DocumentData {
  const now = Date.now();
  const at = Timestamp.fromMillis(now - 60_000);
  return {
    schemaVersion: 1, inviteCode: CODE, clubId: CLUB, targetUid: TARGET,
    membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH",
    createdAt: at, createdBy: "owner-a", updatedAt: at, updatedBy: "owner-a",
    expiresAt: Timestamp.fromMillis(now + (state === "EXPIRED" ? -30_000 : 86_400_000)),
    status: state === "EXPIRED" ? "ACTIVE" : state,
    ...(state === "REVOKED" ? { revokedAt: at, revokedBy: "owner-a" } : {}),
    ...(state === "CONSUMED"
      ? { consumedAt: at, consumedBy: "owner-a", claimId: CLAIM_ID }
      : {}),
  };
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) =>
      setDoc(doc(context.firestore(), path), data),
    ));
  });
}

function pendingQuery(db: Firestore, clubId = CLUB) {
  return query(
    collection(db, "proClubs", clubId, "onboardingClaims"),
    where("clubId", "==", clubId),
    where("status", "==", "PENDING"),
  );
}

before(async () => {
  const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(hostPort, "Run Rules tests through the Firestore Emulator.");
  const separator = hostPort.lastIndexOf(":");
  const host = hostPort.slice(0, separator);
  const port = Number(hostPort.slice(separator + 1));
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
  const entries: Array<[string, DocumentData]> = [
    [`proClubs/${CLUB}`, { name: "Club A", level: "T3", status: "ACTIVE" }],
    [`proClubs/${OTHER_CLUB}`, { name: "Club B", level: "T3", status: "ACTIVE" }],
    [`proClubs/${CLUB}/onboardingClaims/${CLAIM_ID}`, pendingClaim()],
    [`proClubs/${CLUB}/onboardingClaims/${OTHER_TARGET}_PRO_CLUB_${OTHER_CODE}`,
      pendingClaim(CLUB, OTHER_TARGET, OTHER_CODE)],
    [`proClubs/${OTHER_CLUB}/onboardingClaims/${CLAIM_ID}`, pendingClaim(OTHER_CLUB)],
    // Terminal claims and mismatched legacy data must never enter the pending queue.
    [`proClubs/${CLUB}/onboardingClaims/${APPROVED_CLAIM_ID}`, {
      ...pendingClaim(CLUB, TARGET, APPROVED_CODE), status: "APPROVED", approvedAt: Timestamp.now(), approvedBy: "owner-a",
    }],
    [`proClubs/${CLUB}/onboardingClaims/${REJECTED_CLAIM_ID}`, {
      ...pendingClaim(CLUB, TARGET, REJECTED_CODE), status: "REJECTED", rejectedAt: Timestamp.now(), rejectedBy: "admin-a",
    }],
    [`proClubs/${CLUB}/onboardingClaims/mismatched-club`, pendingClaim(OTHER_CLUB)],
    [`proClubInvites/${CODE}`, invite("ACTIVE")],
    [`users/${TARGET}`, { role: "USER", status: "Inactive" }],
    ["users/global-superadmin", { role: "SUPERADMIN", status: "ACTIVE" }],
    ["users/global-admin", { role: "ADMIN", status: "ACTIVE" }],
    ["users/coach", { role: "COACH", status: "ACTIVE" }],
    ["users/player", { role: "PLAYER", status: "ACTIVE" }],
    ["academies/academy-a/members/academy-admin", {
      userId: "academy-admin", academyId: "academy-a", role: "ADMIN", status: "ACTIVE",
    }],
  ];
  for (const [clubId, suffix] of [[CLUB, "a"], [OTHER_CLUB, "b"]]) {
    for (const role of ["OWNER", "ADMIN"]) {
      entries.push([`users/${role.toLowerCase()}-${suffix}`, {
        role: "USER",
        status: suffix === "a" && role === "OWNER" ? "Active" : "ACTIVE",
      }]);
      entries.push([`proClubs/${clubId}/members/${role.toLowerCase()}-${suffix}`, {
        authorizationRole: role, status: "ACTIVE",
      }]);
    }
  }
  for (const uid of ["member", "coach", "staff", "player"]) {
    entries.push([`proClubs/${CLUB}/members/${uid}`, {
      authorizationRole: "MEMBER", status: "ACTIVE",
    }]);
  }
  for (const [uid, staffRole] of [["coach", "HEAD_COACH"], ["staff", "STAFF"], ["staff-only", "HEAD_COACH"]]) {
    entries.push([`proClubs/${CLUB}/staff/${uid}`, { staffRole, status: "ACTIVE" }]);
  }
  await seed(entries);
});

after(async () => { await testEnv?.cleanup(); });

for (const role of ["OWNER", "ADMIN"] as const) {
  test(`${role} active in exact club can query only that club's PENDING claims`, async () => {
    const result = await assertSucceeds(getDocs(pendingQuery(client(`${role.toLowerCase()}-a`))));
    assert.deepEqual(result.docs.map((item) => item.id).sort(), [
      CLAIM_ID, `${OTHER_TARGET}_PRO_CLUB_${OTHER_CODE}`,
    ].sort());
    for (const item of result.docs) {
      assert.equal(item.data().clubId, CLUB);
      assert.equal(item.data().status, "PENDING");
    }
  });

  test(`${role} authority in another club cannot query this club`, async () => {
    await assertFails(getDocs(pendingQuery(client(`${role.toLowerCase()}-b`))));
  });

  test(`${role} inactive or terminal membership cannot query pending claims`, async () => {
    for (const status of ["INACTIVE", "LEFT", "REVOKED"]) {
      await seed([[`proClubs/${CLUB}/members/inactive-reviewer`, { authorizationRole: role, status }]]);
      await assertFails(getDocs(pendingQuery(client("inactive-reviewer"))));
    }
  });
}

for (const uid of ["coach", "staff", "staff-only", "player", "member", TARGET, "global-admin", "global-superadmin", "academy-admin", null]) {
  test(`${uid ?? "unauthenticated"} cannot list this club's pending claims`, async () => {
    await assertFails(getDocs(pendingQuery(client(uid))));
  });
}

test("active reviewer cannot query an inactive club", async () => {
  await seed([[`proClubs/${CLUB}`, { name: "Club A", level: "T3", status: "INACTIVE" }]]);
  await assertFails(getDocs(pendingQuery(client("owner-a"))));
});

test("malformed canonical membership cannot grant reviewer access", async () => {
  await seed([[`proClubs/${CLUB}/members/owner-a`, {
    authorizationRole: "OWNER", status: "ACTIVE", role: "SUPERADMIN",
  }]]);
  await assertFails(getDocs(pendingQuery(client("owner-a"))));
});

test("queries missing club or PENDING constraints are denied even on an empty collection", async () => {
  for (const uid of ["owner-a", "admin-a"]) {
    const db = client(uid);
    const claims = collection(db, "proClubs", CLUB, "onboardingClaims");
    await assertFails(getDocs(claims));
    await assertFails(getDocs(query(claims, where("status", "==", "PENDING"))));
    await assertFails(getDocs(query(claims, where("clubId", "==", CLUB))));
    for (const status of ["APPROVED", "REJECTED"]) {
      await assertFails(getDocs(query(claims, where("clubId", "==", CLUB), where("status", "==", status))));
    }
    await assertFails(getDocs(query(claims, where("clubId", "==", CLUB), where("status", "in", ["PENDING", "APPROVED"]))));
  }
  await testEnv.clearFirestore();
  await seed([
    [`proClubs/${CLUB}`, { name: "Empty club", level: "T3", status: "ACTIVE" }],
    ["users/owner-a", { role: "USER", status: "Active" }],
    [`proClubs/${CLUB}/members/owner-a`, { authorizationRole: "OWNER", status: "ACTIVE" }],
  ]);
  const db = client("owner-a");
  assert.equal((await assertSucceeds(getDocs(pendingQuery(db)))).empty, true);
  await assertFails(getDocs(collection(db, "proClubs", CLUB, "onboardingClaims")));
});

test("reviewer cannot query another tenant path, mismatched club field, or multiple clubs", async () => {
  const db = client("owner-a");
  await assertFails(getDocs(pendingQuery(db, OTHER_CLUB)));
  const claims = collection(db, "proClubs", CLUB, "onboardingClaims");
  await assertFails(getDocs(query(claims, where("clubId", "==", OTHER_CLUB), where("status", "==", "PENDING"))));
  await assertFails(getDocs(query(claims, where("clubId", "in", [CLUB, OTHER_CLUB]), where("status", "==", "PENDING"))));
});

test("root and collection-group claim discovery stay denied even for a multi-club reviewer", async () => {
  await seed([[`proClubs/${OTHER_CLUB}/members/owner-a`, { authorizationRole: "OWNER", status: "ACTIVE" }]]);
  const db = client("owner-a");
  await assertFails(getDocs(collection(db, "onboardingClaims")));
  await assertFails(getDocs(collectionGroup(db, "onboardingClaims")));
  await assertFails(getDocs(query(collectionGroup(db, "onboardingClaims"), where("clubId", "==", CLUB), where("status", "==", "PENDING"))));
});

test("claimant exact self reads preserve PENDING APPROVED and REJECTED states", async () => {
  const db = client(TARGET);
  for (const claimId of [CLAIM_ID, APPROVED_CLAIM_ID, REJECTED_CLAIM_ID]) {
    const result = await assertSucceeds(getDoc(doc(db, "proClubs", CLUB, "onboardingClaims", claimId)));
    assert.equal(result.data()?.userId, TARGET);
  }
});

test("claimant cannot read another claimant's exact claim", async () => {
  await assertFails(getDoc(doc(client(TARGET), "proClubs", CLUB, "onboardingClaims", `${OTHER_TARGET}_PRO_CLUB_${OTHER_CODE}`)));
});

test("exact reviewer reads are preserved without granting cross-club or anonymous reads", async () => {
  for (const uid of ["owner-a", "admin-a"]) {
    await assertSucceeds(getDoc(doc(client(uid), "proClubs", CLUB, "onboardingClaims", APPROVED_CLAIM_ID)));
  }
  for (const uid of ["owner-b", "admin-b", null]) {
    await assertFails(getDoc(doc(client(uid), "proClubs", CLUB, "onboardingClaims", CLAIM_ID)));
  }
});

for (const state of ["ACTIVE", "EXPIRED", "REVOKED", "CONSUMED"] as const) {
  test(`authenticated exact-code ${state} invite lookup succeeds, anonymous lookup fails`, async () => {
    const data = invite(state);
    await seed([[`proClubInvites/${CODE}`, data]]);
    for (const uid of [HOLDER, TARGET, "owner-a", "admin-a"]) {
      const result = await assertSucceeds(getDoc(doc(client(uid), "proClubInvites", CODE)));
      assert.equal(result.data()?.status, data.status);
      assert.equal(result.data()?.expiresAt.toMillis(), data.expiresAt.toMillis());
    }
    await assertFails(getDoc(doc(client(null), "proClubInvites", CODE)));
  });
}

test("invite collection list, filtered query and document-ID query all remain denied", async () => {
  for (const uid of [HOLDER, TARGET, "owner-a", "admin-a", null]) {
    const invites = collection(client(uid), "proClubInvites");
    await assertFails(getDocs(invites));
    await assertFails(getDocs(query(invites, where("targetUid", "==", TARGET))));
    await assertFails(getDocs(query(invites, where("clubId", "==", CLUB), where("status", "==", "ACTIVE"))));
    await assertFails(getDocs(query(invites, where(documentId(), "==", CODE))));
  }
});

test("capability read rejects unknown fields in every invite lifecycle schema", async () => {
  for (const state of ["ACTIVE", "EXPIRED", "REVOKED", "CONSUMED"] as const) {
    await seed([[`proClubInvites/${CODE}`, { ...invite(state), internalNote: "must not be disclosed" }]]);
    for (const uid of [HOLDER, TARGET]) {
      await assertFails(getDoc(doc(client(uid), "proClubInvites", CODE)));
    }
  }
});

test("capability read rejects malformed identity, elevated roles, timestamps and lifecycle fields", async () => {
  const invalid: DocumentData[] = [
    { ...invite("ACTIVE"), inviteCode: OTHER_CODE },
    { ...invite("ACTIVE"), schemaVersion: 2 },
    { ...invite("ACTIVE"), membershipAuthorizationRole: "OWNER" },
    { ...invite("ACTIVE"), membershipAuthorizationRole: "ADMIN" },
    { ...invite("ACTIVE"), staffRole: "SUPERADMIN" },
    { ...invite("ACTIVE"), expiresAt: "tomorrow" },
    { ...invite("ACTIVE"), targetUid: "" },
    { ...invite("ACTIVE"), status: "CONSUMED" },
    { ...invite("ACTIVE"), status: "REVOKED" },
  ];
  for (const data of invalid) {
    await seed([[`proClubInvites/${CODE}`, data]]);
    await assertFails(getDoc(doc(client(HOLDER), "proClubInvites", CODE)));
  }
  const shortCode = "FUT-PC-A";
  await seed([[`proClubInvites/${shortCode}`, { ...invite("ACTIVE"), inviteCode: shortCode }]]);
  await assertFails(getDoc(doc(client(HOLDER), "proClubInvites", shortCode)));
});

test("exact-code knowledge grants no claim write or tenant read authority", async () => {
  const db = client(HOLDER);
  await assertSucceeds(getDoc(doc(db, "proClubInvites", CODE)));
  await assertFails(setDoc(doc(db, "proClubs", CLUB, "onboardingClaims", `${HOLDER}_PRO_CLUB_${CODE}`), {
    ...pendingClaim(CLUB, HOLDER), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await assertFails(getDoc(doc(db, "proClubs", CLUB)));
  await assertFails(getDoc(doc(db, "proClubs", CLUB, "onboardingClaims", CLAIM_ID)));
  await assertFails(setDoc(doc(db, "proClubs", CLUB, "members", HOLDER), {
    authorizationRole: "MEMBER", status: "ACTIVE",
  }));
});

// ============================================================================
// Reviewer Account Status Enforcement (P1 Codex Remediation)
// ============================================================================

for (const role of ["OWNER", "ADMIN"] as const) {
  const actor = `test-${role.toLowerCase()}-reviewer`;

  test(`${role} with REJECTED canonical account status cannot query or get pending claims`, async () => {
    await seed([
      [`proClubs/${CLUB}/members/${actor}`, { authorizationRole: role, status: "ACTIVE" }],
      [`users/${actor}`, { role: "USER", status: "REJECTED" }],
    ]);
    await assertFails(getDocs(pendingQuery(client(actor))));
    await assertFails(getDoc(doc(client(actor), "proClubs", CLUB, "onboardingClaims", CLAIM_ID)));
  });

  test(`${role} with missing users/{uid} document cannot query or get pending claims`, async () => {
    await seed([
      [`proClubs/${CLUB}/members/${actor}`, { authorizationRole: role, status: "ACTIVE" }],
    ]);
    await assertFails(getDocs(pendingQuery(client(actor))));
    await assertFails(getDoc(doc(client(actor), "proClubs", CLUB, "onboardingClaims", CLAIM_ID)));
  });

  test(`${role} with missing account status field cannot query or get pending claims`, async () => {
    await seed([
      [`proClubs/${CLUB}/members/${actor}`, { authorizationRole: role, status: "ACTIVE" }],
      [`users/${actor}`, { role: "USER" }],
    ]);
    await assertFails(getDocs(pendingQuery(client(actor))));
    await assertFails(getDoc(doc(client(actor), "proClubs", CLUB, "onboardingClaims", CLAIM_ID)));
  });

  test(`${role} with malformed account status cannot query or get pending claims`, async () => {
    for (const malformedStatus of [42, true, null, { invalid: true }, ["ACTIVE"]]) {
      await seed([
        [`proClubs/${CLUB}/members/${actor}`, { authorizationRole: role, status: "ACTIVE" }],
        [`users/${actor}`, { role: "USER", status: malformedStatus }],
      ]);
      await assertFails(getDocs(pendingQuery(client(actor))));
      await assertFails(getDoc(doc(client(actor), "proClubs", CLUB, "onboardingClaims", CLAIM_ID)));
    }
  });

  test(`${role} with unsupported account status cannot query or get pending claims`, async () => {
    for (const unsupportedStatus of ["PENDING", "Inactive", "SUSPENDED", "active", "DEACTIVATED", "BANNED"]) {
      await seed([
        [`proClubs/${CLUB}/members/${actor}`, { authorizationRole: role, status: "ACTIVE" }],
        [`users/${actor}`, { role: "USER", status: unsupportedStatus }],
      ]);
      await assertFails(getDocs(pendingQuery(client(actor))));
      await assertFails(getDoc(doc(client(actor), "proClubs", CLUB, "onboardingClaims", CLAIM_ID)));
    }
  });

  test(`ACTIVE account status ("Active" and "ACTIVE") allows ${role} to query and get pending claims`, async () => {
    for (const activeStatus of ["Active", "ACTIVE"] as const) {
      await seed([
        [`proClubs/${CLUB}/members/${actor}`, { authorizationRole: role, status: "ACTIVE" }],
        [`users/${actor}`, { role: "USER", status: activeStatus }],
      ]);
      const result = await assertSucceeds(getDocs(pendingQuery(client(actor))));
      assert.ok(result.docs.length > 0);
      const claim = await assertSucceeds(getDoc(doc(client(actor), "proClubs", CLUB, "onboardingClaims", CLAIM_ID)));
      assert.equal(claim.data()?.status, "PENDING");
    }
  });
}
