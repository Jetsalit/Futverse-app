import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDocFromServer, setDoc, Timestamp, type DocumentData, type Firestore } from "firebase/firestore";
import { createProClubOnboardingRepository } from "../src/lib/firestore/proClubOnboardingRepository";
import { OnboardingError, proClubClaimId, type ProClubStaffRole } from "../src/lib/proClubOnboarding";

const CLUB = "club-a";
const OTHER_CLUB = "club-b";
const OWNER = "owner-a";
const ADMIN = "admin-a";
const MEMBER = "member-a";
const OUTSIDER = "outsider-a";
const INACTIVE_OWNER = "inactive-owner";
const CANDIDATE_1 = "candidate-1";
const CANDIDATE_2 = "candidate-2";
const CANDIDATE_3 = "candidate-3";
const WRONG_USER = "wrong-user";

let environment: RulesTestEnvironment;

function db(uid: string): Firestore {
  return environment.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function repository(uid: string) {
  return createProClubOnboardingRepository(db(uid), () => uid);
}

async function seed(entries: Array<[string, DocumentData]>) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
}

async function snapshot(path: string) {
  let data: DocumentData | null = null;
  await environment.withSecurityRulesDisabled(async (context) => {
    const result = await getDocFromServer(doc(context.firestore(), path));
    data = result.exists() ? result.data() : null;
  });
  return data;
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Emulator required");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  environment = await initializeTestEnvironment({
    projectId: "demo-pro-club-invitation-runtime",
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
    [`proClubs/${OTHER_CLUB}`, { name: "Club B", level: "T3", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/${OWNER}`, { authorizationRole: "OWNER", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/${ADMIN}`, { authorizationRole: "ADMIN", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/${MEMBER}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/${INACTIVE_OWNER}`, { authorizationRole: "OWNER", status: "INACTIVE" }],
    [`proClubs/${OTHER_CLUB}/members/${OUTSIDER}`, { authorizationRole: "OWNER", status: "ACTIVE" }],
    [`users/${OWNER}`, { role: "USER", status: "ACTIVE" }],
    [`users/${ADMIN}`, { role: "USER", status: "ACTIVE" }],
    [`users/${MEMBER}`, { role: "USER", status: "ACTIVE" }],
    [`users/${INACTIVE_OWNER}`, { role: "USER", status: "ACTIVE" }],
    [`users/${OUTSIDER}`, { role: "USER", status: "ACTIVE" }],
    [`users/${CANDIDATE_1}`, { name: "Candidate 1", email: "c1@example.test", role: "USER", status: "ACTIVE" }],
    [`users/${CANDIDATE_2}`, { name: "Candidate 2", email: "c2@example.test", role: "USER", status: "ACTIVE" }],
    [`users/${CANDIDATE_3}`, { name: "Candidate 3", email: "c3@example.test", role: "USER", status: "ACTIVE" }],
    [`users/${WRONG_USER}`, { name: "Wrong User", email: "wrong@example.test", role: "USER", status: "ACTIVE" }],
  ]);
});

after(async () => {
  await environment?.cleanup();
});

test("1. OWNER can issue valid invite with canonical MEMBER role and exact staff role", async () => {
  const repo = repository(OWNER);
  const invite = await repo.issueInvitation(
    { clubId: CLUB, targetUid: CANDIDATE_1, staffRole: "HEAD_COACH" },
    OWNER,
  );

  assert.equal(invite.schemaVersion, 1);
  assert.ok(invite.inviteCode.startsWith("FUT-PC-"));
  assert.equal(invite.clubId, CLUB);
  assert.equal(invite.targetUid, CANDIDATE_1);
  assert.equal(invite.membershipAuthorizationRole, "MEMBER");
  assert.equal(invite.staffRole, "HEAD_COACH");
  assert.equal(invite.status, "ACTIVE");
  assert.equal(invite.createdBy, OWNER);
  assert.equal(invite.updatedBy, OWNER);
  assert.ok(invite.createdAt.toMillis() > Date.now() - 30_000);
  assert.ok(invite.expiresAt.toMillis() > Date.now());

  // Confirm saved document matches
  const stored = await snapshot(`proClubInvites/${invite.inviteCode}`);
  assert.ok(stored);
  assert.equal(stored.targetUid, CANDIDATE_1);
  assert.equal(stored.staffRole, "HEAD_COACH");
});

test("2. ADMIN can issue valid invite for a staff member", async () => {
  const repo = repository(ADMIN);
  const invite = await repo.issueInvitation(
    { clubId: CLUB, targetUid: CANDIDATE_2, staffRole: "ASSISTANT_COACH" },
    ADMIN,
  );

  assert.equal(invite.clubId, CLUB);
  assert.equal(invite.targetUid, CANDIDATE_2);
  assert.equal(invite.staffRole, "ASSISTANT_COACH");
  assert.equal(invite.createdBy, ADMIN);
  assert.equal(invite.status, "ACTIVE");
});

test("3. MEMBER cannot issue invite (denied REVIEWER_REQUIRED)", async () => {
  const repo = repository(MEMBER);
  await assert.rejects(
    repo.issueInvitation(
      { clubId: CLUB, targetUid: CANDIDATE_1, staffRole: "STAFF" },
      MEMBER,
    ),
    (error) => error instanceof OnboardingError && error.code === "REVIEWER_REQUIRED",
  );
});

test("4. Non-member cannot issue invite (denied REVIEWER_REQUIRED)", async () => {
  const repo = repository(OUTSIDER);
  await assert.rejects(
    repo.issueInvitation(
      { clubId: CLUB, targetUid: CANDIDATE_1, staffRole: "STAFF" },
      OUTSIDER,
    ),
    (error) => error instanceof OnboardingError && error.code === "REVIEWER_REQUIRED",
  );
});

test("5. Wrong club cannot be targeted by reviewer (denied REVIEWER_REQUIRED)", async () => {
  const repo = repository(OWNER);
  await assert.rejects(
    repo.issueInvitation(
      { clubId: OTHER_CLUB, targetUid: CANDIDATE_1, staffRole: "STAFF" },
      OWNER,
    ),
    (error) => error instanceof OnboardingError && error.code === "REVIEWER_REQUIRED",
  );
});

test("6. Inactive reviewer cannot issue invite", async () => {
  const repo = repository(INACTIVE_OWNER);
  await assert.rejects(
    repo.issueInvitation(
      { clubId: CLUB, targetUid: CANDIDATE_1, staffRole: "STAFF" },
      INACTIVE_OWNER,
    ),
    (error) => error instanceof OnboardingError && error.code === "REVIEWER_REQUIRED",
  );
});

test("7. Self-invite is rejected", async () => {
  const repo = repository(OWNER);
  await assert.rejects(
    repo.issueInvitation(
      { clubId: CLUB, targetUid: OWNER, staffRole: "HEAD_COACH" },
      OWNER,
    ),
    (error) => error instanceof OnboardingError && error.code === "INVALID_DATA",
  );
});

test("8. Inviting existing member is rejected", async () => {
  const repo = repository(OWNER);
  await assert.rejects(
    repo.issueInvitation(
      { clubId: CLUB, targetUid: MEMBER, staffRole: "STAFF" },
      OWNER,
    ),
    (error) => error instanceof OnboardingError && (error.code === "MEMBERSHIP_EXISTS" || error.code === "TARGET_USER_NOT_FOUND"),
  );
});

test("9. Membership role escalation is impossible (always MEMBER, cannot be OWNER/ADMIN in rules)", async () => {
  // Test direct bypass attempt to write OWNER authorizationRole into proClubInvites
  const rawDb = db(OWNER);
  const maliciousCode = `FUT-PC-${"X".repeat(24)}`;
  await assert.rejects(
    setDoc(doc(rawDb, "proClubInvites", maliciousCode), {
      schemaVersion: 1,
      inviteCode: maliciousCode,
      clubId: CLUB,
      targetUid: CANDIDATE_1,
      membershipAuthorizationRole: "OWNER",
      staffRole: "HEAD_COACH",
      status: "ACTIVE",
      createdAt: Timestamp.now(),
      createdBy: OWNER,
      updatedAt: Timestamp.now(),
      updatedBy: OWNER,
      expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    }),
  );
});

test("10. createdBy spoofing is impossible (caller must equal request.auth.uid)", async () => {
  const rawDb = db(ADMIN);
  const spoofCode = `FUT-PC-${"Y".repeat(24)}`;
  await assert.rejects(
    setDoc(doc(rawDb, "proClubInvites", spoofCode), {
      schemaVersion: 1,
      inviteCode: spoofCode,
      clubId: CLUB,
      targetUid: CANDIDATE_1,
      membershipAuthorizationRole: "MEMBER",
      staffRole: "HEAD_COACH",
      status: "ACTIVE",
      createdAt: Timestamp.now(),
      createdBy: OWNER, // Spoofing OWNER when authenticated as ADMIN
      updatedAt: Timestamp.now(),
      updatedBy: ADMIN,
      expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    }),
  );
});

test("11. Invalid staff role is rejected", async () => {
  const repo = repository(OWNER);
  await assert.rejects(
    repo.issueInvitation(
      { clubId: CLUB, targetUid: CANDIDATE_1, staffRole: "INVALID_ROLE" as unknown as ProClubStaffRole },
      OWNER,
    ),
    (error) => error instanceof OnboardingError && error.code === "INVALID_DATA",
  );
});

test("12. Inviting non-existent user account fails with TARGET_USER_NOT_FOUND", async () => {
  const repo = repository(OWNER);
  await assert.rejects(
    repo.issueInvitation(
      { clubId: CLUB, targetUid: "non-existent-user-uid", staffRole: "STAFF" },
      OWNER,
    ),
    (error) => error instanceof OnboardingError && error.code === "TARGET_USER_NOT_FOUND",
  );
});

test("13. Invalid invite code format is rejected", async () => {
  const rawDb = db(OWNER);
  // Short code (< 31 chars)
  await assert.rejects(
    setDoc(doc(rawDb, "proClubInvites", "FUT-PC-SHORT"), {
      schemaVersion: 1,
      inviteCode: "FUT-PC-SHORT",
      clubId: CLUB,
      targetUid: CANDIDATE_1,
      membershipAuthorizationRole: "MEMBER",
      staffRole: "HEAD_COACH",
      status: "ACTIVE",
      createdAt: Timestamp.now(),
      createdBy: OWNER,
      updatedAt: Timestamp.now(),
      updatedBy: OWNER,
      expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    }),
  );

  // Lowercase code
  const lowercaseCode = `fut-pc-${"a".repeat(24)}`;
  await assert.rejects(
    setDoc(doc(rawDb, "proClubInvites", lowercaseCode), {
      schemaVersion: 1,
      inviteCode: lowercaseCode,
      clubId: CLUB,
      targetUid: CANDIDATE_1,
      membershipAuthorizationRole: "MEMBER",
      staffRole: "HEAD_COACH",
      status: "ACTIVE",
      createdAt: Timestamp.now(),
      createdBy: OWNER,
      updatedAt: Timestamp.now(),
      updatedBy: OWNER,
      expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    }),
  );
});

test("14. Collision safe: cannot overwrite existing invitation", async () => {
  const repo = repository(OWNER);
  const invite = await repo.issueInvitation(
    { clubId: CLUB, targetUid: CANDIDATE_1, staffRole: "HEAD_COACH" },
    OWNER,
  );

  // Attempting to overwrite existing code with different targetUid/role
  const rawDb = db(OWNER);
  await assert.rejects(
    setDoc(doc(rawDb, "proClubInvites", invite.inviteCode), {
      schemaVersion: 1,
      inviteCode: invite.inviteCode,
      clubId: CLUB,
      targetUid: CANDIDATE_2,
      membershipAuthorizationRole: "MEMBER",
      staffRole: "FITNESS_COACH",
      status: "ACTIVE",
      createdAt: Timestamp.now(),
      createdBy: OWNER,
      updatedAt: Timestamp.now(),
      updatedBy: OWNER,
      expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    }),
  );

  // Verify the original invite was unchanged
  const stored = await snapshot(`proClubInvites/${invite.inviteCode}`);
  assert.ok(stored);
  assert.equal(stored.targetUid, CANDIDATE_1);
  assert.equal(stored.staffRole, "HEAD_COACH");
});

test("15. Intended staff can inspect invite, wrong account cannot claim, claim stays PENDING, approval succeeds", async () => {
  // Step 1: Owner issues invite
  const repoOwner = repository(OWNER);
  const invite = await repoOwner.issueInvitation(
    { clubId: CLUB, targetUid: CANDIDATE_3, staffRole: "PHYSIO" },
    OWNER,
  );

  // Step 2: Intended staff inspects invite
  const repoCandidate = repository(CANDIDATE_3);
  const inspection = await repoCandidate.inspectInvitation(invite.inviteCode, CANDIDATE_3);
  assert.equal(inspection.invite.inviteCode, invite.inviteCode);
  assert.equal(inspection.invite.staffRole, "PHYSIO");
  assert.equal(inspection.claim, null);
  assert.equal(inspection.membershipExists, false);

  // Step 3: Wrong account cannot claim
  const repoWrong = repository(WRONG_USER);
  await assert.rejects(
    repoWrong.requestMembership(invite.inviteCode, WRONG_USER),
    (error) => error instanceof OnboardingError && error.code === "WRONG_RECIPIENT",
  );

  // Step 4: Intended staff claims -> claim status is PENDING
  const claim = await repoCandidate.requestMembership(invite.inviteCode, CANDIDATE_3);
  assert.equal(claim.status, "PENDING");
  assert.equal(claim.staffRole, "PHYSIO");
  assert.equal(claim.userId, CANDIDATE_3);
  assert.equal(await snapshot(`proClubs/${CLUB}/members/${CANDIDATE_3}`), null);

  // Step 5: Owner reviews and approves claim
  const claimId = proClubClaimId(CANDIDATE_3, invite.inviteCode);
  await repoOwner.reviewClaim(CLUB, claimId, "APPROVED", OWNER);

  // Confirm approval: membership created, staff assignment created, invite consumed
  const memberSnap = await snapshot(`proClubs/${CLUB}/members/${CANDIDATE_3}`);
  assert.ok(memberSnap);
  assert.equal(memberSnap.authorizationRole, "MEMBER");
  assert.equal(memberSnap.status, "ACTIVE");

  const staffSnap = await snapshot(`proClubs/${CLUB}/staff/${CANDIDATE_3}`);
  assert.ok(staffSnap);
  assert.equal(staffSnap.staffRole, "PHYSIO");
  assert.equal(staffSnap.status, "ACTIVE");

  const inviteSnap = await snapshot(`proClubInvites/${invite.inviteCode}`);
  assert.ok(inviteSnap);
  assert.equal(inviteSnap.status, "CONSUMED");
  assert.equal(inviteSnap.claimId, claimId);
});
