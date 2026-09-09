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

function tdAuthority() {
  return resolveProClubTechnicalAuthority({ authorityMode: "AUTO" }, [td, headCoach]);
}

function hcAuthority() {
  return resolveProClubTechnicalAuthority({ authorityMode: "AUTO" }, [headCoach]);
}

function assertAllowed(decision: ReturnType<typeof resolveProClubWeeklyTrainingWorkflow>) {
  assert.equal(decision.allowed, true);
  if (!decision.allowed) throw new Error("Expected allowed decision");
  return decision;
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

    const badSession = validPlan() as any;
    badSession.sessions[0].legacyField = "x";
    assert.equal(parseProClubWeeklyTrainingDraft(badSession).state, "INVALID");

    const badBlock = validPlan() as any;
    badBlock.sessions[0].blocks[0].durationMin = 15;
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
    assert.equal(
      canCreateProClubWeeklyTrainingPlan({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authority: hcAuthority(),
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
    const decision = assertAllowed(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authorUid: "hc-1",
        currentStatus: "DRAFT",
        authority: tdAuthority(),
        action: "SUBMIT",
      }),
    );
    assert.equal(decision.toStatus, "SUBMITTED");
    assert.equal(decision.actorUid, "hc-1");
    assert.equal(decision.authorUid, "hc-1");
    assert.equal(decision.technicalAuthorityUid, "td-1");
    assert.equal(decision.technicalAuthorityRole, "TECHNICAL_DIRECTOR");
  });

  it("TD authority can begin review, request revision and approve another author's plan", () => {
    const authority = tdAuthority();
    const begin = assertAllowed(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authorUid: "hc-1",
        currentStatus: "SUBMITTED",
        authority,
        action: "BEGIN_REVIEW",
      }),
    );
    assert.equal(begin.toStatus, "IN_REVIEW");

    const revision = assertAllowed(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authorUid: "hc-1",
        currentStatus: "IN_REVIEW",
        authority,
        action: "REQUEST_REVISION",
      }),
    );
    assert.equal(revision.toStatus, "NEEDS_REVISION");

    const approve = assertAllowed(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authorUid: "hc-1",
        currentStatus: "IN_REVIEW",
        authority,
        action: "APPROVE",
      }),
    );
    assert.equal(approve.toStatus, "APPROVED");
    assert.equal(approve.authorityAction, "REVIEW_AND_APPROVE");
  });

  it("Head Coach authority must publish own work instead of self-submitting/self-approving", () => {
    const authority = hcAuthority();
    assert.deepEqual(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authorUid: "hc-1",
        currentStatus: "DRAFT",
        authority,
        action: "SUBMIT",
      }),
      { allowed: false, action: "SUBMIT", reason: "SELF_WORK_MUST_PUBLISH" },
    );

    const publish = assertAllowed(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "hc-1",
        actorRole: "HEAD_COACH",
        authorUid: "hc-1",
        currentStatus: "DRAFT",
        authority,
        action: "PUBLISH",
      }),
    );
    assert.equal(publish.toStatus, "PUBLISHED");
    assert.equal(publish.authorityAction, "PUBLISH_OWN_WORK");

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

    assert.equal(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authorUid: "hc-1",
        currentStatus: "DRAFT",
        authority: tdAuthority(),
        action: "EDIT",
      }).allowed,
      true,
    );
  });

  it("author may edit DRAFT or NEEDS_REVISION, but terminal work is immutable", () => {
    const authority = tdAuthority();
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

  it("binds provenance to the exact actor, author and authority that produced the decision", () => {
    const decision = assertAllowed(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authorUid: "hc-1",
        currentStatus: "IN_REVIEW",
        authority: tdAuthority(),
        action: "APPROVE",
      }),
    );

    const provenance = buildProClubWeeklyTrainingActionProvenance({
      decision,
      occurredAt: "2026-09-09T11:30:00+07:00",
    });
    assert.deepEqual(provenance, {
      actorUid: "td-1",
      actorRole: "TECHNICAL_DIRECTOR",
      authorUid: "hc-1",
      action: "APPROVE",
      fromStatus: "IN_REVIEW",
      toStatus: "APPROVED",
      technicalAuthorityUid: "td-1",
      technicalAuthorityRole: "TECHNICAL_DIRECTOR",
      occurredAt: "2026-09-09T11:30:00+07:00",
    });
  });

  it("rejects impossible or non-offset-aware provenance timestamps", () => {
    const decision = assertAllowed(
      resolveProClubWeeklyTrainingWorkflow({
        actorUid: "td-1",
        actorRole: "TECHNICAL_DIRECTOR",
        authorUid: "hc-1",
        currentStatus: "IN_REVIEW",
        authority: tdAuthority(),
        action: "APPROVE",
      }),
    );

    for (const occurredAt of [
      "2026-02-30T11:30:00Z",
      "2026-09-09T24:00:00Z",
      "2026-09-09T11:60:00Z",
      "2026-09-09T11:30:60Z",
      "2026-09-09T11:30:00",
    ]) {
      assert.equal(
        buildProClubWeeklyTrainingActionProvenance({ decision, occurredAt }),
        null,
      );
    }

    assert.notEqual(
      buildProClubWeeklyTrainingActionProvenance({
        decision,
        occurredAt: "2028-02-29T23:59:59Z",
      }),
      null,
    );
  });
});
