import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildProClubWeeklyTrainingDraftWrite,
  proClubTechnicalGovernanceCurrentPath,
  proClubWeeklyTrainingPlanPath,
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
  it("builds exact Pro Club-only canonical paths", () => {
    assert.equal(
      proClubWeeklyTrainingPlanPath("club-1", "plan-1"),
      "proClubs/club-1/weeklyTrainingPlans/plan-1",
    );
    assert.equal(
      proClubTechnicalGovernanceCurrentPath("club-1"),
      "proClubs/club-1/technicalGovernance/current",
    );
  });

  it("rejects padded and path-like identifiers", () => {
    for (const [clubId, planId] of [
      [" club-1 ", "plan-1"],
      ["club-1", "plans/plan-1"],
      ["club/1", "plan-1"],
      ["club-1", " plan-1 "],
    ]) {
      assert.equal(proClubWeeklyTrainingPlanPath(clubId, planId), null);
    }
  });

  it("builds a DRAFT persistence payload only from a domain-valid plan", () => {
    const result = buildProClubWeeklyTrainingDraftWrite({
      clubId: "club-1",
      planId: "plan-1",
      plan: validPlan(),
    });

    assert.equal(result.state, "VALID");
    if (result.state !== "VALID") throw new Error("Expected valid persistence payload");

    assert.equal(result.payload.schemaVersion, 1);
    assert.equal(result.payload.status, "DRAFT");
    assert.equal(result.payload.authorUid, "hc-1");
    assert.equal(result.payload.sessions.length, 1);
    assert.equal("clubId" in result.payload, false);
    assert.equal("planId" in result.payload, false);
    assert.equal("technicalDirectorNote" in result.payload, false);
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

  it("fails closed before persistence when deep plan validation fails", () => {
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
});
