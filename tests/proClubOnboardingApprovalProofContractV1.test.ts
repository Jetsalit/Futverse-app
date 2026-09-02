import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contract = read("docs/PRO_CLUB_ONBOARDING_APPROVAL_PROOF_CONTRACT_V1.md");
const predecessor = read("docs/PRO_CLUB_INVITE_CLAIM_MEMBERSHIP_RULES_DATA_CONTRACT_V1.md");
const proClubTypes = read("src/types/ProClub.ts");
const proClubModel = read("src/lib/proClubModel.ts");
const readAdapter = read("src/lib/firestore/proClubReadAdapter.ts");
const organizationAdapter = read("src/lib/firestore/proClubOrganizationAdapter.ts");
const firestoreRules = read("firestore.rules");

test("Pro Club Onboarding Approval Proof Contract V1", async (t) => {
  await t.test("freezes exact baseline and remediation-only scope", () => {
    assert.ok(contract.includes("f95793672aabef9b976b3ce6ab5b1f0cef61239f"));
    assert.ok(contract.includes("fix/pro-club-onboarding-approval-proof-contract-v1"));
    assert.ok(contract.includes("does not modify `firestore.rules`"));
    assert.ok(contract.includes("production application source"));
  });

  await t.test("preserves exact runtime Membership and Staff shapes", () => {
    assert.match(proClubTypes, /interface ProClubMembership \{\s*authorizationRole: ProClubAuthorizationRole;\s*status: ProClubMembershipStatus;\s*\}/s);
    assert.match(proClubTypes, /interface ProClubStaffAssignment \{\s*staffRole: ProClubStaffRole;\s*status: ProClubStaffStatus;\s*\}/s);
    assert.match(proClubModel, /PRO_CLUB_MEMBERSHIP_FIELDS[\s\S]*"authorizationRole"[\s\S]*"status"/);
    assert.match(proClubModel, /PRO_CLUB_STAFF_ASSIGNMENT_FIELDS[\s\S]*"staffRole"[\s\S]*"status"/);
    assert.ok(contract.includes("identity-free"));
  });

  await t.test("introduces deterministic non-authority approval proof", () => {
    assert.ok(contract.includes("`proClubs/{clubId}/onboardingApprovals/{uid}`"));
    assert.ok(contract.includes("APPROVAL PROOF != TENANT AUTHORITY"));
    assert.ok(contract.includes("Canonical tenant authority remains only"));
    assert.ok(contract.includes("`proClubs/{clubId}/members/{uid}`"));
  });

  await t.test("freezes exact approval proof schema", () => {
    for (const field of [
      "`schemaVersion: 1`",
      "`userId`",
      "`clubId`",
      "`claimId`",
      "`inviteCode`",
      "`membershipAuthorizationRole: \"MEMBER\"`",
      "`staffRole`",
      "`status: \"APPROVED\"`",
      "`approvedAt`",
      "`approvedBy`",
    ]) assert.ok(contract.includes(field), `missing ${field}`);
    assert.ok(contract.includes("No additional fields are allowed in V1"));
  });

  await t.test("requires five-way atomic approval", () => {
    for (const step of [
      "claim transitions `PENDING -> APPROVED`",
      "deterministic approval proof is created",
      "exact Membership is created",
      "exact Staff assignment is created",
      "exact invite transitions `ACTIVE -> CONSUMED`",
    ]) assert.ok(contract.includes(step), `missing atomic step: ${step}`);
    assert.ok(contract.includes("No partial approval is valid"));
  });

  await t.test("closes direct Membership and Staff bypass", () => {
    assert.ok(contract.includes("Membership create without approval proof denied"));
    assert.ok(contract.includes("Staff create without approval proof denied"));
    assert.ok(contract.includes("closes the bypass"));
    assert.ok(contract.includes("`existsAfter()` and `getAfter()`"));
  });

  await t.test("keeps reviewer authority canonical", () => {
    assert.ok(contract.includes("reviewer is canonical active `OWNER`/`ADMIN`"));
    assert.ok(contract.includes("approval proof cannot be created by `MEMBER`"));
    assert.ok(contract.includes("staff-only actor"));
    assert.ok(contract.includes("unrelated Pro Club admin"));
  });

  await t.test("keeps approval proof immutable and non-discoverable", () => {
    assert.ok(contract.includes("creation-only"));
    assert.ok(contract.includes("Client update and delete are denied"));
    assert.ok(contract.includes("Listing `onboardingApprovals` is not authorized"));
  });

  await t.test("preserves current runtime authority resolution", () => {
    assert.match(readAdapter, /getProClubMembership/);
    assert.match(readAdapter, /getProClubStaffAssignment/);
    assert.doesNotMatch(readAdapter, /onboardingApprovals/);
    assert.match(organizationAdapter, /hasMembershipAuthority/);
    assert.doesNotMatch(organizationAdapter, /onboardingApprovals/);
    assert.ok(contract.includes("must remain unchanged"));
  });

  await t.test("preserves current Rules until Slice 2B", () => {
    const start = firestoreRules.indexOf("match /proClubs/{clubId}");
    const end = firestoreRules.indexOf("match /proPlayers/{proPlayerId}", start);
    const rules = firestoreRules.slice(start, end);
    assert.match(rules, /match \/members\/\{uid\}[\s\S]*allow list, create, update, delete: if false;/);
    assert.match(rules, /match \/staff\/\{uid\}[\s\S]*allow list, create, update, delete: if false;/);
    assert.doesNotMatch(rules, /onboardingApprovals/);
  });

  await t.test("preserves Academy boundaries", () => {
    for (const item of [
      "Academy invite or claim paths",
      "Academy Membership schemas",
      "Academy Firestore Rules",
      "`JoinAcademy`",
      "`AcademyProvider`",
    ]) assert.ok(contract.includes(item));
  });

  await t.test("freezes corrected succession", () => {
    for (const item of [
      "Slice 2A — Rules/Data Contract Freeze — completed",
      "Slice 2A.1 — this Approval Proof remediation contract",
      "Slice 2B — Firestore Rules implementation + dedicated emulator tests",
      "Slice 3 — Pro Club Onboarding Service",
      "Slice 5 — Organization-aware Onboarding UI",
      "Slice 6 — Pro Club Workspace Entry",
    ]) assert.ok(contract.includes(item));
    assert.ok(predecessor.includes("Slice 2B"));
  });
});
