import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSuperAdminAccountOrganizationContext,
} from "../src/components/superadmin/superAdminAccountOrganizationContext";

import type {
  SuperAdminUserRelationshipRow,
} from "../src/lib/superAdminRelationshipReadModel";

function verifiedCoachRow(
  overrides: Partial<SuperAdminUserRelationshipRow> = {},
): SuperAdminUserRelationshipRow {
  return {
    userId: "user-1",
    name: "Coach Ton",
    email: "coach@example.com",
    accountRole: "COACH",
    accountStatus: "ACTIVE",
    organizations: [
      {
        organizationId: "academy-talumball",
        organizationName: "Talumball Academy",
        organizationType: "ACADEMY",
        relationship: "COACH",
        relationshipStatus: "ACTIVE",
        source: "CANONICAL",
        evidenceKind: "STAFF_MEMBERSHIP",
        isCurrent: true,
        membershipSource: "INVITE",
      },
    ],
    source: "CANONICAL",
    integrity: "VERIFIED",
    issues: [],
    ...overrides,
  };
}

describe("superAdminAccountOrganizationContext", () => {
  it("1. READY inventory presents canonical Academy authority without claiming Pro Club coverage", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "user-1",
      inventoryState: "READY",
      row: verifiedCoachRow(),
    });

    assert.equal(result.state, "READY");
    assert.deepEqual(result.coverage, {
      academyAuthority: "AVAILABLE",
      proClubAuthority: "NOT_CONNECTED",
    });

    if (result.state !== "READY") {
      assert.fail("Expected READY organization context");
    }

    assert.equal(result.presentation.presentationState, "VERIFIED");
    assert.equal(result.presentation.current.length, 1);
    assert.equal(
      result.presentation.current[0]?.organizationId,
      "academy-talumball",
    );
    assert.equal(
      result.presentation.current[0]?.organizationType,
      "ACADEMY",
    );
  });

  it("2. genuine authoritative UNASSIGNED row remains explicitly unassigned", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "user-1",
      inventoryState: "READY",
      row: verifiedCoachRow({
        organizations: [],
        source: "UNASSIGNED",
        integrity: "UNASSIGNED",
      }),
    });

    assert.equal(result.state, "READY");

    if (result.state !== "READY") {
      assert.fail("Expected READY organization context");
    }

    assert.equal(result.presentation.presentationState, "UNASSIGNED");
    assert.equal(result.presentation.current.length, 0);
    assert.equal(result.presentation.historical.length, 0);
    assert.equal(result.coverage.proClubAuthority, "NOT_CONNECTED");
  });

  it("3. live account missing from a READY inventory fails closed as OUT_OF_SYNC", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "new-user-not-in-snapshot",
      inventoryState: "READY",
      row: undefined,
    });

    assert.equal(result.state, "OUT_OF_SYNC");

    if (result.state !== "OUT_OF_SYNC") {
      assert.fail("Expected OUT_OF_SYNC organization context");
    }

    assert.deepEqual(result.coverage, {
      academyAuthority: "AVAILABLE",
      proClubAuthority: "NOT_CONNECTED",
    });

    assert.match(result.reason, /refresh|snapshot|inventory/i);
  });

  it("4. missing inventory row must never be silently converted to UNASSIGNED", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "new-user-not-in-snapshot",
      inventoryState: "READY",
      row: undefined,
    });

    assert.notEqual(result.state, "READY");

    if (result.state === "READY") {
      assert.notEqual(
        result.presentation.presentationState,
        "UNASSIGNED",
      );
    }
  });

  it("5. loading authoritative inventory exposes loading Academy coverage", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "user-1",
      inventoryState: "LOADING",
    });

    assert.equal(result.state, "LOADING");
    assert.deepEqual(result.coverage, {
      academyAuthority: "LOADING",
      proClubAuthority: "NOT_CONNECTED",
    });
  });

  it("6. unavailable authoritative inventory fails closed and does not fabricate authority", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "user-1",
      inventoryState: "UNAVAILABLE",
    });

    assert.equal(result.state, "UNAVAILABLE");
    assert.deepEqual(result.coverage, {
      academyAuthority: "UNAVAILABLE",
      proClubAuthority: "NOT_CONNECTED",
    });
  });

  it("7. legacy evidence may be presented for review but never becomes current organization authority", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "user-1",
      inventoryState: "READY",
      row: verifiedCoachRow({
        organizations: [],
        source: "LEGACY_COMPATIBLE",
        integrity: "REVIEW_REQUIRED",
        legacyEvidence: {
          academyId: "legacy-academy",
          activeAcademyId: "legacy-academy",
          tenantRole: "COACH",
        },
        issues: ["LEGACY_ONLY_RELATIONSHIP_EVIDENCE"],
      }),
    });

    assert.equal(result.state, "READY");

    if (result.state !== "READY") {
      assert.fail("Expected READY organization context");
    }

    assert.equal(
      result.presentation.presentationState,
      "LEGACY_REVIEW_REQUIRED",
    );
    assert.equal(result.presentation.current.length, 0);
  });

  it("8. V1 coverage must explicitly keep Pro Club authority unconnected", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "user-1",
      inventoryState: "READY",
      row: verifiedCoachRow(),
    });

    assert.equal(
      result.coverage.proClubAuthority,
      "NOT_CONNECTED",
    );

    assert.notEqual(
      result.coverage.proClubAuthority,
      "AVAILABLE",
    );
  });

  it("9. missing requested account identity fails closed", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "",
      inventoryState: "READY",
      row: verifiedCoachRow(),
    });

    assert.equal(result.state, "OUT_OF_SYNC");

    if (result.state !== "OUT_OF_SYNC") {
      assert.fail("Expected OUT_OF_SYNC for missing account identity");
    }

    assert.match(result.reason, /identity|refresh/i);
    assert.deepEqual(result.coverage, {
      academyAuthority: "AVAILABLE",
      proClubAuthority: "NOT_CONNECTED",
    });
  });

  it("10. relationship row for another account fails closed", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "user-1",
      inventoryState: "READY",
      row: verifiedCoachRow({
        userId: "different-user",
      }),
    });

    assert.equal(result.state, "OUT_OF_SYNC");

    if (result.state !== "OUT_OF_SYNC") {
      assert.fail("Expected OUT_OF_SYNC for mismatched account identity");
    }

    assert.match(result.reason, /match|account|refresh/i);
    assert.deepEqual(result.coverage, {
      academyAuthority: "AVAILABLE",
      proClubAuthority: "NOT_CONNECTED",
    });
  });

  it("11. Pro Club evidence cannot become authority before Pro Club coverage is connected", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "user-1",
      inventoryState: "READY",
      row: verifiedCoachRow({
        organizations: [
          {
            organizationId: "club-lampang",
            organizationName: "Lampang FC",
            organizationType: "PRO_CLUB",
            relationship: "COACH",
            relationshipStatus: "ACTIVE",
            source: "CANONICAL",
            evidenceKind: "STAFF_MEMBERSHIP",
            isCurrent: true,
            membershipSource: "SUPERADMIN_ASSIGNMENT",
          },
        ],
      }),
    });

    assert.equal(result.state, "OUT_OF_SYNC");

    if (result.state !== "OUT_OF_SYNC") {
      assert.fail(
        "Expected OUT_OF_SYNC while Pro Club authority is not connected",
      );
    }

    assert.equal(
      result.coverage.proClubAuthority,
      "NOT_CONNECTED",
    );

    assert.match(
      result.reason,
      /outside|coverage|academy/i,
    );
  });

  it("12. unknown organization evidence fails closed", () => {
    const result = buildSuperAdminAccountOrganizationContext({
      userId: "user-1",
      inventoryState: "READY",
      row: verifiedCoachRow({
        organizations: [
          {
            organizationId: "unknown-org",
            organizationName: "Unknown Organization",
            organizationType: "UNKNOWN",
            relationship: "COACH",
            relationshipStatus: "ACTIVE",
            source: "CANONICAL",
            evidenceKind: "STAFF_MEMBERSHIP",
            isCurrent: true,
            membershipSource: "INVITE",
          },
        ],
      }),
    });

    assert.equal(result.state, "OUT_OF_SYNC");

    if (result.state !== "OUT_OF_SYNC") {
      assert.fail(
        "Expected OUT_OF_SYNC for unsupported organization evidence",
      );
    }

    assert.equal(
      result.coverage.proClubAuthority,
      "NOT_CONNECTED",
    );
  });
});
