import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  currentSuperAdminOrganizationRelationships,
  isExactReadModelDocumentId,
  resolveSuperAdminUserRelationshipRow,
  type SuperAdminNonStaffAssociationInput,
  type SuperAdminStaffMembershipInput,
} from "../src/lib/superAdminRelationshipReadModel";

const userId = "user-123";
const academyA = "academy-a";
const academyB = "academy-b";

function staffMembership(
  overrides: Partial<SuperAdminStaffMembershipInput> = {},
): SuperAdminStaffMembershipInput {
  return {
    documentId: userId,
    userId,
    academyId: academyA,
    role: "ADMIN",
    status: "ACTIVE",
    source: "SUPERADMIN_ASSIGNMENT",
    organizationName: "Academy A",
    ...overrides,
  };
}

function nonStaffAssociation(
  overrides: Partial<SuperAdminNonStaffAssociationInput> = {},
): SuperAdminNonStaffAssociationInput {
  return {
    documentId: "player-1",
    userId,
    academyId: academyA,
    playerId: "player-1",
    role: "PARENT",
    status: "ACTIVE",
    organizationName: "Academy A",
    futId: "FUT-0001",
    playerName: "Player One",
    ...overrides,
  };
}

describe("superAdminRelationshipReadModel", () => {
  it("1. accepts exact Firestore document IDs and rejects malformed IDs", () => {
    assert.equal(isExactReadModelDocumentId("abc-123"), true);
    assert.equal(isExactReadModelDocumentId(""), false);
    assert.equal(isExactReadModelDocumentId(" abc"), false);
    assert.equal(isExactReadModelDocumentId("academies/abc"), false);
  });

  it("2. resolves ACTIVE ADMIN membership as canonical verified relationship", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: {
        userId,
        name: "Admin One",
        accountRole: "ADMIN",
        accountStatus: "ACTIVE",
      },
      staffMemberships: [staffMembership()],
    });

    assert.equal(row.source, "CANONICAL");
    assert.equal(row.integrity, "VERIFIED");
    assert.equal(row.organizations.length, 1);
    assert.deepEqual(row.organizations[0], {
      organizationId: academyA,
      organizationName: "Academy A",
      organizationType: "ACADEMY",
      relationship: "ADMIN",
      relationshipStatus: "ACTIVE",
      source: "CANONICAL",
      evidenceKind: "STAFF_MEMBERSHIP",
      isCurrent: true,
      membershipSource: "SUPERADMIN_ASSIGNMENT",
    });
  });

  it("3. resolves ACTIVE COACH membership canonically", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "COACH", accountStatus: "ACTIVE" },
      staffMemberships: [staffMembership({ role: "COACH", source: "INVITE" })],
    });

    assert.equal(row.integrity, "VERIFIED");
    assert.equal(row.organizations[0]?.relationship, "COACH");
    assert.equal(row.organizations[0]?.membershipSource, "INVITE");
  });

  it("4. preserves LEFT staff membership as historical, not current", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "COACH", accountStatus: "ACTIVE" },
      staffMemberships: [staffMembership({ role: "COACH", status: "LEFT" })],
    });

    assert.equal(row.source, "CANONICAL");
    assert.equal(row.integrity, "VERIFIED");
    assert.equal(row.organizations[0]?.relationshipStatus, "LEFT");
    assert.equal(row.organizations[0]?.isCurrent, false);
    assert.equal(currentSuperAdminOrganizationRelationships(row).length, 0);
  });

  it("5. preserves multiple organization memberships for one staff account", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "COACH", accountStatus: "ACTIVE" },
      staffMemberships: [
        staffMembership({ role: "COACH", academyId: academyA }),
        staffMembership({
          role: "COACH",
          academyId: academyB,
          organizationName: "Academy B",
        }),
      ],
    });

    assert.equal(row.integrity, "VERIFIED");
    assert.equal(row.organizations.length, 2);
    assert.deepEqual(
      currentSuperAdminOrganizationRelationships(row).map((item) =>
        item.organizationId,
      ),
      [academyA, academyB],
    );
  });

  it("6. resolves PARENT association with linked player context without staff membership", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: {
        userId,
        name: "Parent One",
        accountRole: "PARENT",
        accountStatus: "ACTIVE",
      },
      nonStaffAssociations: [nonStaffAssociation()],
    });

    assert.equal(row.source, "CANONICAL");
    assert.equal(row.integrity, "VERIFIED");
    assert.equal(row.organizations[0]?.relationship, "PARENT");
    assert.equal(row.organizations[0]?.evidenceKind, "PLAYER_ASSOCIATION");
    assert.equal(row.organizations[0]?.playerId, "player-1");
    assert.equal(row.organizations[0]?.futId, "FUT-0001");
    assert.equal(row.organizations[0]?.playerName, "Player One");
  });

  it("7. resolves PLAYER association canonically", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "PLAYER", accountStatus: "ACTIVE" },
      nonStaffAssociations: [
        nonStaffAssociation({ role: "PLAYER", playerName: "Self Player" }),
      ],
    });

    assert.equal(row.integrity, "VERIFIED");
    assert.equal(row.organizations[0]?.relationship, "PLAYER");
    assert.equal(row.organizations[0]?.playerName, "Self Player");
  });

  it("8. rejects nonstaff association when account role does not match association role", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "PARENT", accountStatus: "ACTIVE" },
      nonStaffAssociations: [nonStaffAssociation({ role: "PLAYER" })],
    });

    assert.equal(row.source, "UNASSIGNED");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.deepEqual(row.organizations, []);
    assert.deepEqual(row.issues, ["INVALID_NONSTAFF_ASSOCIATION_EVIDENCE"]);
  });

  it("9. classifies legacy-only relationship evidence as legacy compatible and review required", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "ADMIN", accountStatus: "ACTIVE" },
      legacyEvidence: {
        academyId: academyA,
        activeAcademyId: academyA,
        tenantRole: "ADMIN",
      },
    });

    assert.equal(row.source, "LEGACY_COMPATIBLE");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.equal(row.organizations.length, 0);
    assert.equal(row.legacyEvidence?.academyId, academyA);
  });

  it("10. canonical relationship remains authoritative when compatible legacy evidence also exists", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "ADMIN", accountStatus: "ACTIVE" },
      staffMemberships: [staffMembership()],
      legacyEvidence: {
        academyId: academyA,
        activeAcademyId: academyA,
        tenantRole: "ADMIN",
      },
    });

    assert.equal(row.source, "CANONICAL");
    assert.equal(row.integrity, "VERIFIED");
    assert.deepEqual(row.issues, []);
  });

  it("11. divergent legacy organization never overrides canonical and triggers review", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "ADMIN", accountStatus: "ACTIVE" },
      staffMemberships: [staffMembership()],
      legacyEvidence: {
        academyId: "legacy-academy",
        tenantRole: "ADMIN",
      },
    });

    assert.equal(row.source, "CANONICAL");
    assert.equal(row.organizations[0]?.organizationId, academyA);
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.ok(row.issues.includes("LEGACY_ORGANIZATION_DIVERGES"));
  });

  it("12. divergent legacy tenant role never overrides canonical and triggers review", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "ADMIN", accountStatus: "ACTIVE" },
      staffMemberships: [staffMembership()],
      legacyEvidence: {
        academyId: academyA,
        tenantRole: "COACH",
      },
    });

    assert.equal(row.organizations[0]?.relationship, "ADMIN");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.ok(row.issues.includes("LEGACY_TENANT_ROLE_DIVERGES"));
  });

  it("13. divergent legacy player link never overrides canonical association", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "PARENT", accountStatus: "ACTIVE" },
      nonStaffAssociations: [nonStaffAssociation()],
      legacyEvidence: {
        academyId: academyA,
        linkedPlayerId: "old-player",
      },
    });

    assert.equal(row.organizations[0]?.playerId, "player-1");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.ok(row.issues.includes("LEGACY_PLAYER_LINK_DIVERGES"));
  });

  it("14. conflicting canonical staff evidence produces CONFLICT", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "ADMIN", accountStatus: "ACTIVE" },
      staffMemberships: [
        staffMembership({ role: "ADMIN" }),
        staffMembership({ role: "COACH" }),
      ],
    });

    assert.equal(row.source, "CANONICAL");
    assert.equal(row.integrity, "CONFLICT");
    assert.ok(row.issues.includes("CONFLICTING_STAFF_MEMBERSHIP_EVIDENCE"));
  });

  it("15. exact duplicate canonical evidence is deduplicated without conflict", () => {
    const duplicate = staffMembership();
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "ADMIN", accountStatus: "ACTIVE" },
      staffMemberships: [duplicate, { ...duplicate }],
    });

    assert.equal(row.integrity, "VERIFIED");
    assert.equal(row.organizations.length, 1);
  });

  it("16. invalid membership document identity is review required and never canonical", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: { userId, accountRole: "ADMIN", accountStatus: "ACTIVE" },
      staffMemberships: [staffMembership({ documentId: "different-user" })],
    });

    assert.equal(row.source, "UNASSIGNED");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.deepEqual(row.organizations, []);
    assert.ok(row.issues.includes("INVALID_STAFF_MEMBERSHIP_EVIDENCE"));
  });

  it("17. account with no authoritative or legacy relationship is unassigned", () => {
    const row = resolveSuperAdminUserRelationshipRow({
      account: {
        userId,
        name: "Unassigned User",
        accountStatus: "ACTIVE",
      },
    });

    assert.equal(row.source, "UNASSIGNED");
    assert.equal(row.integrity, "UNASSIGNED");
    assert.deepEqual(row.organizations, []);
    assert.deepEqual(row.issues, []);
  });

  it("18. preserves historical last-known account activity without interpreting presence", () => {
    const lastLogin = "2026-08-20T10:00:00.000Z";
    const row = resolveSuperAdminUserRelationshipRow({
      account: {
        userId,
        accountStatus: "ACTIVE",
        lastKnownAccountActivity: lastLogin,
      },
    });

    assert.equal(row.lastKnownAccountActivity, lastLogin);
    assert.equal("online" in row, false);
  });

  it("19. malformed account userId fails closed", () => {
    assert.throws(
      () =>
        resolveSuperAdminUserRelationshipRow({
          account: { userId: "users/user-123" },
        }),
      /requires an exact userId/,
    );
  });
});
