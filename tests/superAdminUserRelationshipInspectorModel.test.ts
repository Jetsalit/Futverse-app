import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import type {
  SuperAdminUserRelationshipRow,
} from "../src/lib/superAdminRelationshipReadModel";

const repoRoot = process.cwd();

const modulePath = path.join(
  repoRoot,
  "src/components/superadmin/superAdminUserRelationshipInspectorModel.ts",
);

async function loadInspectorModule() {
  assert.equal(
    fs.existsSync(modulePath),
    true,
    "2C.2A inspector model must exist before this contract can pass",
  );

  return import(pathToFileURL(modulePath).href);
}

function coverage() {
  return {
    academyAuthority: "AVAILABLE",
    proClubAuthority: "NOT_CONNECTED",
  };
}

function readyContext({
  userId = "user-1",
  source = "CANONICAL",
  integrity = "VERIFIED",
  presentationState = "VERIFIED",
}: {
  userId?: string;
  source?: string;
  integrity?: string;
  presentationState?: string;
} = {}) {
  return {
    state: "READY",
    coverage: coverage(),
    presentation: {
      userId,
      name: "Example User",
      email: "user@example.com",
      accountRole: "USER",
      accountStatus: "ACTIVE",
      source,
      integrity,
      presentationState,
      current: [],
      historical: [],
      issues: [],
    },
  };
}

function verifiedStaffRow(): SuperAdminUserRelationshipRow {
  return {
    userId: "user-1",
    name: "Example User",
    email: "user@example.com",
    accountRole: "USER",
    accountStatus: "ACTIVE",
    organizations: [
      {
        organizationId: "academy-a",
        organizationName: "Academy A",
        organizationType: "ACADEMY",
        relationship: "COACH",
        relationshipStatus: "ACTIVE",
        source: "CANONICAL",
        evidenceKind: "STAFF_MEMBERSHIP",
        isCurrent: true,
        membershipSource: "SUPERADMIN_ASSIGNMENT",
      },
    ],
    source: "CANONICAL",
    integrity: "VERIFIED",
    legacyEvidence: undefined,
    lastKnownAccountActivity: "2026-08-22T10:00:00Z",
    issues: [],
  };
}

