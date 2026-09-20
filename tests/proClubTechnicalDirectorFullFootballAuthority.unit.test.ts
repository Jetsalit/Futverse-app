import assert from "node:assert/strict";
import test from "node:test";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter.ts";
import {
  resolveProClubTechnicalDirectorFullFootballCapabilities,
} from "../src/lib/proClubTechnicalDirectorFullFootballAuthority.ts";

function authority(
  overrides: Partial<ProClubOrganizationAuthority> = {},
): ProClubOrganizationAuthority {
  return {
    organizationId: "tnsu-lampang",
    organizationType: "PRO_CLUB",
    organizationName: "TNSU Lampang",
    organizationLevel: "T3",
    organizationStatus: "ACTIVE",
    userId: "owner-td-1",
    membershipAuthorizationRole: "OWNER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole: "TECHNICAL_DIRECTOR",
    ...overrides,
  };
}

const resolvedTdAuthority = {
  state: "FOUND" as const,
  authorityUid: "owner-td-1",
  authorityRole: "TECHNICAL_DIRECTOR" as const,
  resolvedBy: "AUTO" as const,
};

test("OWNER + TECHNICAL_DIRECTOR receives the full football-operational contract", () => {
  const result =
    resolveProClubTechnicalDirectorFullFootballCapabilities({
      authority: authority(),
      technicalAuthority: resolvedTdAuthority,
    });

  assert.equal(result.canViewAllFootballModules, true);
  assert.equal(result.canViewSquad, true);
  assert.equal(result.canViewTraining, true);
  assert.equal(result.canViewAttendance, true);
  assert.equal(result.canViewSubmissions, true);
  assert.equal(result.canViewReports, true);
  assert.equal(result.canViewAssessments, true);
  assert.equal(result.canViewMatches, true);
  assert.equal(result.canWriteDailyTrainingPlan, true);
  assert.equal(result.canWriteWeeklyTrainingPlan, true);
  assert.equal(result.canEditTrainingDrafts, true);
  assert.equal(result.canReviewTechnicalWork, true);
  assert.equal(result.canRequestRevision, true);
  assert.equal(result.canApproveTechnicalWork, true);
  assert.equal(result.canCreateAssessment, true);
  assert.equal(result.canEditAssessment, true);
  assert.equal(result.canDeleteAuditHistory, false);
  assert.equal(result.canMutateTenantAuthority, false);
});

test("active MEMBER + TECHNICAL_DIRECTOR receives the same football capabilities without tenant admin authority", () => {
  const result =
    resolveProClubTechnicalDirectorFullFootballCapabilities({
      authority: authority({
        userId: "td-member-1",
        membershipAuthorizationRole: "MEMBER",
      }),
      technicalAuthority: {
        state: "FOUND",
        authorityUid: "td-member-1",
        authorityRole: "TECHNICAL_DIRECTOR",
        resolvedBy: "AUTO",
      },
    });

  assert.equal(result.canViewAllFootballModules, true);
  assert.equal(result.canWriteDailyTrainingPlan, true);
  assert.equal(result.canWriteWeeklyTrainingPlan, true);
  assert.equal(result.canApproveTechnicalWork, true);
  assert.equal(result.canCreateAssessment, true);
  assert.equal(result.canMutateTenantAuthority, false);
});

test("review, revision and approval fail closed unless this TD is the resolved technical authority", () => {
  const result =
    resolveProClubTechnicalDirectorFullFootballCapabilities({
      authority: authority(),
      technicalAuthority: {
        state: "AMBIGUOUS",
        authorityRole: "TECHNICAL_DIRECTOR",
        candidateUids: ["owner-td-1", "td-2"],
      },
    });

  assert.equal(result.canViewAllFootballModules, true);
  assert.equal(result.canWriteDailyTrainingPlan, true);
  assert.equal(result.canWriteWeeklyTrainingPlan, true);
  assert.equal(result.canCreateAssessment, true);
  assert.equal(result.canReviewTechnicalWork, false);
  assert.equal(result.canRequestRevision, false);
  assert.equal(result.canApproveTechnicalWork, false);
});

test("inactive membership, inactive club or missing effective membership authority disables the contract", () => {
  for (const td of [
    authority({ membershipStatus: "INACTIVE" }),
    authority({ organizationStatus: "INACTIVE" }),
    authority({ hasMembershipAuthority: false }),
  ]) {
    const result =
      resolveProClubTechnicalDirectorFullFootballCapabilities({
        authority: td,
        technicalAuthority: resolvedTdAuthority,
      });

    assert.equal(result.canViewAllFootballModules, false);
    assert.equal(result.canWriteWeeklyTrainingPlan, false);
    assert.equal(result.canApproveTechnicalWork, false);
    assert.equal(result.canCreateAssessment, false);
  }
});

test("Head Coach and other staff roles do not inherit the Technical Director full-authority contract", () => {
  for (const staffRole of ["HEAD_COACH", "ASSISTANT_COACH", "ANALYST"] as const) {
    const result =
      resolveProClubTechnicalDirectorFullFootballCapabilities({
        authority: authority({ staffRole }),
        technicalAuthority: resolvedTdAuthority,
      });

    assert.equal(result.canViewAllFootballModules, false);
    assert.equal(result.canWriteDailyTrainingPlan, false);
    assert.equal(result.canApproveTechnicalWork, false);
    assert.equal(result.canCreateAssessment, false);
  }
});

test("audit deletion and tenant-authority mutation are never granted by this football role", () => {
  const result =
    resolveProClubTechnicalDirectorFullFootballCapabilities({
      authority: authority(),
      technicalAuthority: resolvedTdAuthority,
    });

  assert.equal(result.canDeleteAuditHistory, false);
  assert.equal(result.canMutateTenantAuthority, false);
});
