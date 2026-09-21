import assert from "node:assert/strict";
import test from "node:test";

import {
  getProClubGameModel,
  proClubGameModelDocumentPath,
  saveProClubGameModel,
  type ProClubGameModelRepositoryOps,
} from "../src/lib/firestore/proClubGameModelRepository.ts";
import { createEmptyGameModelTextSnapshot } from "../src/lib/gameModel.ts";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter.ts";

function authority(
  staffRole: ProClubOrganizationAuthority["staffRole"] = "HEAD_COACH",
): ProClubOrganizationAuthority {
  return {
    organizationId: "club-a",
    organizationType: "PRO_CLUB",
    organizationName: "Club A",
    organizationLevel: "T3",
    organizationStatus: "ACTIVE",
    userId: "coach-a",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole,
  };
}

function harness(staffRole: ProClubOrganizationAuthority["staffRole"] = "HEAD_COACH") {
  let stored: Record<string, unknown> | null = null;
  let clock = 0;

  const ops: ProClubGameModelRepositoryOps = {
    getAuthenticatedUid: () => "coach-a",
    resolveAuthority: async () => ({ state: "FOUND", value: authority(staffRole) }),
    readDocument: async () => ({
      id: "current",
      exists: stored !== null,
      data: stored ?? undefined,
    }),
    setDocument: async (_path, data) => {
      stored = { ...data };
    },
    updateDocument: async (_path, data) => {
      if (!stored) throw new Error("missing");
      stored = { ...stored, ...data };
    },
    timestamp: () => ({ tick: ++clock }),
  };

  return {
    ops,
    readRaw: () => stored,
  };
}

test("Pro Club Game Model uses one canonical current document", () => {
  assert.deepEqual(
    proClubGameModelDocumentPath("club-a"),
    ["proClubs", "club-a", "gameModel", "current"],
  );
});

test("Head Coach creates and updates the four-phase master with revisions", async () => {
  const { ops } = harness();
  const firstDraft = {
    ...createEmptyGameModelTextSnapshot(),
    IN_POSSESSION: "Build through midfield",
  };

  const first = await saveProClubGameModel("club-a", firstDraft, 0, ops);
  assert.equal(first.revision, 1);
  assert.equal(first.phases.IN_POSSESSION, "Build through midfield");

  const second = await saveProClubGameModel(
    "club-a",
    { ...first.phases, IN_POSSESSION: "Build through #6" },
    1,
    ops,
  );
  assert.equal(second.revision, 2);
  assert.equal(second.phases.IN_POSSESSION, "Build through #6");

  const read = await getProClubGameModel("club-a", ops);
  assert.equal(read?.revision, 2);
});

test("Assistant Coach cannot author the team Game Model", async () => {
  const { ops } = harness("ASSISTANT_COACH");

  await assert.rejects(
    saveProClubGameModel(
      "club-a",
      createEmptyGameModelTextSnapshot(),
      0,
      ops,
    ),
    /HEAD_COACH or TECHNICAL_DIRECTOR/,
  );
});

test("stale Game Model revisions fail closed", async () => {
  const { ops } = harness();
  await saveProClubGameModel(
    "club-a",
    createEmptyGameModelTextSnapshot(),
    0,
    ops,
  );

  await assert.rejects(
    saveProClubGameModel(
      "club-a",
      { ...createEmptyGameModelTextSnapshot(), OUT_OF_POSSESSION: "Press" },
      0,
      ops,
    ),
    /Stale Game Model revision/,
  );
});

test("returned phase data is detached from caller-owned objects", async () => {
  const { ops, readRaw } = harness();
  const input = {
    ...createEmptyGameModelTextSnapshot(),
    TRANSITION_TO_ATTACK: "Play forward",
  };
  const saved = await saveProClubGameModel("club-a", input, 0, ops);

  input.TRANSITION_TO_ATTACK = "mutated later";
  assert.equal(saved.phases.TRANSITION_TO_ATTACK, "Play forward");
  assert.equal(
    (readRaw()?.phases as Record<string, string>).TRANSITION_TO_ATTACK,
    "Play forward",
  );
});
