import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildProClubWeeklyTrainingDraftWrite,
  proClubTechnicalGovernanceCurrentPath,
  proClubWeeklyTrainingBlockPath,
  proClubWeeklyTrainingPlanPath,
  proClubWeeklyTrainingSessionPath,
} from "../src/lib/firestore/proClubWeeklyTrainingPersistence.js";

function validPlan() {
  return {
    clubId: "club-1",
    authorUid: "hc-1",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    secondaryObjective: "Counter-press after loss",
    headCoachNote: "Control volume before match day.",
    sessions: [
      {
        sessionDate: "2026-09-08",
        startTime: "16:00",
        location: "Training Ground A",
        objective: "Progress through first and second line",
        phaseOfPlay: "IN_POSSESSION" as const,
        plannedLoad: "MODERATE" as const,
        durationMinutes: 90,
        blocks: [
          {
            blockType: "TACTICAL" as const,
            title: "Build-up 8v6",
            durationMinutes: 45,
            coachingPoints: ["Create the third-man option"],
          },
        ],
      },
    ],
  };
}

describe("Pro Club Weekly Training persistence foundation", () => {
  it("builds exact normalized Pro Club-only canonical paths", () => {
    assert.equal(
      proClubWeeklyTrainingPlanPath("club-1", "plan-1"),
      "proClubs/club-1/weeklyTrainingPlans/plan-1",
    );
    assert.equal(
      proClubWeeklyTrainingSessionPath("club-1", "plan-1", "2026-09-08-1600"),
      "proClubs/club-1/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600",
    );
    assert.equal(
      proClubWeeklyTrainingBlockPath(
        "club-1",
        "plan-1",
        "2026-09-08-1600",
        "block-01",
      ),
      "proClubs/club-1/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600/blocks/block-01",
    );
    assert.equal(
      proClubTechnicalGovernanceCurrentPath("club-1"),
      "proClubs/club-1/technicalGovernance/current",
    );
  });

  it("rejects padded and path-like identifiers at every path level", () => {
    assert.equal(proClubWeeklyTrainingPlanPath(" club-1 ", "plan-1"), null);
    assert.equal(proClubWeeklyTrainingPlanPath("club-1", "plans/plan-1"), null);
    assert.equal(
      proClubWeeklyTrainingSessionPath("club-1", "plan-1", "sessions/s1"),
      null,
    );
    assert.equal(
      proClubWeeklyTrainingBlockPath("club-1", "plan-1", "s1", " block-1 "),
      null,
    );
  });

  it("normalizes a domain-valid DRAFT into plan/session/block documents", () => {
    const result = buildProClubWeeklyTrainingDraftWrite({
      clubId: "club-1",
      planId: "plan-1",
      plan: validPlan(),
    });

    assert.equal(result.state, "VALID");
    if (result.state !== "VALID") throw new Error("Expected valid persistence bundle");

    assert.equal(result.bundle.planPayload.schemaVersion, 1);
    assert.equal(result.bundle.planPayload.status, "DRAFT");
    assert.equal(result.bundle.planPayload.authorUid, "hc-1");
    assert.equal("sessions" in result.bundle.planPayload, false);
    assert.equal("clubId" in result.bundle.planPayload, false);
    assert.equal("planId" in result.bundle.planPayload, false);

    assert.equal(result.bundle.sessions.length, 1);
    const session = result.bundle.sessions[0];
    assert.equal(session.sessionId, "2026-09-08-1600");
    assert.equal(session.payload.orderIndex, 0);
    assert.equal("blocks" in session.payload, false);
    assert.equal(session.blocks.length, 1);
    assert.equal(session.blocks[0].blockId, "block-01");
    assert.equal(session.blocks[0].payload.orderIndex, 0);
    assert.deepEqual(session.blocks[0].payload.coachingPoints, [
      "Create the third-man option",
    ]);
  });

  it("fails closed when the plan tenant does not match the path tenant", () => {
    assert.deepEqual(
      buildProClubWeeklyTrainingDraftWrite({
        clubId: "club-2",
        planId: "plan-1",
        plan: validPlan(),
      }),
      { state: "INVALID", reason: "INVALID_PLAN" },
    );
  });

  it("fails closed before normalization when deep plan validation fails", () => {
    const plan = validPlan();
    plan.sessions[0].blocks[0].coachingPoints = [];

    assert.deepEqual(
      buildProClubWeeklyTrainingDraftWrite({
        clubId: "club-1",
        planId: "plan-1",
        plan,
      }),
      { state: "INVALID", reason: "INVALID_PLAN" },
    );
  });

  it("rejects Technical Director notes until TD co-author persistence is opened", () => {
    const plan = { ...validPlan(), technicalDirectorNote: "Adjust the MD-2 load." };

    assert.deepEqual(
      buildProClubWeeklyTrainingDraftWrite({
        clubId: "club-1",
        planId: "plan-1",
        plan,
      }),
      { state: "INVALID", reason: "INVALID_PLAN" },
    );
  });
});
