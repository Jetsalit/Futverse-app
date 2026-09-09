import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProClubWeeklyTrainingActionProvenance,
  canCreateProClubWeeklyTrainingPlan,
  parseProClubWeeklyTrainingDraft,
  resolveProClubWeeklyTrainingWorkflow,
} from "../src/lib/proClubWeeklyTraining.js";
import { resolveProClubTechnicalAuthority } from "../src/lib/proClubTechnicalGovernance.js";

const headCoach = {
  uid: "hc-1",
  staffRole: "HEAD_COACH" as const,
  status: "ACTIVE" as const,
};
const td = {
  uid: "td-1",
  staffRole: "TECHNICAL_DIRECTOR" as const,
  status: "ACTIVE" as const,
};

function validPlan() {
  return {
    clubId: "club-1",
    authorUid: "hc-1",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build up under pressure",
    secondaryObjective: "Counter-press after loss",
    headCoachNote: "Manage volume before match day.",
    sessions: [
      {
        sessionDate: "2026-09-08",
        startTime: "16:00",
        location: "Training Ground A",
        objective: "Progress through first and second line",
        phaseOfPlay: "IN_POSSESSION" as const,
        plannedLoad: "MODERATE" as const,
        durationMinutes: 100,
        blocks: [
          {
            blockType: "WARM_UP" as const,
            title: "Dynamic activation",
            durationMinutes: 15,
            coachingPoints: ["Body orientation", "Communication"],
          },
          {
            blockType: "TACTICAL" as const,
            title: "Build-up 8v6",
            durationMinutes: 45,
            drillReference: "drill-123",
            coachingPoints: ["Create third-man option"],
          },
        ],
      },
    ],
  };
}

