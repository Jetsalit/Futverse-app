import test from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_SCHEMA_VERSION,
  MATCH_STATUSES,
  isMatchEvidenceLocked,
  canTransitionMatchStatus,
  isExactMatchPathSegment,
  isMatchStatus,
  isMatchVenueType,
  isTerminalMatchStatus,
  validateMatchCoreData,
  validateMatchRosterSnapshotData,
  type MatchCoreData,
  type MatchRosterSnapshotData,
} from "../src/lib/matchFoundation";

function draftMatch(): MatchCoreData {
  return {
    schemaVersion: MATCH_SCHEMA_VERSION,
    status: "DRAFT",
    squadLabel: "U15",
    competitionName: "League",
    opponentName: null,
    kickoffAt: null,
    venueType: null,
  };
}

function scheduledMatch(): MatchCoreData {
  return {
    ...draftMatch(),
    status: "SCHEDULED",
    squadLabel: "U15",
    competitionName: "League",
    opponentName: "Academy B",
    kickoffAt: new Date("2026-09-01T10:00:00.000Z"),
    venueType: "HOME",
  };
}

function rosterSnapshot(): MatchRosterSnapshotData {
  return {
    schemaVersion: MATCH_SCHEMA_VERSION,
    futId: null,
    firstName: "Player",
    lastName: "One",
    position: "CM",
    jerseyNumber: 8,
  };
}

