import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

const repoRoot = process.cwd();

const policyPath = path.join(
  repoRoot,
  "src/lib/superAdminControlledMembershipActionPolicy.ts",
);

async function loadPolicy() {
  assert.equal(
    fs.existsSync(policyPath),
    true,
    "2C.3A controlled Membership policy must exist",
  );

  return import(
    pathToFileURL(policyPath).href
  );
}

function baseInput() {
  return {
    actorIsActiveSuperAdmin: true,
    requestedUserId: "user-1",
    relationshipUserId: "user-1",
    academyId: "academy-a",
    relationshipAcademyId: "academy-a",
    relationshipSource: "CANONICAL",
    integrity: "VERIFIED",
    evidenceKind: "STAFF_MEMBERSHIP",
    membershipRole: "COACH",
    membershipStatus: "ACTIVE",
    membershipSource: "SUPERADMIN_ASSIGNMENT",
    action: "SUSPEND",
  };
}

describe(
  "SuperAdmin Controlled Membership Action Policy",
  () => {
    it("1. remains a pure policy with no Firebase or persistence ownership", async () => {
      await loadPolicy();

      const source = fs
        .readFileSync(policyPath, "utf8")
        .replace(/\r\n/g, "\n");

      assert.doesNotMatch(
        source,
        /firebase|firestore|setDoc|updateDoc|deleteDoc|runTransaction|writeBatch/i,
      );
    });

    it("2. allows verified ACTIVE Membership to be suspended", async () => {
      const {
        buildSuperAdminControlledMembershipActionDecision,
      } = await loadPolicy();

      const result =
        buildSuperAdminControlledMembershipActionDecision(
          baseInput(),
        );

      assert.equal(result.allowed, true);

      if (!result.allowed) return;

      assert.equal(
        result.currentStatus,
        "ACTIVE",
      );
      assert.equal(
        result.targetStatus,
        "SUSPENDED",
      );
      assert.equal(
        result.writeScope,
        "MEMBERSHIP_STATUS_ONLY",
      );
      assert.equal(
        result.accountMutationAllowed,
        false,
      );
    });

    it("3. allows ACTIVE Membership to be marked LEFT or REVOKED", async () => {
      const {
        buildSuperAdminControlledMembershipActionDecision,
      } = await loadPolicy();

      for (const [action, targetStatus] of [
        ["MARK_LEFT", "LEFT"],
        ["REVOKE", "REVOKED"],
      ] as const) {
        const result =
          buildSuperAdminControlledMembershipActionDecision({
            ...baseInput(),
            action,
          });

        assert.equal(result.allowed, true);

        if (!result.allowed) continue;

        assert.equal(
          result.targetStatus,
          targetStatus,
        );
      }
    });

    it("4. allows only explicit reactivation from SUSPENDED", async () => {
      const {
        buildSuperAdminControlledMembershipActionDecision,
      } = await loadPolicy();

      const result =
        buildSuperAdminControlledMembershipActionDecision({
          ...baseInput(),
          membershipStatus: "SUSPENDED",
          action: "REACTIVATE",
        });

      assert.equal(result.allowed, true);

      if (!result.allowed) return;

      assert.equal(
        result.targetStatus,
        "ACTIVE",
      );
    });

    it("5. PENDING Membership can be revoked but cannot be generically activated", async () => {
      const {
        buildSuperAdminControlledMembershipActionDecision,
      } = await loadPolicy();

      const revoke =
        buildSuperAdminControlledMembershipActionDecision({
          ...baseInput(),
          membershipStatus: "PENDING",
          action: "REVOKE",
        });

      assert.equal(revoke.allowed, true);

      for (const action of [
        "SUSPEND",
        "REACTIVATE",
        "MARK_LEFT",
      ] as const) {
        const blocked =
          buildSuperAdminControlledMembershipActionDecision({
            ...baseInput(),
            membershipStatus: "PENDING",
            action,
          });

        assert.equal(blocked.allowed, false);
      }
    });

    it("6. LEFT and REVOKED are terminal in this policy slice", async () => {
      const {
        buildSuperAdminControlledMembershipActionDecision,
      } = await loadPolicy();

      for (const membershipStatus of [
        "LEFT",
        "REVOKED",
      ]) {
        for (const action of [
          "SUSPEND",
          "REACTIVATE",
          "MARK_LEFT",
          "REVOKE",
        ] as const) {
          const result =
            buildSuperAdminControlledMembershipActionDecision({
              ...baseInput(),
              membershipStatus,
              action,
            });

          assert.equal(result.allowed, false);
        }
      }
    });

    it("7. legacy, conflicting and review-required evidence fail closed", async () => {
      const {
        buildSuperAdminControlledMembershipActionDecision,
      } = await loadPolicy();

      const scenarios = [
        {
          relationshipSource:
            "LEGACY_COMPATIBLE",
        },
        {
          integrity: "CONFLICT",
        },
        {
          integrity: "REVIEW_REQUIRED",
        },
      ];

      for (const scenario of scenarios) {
        const result =
          buildSuperAdminControlledMembershipActionDecision({
            ...baseInput(),
            ...scenario,
          });

        assert.equal(result.allowed, false);
      }
    });

    it("8. UID and Academy mismatches fail closed", async () => {
      const {
        buildSuperAdminControlledMembershipActionDecision,
      } = await loadPolicy();

      const wrongUser =
        buildSuperAdminControlledMembershipActionDecision({
          ...baseInput(),
          relationshipUserId:
            "different-user",
        });

      const wrongAcademy =
        buildSuperAdminControlledMembershipActionDecision({
          ...baseInput(),
          relationshipAcademyId:
            "academy-b",
        });

      assert.equal(
        wrongUser.allowed,
        false,
      );
      assert.equal(
        wrongAcademy.allowed,
        false,
      );
    });

    it("9. non-staff evidence and inactive actor fail closed", async () => {
      const {
        buildSuperAdminControlledMembershipActionDecision,
      } = await loadPolicy();

      const nonStaff =
        buildSuperAdminControlledMembershipActionDecision({
          ...baseInput(),
          evidenceKind:
            "PLAYER_ASSOCIATION",
        });

      const inactiveActor =
        buildSuperAdminControlledMembershipActionDecision({
          ...baseInput(),
          actorIsActiveSuperAdmin:
            false,
        });

      assert.equal(
        nonStaff.allowed,
        false,
      );
      assert.equal(
        inactiveActor.allowed,
        false,
      );
    });

    it("10. malformed or future contract values fail closed", async () => {
      const {
        buildSuperAdminControlledMembershipActionDecision,
      } = await loadPolicy();

      const scenarios = [
        {
          requestedUserId:
            "bad/user",
        },
        {
          requestedUserId:
            " user-1",
        },
        {
          academyId:
            "academy-a ",
        },
        {
          membershipRole:
            "OWNER",
        },
        {
          membershipStatus:
            "ARCHIVED",
        },
        {
          membershipSource:
            "FUTURE_SOURCE",
        },
        {
          action:
            "DELETE",
        },
      ];

      for (const scenario of scenarios) {
        const result =
          buildSuperAdminControlledMembershipActionDecision({
            ...baseInput(),
            ...scenario,
          });

        assert.equal(result.allowed, false);
      }
    });
  },
);
