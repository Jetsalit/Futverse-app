import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = process.cwd();

const componentPath = path.join(
  repoRoot,
  "src/components/superadmin/SuperAdminControlledMembershipActions.tsx",
);

function source() {
  assert.equal(
    fs.existsSync(componentPath),
    true,
    "2C.3C.2 Controlled Membership Actions component must exist",
  );

  return fs
    .readFileSync(
      componentPath,
      "utf8",
    )
    .replace(/\r\n/g, "\n");
}

describe(
  "SuperAdmin Controlled Membership Actions UI",
  () => {
    it("1. owns no direct Firebase or Firestore persistence path", () => {
      const text = source();

      assert.doesNotMatch(
        text,
        /from\s+["']firebase\//i,
      );

      assert.doesNotMatch(
        text,
        /from\s+["']\.\.\/\.\.\/lib\/firebase["']/i,
      );

      assert.doesNotMatch(
        text,
        /\b(runTransaction|updateDoc|setDoc|deleteDoc|writeBatch|addDoc)\s*\(/,
      );
    });

    it("2. delegates the write exclusively to the audited 2C.3B adapter", () => {
      const text = source();

      assert.match(
        text,
        /mutateMembershipStatusAtomically/,
      );

      assert.match(
        text,
        /superAdminControlledMembershipMutations/,
      );

      assert.equal(
        (
          text.match(
            /mutateMembershipStatusAtomically\s*\(/g,
          ) || []
        ).length,
        1,
      );
    });

    it("3. derives actor identity from actualUser and never currentUser", () => {
      const text = source();

      assert.match(
        text,
        /const\s*\{\s*actualUser\s*\}\s*=\s*useAuth\(\)/,
      );

      assert.match(
        text,
        /isExactActiveSuperAdmin\s*\(\s*actualUser\s*\)/,
      );

      assert.doesNotMatch(
        text,
        /\bcurrentUser\b/,
      );
    });

    it("4. blocks controlled actions during both staff and nonstaff support modes", () => {
      const text = source();

      assert.match(
        text,
        /useSuperAdminSupport/,
      );

      assert.match(
        text,
        /useSuperAdminNonStaffSupport/,
      );

      assert.match(
        text,
        /staffSupport\.isSupportActive/,
      );

      assert.match(
        text,
        /nonStaffSupport\.isActive/,
      );

      assert.match(
        text,
        /Work As \/ support mode/,
      );
    });

    it("5. forwards exact stale-review guards from presentation descriptor to 2C.3B", () => {
      const text = source();

      const required = [
        "targetUid:",
        "academyId:",
        "action:",
        "expectedStatus:",
        "expectedRole:",
        "expectedSource:",
      ];

      for (const token of required) {
        assert.match(
          text,
          new RegExp(token),
        );
      }

      assert.match(
        text,
        /expectedStatus:\s*action\.expectedStatus/,
      );

      assert.match(
        text,
        /expectedRole:\s*action\.expectedRole/,
      );

      assert.match(
        text,
        /expectedSource:\s*action\.expectedSource/,
      );
    });

    it("6. prevents duplicate in-flight writes independently of button disabled state", () => {
      const text = source();

      assert.match(
        text,
        /inFlightRef\s*=\s*useRef\(false\)/,
      );

      assert.match(
        text,
        /inFlightRef\.current\s*=\s*true/,
      );

      assert.match(
        text,
        /inFlightRef\.current\s*=\s*false/,
      );

      assert.match(
        text,
        /isSubmitting/,
      );
    });

    it("7. shows explicit Academy, role, current status and target status confirmation", () => {
      const text = source();

      for (const label of [
        "Academy",
        "Membership Role",
        "Current Status",
        "Target Status",
      ]) {
        assert.match(
          text,
          new RegExp(label),
        );
      }

      assert.match(
        text,
        /confirmationTitle/,
      );

      assert.match(
        text,
        /confirmationMessage/,
      );
    });

    it("8. presents LEFT and REVOKED as terminal controlled states", () => {
      const text = source();

      assert.match(
        text,
        /selectedAction\.targetStatus\s*===\s*["']LEFT["']/,
      );

      assert.match(
        text,
        /selectedAction\.targetStatus\s*===\s*["']REVOKED["']/,
      );

      assert.match(
        text,
        /terminal in this controlled workflow/i,
      );
    });

    it("9. separates committed mutation success from refresh failure", () => {
      const text = source();

      const mutationCall =
        text.indexOf(
          "await mutateMembershipStatusAtomically",
        );

      const mutationNotice =
        text.indexOf(
          "setMutationNotice(",
          mutationCall,
        );

      const refreshCall =
        text.indexOf(
          "await onAuthoritativeRefresh()",
          mutationNotice,
        );

      const refreshWarning =
        text.indexOf(
          "setRefreshWarning(",
          refreshCall,
        );

      assert.ok(
        mutationCall >= 0,
      );

      assert.ok(
        mutationNotice > mutationCall,
      );

      assert.ok(
        refreshCall > mutationNotice,
      );

      assert.ok(
        refreshWarning > refreshCall,
      );

      assert.match(
        text,
        /mutation committed but authoritative relationship refresh failed/i,
      );
    });

    it("10. locks stale controls after commit until authoritative evidence changes", () => {
      const text = source();

      assert.match(
        text,
        /postCommitLocked/,
      );

      assert.match(
        text,
        /setPostCommitLocked\(true\)/,
      );

      assert.match(
        text,
        /setPostCommitLocked\(false\)/,
      );

      assert.match(
        text,
        /model\.status/,
      );

      assert.match(
        text,
        /model\.academyId/,
      );

      const resetEffect =
        text.match(
          /useEffect\(\(\) => \{\s*setSelectedAction\(null\);[\s\S]*?\}, \[[\s\S]*?\]\);/,
        )?.[0] || "";

      assert.match(
        resetEffect,
        /model\.availability/,
        "Availability transitions must invalidate any previously reviewed confirmation.",
      );
    });

    it("11. rechecks live actor, support mode, eligibility and descriptor presence at confirmation time", () => {
      const text = source();

      assert.match(
        text,
        /const\s+liveActorUid/,
      );

      assert.match(
        text,
        /isExactActiveSuperAdmin\(actualUser\)/,
      );

      assert.match(
        text,
        /model\.availability\s*!==\s*["']AVAILABLE["']/,
      );

      assert.match(
        text,
        /const\s+stillPresented/,
      );

      assert.match(
        text,
        /reviewed Membership action is stale/i,
      );
    });

    it("12. identifies the exact Academy and Membership role before an action is chosen", () => {
      const text = source();

      const availablePanel =
        text.indexOf(
          'data-controlled-membership-actions="available"',
        );

      const actionButtons =
        text.indexOf(
          "model.actions.map",
          availablePanel,
        );

      assert.ok(
        availablePanel >= 0,
        "Available controlled action panel must exist",
      );

      assert.ok(
        actionButtons > availablePanel,
        "Action buttons must follow the Membership identity context",
      );

      const preActionIdentity =
        text.slice(
          availablePanel,
          actionButtons,
        );

      assert.match(
        preActionIdentity,
        /model\.organizationName\s*\|\|\s*model\.academyId/,
        "Academy identity must be visible before the action buttons",
      );

      assert.match(
        preActionIdentity,
        /Academy ID:\s*\{model\.academyId\}/,
        "Exact Academy ID must remain inspectable before mutation",
      );

      assert.match(
        preActionIdentity,
        /\{model\.role\}/,
        "Membership role must be visible before mutation",
      );
    });

    it("13. owns no account-role mutation, Membership delete or generic activation UI", () => {
      const text = source();

      assert.doesNotMatch(
        text,
        /\bdeleteMembership\b/i,
      );

      assert.doesNotMatch(
        text,
        /\b(update|set|change)\w*AccountRole\b/i,
      );

      assert.doesNotMatch(
        text,
        /PENDING\s*(?:เนยโ€|->|to)\s*ACTIVE/i,
      );

      assert.match(
        text,
        /Membership status only|Membership status/i,
      );
    });
  },
);