test("1. Match lifecycle exposes only frozen Phase 2A statuses", () => {
  assert.deepEqual(MATCH_STATUSES, [
    "DRAFT",
    "SCHEDULED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ]);
});

test("2. Match status validation rejects unsupported states", () => {
  assert.equal(isMatchStatus("DRAFT"), true);
  assert.equal(isMatchStatus("COMPLETED"), true);
  assert.equal(isMatchStatus("POSTPONED"), false);
  assert.equal(isMatchStatus(""), false);
  assert.equal(isMatchStatus(null), false);
});

test("3. venue type validation is explicit", () => {
  assert.equal(isMatchVenueType("HOME"), true);
  assert.equal(isMatchVenueType("AWAY"), true);
  assert.equal(isMatchVenueType("NEUTRAL"), true);
  assert.equal(isMatchVenueType("LOCAL"), false);
  assert.equal(isMatchVenueType(null), false);
});

test("4. allowed lifecycle transitions are explicit", () => {
  assert.equal(
    canTransitionMatchStatus("DRAFT", "SCHEDULED"),
    true,
  );
  assert.equal(
    canTransitionMatchStatus("DRAFT", "CANCELLED"),
    true,
  );
  assert.equal(
    canTransitionMatchStatus("SCHEDULED", "IN_PROGRESS"),
    true,
  );
  assert.equal(
    canTransitionMatchStatus("SCHEDULED", "CANCELLED"),
    true,
  );
  assert.equal(
    canTransitionMatchStatus("IN_PROGRESS", "COMPLETED"),
    true,
  );
  assert.equal(
    canTransitionMatchStatus("IN_PROGRESS", "CANCELLED"),
    true,
  );
});

test("5. lifecycle cannot skip authoritative states", () => {
  assert.equal(
    canTransitionMatchStatus("DRAFT", "IN_PROGRESS"),
    false,
  );
  assert.equal(
    canTransitionMatchStatus("DRAFT", "COMPLETED"),
    false,
  );
  assert.equal(
    canTransitionMatchStatus("SCHEDULED", "COMPLETED"),
    false,
  );
  assert.equal(
    canTransitionMatchStatus("DRAFT", "DRAFT"),
    false,
  );
});

test("6. terminal states cannot be reopened", () => {
  for (const status of ["COMPLETED", "CANCELLED"] as const) {
    assert.equal(isTerminalMatchStatus(status), true);
    assert.equal(
      canTransitionMatchStatus(status, "DRAFT"),
      false,
    );
    assert.equal(
      canTransitionMatchStatus(status, "SCHEDULED"),
      false,
    );
    assert.equal(
      canTransitionMatchStatus(status, "IN_PROGRESS"),
      false,
    );
  }
});

test("7. terminal or malformed Match evidence is locked fail closed", () => {
  assert.equal(isMatchEvidenceLocked("DRAFT"), false);
  assert.equal(isMatchEvidenceLocked("SCHEDULED"), false);
  assert.equal(isMatchEvidenceLocked("IN_PROGRESS"), false);
  assert.equal(isMatchEvidenceLocked("COMPLETED"), true);
  assert.equal(isMatchEvidenceLocked("CANCELLED"), true);
  assert.equal(isMatchEvidenceLocked("INVALID"), true);
  assert.equal(isMatchEvidenceLocked(null), true);
});

test("8. DRAFT may preserve explicitly missing scheduling data", () => {
  const result = validateMatchCoreData(draftMatch());

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("9. SCHEDULED requires opponent and kickoff time", () => {
  const result = validateMatchCoreData({
    ...draftMatch(),
    status: "SCHEDULED",
  });

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
});

test("10. complete SCHEDULED Match core data is valid", () => {
  const result = validateMatchCoreData(scheduledMatch());

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("11. IN_PROGRESS and COMPLETED preserve scheduling identity", () => {
  const inProgress = validateMatchCoreData({
    ...scheduledMatch(),
    status: "IN_PROGRESS",
  });

  const completed = validateMatchCoreData({
    ...scheduledMatch(),
    status: "COMPLETED",
  });

  assert.equal(inProgress.valid, true);
  assert.equal(completed.valid, true);
});

test("12. Match core rejects synthetic identity and unknown fields", () => {
  const result = validateMatchCoreData({
    ...draftMatch(),
    id: "match-1",
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.includes(
      "Match core data contains missing or unsupported fields.",
    ),
  );
});

test("13. Match text fields reject blank or untrimmed values", () => {
  const blankOpponent = validateMatchCoreData({
    ...draftMatch(),
    opponentName: "",
  });

  const untrimmedSquad = validateMatchCoreData({
    ...draftMatch(),
    squadLabel: " U15 ",
  });

  assert.equal(blankOpponent.valid, false);
  assert.ok(
    blankOpponent.errors.includes("Invalid opponent name."),
  );

  assert.equal(untrimmedSquad.valid, false);
  assert.ok(
    untrimmedSquad.errors.includes("Invalid squad label."),
  );
});

test("14. invalid schema, kickoff and venue fail closed", () => {
  const result = validateMatchCoreData({
    ...scheduledMatch(),
    schemaVersion: 2,
    kickoffAt: new Date("invalid"),
    venueType: "LOCAL",
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.includes("Unsupported Match schema version."),
  );
  assert.ok(
    result.errors.includes("Invalid kickoff time."),
  );
  assert.ok(
    result.errors.includes("Invalid venue type."),
  );
});

test("15. path segment validation rejects ambiguous identities", () => {
  assert.equal(
    isExactMatchPathSegment("match-1"),
    true,
  );
  assert.equal(
    isExactMatchPathSegment("player-1"),
    true,
  );
  assert.equal(
    isExactMatchPathSegment(" player-1"),
    false,
  );
  assert.equal(
    isExactMatchPathSegment("player/1"),
    false,
  );
  assert.equal(
    isExactMatchPathSegment(""),
    false,
  );
});

test("16. roster snapshot accepts explicit missing FUTID", () => {
  const result = validateMatchRosterSnapshotData(
    "player-1",
    rosterSnapshot(),
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("17. roster snapshot preserves FUTID when it exists", () => {
  const result = validateMatchRosterSnapshotData(
    "player-1",
    {
      ...rosterSnapshot(),
      futId: "FUT-000001",
    },
  );

  assert.equal(result.valid, true);
});

test("18. roster payload cannot duplicate player identity", () => {
  const result = validateMatchRosterSnapshotData(
    "player-1",
    {
      ...rosterSnapshot(),
      playerId: "player-1",
    },
  );

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.includes(
      "Match roster snapshot contains missing or unsupported fields.",
    ),
  );
});

test("19. roster rejects invalid canonical player path", () => {
  const result = validateMatchRosterSnapshotData(
    "academy/player-1",
    rosterSnapshot(),
  );

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.includes(
      "Invalid canonical player document ID.",
    ),
  );
});

test("20. malformed roster snapshot values fail closed", () => {
  const result = validateMatchRosterSnapshotData(
    "player-1",
    {
      ...rosterSnapshot(),
      futId: "",
      firstName: " Player ",
      position: "",
      jerseyNumber: 8.5,
    },
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("Invalid FUTID snapshot."));
  assert.ok(
    result.errors.includes("Invalid first-name snapshot."),
  );
  assert.ok(
    result.errors.includes("Invalid position snapshot."),
  );
  assert.ok(
    result.errors.includes("Invalid jersey-number snapshot."),
  );
});

test("21. validators never rewrite their source objects", () => {
  const match = scheduledMatch();
  const roster = rosterSnapshot();

  const matchBefore = JSON.stringify(match);
  const rosterBefore = JSON.stringify(roster);

  validateMatchCoreData(match);
  validateMatchRosterSnapshotData(
    "player-1",
    roster,
  );

  assert.equal(JSON.stringify(match), matchBefore);
  assert.equal(JSON.stringify(roster), rosterBefore);
});


test("22. Match text bounds match Firestore persistence contract", () => {
  const validBoundary = validateMatchCoreData({
    ...draftMatch(),
    squadLabel: "S".repeat(80),
    competitionName: "C".repeat(120),
    opponentName: "O".repeat(120),
  });

  const squadTooLong = validateMatchCoreData({
    ...draftMatch(),
    squadLabel: "S".repeat(81),
  });

  const competitionTooLong = validateMatchCoreData({
    ...draftMatch(),
    competitionName: "C".repeat(121),
  });

  const opponentTooLong = validateMatchCoreData({
    ...draftMatch(),
    opponentName: "O".repeat(121),
  });

  assert.equal(validBoundary.valid, true);
  assert.equal(squadTooLong.valid, false);
  assert.equal(competitionTooLong.valid, false);
  assert.equal(opponentTooLong.valid, false);
});

test("23. scheduled and active Match requires venue identity", () => {
  for (
    const status of [
      "SCHEDULED",
      "IN_PROGRESS",
      "COMPLETED",
    ] as const
  ) {
    const result = validateMatchCoreData({
      ...scheduledMatch(),
      status,
      venueType: null,
    });

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes(
        "Scheduled or active Match requires a venue type.",
      ),
    );
  }
});

test("24. roster required fields and bounds match Firestore Rules", () => {
  const invalidCases = [
    {
      ...rosterSnapshot(),
      futId: "F".repeat(65),
    },
    {
      ...rosterSnapshot(),
      firstName: "F".repeat(81),
    },
    {
      ...rosterSnapshot(),
      lastName: "L".repeat(81),
    },
    {
      ...rosterSnapshot(),
      position: "P".repeat(33),
    },
    {
      ...rosterSnapshot(),
      jerseyNumber: 100,
    },
    {
      ...rosterSnapshot(),
      firstName: null,
    },
    {
      ...rosterSnapshot(),
      lastName: null,
    },
    {
      ...rosterSnapshot(),
      position: null,
    },
    {
      ...rosterSnapshot(),
      jerseyNumber: null,
    },
  ];

  for (const snapshot of invalidCases) {
    const result = validateMatchRosterSnapshotData(
      "player-1",
      snapshot,
    );

    assert.equal(result.valid, false);
  }
});

test("25. roster exact persistence boundaries remain valid", () => {
  const result = validateMatchRosterSnapshotData(
    "player-1",
    {
      ...rosterSnapshot(),
      futId: "F".repeat(64),
      firstName: "F".repeat(80),
      lastName: "",
      position: "P".repeat(32),
      jerseyNumber: 99,
    },
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});
