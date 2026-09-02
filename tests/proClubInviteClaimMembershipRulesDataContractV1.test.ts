import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contract = read(
  "docs/PRO_CLUB_INVITE_CLAIM_MEMBERSHIP_RULES_DATA_CONTRACT_V1.md",
);
const normalized = contract.replace(/\s+/g, " ");
const predecessor = read(
  "docs/PRO_CLUB_STAFF_ONBOARDING_V1_CONTRACT_FREEZE.md",
);
const proClubTypes = read("src/types/ProClub.ts");
const proClubModel = read("src/lib/proClubModel.ts");
const readAdapter = read("src/lib/firestore/proClubReadAdapter.ts");
const organizationAdapter = read(
  "src/lib/firestore/proClubOrganizationAdapter.ts",
);
const firestoreRules = read("firestore.rules");

test("Pro Club Invite / Claim / Membership Rules & Data Contract V1", async (t) => {
  await t.test("freezes exact baseline and preservation-only scope", () => {
    assert.ok(contract.includes("c4c55e1aeaf30c797d845cffbfe80587a5472051"));
    assert.ok(contract.includes("feat/pro-club-invite-claim-membership-rules-data-contract-v1"));
    assert.ok(contract.includes("frozen Firestore Rules blob: `78f16bc6f05e53adff514674cb7a2362c77e5ae9`"));
    assert.ok(contract.includes("No production file is changed by this freeze"));
    assert.ok(contract.includes("Slice 2A"));
    assert.ok(contract.includes("Slice 2B"));
  });

  await t.test("inherits predecessor authority invariants", () => {
    for (const invariant of [
      "`REGISTRATION INTENT != ACCOUNT AUTHORITY`",
      "`INVITE != TENANT AUTHORITY`",
      "`CLAIM != TENANT AUTHORITY`",
      "`MEMBERSHIP AUTHORITY != FOOTBALL STAFF ROLE`",
      "`STAFF DOCUMENT ALONE != TENANT AUTHORITY`",
      "`PRESENTED USER != AUTHENTICATED ACTOR`",
      "`APPROVAL MUST BE ATOMIC`",
    ]) {
      assert.ok(contract.includes(invariant), `missing invariant: ${invariant}`);
    }
    assert.ok(predecessor.includes("`REGISTRATION INTENT != ACCOUNT AUTHORITY`"));
    assert.ok(predecessor.includes("`STAFF DOCUMENT ALONE != TENANT AUTHORITY`"));
  });

  await t.test("preserves runtime-compatible exact Membership shape", () => {
    assert.match(
      proClubTypes,
      /export interface ProClubMembership \{\s*authorizationRole: ProClubAuthorizationRole;\s*status: ProClubMembershipStatus;\s*\}/s,
    );
    assert.match(
      proClubModel,
      /const PRO_CLUB_MEMBERSHIP_FIELDS = new Set\(\[\s*"authorizationRole",\s*"status",\s*\]\)/s,
    );
    assert.ok(contract.includes("must not add audit fields to Membership or Staff documents"));
    assert.ok(normalized.includes('authorizationRole: "OWNER" | "ADMIN" | "MEMBER"'));
  });

  await t.test("preserves runtime-compatible exact Staff shape", () => {
    assert.match(
      proClubTypes,
      /export interface ProClubStaffAssignment \{\s*staffRole: ProClubStaffRole;\s*status: ProClubStaffStatus;\s*\}/s,
    );
    assert.match(
      proClubModel,
      /const PRO_CLUB_STAFF_ASSIGNMENT_FIELDS = new Set\(\[\s*"staffRole",\s*"status",\s*\]\)/s,
    );
    for (const role of [
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "FITNESS_COACH",
      "ANALYST",
      "PHYSIO",
      "TEAM_MANAGER",
      "STAFF",
    ]) {
      assert.ok(contract.includes(`\`${role}\``) || contract.includes(`"${role}"`));
    }
  });

  await t.test("freezes exact four-path onboarding data model", () => {
    for (const path of [
      "`proClubInvites/{inviteCode}`",
      "`proClubs/{clubId}/onboardingClaims/{claimId}`",
      "`proClubs/{clubId}/members/{uid}`",
      "`proClubs/{clubId}/staff/{uid}`",
    ]) {
      assert.ok(contract.includes(path), `missing path: ${path}`);
    }
    assert.ok(contract.includes("No other Pro Club onboarding collection is authorized by V1"));
  });

  await t.test("freezes targeted invite and no-discovery boundary", () => {
    assert.ok(contract.includes("prefix `FUT-PC-`"));
    assert.ok(contract.includes("targetUid == request.auth.uid"));
    assert.ok(contract.includes("exact lookup only; no list/search endpoint"));
    assert.ok(contract.includes("Collection listing or account-wide Pro Club discovery is not authorized"));
  });

  await t.test("freezes public onboarding Membership ceiling to MEMBER", () => {
    assert.ok(contract.includes("`membershipAuthorizationRole: \"MEMBER\"`"));
    assert.ok(contract.includes("Public onboarding cannot issue `OWNER` or `ADMIN` Membership authority"));
    assert.ok(normalized.includes('authorizationRole: "MEMBER", status: "ACTIVE"'));
    assert.ok(contract.includes("must never create or transform a public claimant into `OWNER` or `ADMIN`"));
  });

  await t.test("requires canonical Pro Club Membership reviewer authority", () => {
    assert.ok(contract.includes("`proClubs/{clubId}/members/{request.auth.uid}`"));
    assert.ok(contract.includes('whose `authorizationRole` is `OWNER` or `ADMIN`'));
    assert.ok(contract.includes("`staffRole` never grants review authority"));
    assert.ok(contract.includes('Global `users.role == "SUPERADMIN"` is not a V1 onboarding reviewer proof'));
  });

  await t.test("freezes deterministic tenant-scoped claim identity", () => {
    assert.ok(contract.includes("`claimId = userId + \"_PRO_CLUB_\" + inviteCode`"));
    assert.ok(contract.includes("claim path `clubId`, claim payload `clubId`, invite `clubId`, target `userId`, and authenticated `request.auth.uid` must all agree exactly"));
    assert.ok(contract.includes("The claimant cannot choose a second claim identity for the same invite"));
  });

  await t.test("freezes immutable claim authority fields", () => {
    for (const field of [
      "`schemaVersion`",
      "`type`",
      "`userId`",
      "`clubId`",
      "`inviteCode`",
      "`membershipAuthorizationRole`",
      "`staffRole`",
      "`createdAt`",
    ]) {
      assert.ok(contract.includes(field));
    }
    assert.ok(contract.includes("The claimant can never approve, reject, retarget, or elevate their own claim"));
  });

  await t.test("requires four-way atomic approval", () => {
    for (const step of [
      "claim transitions `PENDING -> APPROVED`",
      "exact Membership is created",
      "exact Staff assignment is created",
      "exact invite transitions `ACTIVE -> CONSUMED`",
    ]) {
      assert.ok(contract.includes(step), `missing atomic step: ${step}`);
    }
    assert.ok(contract.includes("No partial approval is valid"));
    assert.ok(contract.includes("`existsAfter` / `getAfter`"));
  });

  await t.test("freezes replay-safe invite consumption", () => {
    assert.ok(contract.includes("`CONSUMED` invite evidence"));
    assert.ok(contract.includes("`consumedAt == request.time`"));
    assert.ok(contract.includes("A consumed or revoked invite cannot create another claim or another Membership"));
    assert.ok(contract.includes("deterministic claim ID plus targeted UID plus consumed invite"));
  });

  await t.test("freezes atomic rejection and no authority creation", () => {
    assert.ok(contract.includes("transition claim `PENDING -> REJECTED`"));
    assert.ok(contract.includes("transition the matching invite `ACTIVE -> REVOKED`"));
    assert.ok(contract.includes("No Membership or Staff document may be created by a rejection transaction"));
  });

  await t.test("recognizes reviewed Slice 2B successor Rules", () => {
    const start = firestoreRules.indexOf("match /proClubs/{clubId}");
    const end = firestoreRules.indexOf("match /proPlayers/{proPlayerId}", start);
    assert.ok(start >= 0 && end > start);
    const rules = firestoreRules.slice(start, end);

    assert.match(firestoreRules, /match \/proClubInvites\/\{inviteCode\}/);
    assert.match(
      rules,
      /match \/members\/\{uid\}[\s\S]*allow create: if validProClubMembershipCreateV1\(clubId, uid\);/,
    );
    assert.match(
      rules,
      /match \/staff\/\{uid\}[\s\S]*allow create: if validProClubStaffCreateV1\(clubId, uid\);/,
    );
    assert.match(rules, /match \/onboardingClaims\/\{claimId\}/);
    assert.match(rules, /match \/onboardingApprovals\/\{uid\}/);
    assert.match(firestoreRules, /function validProClubApprovalProofCreateV1\(/);

    // Historical Slice 2A remains immutable about its own docs/tests-only scope.
    assert.match(contract, /does \*\*not\*\* modify `firestore\.rules`/);
  });  await t.test("preserves existing runtime authority chain", () => {
    assert.match(readAdapter, /getProClubMembership/);
    assert.match(readAdapter, /getProClubStaffAssignment/);
    assert.match(readAdapter, /hasActiveProClubMembershipAuthority/);
    assert.match(organizationAdapter, /membershipAuthorizationRole/);
    assert.match(organizationAdapter, /hasMembershipAuthority/);
    assert.match(organizationAdapter, /staffRole/);
  });

  await t.test("preserves Academy boundaries", () => {
    for (const boundary of [
      "`academy_invites`",
      "`profile_claims`",
      "Academy Membership Rules",
      "`JoinAcademy`",
      "`AcademyProvider`",
      "Academy Match authority",
      "existing Academy activation behavior",
    ]) {
      assert.ok(contract.includes(boundary), `missing Academy boundary: ${boundary}`);
    }
    assert.ok(contract.includes("Pro Club onboarding is not a renamed Academy flow"));
  });

  await t.test("freezes required emulator regression matrix", () => {
    const required = [
      "anonymous invite get denied",
      "wrong target UID invite get denied",
      "claimant cannot list invite registry",
      "MEMBER cannot issue invite",
      "canonical OWNER can issue exact MEMBER-role invite",
      "canonical ADMIN can issue exact MEMBER-role invite",
      "invite cannot grant OWNER",
      "invite cannot grant ADMIN",
      "claimant cannot self-approve",
      "approval without Membership create denied",
      "approval without Staff create denied",
      "approval without invite consumption denied",
      "Membership create without approved claim denied",
      "Staff create without Membership denied",
      "exact atomic approval succeeds",
      "replay of consumed invite denied",
      "exact atomic rejection succeeds",
      "Academy Rules regression suite remains green",
      "current Pro Club exact-read adapter behavior remains green",
      "production default deny remains intact",
    ];
    for (const scenario of required) {
      assert.ok(contract.includes(scenario), `missing Rules scenario: ${scenario}`);
    }
    assert.ok(contract.includes("37. production default deny remains intact"));
  });

  await t.test("requires Rules before service before UI", () => {
    const sequence = [
      "Slice 2A — this Rules/Data Contract Freeze",
      "Slice 2B — Firestore Rules implementation + dedicated emulator tests only",
      "Slice 3 — Pro Club Onboarding Service implementation",
      "Slice 4 — Registration Organization Intent / Routing",
      "Slice 5 — Organization-aware Onboarding UI",
      "Slice 6 — Pro Club Workspace Entry",
    ];
    for (const item of sequence) assert.ok(contract.includes(item));
    assert.ok(contract.includes("No Slice 3 service write is authorized until Slice 2B"));
  });
});
