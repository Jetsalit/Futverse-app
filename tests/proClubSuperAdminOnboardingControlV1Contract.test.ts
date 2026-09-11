import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
const contract = read("docs/PRO_CLUB_SUPERADMIN_ONBOARDING_CONTROL_V1_CONTRACT_FREEZE.md");
const rules = read("firestore.rules");
const runtimeCapabilities = read("src/config/runtimeCapabilities.ts");
const onboardingRepository = read("src/lib/firestore/proClubOnboardingRepository.ts");

function includesAll(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `missing contract fragment: ${fragment}`);
  }
}

test("contract freezes explicit ACTIVE SUPERADMIN control-plane authority without tenant membership", () => {
  includesAll(contract, [
    "SUPERADMIN CONTROL AUTHORITY != PRO CLUB MEMBERSHIP AUTHORITY",
    "SUPERADMIN CONTROL AUTHORITY != FOOTBALL STAFF ROLE",
    "users/{request.auth.uid}.role == \"SUPERADMIN\"",
    "The implementation must never satisfy this path by creating a Pro Club membership for the SuperAdmin.",
    "support presentation",
  ]);
});

test("contract freezes Spark-native UID invitation while keeping email lookup fail-closed", () => {
  includesAll(contract, [
    "exact `targetUid`",
    "Spark-native path must not require email-to-UID discovery in the browser",
    "must not globally flip `FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE` to true in production",
    "does not authorize enabling `resolveProClubStaffCandidateV1`",
  ]);

  assert.match(runtimeCapabilities, /FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE/);
  assert.match(runtimeCapabilities, /isFunctionBackedProClubWebAvailable/);
  assert.match(onboardingRepository, /async function issueInvitation/);
  assert.match(onboardingRepository, /async function resolveCandidate/);
});

test("contract preserves MEMBER ceiling, HEAD_COACH staff role, targeted claim, and atomic approval", () => {
  includesAll(contract, [
    "membershipAuthorizationRole: \"MEMBER\"",
    "including `HEAD_COACH`",
    "targetUid == request.auth.uid",
    "Approval must remain one atomic operation",
    "invitation `ACTIVE -> CONSUMED`",
  ]);
});

test("contract requires immutable SuperAdmin audit evidence", () => {
  includesAll(contract, [
    "Every successful SuperAdmin onboarding control write must leave durable append-only audit evidence.",
    "`INVITE_ISSUED`, `CLAIM_APPROVED`, or `CLAIM_REJECTED`",
    "Audit documents must be append-only. Update and delete remain denied.",
    "client must not be able to forge the acting SuperAdmin UID or timestamp",
  ]);
});

test("contract defines security and regression gates before implementation", () => {
  includesAll(contract, [
    "inactive SuperAdmin cannot issue an invite",
    "global ADMIN cannot use the SuperAdmin path",
    "claimant cannot self-approve",
    "exact atomic SuperAdmin approval succeeds",
    "existing OWNER/ADMIN onboarding continues to pass",
    "Academy regression remains green",
    "production default-deny remains intact",
  ]);
});

test("this freeze remains docs/tests only and does not itself mutate production Rules", () => {
  includesAll(contract, [
    "This freeze is preservation-safe",
    "does not authorize",
    "editing `firestore.rules`",
    "deploying Hosting, Rules, Functions, or indexes",
    "writing production data",
  ]);

  // Baseline evidence: Pro Club invitation create remains governed by the existing V1 rule.
  assert.match(rules, /allow create: if validProClubInviteCreateV1\(inviteCode\);/);
});
