import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSuperAdminAccountOrganizationPresentation,
} from "../src/components/superadmin/superAdminAccountOrganizationPresentation";
import type {
  SuperAdminOrganizationRelationship,
  SuperAdminUserRelationshipRow,
} from "../src/lib/superAdminRelationshipReadModel";

function relationship(
  overrides: Partial<SuperAdminOrganizationRelationship> = {},
): SuperAdminOrganizationRelationship {
  return {
    organizationId: "academy-talumball",
    organizationName: "Talumball Academy",
    organizationType: "ACADEMY",
    relationship: "COACH",
    relationshipStatus: "ACTIVE",
    source: "CANONICAL",
    evidenceKind: "STAFF_MEMBERSHIP",
    isCurrent: true,
    membershipSource: "INVITE",
    ...overrides,
  };
}

function row(
  overrides: Partial<SuperAdminUserRelationshipRow> = {},
): SuperAdminUserRelationshipRow {
  return {
    userId: "user-1",
    name: "Coach Ton",
    email: "coach@example.com",
    accountRole: "COACH",
    accountStatus: "ACTIVE",
    organizations: [relationship()],
    source: "CANONICAL",
    integrity: "VERIFIED",
    issues: [],
    ...overrides,
  };
}

describe("superAdminAccountOrganizationPresentation", () => {
  it("1. presents an active canonical staff membership as current organization authority", () => {
    const result = buildSuperAdminAccountOrganizationPresentation(row());

    assert.equal(result.accountRole, "COACH");
    assert.equal(result.source, "CANONICAL");
    assert.equal(result.integrity, "VERIFIED");
    assert.equal(result.current.length, 1);
    assert.equal(result.historical.length, 0);

    assert.deepEqual(result.current[0], {
      organizationId: "academy-talumball",
      organizationName: "Talumball Academy",
      organizationType: "ACADEMY",
      role: "COACH",
      status: "ACTIVE",
      evidenceKind: "STAFF_MEMBERSHIP",
      state: "CURRENT",
      playerId: undefined,
      futId: undefined,
      playerName: undefined,
    });
  });

  it("2. preserves multiple organization relationships for one account", () => {
    const result = buildSuperAdminAccountOrganizationPresentation(
      row({
        organizations: [
          relationship(),
          relationship({
            organizationId: "academy-b",
            organizationName: "Academy B",
            relationship: "ADMIN",
            membershipSource: "SUPERADMIN_ASSIGNMENT",
          }),
        ],
      }),
    );

    assert.equal(result.current.length, 2);
    assert.deepEqual(
      result.current.map((item) => item.organizationId),
      ["academy-talumball", "academy-b"],
    );
    assert.deepEqual(
      result.current.map((item) => item.role),
      ["COACH", "ADMIN"],
    );
  });

  it("3. keeps LEFT membership as historical and never current", () => {
    const result = buildSuperAdminAccountOrganizationPresentation(
      row({
        organizations: [
          relationship({
            relationshipStatus: "LEFT",
            isCurrent: false,
          }),
        ],
      }),
    );

    assert.equal(result.current.length, 0);
    assert.equal(result.historical.length, 1);
    assert.equal(result.historical[0]?.status, "LEFT");
    assert.equal(result.historical[0]?.state, "HISTORICAL");
  });

  it("4. preserves Parent player identity and FUTID context", () => {
    const result = buildSuperAdminAccountOrganizationPresentation(
      row({
        accountRole: "PARENT",
        organizations: [
          relationship({
            relationship: "PARENT",
            evidenceKind: "PLAYER_ASSOCIATION",
            membershipSource: undefined,
            playerId: "player-1",
            futId: "FUT-26-K2KNB8",
            playerName: "Player One",
          }),
        ],
      }),
    );

    assert.equal(result.current.length, 1);
    assert.equal(result.current[0]?.role, "PARENT");
    assert.equal(result.current[0]?.evidenceKind, "PLAYER_ASSOCIATION");
    assert.equal(result.current[0]?.playerId, "player-1");
    assert.equal(result.current[0]?.futId, "FUT-26-K2KNB8");
    assert.equal(result.current[0]?.playerName, "Player One");
  });

  it("5. legacy-only evidence never becomes organization authority", () => {
    const result = buildSuperAdminAccountOrganizationPresentation(
      row({
        organizations: [],
        source: "LEGACY_COMPATIBLE",
        integrity: "REVIEW_REQUIRED",
        legacyEvidence: {
          academyId: "legacy-academy",
          activeAcademyId: "legacy-academy",
          tenantRole: "ADMIN",
        },
      }),
    );

    assert.equal(result.current.length, 0);
    assert.equal(result.historical.length, 0);
    assert.equal(result.source, "LEGACY_COMPATIBLE");
    assert.equal(result.integrity, "REVIEW_REQUIRED");
    assert.equal(result.presentationState, "LEGACY_REVIEW_REQUIRED");
  });

  it("6. canonical conflict remains explicitly visible", () => {
    const result = buildSuperAdminAccountOrganizationPresentation(
      row({
        integrity: "CONFLICT",
        issues: ["CONFLICTING_STAFF_MEMBERSHIP_EVIDENCE"],
      }),
    );

    assert.equal(result.presentationState, "CONFLICT");
    assert.equal(result.integrity, "CONFLICT");
    assert.deepEqual(result.issues, [
      "CONFLICTING_STAFF_MEMBERSHIP_EVIDENCE",
    ]);
  });

  it("7. account with no relationship evidence is explicitly unassigned", () => {
    const result = buildSuperAdminAccountOrganizationPresentation(
      row({
        organizations: [],
        source: "UNASSIGNED",
        integrity: "UNASSIGNED",
      }),
    );

    assert.equal(result.current.length, 0);
    assert.equal(result.historical.length, 0);
    assert.equal(result.presentationState, "UNASSIGNED");
  });

  it("8. account role and organization role remain separate concepts", () => {
    const result = buildSuperAdminAccountOrganizationPresentation(
      row({
        accountRole: "COACH",
        organizations: [
          relationship({
            relationship: "ADMIN",
          }),
        ],
      }),
    );

    assert.equal(result.accountRole, "COACH");
    assert.equal(result.current[0]?.role, "ADMIN");
    assert.notEqual(result.accountRole, result.current[0]?.role);
  });

  it("9. inconsistent upstream state fails closed as review required", () => {
    const result = buildSuperAdminAccountOrganizationPresentation(
      row({
        source: "CANONICAL",
        integrity: "UNASSIGNED",
        organizations: [relationship()],
      }),
    );

    assert.equal(result.current.length, 1);
    assert.equal(result.presentationState, "REVIEW_REQUIRED");
  });
});
