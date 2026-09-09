import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canTransitionProClubTechnicalWorkStatus,
  isProClubTechnicalWorkStatus,
  resolveProClubTechnicalAuthority,
  resolveProClubTechnicalAuthorityAction,
  resolveProClubTechnicalCapabilities,
} from "../src/lib/proClubTechnicalGovernance.js";

const td = {
  uid: "td-1",
  staffRole: "TECHNICAL_DIRECTOR" as const,
  status: "ACTIVE" as const,
};
const headCoach = {
  uid: "hc-1",
  staffRole: "HEAD_COACH" as const,
  status: "ACTIVE" as const,
};
const fitness = {
  uid: "fitness-1",
  staffRole: "FITNESS_COACH" as const,
  status: "ACTIVE" as const,
};

describe("Pro Club Technical Governance V1", () => {
  it("AUTO selects one ACTIVE Technical Director before Head Coach", () => {
    assert.deepEqual(
      resolveProClubTechnicalAuthority(
        { authorityMode: "AUTO" },
        [headCoach, td, fitness],
      ),
      {
        state: "FOUND",
        authorityUid: "td-1",
        authorityRole: "TECHNICAL_DIRECTOR",
        resolvedBy: "AUTO",
      },
    );
  });

  it("AUTO falls back to one ACTIVE Head Coach when there is no ACTIVE Technical Director", () => {
    assert.deepEqual(
      resolveProClubTechnicalAuthority(
        { authorityMode: "AUTO" },
        [headCoach, { ...td, status: "LEFT" }, fitness],
      ),
      {
        state: "FOUND",
        authorityUid: "hc-1",
        authorityRole: "HEAD_COACH",
        resolvedBy: "AUTO",
      },
    );
  });

  it("AUTO fails closed on multiple ACTIVE Technical Directors", () => {
    assert.deepEqual(
      resolveProClubTechnicalAuthority(
        { authorityMode: "AUTO" },
        [td, { ...td, uid: "td-2" }, headCoach],
      ),
      {
        state: "AMBIGUOUS",
        authorityRole: "TECHNICAL_DIRECTOR",
        candidateUids: ["td-1", "td-2"],
      },
    );
  });

  it("an explicit selectedAuthorityUid resolves ambiguous Thai club structures", () => {
    assert.deepEqual(
      resolveProClubTechnicalAuthority(
        { authorityMode: "AUTO", selectedAuthorityUid: "hc-1" },
        [td, { ...td, uid: "td-2" }, headCoach],
      ),
      {
        state: "FOUND",
        authorityUid: "hc-1",
        authorityRole: "HEAD_COACH",
        resolvedBy: "SELECTED_UID",
      },
    );
  });

  it("explicit role mode requires an ACTIVE candidate of that role", () => {
    assert.deepEqual(
      resolveProClubTechnicalAuthority(
        { authorityMode: "TECHNICAL_DIRECTOR" },
        [headCoach, { ...td, status: "INACTIVE" }],
      ),
      {
        state: "MISSING",
        requiredRole: "TECHNICAL_DIRECTOR",
      },
    );
  });

  it("rejects malformed candidates and duplicate UIDs instead of guessing", () => {
    assert.equal(
      resolveProClubTechnicalAuthority(
        { authorityMode: "AUTO" },
        [{ uid: " bad ", staffRole: "HEAD_COACH", status: "ACTIVE" }],
      ).state,
      "INVALID_CONFIG",
    );
    assert.equal(
      resolveProClubTechnicalAuthority(
        { authorityMode: "AUTO" },
        [headCoach, { ...fitness, uid: "hc-1" }],
      ).state,
      "INVALID_CONFIG",
    );
  });

  it("selected authority must be ACTIVE and must match an explicit role mode", () => {
    assert.equal(
      resolveProClubTechnicalAuthority(
        { authorityMode: "AUTO", selectedAuthorityUid: "td-1" },
        [{ ...td, status: "LEFT" }, headCoach],
      ).state,
      "INVALID_CONFIG",
    );
    assert.equal(
      resolveProClubTechnicalAuthority(
        { authorityMode: "HEAD_COACH", selectedAuthorityUid: "td-1" },
        [td, headCoach],
      ).state,
      "INVALID_CONFIG",
    );
  });

  it("Head Coach can create/edit/submit while TD authority gets co-author/review/approve", () => {
    const authority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [td, headCoach],
    );
    const hcCapabilities = resolveProClubTechnicalCapabilities({
      actorUid: "hc-1",
      actorRole: "HEAD_COACH",
      authority,
    });
    const tdCapabilities = resolveProClubTechnicalCapabilities({
      actorUid: "td-1",
      actorRole: "TECHNICAL_DIRECTOR",
      authority,
    });

    assert.equal(hcCapabilities.canCreateTrainingPlan, true);
    assert.equal(hcCapabilities.canSubmitTechnicalWork, true);
    assert.equal(hcCapabilities.canApproveSubmittedWork, false);
    assert.equal(tdCapabilities.canCoAuthorTrainingPlan, true);
    assert.equal(tdCapabilities.canReviewTechnicalWork, true);
    assert.equal(tdCapabilities.canApproveSubmittedWork, true);
  });

  it("Head Coach authority can publish own work and review somebody else's work", () => {
    const authority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [headCoach, fitness],
    );

    assert.equal(
      resolveProClubTechnicalAuthorityAction({
        actorUid: "hc-1",
        authorUid: "hc-1",
        authority,
      }),
      "PUBLISH_OWN_WORK",
    );
    assert.equal(
      resolveProClubTechnicalAuthorityAction({
        actorUid: "hc-1",
        authorUid: "fitness-1",
        authority,
      }),
      "REVIEW_AND_APPROVE",
    );
  });

  it("non-authority actors cannot review/approve/publish through this contract", () => {
    const authority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [td, headCoach, fitness],
    );
    const capabilities = resolveProClubTechnicalCapabilities({
      actorUid: "fitness-1",
      actorRole: "FITNESS_COACH",
      authority,
    });
    assert.equal(capabilities.canReviewTechnicalWork, false);
    assert.equal(capabilities.canApproveSubmittedWork, false);
    assert.equal(capabilities.canPublishOwnTechnicalWork, false);
    assert.equal(
      resolveProClubTechnicalAuthorityAction({
        actorUid: "fitness-1",
        authorUid: "fitness-1",
        authority,
      }),
      "NONE",
    );
  });

  it("freezes the shared technical work lifecycle without self-approval", () => {
    for (const status of [
      "DRAFT",
      "SUBMITTED",
      "IN_REVIEW",
      "NEEDS_REVISION",
      "APPROVED",
      "PUBLISHED",
    ]) {
      assert.equal(isProClubTechnicalWorkStatus(status), true);
    }

    assert.equal(canTransitionProClubTechnicalWorkStatus("DRAFT", "SUBMITTED"), true);
    assert.equal(canTransitionProClubTechnicalWorkStatus("DRAFT", "PUBLISHED"), true);
    assert.equal(canTransitionProClubTechnicalWorkStatus("SUBMITTED", "IN_REVIEW"), true);
    assert.equal(canTransitionProClubTechnicalWorkStatus("IN_REVIEW", "APPROVED"), true);
    assert.equal(canTransitionProClubTechnicalWorkStatus("IN_REVIEW", "NEEDS_REVISION"), true);
    assert.equal(canTransitionProClubTechnicalWorkStatus("NEEDS_REVISION", "SUBMITTED"), true);
    assert.equal(canTransitionProClubTechnicalWorkStatus("APPROVED", "DRAFT"), false);
    assert.equal(canTransitionProClubTechnicalWorkStatus("PUBLISHED", "APPROVED"), false);
  });
});
