import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasActiveProClubMembershipAuthority,
  isProClubAuthorizationRole,
  isProClubLevel,
  isProClubMembershipStatus,
  isProClubStaffRole,
  isProClubStatus,
  isValidDocumentIdentifier,
  validateProClub,
  validateProClubMembership,
  validateProClubStaffAssignment,
} from "../src/lib/proClubModel.js";
import type {
  ProClub,
  ProClubAuthorizationRole,
  ProClubMembership,
  ProClubStaffAssignment,
} from "../src/types/ProClub.js";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contract = read("docs/PRO_CLUB_PROVISIONING_V1_CONTRACT_FREEZE.md");
const normalizedContract = contract.replace(/\s+/g, " ");
const firestoreRules = read("firestore.rules");
const proClubTypes = read("src/types/ProClub.ts");
const proClubModel = read("src/lib/proClubModel.ts");
const loginSource = read("src/components/Login.tsx");
const registrationSource = read("src/lib/firestore/registration.ts");
const accountRolePolicy = read("src/lib/accountRolePolicy.ts");

test("Pro Club Provisioning V1 Contract Freeze", async (t) => {
  await t.test("freezes exact baseline, branch scope, and two-file boundary", () => {
    assert.ok(contract.includes("03866126fb98e034a6898b4ff6de99a8210e9f29"));
    assert.ok(contract.includes("https://github.com/Jetsalit/Futverse-app.git"));
    assert.ok(contract.includes("docs/PRO_CLUB_PROVISIONING_V1_CONTRACT_FREEZE.md"));
    assert.ok(contract.includes("tests/proClubProvisioningV1Contract.test.ts"));
    assert.ok(contract.includes("introduce or modify exactly **two** files"));
    assert.ok(contract.includes("No production source file (`src/...`), Firestore Rules (`firestore.rules`)"));
  });

  await t.test("freezes contract decision B (trusted backend) over option A (client SuperAdmin)", () => {
    assert.ok(contract.includes("OPTION B (Trusted Backend / Service Provisioning Boundary) IS SELECTED"));
    assert.ok(contract.includes("Authenticated Privileged SuperAdmin + Strict Firestore Rules + Atomic Client Write"));
    assert.ok(contract.includes("Trusted Backend / Service Provisioning Boundary"));

    for (const criterion of [
      "Security",
      "Privilege Escalation Risk",
      "Atomicity",
      "Auditability",
      "Blast Radius",
      "Credential Exposure",
      "Production Deployment Complexity",
      "Architecture Consistency",
    ]) {
      assert.ok(contract.includes(criterion), `missing evaluation criterion: ${criterion}`);
    }
  });

  await t.test("distinguishes requesting authority from execution authority", () => {
    assert.ok(contract.includes("REQUESTING AUTHORITY != EXECUTION AUTHORITY"));
    assert.ok(contract.includes("Trusted Backend / Service + Admin SDK is EXECUTION BOUNDARY ONLY"));
    assert.ok(contract.includes("Service identity alone is **never** sufficient for business authorization"));
  });

  await t.test("service identity alone cannot authorize provisioning", () => {
    assert.ok(contract.includes("Service identity alone is **never** sufficient for business authorization"));
    assert.ok(
      contract.includes("Service caller without authenticated requesting principal") ||
      contract.includes("service caller without authenticated requesting principal"),
    );
  });

  await t.test("authenticated non-SUPERADMIN cannot provision", () => {
    assert.ok(contract.includes("`role` must strictly equal `\"SUPERADMIN\"`"));
    assert.ok(contract.includes("`ADMIN`, `COACH`, `PLAYER`, `SCOUT`, `PARENT`, or `USER`"));
  });

  await t.test("DATA_ADMIN cannot provision", () => {
    assert.ok(contract.includes("`DATA_ADMIN`"));
    assert.ok(contract.includes("`DATA_ADMIN`, `ADMIN`, `COACH`, `PLAYER`, `SCOUT`, `PARENT`, or `USER`"));
  });

  await t.test("inactive SUPERADMIN cannot provision", () => {
    assert.ok(contract.includes("Explicitly ACTIVE account state: `status` must equal `\"Active\"` or `\"ACTIVE\"`"));
    assert.ok(contract.includes("fail closed if identity, status, or role does not match"));
  });

  await t.test("support-presented SUPERADMIN cannot provision", () => {
    assert.ok(contract.includes("Support presentation (\"Work As Staff\" / impersonation)"));
    assert.ok(contract.includes("`support presentation != authenticated provisioning actor`"));
    assert.ok(contract.includes("SuperAdmin support presentation (\"Work As Staff\") is a read-only presentation mechanism"));
  });

  await t.test("exact authenticated ACTIVE SUPERADMIN is required", () => {
    assert.ok(
      contract.includes("Verified Firebase authenticated UID") ||
      contract.includes("verified Firebase authenticated UID"),
    );
    assert.ok(contract.includes("re-reads canonical `users/{requestingUid}` directly from Firestore server-side"));
    assert.ok(contract.includes("`status` must equal `\"Active\"` or `\"ACTIVE\"`"));
    assert.ok(contract.includes("`role` must strictly equal `\"SUPERADMIN\"`"));
  });

  await t.test("SUPERADMIN control-plane privilege is not tenant membership authority", () => {
    assert.ok(contract.includes("SUPERADMIN here is PLATFORM CONTROL-PLANE AUTHORITY, NOT PRO CLUB TENANT AUTHORITY"));
    assert.ok(contract.includes("users.role must never substitute for: proClubs/{clubId}/members/{uid}"));
    assert.ok(contract.includes("tenant ownership authority derives **exclusively** from canonical `proClubs/{clubId}/members/{ownerUid}`"));
  });

  await t.test("1. public user cannot create Pro Club", () => {
    const proClubRuleStart = firestoreRules.indexOf("match /proClubs/{clubId}");
    assert.ok(proClubRuleStart >= 0, "match /proClubs/{clubId} must exist");
    const ruleSub = firestoreRules.slice(proClubRuleStart, proClubRuleStart + 350);
    assert.match(ruleSub, /allow\s+list,\s*create,\s*update,\s*delete:\s*if\s+false;/);

    assert.ok(contract.includes("match /proClubs/{clubId}`: `allow list, create, update, delete: if false;`"));
    assert.ok(contract.includes("Zero client write surface"));
  });

  await t.test("2. registration intent cannot create Pro Club", () => {
    assert.match(
      accountRolePolicy,
      /\{ value: "COACH", label: "Coach", authority: "MEMBERSHIP" \}/,
    );
    assert.match(loginSource, /REGISTRATION_INTENT_OPTIONS\.map/);
    assert.doesNotMatch(registrationSource, /proClubs/);
    assert.doesNotMatch(loginSource, /collection\(.*["']proClubs["']\)/);

    assert.ok(contract.includes("`PUBLIC REGISTRATION != PRO CLUB CREATION`"));
    assert.ok(contract.includes("Registering as a user or selecting any requested role"));
  });

  await t.test("3. Academy membership cannot provision Pro Club", () => {
    assert.ok(contract.includes("`Academy authority != Pro Club provisioning authority`"));
    assert.ok(contract.includes("Holding any role or membership in an Academy (`academies/{academyId}`) grants zero authority"));

    const clubCtx = { clubId: "club-1", documentId: "club-1" };
    const memberCtx = {
      clubId: "club-1",
      documentClubId: "club-1",
      userId: "user-1",
      documentId: "user-1",
    };
    const validClub = { name: "Fut FC", level: "T1", status: "ACTIVE" } as const;
    const validOwner = { authorizationRole: "OWNER", status: "ACTIVE" } as const;

    assert.equal(
      hasActiveProClubMembershipAuthority(validClub, clubCtx, validOwner, memberCtx),
      true,
    );
    const academyMemberCtx = {
      ...memberCtx,
      clubId: "academies/academy-1",
      documentClubId: "academy-1",
    };
    assert.equal(
      hasActiveProClubMembershipAuthority(validClub, clubCtx, validOwner, academyMemberCtx),
      false,
    );
  });

  await t.test("4. staffRole cannot provision Pro Club", () => {
    assert.ok(contract.includes("`staffRole != authorizationRole`"));
    assert.ok(contract.includes("Functional staff assignment grants no tenant authority"));

    for (const staffRole of [
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "FITNESS_COACH",
      "ANALYST",
      "PHYSIO",
      "TEAM_MANAGER",
      "STAFF",
    ]) {
      assert.equal(isProClubStaffRole(staffRole), true);
      assert.equal(isProClubAuthorizationRole(staffRole), false);
    }
  });

  await t.test("5. support presentation cannot provision Pro Club", () => {
    assert.ok(contract.includes("`support presentation != authenticated provisioning actor`"));
    assert.ok(contract.includes("`currentUser presentation != authenticated actor`"));
    assert.ok(contract.includes("SuperAdmin support presentation (\"Work As Staff\") is a read-only presentation mechanism"));
  });

  await t.test("6. malformed clubId fails", () => {
    assert.ok(contract.includes("Valid and Canonical `clubId`"));
    assert.ok(contract.includes("isValidDocumentIdentifier"));

    assert.equal(isValidDocumentIdentifier("club-lampang-123"), true);
    assert.equal(isValidDocumentIdentifier(""), false);
    assert.equal(isValidDocumentIdentifier("   "), false);
    assert.equal(isValidDocumentIdentifier(" club-123 "), false);
    assert.equal(isValidDocumentIdentifier("club/123"), false);
    assert.equal(isValidDocumentIdentifier(null), false);
    assert.equal(isValidDocumentIdentifier(undefined), false);
    assert.equal(isValidDocumentIdentifier(123), false);
  });

  await t.test("7. existing club cannot be overwritten", () => {
    assert.ok(contract.includes("Forbid Overwriting Existing Clubs (`CREATE_ONLY`)"));
    assert.ok(contract.includes("If `proClubs/{clubId}` already exists, provisioning must fail closed immediately (`ERROR_CLUB_EXISTS`)"));
  });

  await t.test("8. initial membership must be OWNER", () => {
    assert.ok(contract.includes("Initial Owner Membership Exact Contract"));
    assert.ok(contract.includes("`authorizationRole: \"OWNER\"`"));
    assert.ok(contract.includes("Forbid Initial Bootstrap of ADMIN or MEMBER"));

    assert.equal(isProClubAuthorizationRole("OWNER"), true);
    assert.equal(isProClubAuthorizationRole("ADMIN"), true);
    assert.equal(isProClubAuthorizationRole("MEMBER"), true);

    const initialMembershipPayload = {
      authorizationRole: "OWNER",
      status: "ACTIVE",
    };
    assert.equal(initialMembershipPayload.authorizationRole, "OWNER");
    assert.notEqual(initialMembershipPayload.authorizationRole, "ADMIN");
    assert.notEqual(initialMembershipPayload.authorizationRole, "MEMBER");
  });

  await t.test("9. initial membership must be ACTIVE", () => {
    assert.ok(contract.includes("`status: \"ACTIVE\"`"));
    assert.equal(isProClubMembershipStatus("ACTIVE"), true);
    assert.equal(isProClubMembershipStatus("INACTIVE"), true);
    assert.equal(isProClubMembershipStatus("LEFT"), true);
    assert.equal(isProClubMembershipStatus("REVOKED"), true);

    const initialMembershipPayload = {
      authorizationRole: "OWNER",
      status: "ACTIVE",
    };
    assert.equal(initialMembershipPayload.status, "ACTIVE");
  });

  await t.test("10. owner must match exact canonical user", () => {
    assert.ok(contract.includes("Initial Owner Must Be Exact Canonical Existing User"));
    assert.ok(contract.includes("users/{initialOwnerUid}"));
    assert.ok(contract.includes("Bootstrapping a synthetic, missing, or mismatched UID is strictly forbidden"));

    assert.equal(isValidDocumentIdentifier("user-canonical-owner-456"), true);
    assert.equal(isValidDocumentIdentifier(""), false);
  });

  await t.test("11. club + OWNER cannot be split into unsafe partial state", () => {
    assert.ok(contract.includes("Strict 3-Way Atomicity: No Partial State Permitted"));
    assert.ok(contract.includes("Forbidden**: Club exists, but owner membership does not exist"));
    assert.ok(contract.includes("Forbidden**: Owner membership exists, but club does not exist"));
    assert.ok(contract.includes("Forbidden**: Club and owner membership exist, but audit evidence does not exist"));
    assert.ok(contract.includes("If any of the three writes fails, the entire transaction rolls back"));
  });

  await t.test("12. OWNER provisioning does not create staff assignment", () => {
    assert.ok(contract.includes("OWNER Bootstrap Does Not Create Football Staff Assignment"));
    assert.ok(contract.includes("`OWNER != HEAD_COACH`"));
    assert.ok(contract.includes("proClubs/{clubId}/staff/{ownerUid}`. Football staff assignments require separate operational workflows"));
  });

  await t.test("13. provisioning does not create invitation", () => {
    assert.ok(contract.includes("Provisioning Does Not Create Invitations"));
    assert.ok(contract.includes("proClubInvites/{inviteCode}`. Onboarding invitations are issued separately"));
  });

  await t.test("14. provisioning does not fabricate runtime authorization", () => {
    assert.ok(contract.includes("Provisioning Does Not Fabricate Runtime Authorization"));
    assert.ok(contract.includes("does not inject `AUTHORIZED` states into `OrganizationRuntimeContext`"));
  });

  await t.test("15. provisioning does not use users.role as tenant authority", () => {
    assert.ok(contract.includes("`users.role != tenant authority`"));
    assert.ok(contract.includes("global account role (such as `users.role == 'SUPERADMIN'`"));
    assert.ok(contract.includes("cannot be used by client applications to write or manage clubs directly"));
  });

  await t.test("16. audit evidence does not alter exact membership schema", () => {
    assert.ok(contract.includes("Audit Evidence Outside Exact Membership Payload"));
    assert.ok(contract.includes("proClubProvisioningAudits/{provisioningId}"));
    assert.ok(contract.includes("validateProClubMembership"));

    const memberCtx = {
      clubId: "club-1",
      documentClubId: "club-1",
      userId: "user-1",
      documentId: "user-1",
    };

    const exactMembership = {
      authorizationRole: "OWNER",
      status: "ACTIVE",
    };
    assert.equal(validateProClubMembership(exactMembership, memberCtx), true);

    const membershipWithAudit = {
      authorizationRole: "OWNER",
      status: "ACTIVE",
      provisionedAt: "2026-09-04T00:00:00.000Z",
      provisionedBy: "admin",
      auditTraceId: "trace-123",
    };
    assert.equal(validateProClubMembership(membershipWithAudit, memberCtx), false);
  });

  await t.test("audit required in same atomic provisioning transaction", () => {
    assert.ok(contract.includes("Atomic 3-Way Multi-Document Write"));
    assert.ok(contract.includes("`transaction.set(proClubs/{clubId}, clubPayload)`"));
    assert.ok(contract.includes("`transaction.set(proClubs/{clubId}/members/{initialOwnerUid}, membershipPayload)`"));
    assert.ok(contract.includes("`transaction.set(proClubProvisioningAudits/{provisioningId}, auditPayload)`"));
  });

  await t.test("audit requesting actor = exact authenticated ACTIVE SUPERADMIN", () => {
    assert.ok(contract.includes("`requestingSuperAdminUid`: exact authenticated active SuperAdmin principal"));
    assert.ok(contract.includes("\"requestingSuperAdminUid\": \"user-superadmin-789\""));
  });

  await t.test("audit clubId/ownerUid exactly bind created resources", () => {
    assert.ok(contract.includes("`clubId`: exact canonical club ID"));
    assert.ok(contract.includes("`ownerUid`: exact canonical owner UID"));
    assert.ok(contract.includes("`provisioningId`: matches the document ID and unique request token"));
  });

  await t.test("audit is immutable and closed to client access", () => {
    assert.ok(contract.includes("Audit documents are **immutable** in V1"));
    assert.ok(contract.includes("Audit collection is **closed to client access**"));
  });

  await t.test("missing audit means provisioning transaction is invalid", () => {
    assert.ok(contract.includes("Forbidden**: Club and owner membership exist, but audit evidence does not exist"));
    assert.ok(contract.includes("If any of the three writes fails, the entire transaction rolls back"));
  });

  await t.test("server logs alone are not canonical provisioning audit evidence", () => {
    assert.ok(contract.includes("Server Logs Alone Are Not Canonical Audit Evidence"));
    assert.ok(contract.includes("Provisioning audit evidence must be persisted as an immutable Firestore document in `proClubProvisioningAudits/{provisioningId}`"));
    assert.doesNotMatch(contract, /or server logs/);
    assert.doesNotMatch(contract, /\(e\.g\.\s*proClubProvisioningAudits/);
  });

  await t.test("17. replay/takeover behavior fails closed", () => {
    assert.ok(contract.includes("Replay Safety, Conflict, and Takeover Prevention"));
    assert.ok(contract.includes("Binding Replay Detection"));
    assert.ok(contract.includes("Same Request Retry"));
    assert.ok(contract.includes("Provisioning ID Conflict"));
    assert.ok(contract.includes("Existing Club Takeover Prevention"));
    assert.ok(contract.includes("Existing Owner Replacement Prevention"));
    assert.ok(contract.includes("Cross-Club Tenant Isolation"));
  });

  await t.test("same request retry does not create second tenant or owner", () => {
    assert.ok(
      contract.includes("A repeated request with identical `provisioningId`, `clubId`, `ownerUid`, and `requestingSuperAdminUid`") &&
      contract.includes("returning idempotently without duplicate writes"),
    );
  });

  await t.test("same provisioningId with different identity fails closed", () => {
    assert.ok(contract.includes("Reusing an existing `provisioningId` with altered `clubId`, `ownerUid`, or `requestingSuperAdminUid` fails closed immediately (`ERROR_PROVISIONING_ID_CONFLICT`)"));
  });

  await t.test("exact completed retry returns idempotently before club-exists conflict", () => {
    assert.ok(contract.includes("Exact Decision Ordering"));
    assert.ok(contract.includes("Audit check and replay verification occur before club-exists conflict detection, ensuring exact completed retries return idempotently before triggering conflicts"));
    assert.ok(contract.includes("RETURN existing COMPLETED result idempotently"));
    assert.ok(contract.includes("NO WRITE is performed"));
  });

  await t.test("existing audit + missing club fails integrity", () => {
    assert.ok(contract.includes("If club is missing, OWNER is missing, or payload mismatches -> FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`)"));
    assert.ok(contract.includes("Read `proClubs/{clubId}` and `proClubs/{clubId}/members/{initialOwnerUid}`"));
    assert.ok(contract.includes("Both documents must exist"));
  });

  await t.test("existing audit + missing OWNER fails integrity", () => {
    assert.ok(contract.includes("If club is missing, OWNER is missing, or payload mismatches -> FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`)"));
    assert.ok(contract.includes("Both documents must exist"));
  });

  await t.test("existing audit + wrong OWNER payload fails integrity", () => {
    assert.ok(contract.includes("Membership payload must exactly match `{ authorizationRole: \"OWNER\", status: \"ACTIVE\" }`"));
    assert.ok(contract.includes("If club is missing, OWNER is missing, or payload mismatches -> FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`)"));
  });

  await t.test("orphan OWNER membership without audit fails integrity", () => {
    assert.ok(contract.includes("If `proClubs/{clubId}/members/{initialOwnerUid}` exists without a valid matching provisioning audit:"));
    assert.ok(contract.includes("FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`)"));
    assert.ok(contract.includes("Orphan or pre-existing OWNER membership without valid audit evidence is an integrity violation"));
  });

  await t.test("audit alone can never prove successful provisioning", () => {
    assert.ok(contract.includes("**Audit alone can never prove successful provisioning.**"));
    assert.ok(contract.includes("Only when audit, Club, and OWNER all match completely:"));
  });

  await t.test("18. contract alone does not authorize production implementation", () => {
    assert.ok(contract.includes("Contract Freeze Scope Boundary"));
    assert.ok(contract.includes("This contract slice is documentation and contract tests only"));
    assert.ok(contract.includes("It does NOT authorize production implementation, client write paths, or deployment"));
  });
});
