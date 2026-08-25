import test from "node:test";
import assert from "node:assert/strict";

import type {
  AcademyMatchRecord,
} from "../src/lib/firestore/matchRepository";

import {
  MATCH_STATUS_FILTERS,
  buildMatchCoreData,
  buildMatchCoreDataFromRecord,
  createEmptyMatchForm,
  filterMatches,
  getLifecycleActions,
  isMatchReadOnly,
  matchRecordToForm,
  sortMatchesForWorkspace,
  toDateTimeLocalValue,
} from "../src/components/match/matchWorkspaceModel";

function record(
  id: string,
  status: AcademyMatchRecord["status"],
  kickoffAt: Date | null,
  updatedAt = new Date("2026-08-25T00:00:00.000Z"),
): AcademyMatchRecord {
  return {
    id,
    schemaVersion: 1,
    status,
    squadLabel: "U15",
    competitionName: "League",
    opponentName:
      status === "DRAFT" || status === "CANCELLED"
        ? null
        : "Academy B",
    kickoffAt,
    venueType:
      status === "DRAFT" || status === "CANCELLED"
        ? null
        : "HOME",
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    createdBy: "coach-1",
    updatedAt,
    updatedBy: "coach-1",
  };
}

test("1. Workspace exposes only frozen Match status filters", () => {
  assert.deepEqual(
    MATCH_STATUS_FILTERS,
    [
      "ALL",
      "DRAFT",
      "SCHEDULED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ],
  );
});

test("2. Empty Match form does not invent scheduling data", () => {
  assert.deepEqual(
    createEmptyMatchForm(),
    {
      squadLabel: "",
      competitionName: "",
      opponentName: "",
      kickoffAt: "",
      venueType: "",
    },
  );
});

test("3. DRAFT form normalizes text and explicit missing values", () => {
  const result = buildMatchCoreData(
    {
      squadLabel: " U15 ",
      competitionName: " League ",
      opponentName: "   ",
      kickoffAt: "",
      venueType: "",
    },
    "DRAFT",
  );

  assert.equal(result.valid, true);
  assert.equal(result.data.status, "DRAFT");
  assert.equal(result.data.squadLabel, "U15");
  assert.equal(result.data.competitionName, "League");
  assert.equal(result.data.opponentName, null);
  assert.equal(result.data.kickoffAt, null);
  assert.equal(result.data.venueType, null);
});

test("4. SCHEDULED form still delegates required fields to domain validation", () => {
  const result = buildMatchCoreData(
    {
      squadLabel: "U15",
      competitionName: "League",
      opponentName: "",
      kickoffAt: "",
      venueType: "",
    },
    "SCHEDULED",
  );

  assert.equal(result.valid, false);

  assert.ok(
    result.errors.includes(
      "Scheduled or active Match requires an opponent.",
    ),
  );

  assert.ok(
    result.errors.includes(
      "Scheduled or active Match requires a kickoff time.",
    ),
  );

  assert.ok(
    result.errors.includes(
      "Scheduled or active Match requires a venue type.",
    ),
  );
});

test("5. Complete scheduling form produces canonical SCHEDULED core data", () => {
  const result = buildMatchCoreData(
    {
      squadLabel: "U15",
      competitionName: "League",
      opponentName: "Academy B",
      kickoffAt: "2026-09-01T17:30",
      venueType: "HOME",
    },
    "SCHEDULED",
  );

  assert.equal(result.valid, true);
  assert.equal(result.data.status, "SCHEDULED");
  assert.equal(result.data.opponentName, "Academy B");
  assert.equal(result.data.venueType, "HOME");
  assert.ok(result.data.kickoffAt instanceof Date);
});

test("6. Lifecycle actions expose only frozen transitions", () => {
  assert.deepEqual(
    getLifecycleActions("DRAFT").map(
      (action) => action.targetStatus,
    ),
    ["SCHEDULED", "CANCELLED"],
  );

  assert.deepEqual(
    getLifecycleActions("SCHEDULED").map(
      (action) => action.targetStatus,
    ),
    ["IN_PROGRESS", "CANCELLED"],
  );

  assert.deepEqual(
    getLifecycleActions("IN_PROGRESS").map(
      (action) => action.targetStatus,
    ),
    ["COMPLETED", "CANCELLED"],
  );

  assert.deepEqual(
    getLifecycleActions("COMPLETED"),
    [],
  );

  assert.deepEqual(
    getLifecycleActions("CANCELLED"),
    [],
  );
});

test("7. Terminal Matches are read-only", () => {
  assert.equal(isMatchReadOnly("DRAFT"), false);
  assert.equal(isMatchReadOnly("SCHEDULED"), false);
  assert.equal(isMatchReadOnly("IN_PROGRESS"), false);
  assert.equal(isMatchReadOnly("COMPLETED"), true);
  assert.equal(isMatchReadOnly("CANCELLED"), true);
});

test("8. Filtering and operational sorting preserve Match identity", () => {
  const matches = [
    record(
      "completed",
      "COMPLETED",
      new Date("2026-08-20T10:00:00.000Z"),
    ),
    record(
      "scheduled-late",
      "SCHEDULED",
      new Date("2026-09-02T10:00:00.000Z"),
    ),
    record(
      "draft",
      "DRAFT",
      null,
    ),
    record(
      "live",
      "IN_PROGRESS",
      new Date("2026-08-25T10:00:00.000Z"),
    ),
    record(
      "scheduled-early",
      "SCHEDULED",
      new Date("2026-09-01T10:00:00.000Z"),
    ),
  ];

  assert.deepEqual(
    sortMatchesForWorkspace(matches).map(
      (match) => match.id,
    ),
    [
      "live",
      "scheduled-early",
      "scheduled-late",
      "draft",
      "completed",
    ],
  );

  assert.deepEqual(
    filterMatches(matches, "SCHEDULED").map(
      (match) => match.id,
    ),
    [
      "scheduled-late",
      "scheduled-early",
    ],
  );

  assert.equal(matches.length, 5);
});

test("9. Record conversion preserves domain fields and local form time", () => {
  const kickoff = new Date(
    2026,
    8,
    1,
    17,
    30,
    0,
    0,
  );

  const match = record(
    "scheduled",
    "SCHEDULED",
    kickoff,
  );

  const form = matchRecordToForm(match);

  assert.equal(
    form.kickoffAt,
    "2026-09-01T17:30",
  );

  assert.equal(
    toDateTimeLocalValue(kickoff),
    "2026-09-01T17:30",
  );

  const completed =
    buildMatchCoreDataFromRecord(
      match,
      "COMPLETED",
    );

  assert.equal(completed.valid, true);
  assert.equal(
    completed.data.status,
    "COMPLETED",
  );

  assert.notEqual(
    completed.data.kickoffAt,
    match.kickoffAt,
  );
});