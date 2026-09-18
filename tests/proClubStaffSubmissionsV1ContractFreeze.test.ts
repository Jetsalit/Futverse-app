import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = readFileSync(
  "docs/PRO_CLUB_STAFF_SUBMISSIONS_V1_CONTRACT_FREEZE.md",
  "utf8",
);
const governance = readFileSync(
  "src/lib/proClubTechnicalGovernance.ts",
  "utf8",
);
const types = readFileSync("src/types/ProClub.ts", "utf8");
const teamDashboard = readFileSync(
  "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
  "utf8",
);
const previewDashboard = readFileSync(
  "src/components/pro-club/operations/ProClubOperationsDashboard.tsx",
  "utf8",
);

test("Staff Submissions V1 reuses canonical Pro Club authority and roles", () => {
  assert.match(contract, /OWNER \| ADMIN \| MEMBER/);
  for (const role of [
    "ASSISTANT_COACH",
    "GK_COACH",
    "FITNESS_COACH",
    "ANALYST",
    "PHYSIO",
  ]) {
    assert.match(contract, new RegExp(role));
    assert.match(types, new RegExp(role));
  }
  assert.match(
    types,
    /ProClubAuthorizationRole = "OWNER" \| "ADMIN" \| "MEMBER"/,
  );
});

test("Staff Submissions V1 reuses the existing technical workflow", () => {
  for (const status of [
    "DRAFT",
    "SUBMITTED",
    "IN_REVIEW",
    "NEEDS_REVISION",
    "APPROVED",
    "PUBLISHED",
  ]) {
    assert.match(governance, new RegExp('"' + status + '"'));
  }

  assert.match(contract, /reuses the existing `ProClubTechnicalWorkStatus`/);
  assert.match(contract, /Self-approval remains forbidden/);
  assert.doesNotMatch(contract, /UNDER_REVIEW/);
  assert.doesNotMatch(contract, /REVISION_REQUESTED/);
});

test("Staff Submissions V1 freezes one tenant path and Training references", () => {
  assert.match(
    contract,
    /proClubs\/\{clubId\}\/staffSubmissions\/\{submissionId\}/,
  );
  assert.match(contract, /module: "TRAINING"/);
  assert.match(contract, /targetPlanId/);
  assert.match(contract, /targetSessionDate/);
  assert.match(contract, /MUST NOT silently rewrite or append blocks/);
  assert.match(contract, /Deletes are forbidden in V1/);
});

test("OWNER oversight stays separate from technical approval", () => {
  assert.match(
    contract,
    /OWNER\/ADMIN may receive read-only organization oversight later/,
  );
  assert.match(
    contract,
    /organization authorization alone MUST NOT grant technical approval capability/,
  );
  assert.match(
    governance,
    /ProClubTechnicalAuthorityRole =\s*\| "TECHNICAL_DIRECTOR"\s*\| "HEAD_COACH"/,
  );
});

test("production integration extends the reviewed dashboard, not preview shell", () => {
  assert.match(contract, /extend the existing `ProClubTeamDashboard`/);
  assert.match(
    contract,
    /MUST NOT mount the legacy DEV-only `ProClubOperationsDashboard`/,
  );
  assert.match(teamDashboard, /aria-label="Pro Club application shell"/);
  assert.match(
    previewDashboard,
    /Navigation remains intentionally non-interactive in this preview/,
  );
});

test("contract forbids duplicate systems and premature deploy", () => {
  assert.match(contract, /create a second membership or staff-role system/);
  assert.match(contract, /duplicate Technical Governance/);
  assert.match(contract, /replace or copy Weekly Training persistence/);
  assert.match(contract, /relax Head Coach-only Weekly Training write guards/);
  assert.match(contract, /turn OWNER into a football staff role/);
  assert.match(contract, /deploy until exact-HEAD review/);
});