describe("Pro Club Weekly Training V1", () => {
  it("parses a canonical weekly training plan", () => {
    const result = parseProClubWeeklyTrainingDraft(validPlan());
    assert.equal(result.state, "VALID");
    if (result.state === "VALID") {
      assert.equal(result.value.clubId, "club-1");
      assert.equal(result.value.sessions.length, 1);
      assert.equal(result.value.sessions[0].blocks[1].drillReference, "drill-123");
    }
  });

  it("fails closed on unexpected plan/session/block fields", () => {
    assert.equal(
      parseProClubWeeklyTrainingDraft({ ...validPlan(), unexpected: true }).state,
      "INVALID",
    );

    const badSession = validPlan();
    badSession.sessions[0] = { ...badSession.sessions[0], legacyField: "x" } as typeof badSession.sessions[0];
    assert.equal(parseProClubWeeklyTrainingDraft(badSession).state, "INVALID");

    const badBlock = validPlan();
    badBlock.sessions[0].blocks[0] = {
      ...badBlock.sessions[0].blocks[0],
      durationMin: 15,
    } as typeof badBlock.sessions[0].blocks[0];
    assert.equal(parseProClubWeeklyTrainingDraft(badBlock).state, "INVALID");
  });

  it("rejects impossible dates, out-of-week sessions, duplicate slots and block overflow", () => {
    const impossible = validPlan();
    impossible.weekStartDate = "2026-02-30";
    assert.equal(parseProClubWeeklyTrainingDraft(impossible).state, "INVALID");

    const outside = validPlan();
    outside.sessions[0].sessionDate = "2026-09-14";
    assert.equal(parseProClubWeeklyTrainingDraft(outside).state, "INVALID");

    const duplicate = validPlan();
    duplicate.sessions.push(structuredClone(duplicate.sessions[0]));
    assert.equal(parseProClubWeeklyTrainingDraft(duplicate).state, "INVALID");

    const overflow = validPlan();
    overflow.sessions[0].durationMinutes = 50;
    assert.equal(parseProClubWeeklyTrainingDraft(overflow).state, "INVALID");
  });

  it("rejects padded/path-like identifiers and malformed time/drill reference", () => {
    const padded = validPlan();
    padded.clubId = " club-1 ";
    assert.equal(parseProClubWeeklyTrainingDraft(padded).state, "INVALID");

    const badTime = validPlan();
    badTime.sessions[0].startTime = "24:15";
    assert.equal(parseProClubWeeklyTrainingDraft(badTime).state, "INVALID");

    const badDrill = validPlan();
    badDrill.sessions[0].blocks[1].drillReference = "drills/drill-123";
    assert.equal(parseProClubWeeklyTrainingDraft(badDrill).state, "INVALID");
  });

  it("requires resolved authority before allowing plan creation", () => {
    const authority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [headCoach],
    );
    assert.equal(
      canCreateProClubWeeklyTrainingPlan({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authority,
      }),
      true,
    );

    assert.equal(
      canCreateProClubWeeklyTrainingPlan({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authority: { state: "MISSING", requiredRole: "HEAD_COACH" },
      }),
      false,
    );
  });

  it("Head Coach submits own plan when TD is resolved authority", () => {
    const authority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [td, headCoach],
    );

    assert.deepEqual(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authorUid: "hc-1",
        currentStatus: "DRAFT",
        authority,
        action: "SUBMIT",
      }),
      {
        allowed: true,
        action: "SUBMIT",
        fromStatus: "DRAFT",
        toStatus: "SUBMITTED",
        authorityAction: "NONE",
      },
    );
  });

  it("TD authority can begin review, request revision and approve another author's plan", () => {
    const authority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [td, headCoach],
    );

    assert.equal(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authorUid: "hc-1",
        currentStatus: "SUBMITTED",
        authority,
        action: "BEGIN_REVIEW",
      }).allowed,
      true,
    );

    const revision = resolveProClubWeeklyTrainingWorkflow({
      actorUid: "td-1",
      actorRole: "TECHNICAL_DIRECTOR",
      authorUid: "hc-1",
      currentStatus: "IN_REVIEW",
      authority,
      action: "REQUEST_REVISION",
    });
    assert.deepEqual(revision, {
      allowed: true,
      action: "REQUEST_REVISION",
      fromStatus: "IN_REVIEW",
      toStatus: "NEEDS_REVISION",
      authorityAction: "REVIEW_AND_APPROVE",
    });

    const approve = resolveProClubWeeklyTrainingWorkflow({
      actorUid: "td-1",
      actorRole: "TECHNICAL_DIRECTOR",
      authorUid: "hc-1",
      currentStatus: "IN_REVIEW",
      authority,
      action: "APPROVE",
    });
    assert.deepEqual(approve, {
      allowed: true,
      action: "APPROVE",
      fromStatus: "IN_REVIEW",
      toStatus: "APPROVED",
      authorityAction: "REVIEW_AND_APPROVE",
    });
  });

  it("Head Coach authority must publish own work instead of self-submitting/self-approving", () => {
    const authority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [headCoach],
    );

    assert.deepEqual(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authorUid: "hc-1",
        currentStatus: "DRAFT",
        authority,
        action: "SUBMIT",
      }),
      {
        allowed: false,
        action: "SUBMIT",
        reason: "SELF_WORK_MUST_PUBLISH",
      },
    );

    assert.deepEqual(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authorUid: "hc-1",
        currentStatus: "DRAFT",
        authority,
        action: "PUBLISH",
      }),
      {
        allowed: true,
        action: "PUBLISH",
        fromStatus: "DRAFT",
        toStatus: "PUBLISHED",
        authorityAction: "PUBLISH_OWN_WORK",
      },
    );

    assert.equal(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authorUid: "hc-1",
        currentStatus: "IN_REVIEW",
        authority,
        action: "APPROVE",
      }).allowed,
      false,
    );
  });

  it("only exact TD authority may co-author another person's plan", () => {
    const selectedHeadCoachAuthority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO", selectedAuthorityUid: "hc-1" },
      [td, headCoach],
    );

    assert.deepEqual(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authorUid: "hc-1",
        currentStatus: "DRAFT",
        authority: selectedHeadCoachAuthority,
        action: "EDIT",
      }),
      { allowed: false, action: "EDIT", reason: "NOT_PERMITTED" },
    );

    const tdAuthority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [td, headCoach],
    );
    assert.equal(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authorUid: "hc-1",
        currentStatus: "DRAFT",
        authority: tdAuthority,
        action: "EDIT",
      }).allowed,
      true,
    );
  });

  it("author may edit DRAFT or NEEDS_REVISION, but terminal work is immutable", () => {
    const authority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [td, headCoach],
    );

    for (const status of ["DRAFT", "NEEDS_REVISION"] as const) {
      assert.equal(
        resolveProClubWeeklyTrainingWorkflow({
          actorUid: "hc-1",
          actorRole: "HEAD_COACH",
          authorUid: "hc-1",
          currentStatus: status,
          authority,
          action: "EDIT",
        }).allowed,
        true,
      );
    }

    for (const status of ["APPROVED", "PUBLISHED"] as const) {
      assert.deepEqual(
        resolveProClubWeeklyTrainingWorkflow({
          actorUid: "hc-1",
          actorRole: "HEAD_COACH",
          authorUid: "hc-1",
          currentStatus: status,
          authority,
          action: "EDIT",
        }),
        { allowed: false, action: "EDIT", reason: "INVALID_STATUS_FOR_ACTION" },
      );
    }
  });

  it("fails closed when authority is ambiguous or missing", () => {
    const ambiguous = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [td, { ...td, uid: "td-2" }, headCoach],
    );

    assert.deepEqual(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authorUid: "hc-1",
        currentStatus: "DRAFT",
        authority: ambiguous,
        action: "SUBMIT",
      }),
      { allowed: false, action: "SUBMIT", reason: "AUTHORITY_UNRESOLVED" },
    );
  });

  it("builds immutable action-time provenance from an allowed workflow decision", () => {
    const authority = resolveProClubTechnicalAuthority(
      { authorityMode: "AUTO" },
      [td, headCoach],
    );
    const decision = resolveProClubWeeklyTrainingWorkflow({
      actorUid: "td-1",
      actorRole: "TECHNICAL_DIRECTOR",
      authorUid: "hc-1",
      currentStatus: "IN_REVIEW",
      authority,
      action: "APPROVE",
    });

    assert.deepEqual(
      buildProClubWeeklyTrainingActionProvenance({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authority,
        decision,
        occurredAt: "2026-09-09T11:30:00+07:00",
      }),
      {
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        action: "APPROVE",
        fromStatus: "IN_REVIEW",
        toStatus: "APPROVED",
        technicalAuthorityUid: "td-1",
        technicalAuthorityRole: "TECHNICAL_DIRECTOR",
        occurredAt: "2026-09-09T11:30:00+07:00",
      },
    );

    assert.equal(
      buildProClubWeeklyTrainingActionProvenance({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authority,
        decision,
        occurredAt: "2026-09-09T11:30:00",
      }),
      null,
    );
  });
});