describe("SuperAdmin User Relationship Inspector Model", () => {
  it("1. is a pure presentation model with no Firebase or persistence ownership", async () => {
    await loadInspectorModule();

    const source = fs
      .readFileSync(modulePath, "utf8")
      .replace(/\r\n/g, "\n");

    assert.doesNotMatch(
      source,
      /firebase|firestore|getDocs|getDoc\(|setDoc\(|updateDoc\(|deleteDoc\(|runTransaction|writeBatch|loadSuperAdminRelationshipInventory/i,
      "Inspector model must never own authoritative reads or writes",
    );

    assert.match(
      source,
      /buildSuperAdminUserRelationshipInspectorModel/,
      "Inspector model must expose one narrow pure builder",
    );
  });

  it("2. resolves verified canonical current staff authority while preserving evidence metadata", async () => {
    const {
      buildSuperAdminUserRelationshipInspectorModel,
    } = await loadInspectorModule();

    const result =
      buildSuperAdminUserRelationshipInspectorModel({
        userId: "user-1",
        context: readyContext(),
        row: verifiedStaffRow(),
      });

    assert.equal(result.state, "READY");
    assert.equal(result.authorityState, "RESOLVED");
    assert.equal(result.source, "CANONICAL");
    assert.equal(result.integrity, "VERIFIED");

    assert.equal(result.currentEvidence.length, 1);
    assert.equal(result.resolvedAuthority.length, 1);
    assert.equal(result.historical.length, 0);

    assert.equal(
      result.resolvedAuthority[0].organizationId,
      "academy-a",
    );
    assert.equal(
      result.resolvedAuthority[0].role,
      "COACH",
    );
    assert.equal(
      result.resolvedAuthority[0].status,
      "ACTIVE",
    );
    assert.equal(
      result.resolvedAuthority[0].membershipSource,
      "SUPERADMIN_ASSIGNMENT",
    );
  });

  it("3. preserves multiple current and historical organization relationships without collapsing them", async () => {
    const {
      buildSuperAdminUserRelationshipInspectorModel,
    } = await loadInspectorModule();

    const row = verifiedStaffRow();

    row.organizations = [
      row.organizations[0],
      {
        organizationId: "academy-b",
        organizationName: "Academy B",
        organizationType: "ACADEMY",
        relationship: "ADMIN",
        relationshipStatus: "ACTIVE",
        source: "CANONICAL",
        evidenceKind: "STAFF_MEMBERSHIP",
        isCurrent: true,
        membershipSource: "INVITE",
      },
      {
        organizationId: "academy-old",
        organizationName: "Former Academy",
        organizationType: "ACADEMY",
        relationship: "COACH",
        relationshipStatus: "LEFT",
        source: "CANONICAL",
        evidenceKind: "STAFF_MEMBERSHIP",
        isCurrent: false,
        membershipSource: "CLAIM_APPROVAL",
      },
    ];

    const result =
      buildSuperAdminUserRelationshipInspectorModel({
        userId: "user-1",
        context: readyContext(),
        row,
      });

    assert.equal(result.state, "READY");
    assert.equal(result.currentEvidence.length, 2);
    assert.equal(result.resolvedAuthority.length, 2);
    assert.equal(result.historical.length, 1);

    assert.deepEqual(
      result.resolvedAuthority.map(
        (item: { organizationId: string }) =>
          item.organizationId,
      ),
      ["academy-a", "academy-b"],
    );

    assert.equal(
      result.historical[0].organizationId,
      "academy-old",
    );

    assert.equal(
      result.historical[0].status,
      "LEFT",
    );
  });

  it("4. preserves Parent player identity and FUTID evidence without turning account role into organization authority", async () => {
    const {
      buildSuperAdminUserRelationshipInspectorModel,
    } = await loadInspectorModule();

    const row = verifiedStaffRow();

    row.accountRole = "PARENT";
    row.organizations = [
      {
        organizationId: "academy-a",
        organizationName: "Academy A",
        organizationType: "ACADEMY",
        relationship: "PARENT",
        relationshipStatus: "ACTIVE",
        source: "CANONICAL",
        evidenceKind: "PLAYER_ASSOCIATION",
        isCurrent: true,
        playerId: "player-123",
        futId: "FUT-000123",
        playerName: "Player Example",
      },
    ];

    const result =
      buildSuperAdminUserRelationshipInspectorModel({
        userId: "user-1",
        context: readyContext(),
        row,
      });

    assert.equal(result.state, "READY");
    assert.equal(result.resolvedAuthority.length, 1);

    assert.equal(
      result.resolvedAuthority[0].role,
      "PARENT",
    );
    assert.equal(
      result.resolvedAuthority[0].playerId,
      "player-123",
    );
    assert.equal(
      result.resolvedAuthority[0].futId,
      "FUT-000123",
    );
    assert.equal(
      result.resolvedAuthority[0].playerName,
      "Player Example",
    );

    assert.notEqual(
      result.resolvedAuthority[0].role,
      row.accountRole === "USER"
        ? row.accountRole
        : "USER",
      "organization authority must come from relationship evidence, not account role",
    );
  });

  it("5. keeps conflicting canonical evidence visible but resolves no Current Authority", async () => {
    const {
      buildSuperAdminUserRelationshipInspectorModel,
    } = await loadInspectorModule();

    const row = verifiedStaffRow();

    row.integrity = "CONFLICT";
    row.issues = [
      "CONFLICTING_STAFF_MEMBERSHIP_EVIDENCE",
    ];

    const result =
      buildSuperAdminUserRelationshipInspectorModel({
        userId: "user-1",
        context: readyContext({
          integrity: "CONFLICT",
          presentationState: "CONFLICT",
        }),
        row,
      });

    assert.equal(result.state, "READY");
    assert.equal(
      result.authorityState,
      "UNRESOLVED_CONFLICT",
    );

    assert.equal(
      result.currentEvidence.length,
      1,
      "conflicting canonical evidence must remain inspectable",
    );

    assert.equal(
      result.resolvedAuthority.length,
      0,
      "conflict must fail closed and assert no resolved authority",
    );

    assert.deepEqual(
      result.issues,
      ["CONFLICTING_STAFF_MEMBERSHIP_EVIDENCE"],
    );
  });

  it("6. preserves canonical authority during REVIEW_REQUIRED while keeping divergent legacy evidence separate", async () => {
    const {
      buildSuperAdminUserRelationshipInspectorModel,
    } = await loadInspectorModule();

    const row = verifiedStaffRow();

    row.integrity = "REVIEW_REQUIRED";
    row.legacyEvidence = {
      academyId: "legacy-academy",
      activeAcademyId: "legacy-academy",
      tenantRole: "ADMIN",
      linkedPlayerId: null,
      assignedClients: ["legacy-player"],
    };
    row.issues = [
      "LEGACY_ACADEMY_DIVERGES_FROM_CANONICAL",
    ];

    const result =
      buildSuperAdminUserRelationshipInspectorModel({
        userId: "user-1",
        context: readyContext({
          integrity: "REVIEW_REQUIRED",
          presentationState: "REVIEW_REQUIRED",
        }),
        row,
      });

    assert.equal(result.state, "READY");
    assert.equal(result.authorityState, "RESOLVED");

    assert.equal(
      result.resolvedAuthority.length,
      1,
      "valid canonical current authority must remain visible during non-conflicting review",
    );

    assert.equal(
      result.resolvedAuthority[0].organizationId,
      "academy-a",
    );

    assert.equal(
      result.legacyEvidence.academyId,
      "legacy-academy",
    );

    assert.deepEqual(
      result.legacyEvidence.assignedClients,
      ["legacy-player"],
    );

    assert.notEqual(
      result.legacyEvidence.academyId,
      result.resolvedAuthority[0].organizationId,
      "legacy evidence must remain evidence only",
    );
  });

  it("7. legacy-only relationship evidence is inspectable but never becomes resolved authority", async () => {
    const {
      buildSuperAdminUserRelationshipInspectorModel,
    } = await loadInspectorModule();

    const row = verifiedStaffRow();

    row.organizations = [];
    row.source = "LEGACY_COMPATIBLE";
    row.integrity = "REVIEW_REQUIRED";
    row.legacyEvidence = {
      academyId: "legacy-academy",
      activeAcademyId: "legacy-academy",
      tenantRole: "COACH",
      linkedPlayerId: null,
      assignedClients: [],
    };
    row.issues = [
      "LEGACY_RELATIONSHIP_REQUIRES_REVIEW",
    ];

    const result =
      buildSuperAdminUserRelationshipInspectorModel({
        userId: "user-1",
        context: readyContext({
          source: "LEGACY_COMPATIBLE",
          integrity: "REVIEW_REQUIRED",
          presentationState:
            "LEGACY_REVIEW_REQUIRED",
        }),
        row,
      });

    assert.equal(result.state, "READY");
    assert.equal(
      result.authorityState,
      "NO_CURRENT_AUTHORITY",
    );
    assert.equal(result.currentEvidence.length, 0);
    assert.equal(result.resolvedAuthority.length, 0);

    assert.equal(
      result.legacyEvidence.tenantRole,
      "COACH",
    );
  });

  it("8. LOADING, UNAVAILABLE and OUT_OF_SYNC states always expose zero resolved authority", async () => {
    const {
      buildSuperAdminUserRelationshipInspectorModel,
    } = await loadInspectorModule();

    const row = verifiedStaffRow();

    const scenarios = [
      {
        context: {
          state: "LOADING",
          coverage: {
            academyAuthority: "LOADING",
            proClubAuthority: "NOT_CONNECTED",
          },
        },
        expectedState: "LOADING",
      },
      {
        context: {
          state: "UNAVAILABLE",
          coverage: {
            academyAuthority: "UNAVAILABLE",
            proClubAuthority: "NOT_CONNECTED",
          },
        },
        expectedState: "UNAVAILABLE",
      },
      {
        context: {
          state: "OUT_OF_SYNC",
          coverage: coverage(),
          reason:
            "The relationship snapshot does not match the requested account; refresh the inventory.",
        },
        expectedState: "OUT_OF_SYNC",
      },
    ];

    for (const scenario of scenarios) {
      const result =
        buildSuperAdminUserRelationshipInspectorModel({
          userId: "user-1",
          context: scenario.context,
          row,
        });

      assert.equal(
        result.state,
        scenario.expectedState,
      );

      assert.deepEqual(
        result.resolvedAuthority,
        [],
      );

      assert.deepEqual(
        result.currentEvidence,
        [],
      );

      assert.deepEqual(
        result.historical,
        [],
      );
    }
  });

  it("9. impossible READY UID mismatch fails closed instead of inspecting another user's relationship row", async () => {
    const {
      buildSuperAdminUserRelationshipInspectorModel,
    } = await loadInspectorModule();

    const row = verifiedStaffRow();

    row.userId = "other-user";

    const result =
      buildSuperAdminUserRelationshipInspectorModel({
        userId: "user-1",
        context: readyContext(),
        row,
      });

    assert.equal(
      result.state,
      "OUT_OF_SYNC",
    );

    assert.match(
      result.reason,
      /does not match/i,
    );

    assert.deepEqual(
      result.resolvedAuthority,
      [],
    );

    assert.deepEqual(
      result.currentEvidence,
      [],
    );
  });
});