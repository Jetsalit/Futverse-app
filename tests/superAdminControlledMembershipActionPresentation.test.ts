import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildSuperAdminControlledMembershipActionPresentation,
} from "../src/components/superadmin/superAdminControlledMembershipActionPresentation";

import type {
  SuperAdminUserRelationshipInspectorItem,
} from "../src/components/superadmin/superAdminUserRelationshipInspectorModel";

const presentationPath = path.join(
  process.cwd(),
  "src/components/superadmin/superAdminControlledMembershipActionPresentation.ts",
);

function staffItem(
  overrides:
    Partial<SuperAdminUserRelationshipInspectorItem> = {},
): SuperAdminUserRelationshipInspectorItem {
  return {
    organizationId:
      "academy-a",

    organizationName:
      "Academy A",

    organizationType:
      "ACADEMY",

    role:
      "COACH",

    status:
      "ACTIVE",

    evidenceKind:
      "STAFF_MEMBERSHIP",

    membershipSource:
      "SUPERADMIN_ASSIGNMENT",

    ...overrides,
  };
}

function baseInput(
  item:
    SuperAdminUserRelationshipInspectorItem =
      staffItem(),
) {
  return {
    actorIsActiveSuperAdmin:
      true,

    userId:
      "coach-1",

    relationshipSource:
      "CANONICAL",

    integrity:
      "VERIFIED",

    item,
  };
}

describe(
  "SuperAdmin Controlled Membership Action Presentation",
  () => {
    it("1. remains pure presentation logic with no Firebase or mutation ownership", () => {
      const source =
        fs.readFileSync(
          presentationPath,
          "utf8",
        );

      assert.doesNotMatch(
        source,
        /firebase|firestore|runTransaction|setDoc|updateDoc|deleteDoc|mutateMembershipStatusAtomically/i,
      );

      assert.match(
        source,
        /buildSuperAdminControlledMembershipActionDecision/,
      );
    });

    it("2. ACTIVE canonical verified staff Membership exposes only allowed transitions", () => {
      const model =
        buildSuperAdminControlledMembershipActionPresentation(
          baseInput(),
        );

      assert.equal(
        model.availability,
        "AVAILABLE",
      );

      assert.deepEqual(
        model.actions.map(
          (action) =>
            action.action,
        ),
        [
          "SUSPEND",
          "MARK_LEFT",
          "REVOKE",
        ],
      );

      assert.deepEqual(
        model.actions.map(
          (action) =>
            action.targetStatus,
        ),
        [
          "SUSPENDED",
          "LEFT",
          "REVOKED",
        ],
      );
    });

    it("3. action descriptors carry exact stale-review guards for 2C.3B", () => {
      const model =
        buildSuperAdminControlledMembershipActionPresentation(
          baseInput(),
        );

      for (
        const action
        of model.actions
      ) {
        assert.equal(
          action.targetUid,
          "coach-1",
        );

        assert.equal(
          action.academyId,
          "academy-a",
        );

        assert.equal(
          action.expectedStatus,
          "ACTIVE",
        );

        assert.equal(
          action.expectedRole,
          "COACH",
        );

        assert.equal(
          action.expectedSource,
          "SUPERADMIN_ASSIGNMENT",
        );
      }
    });

    it("4. SUSPENDED Membership exposes explicit reactivation plus terminal actions", () => {
      const model =
        buildSuperAdminControlledMembershipActionPresentation(
          baseInput(
            staffItem({
              status:
                "SUSPENDED",
            }),
          ),
        );

      assert.deepEqual(
        model.actions.map(
          (action) =>
            action.action,
        ),
        [
          "REACTIVATE",
          "MARK_LEFT",
          "REVOKE",
        ],
      );

      assert.equal(
        model.actions[0]
          ?.targetStatus,
        "ACTIVE",
      );
    });

    it("5. PENDING Membership cannot be generically activated and exposes only revoke", () => {
      const model =
        buildSuperAdminControlledMembershipActionPresentation(
          baseInput(
            staffItem({
              status:
                "PENDING",
            }),
          ),
        );

      assert.deepEqual(
        model.actions.map(
          (action) =>
            action.action,
        ),
        [
          "REVOKE",
        ],
      );
    });

    it("6. LEFT and REVOKED remain terminal with no action descriptors", () => {
      for (
        const status
        of [
          "LEFT",
          "REVOKED",
        ] as const
      ) {
        const model =
          buildSuperAdminControlledMembershipActionPresentation(
            baseInput(
              staffItem({
                status,
              }),
            ),
          );

        assert.equal(
          model.availability,
          "BLOCKED",
        );

        assert.deepEqual(
          model.actions,
          [],
        );

        assert.ok(
          model.blockedReason,
        );
      }
    });

    it("7. review-required, conflicting, legacy and inactive actor evidence fail closed", () => {
      const scenarios = [
        {
          ...baseInput(),
          integrity:
            "REVIEW_REQUIRED",
        },
        {
          ...baseInput(),
          integrity:
            "CONFLICT",
        },
        {
          ...baseInput(),
          relationshipSource:
            "LEGACY_COMPATIBLE",
        },
        {
          ...baseInput(),
          actorIsActiveSuperAdmin:
            false,
        },
      ];

      for (
        const scenario
        of scenarios
      ) {
        const model =
          buildSuperAdminControlledMembershipActionPresentation(
            scenario,
          );

        assert.equal(
          model.availability,
          "BLOCKED",
        );

        assert.deepEqual(
          model.actions,
          [],
        );
      }
    });

    it("8. non-staff association evidence never becomes a Membership action", () => {
      const model =
        buildSuperAdminControlledMembershipActionPresentation(
          baseInput(
            staffItem({
              role:
                "PLAYER",
              status:
                "INACTIVE",
              evidenceKind:
                "PLAYER_ASSOCIATION",
              membershipSource:
                undefined,
            }),
          ),
        );

      assert.equal(
        model.availability,
        "BLOCKED",
      );

      assert.deepEqual(
        model.actions,
        [],
      );
    });

    it("9. Pro Club and future unsupported organization evidence fail closed", () => {
      const model =
        buildSuperAdminControlledMembershipActionPresentation(
          baseInput(
            staffItem({
              organizationId:
                "pro-club-a",
              organizationName:
                "Pro Club A",
              organizationType:
                "PRO_CLUB",
            }),
          ),
        );

      assert.equal(
        model.availability,
        "BLOCKED",
      );

      assert.deepEqual(
        model.actions,
        [],
      );

      assert.match(
        model.blockedReason || "",
        /Academy Memberships/i,
      );
    });

    it("10. exact Academy identity is preserved independently for multi-Academy accounts", () => {
      const academyA =
        buildSuperAdminControlledMembershipActionPresentation(
          baseInput(
            staffItem({
              organizationId:
                "academy-a",
              organizationName:
                "Academy A",
            }),
          ),
        );

      const academyB =
        buildSuperAdminControlledMembershipActionPresentation(
          baseInput(
            staffItem({
              organizationId:
                "academy-b",
              organizationName:
                "Academy B",
              role:
                "ADMIN",
              membershipSource:
                "INVITE",
            }),
          ),
        );

      assert.equal(
        academyA.actions[0]
          ?.academyId,
        "academy-a",
      );

      assert.equal(
        academyB.actions[0]
          ?.academyId,
        "academy-b",
      );

      assert.equal(
        academyB.actions[0]
          ?.expectedRole,
        "ADMIN",
      );

      assert.equal(
        academyB.actions[0]
          ?.expectedSource,
        "INVITE",
      );
    });
  },
);