import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeDrillRecord } from "../src/lib/drillDataModel";

const provenanceModule = await import("../src/lib/proClubDrillProvenance").catch(
  () => undefined,
) as
  | {
      resolveProClubDrillProvenance?: (authority: unknown) => unknown;
      isProClubDrillSubmissionEligible?: (drill: unknown, clubId: string) => boolean;
    }
  | undefined;

function resolveProvenance(authority: unknown): unknown {
  assert.equal(
    typeof provenanceModule?.resolveProClubDrillProvenance,
    "function",
    "the current-authority provenance resolver must exist",
  );
  return provenanceModule.resolveProClubDrillProvenance!(authority);
}

function isEligibleForSubmission(drill: unknown, clubId = "club-lampang"): boolean {
  assert.equal(
    typeof provenanceModule?.isProClubDrillSubmissionEligible,
    "function",
    "the Pro Club source eligibility helper must exist",
  );
  return provenanceModule.isProClubDrillSubmissionEligible!(drill, clubId);
}

function authority(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "club-lampang",
    organizationType: "PRO_CLUB",
    organizationName: "Lampang United",
    organizationLevel: "T1",
    organizationStatus: "ACTIVE",
    userId: "coach-1",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole: "HEAD_COACH",
    ...overrides,
  };
}

test("resolvesProvenanceForActiveHeadCoachAndGkCoach", () => {
  assert.deepEqual(resolveProvenance(authority({ staffRole: "HEAD_COACH" })), {
    organizationType: "PRO_CLUB",
    organizationId: "club-lampang",
  });
  assert.deepEqual(resolveProvenance(authority({ staffRole: "GK_COACH" })), {
    organizationType: "PRO_CLUB",
    organizationId: "club-lampang",
  });
});

test("rejectsInactiveWrongTenantAndOtherStaffRoles", () => {
  for (const invalid of [
    authority({ organizationType: "ACADEMY" }),
    authority({ organizationStatus: "INACTIVE" }),
    authority({ membershipStatus: "INACTIVE" }),
    authority({ hasMembershipAuthority: false }),
    authority({ organizationId: " " }),
    authority({ staffRole: "ASSISTANT_COACH" }),
    authority({ staffRole: "FITNESS_COACH" }),
    authority({ staffRole: "ANALYST" }),
    authority({ staffRole: "TECHNICAL_DIRECTOR" }),
    null,
    undefined,
  ]) {
    assert.equal(resolveProvenance(invalid), null);
  }
});

test("currentClubProvenancedDrillCanSend", () => {
  assert.equal(
    isEligibleForSubmission({
      organizationType: "PRO_CLUB",
      organizationId: "club-lampang",
    }),
    true,
  );
});

test("legacyDrillCannotSend", () => {
  assert.equal(isEligibleForSubmission({}), false);
});

test("differentProClubDrillCannotSend", () => {
  assert.equal(
    isEligibleForSubmission({
      organizationType: "PRO_CLUB",
      organizationId: "club-other",
    }),
    false,
  );
});

test("missingOrganizationTypeCannotSend", () => {
  assert.equal(
    isEligibleForSubmission({ organizationId: "club-lampang" }),
    false,
  );
});

test("missingOrganizationIdCannotSend", () => {
  assert.equal(
    isEligibleForSubmission({ organizationType: "PRO_CLUB" }),
    false,
  );
});

test("preservesProvenanceOnEdit", () => {
  const source = readFileSync(
    new URL("../src/hooks/useDrillDatabase.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /organizationType/);
  assert.match(source, /organizationId/);
  assert.match(source, /Drill provenance is immutable|Pro Club drill provenance is immutable/);
});

test("keepsLegacyDrillsReadable", () => {
  const drill = normalizeDrillRecord("legacy-drill", {
    title: "Legacy GK Session",
    category: "GK Training",
    created_by: "coach-1",
    is_shared: false,
    canvas_data: null,
  });

  assert.equal(drill.id, "legacy-drill");
  assert.equal(drill.title, "Legacy GK Session");
  assert.equal(drill.canvas_data, null);
  assert.equal(drill.organizationType, undefined);
  assert.equal(drill.organizationId, undefined);
});

test("genericAndAcademySavesOmitProClubProvenance", () => {
  assert.equal(resolveProvenance(undefined), null);
  assert.equal(
    resolveProvenance(authority({ organizationType: "ACADEMY" })),
    null,
  );

  const boardSource = readFileSync(
    new URL("../src/components/TacticBoard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(boardSource, /proClubAuthoringAuthority\?/);
  assert.match(
    boardSource,
    /resolveProClubDrillProvenance\(\s*proClubAuthoringAuthority,\s*\)/s,
  );
  const appSource = readFileSync(
    new URL("../src/App.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(appSource, /proClubAuthoringAuthority\s*=/);
});
