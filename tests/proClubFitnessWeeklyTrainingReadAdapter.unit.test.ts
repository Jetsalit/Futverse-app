import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FOOTBALL_FITNESS_TEST_CATALOGUE } from "../src/lib/fitnessTestFoundation";
import {
  loadProClubFitnessWeeklyTrainingRead,
  type ProClubFitnessWeeklyTrainingReadAdapterServices,
} from "../src/lib/firestore/proClubFitnessWeeklyTrainingReadAdapter";
import type { ProClubSquadRosterRecord } from "../src/lib/firestore/proClubSquadRosterRepository";

const CLUB_ID = "club-a";
const REFERENCE_DATE = "2026-09-24";
const DEFINITION = FOOTBALL_FITNESS_TEST_CATALOGUE.find(({ key }) => key === "speed_10m");
assert.ok(DEFINITION);

function player(
  playerKey: string,
  firstName: string,
  lastName: string,
  status: ProClubSquadRosterRecord["status"],
): ProClubSquadRosterRecord {
  return {
    schemaVersion: 1,
    futId: null,
    firstName,
    lastName,
    position: "ST",
    additionalPositions: [],
    jerseyNumber: 9,
    squadLabel: "Senior",
    status,
    playerKey,
    createdAt: null,
    createdBy: "coach-a",
    updatedAt: null,
    updatedBy: "coach-a",
  };
}

function result(id: string, playerKey: string, observedOn = REFERENCE_DATE) {
  return {
    id,
    organization: { organizationType: "PRO_CLUB" as const, organizationId: CLUB_ID },
    data: {
      schemaVersion: 1,
      playerKey,
      definitionId: DEFINITION.id,
      definitionVersion: DEFINITION.version,
      value: 1.82,
      observedOn,
      source: "PRO_CLUB_FITNESS_ENTRY",
      recordedAt: { toMillis: () => 1789908000000 },
      recordedBy: "coach-a",
    },
  };
}

function services(
  players: ProClubSquadRosterRecord[],
  records: ReturnType<typeof result>[],
  calls: { roster: string[]; results: string[] } = { roster: [], results: [] },
): ProClubFitnessWeeklyTrainingReadAdapterServices {
  return {
    async listRoster(clubId) {
      calls.roster.push(clubId);
      return players;
    },
    async listFitnessResults(clubId) {
      calls.results.push(clubId);
      return records;
    },
  };
}

test("uses the exact club reads and maps canonical roster identity into the frozen selector", async () => {
  const calls = { roster: [] as string[], results: [] as string[] };
  const records = [
    result("active-result", "player-active"),
    result("inactive-result", "player-inactive"),
    result("released-result", "player-released"),
    result("after-reference-date", "player-active", "2026-09-25"),
  ];
  const selection = await loadProClubFitnessWeeklyTrainingRead({
    clubId: CLUB_ID,
    referenceDate: REFERENCE_DATE,
    definitions: [DEFINITION],
  }, services([
    player("player-active", " Alex ", "Active ", "ACTIVE"),
    player("player-inactive", "Indy", "Inactive", "INACTIVE"),
    player("player-released", "Rory", "Released", "RELEASED"),
  ], records, calls));

  assert.deepEqual(calls, { roster: [CLUB_ID], results: [CLUB_ID] });
  assert.equal(selection.organization.organizationType, "PRO_CLUB");
  assert.equal(selection.organization.organizationId, CLUB_ID);
  assert.equal(selection.prescription, null);
  assert.deepEqual(selection.observations.map(({ playerDisplayLabel, rosterStatus, resultId }) => ({
    playerDisplayLabel,
    rosterStatus,
    resultId,
  })), [
    { playerDisplayLabel: "Alex Active", rosterStatus: "ACTIVE", resultId: "active-result" },
    { playerDisplayLabel: "Indy Inactive", rosterStatus: "INACTIVE", resultId: "inactive-result" },
  ]);
});

test("preserves the explicit reference date and does not turn source failures into NO_DATA", async () => {
  const selection = await loadProClubFitnessWeeklyTrainingRead({
    clubId: CLUB_ID,
    referenceDate: REFERENCE_DATE,
    definitions: [DEFINITION],
  }, services([player("player-active", "Alex", "Active", "ACTIVE")], [
    result("on-reference-date", "player-active", REFERENCE_DATE),
  ]));
  assert.equal(selection.observations[0]?.observedOn, REFERENCE_DATE);

  const failingServices: ProClubFitnessWeeklyTrainingReadAdapterServices = {
    async listRoster() {
      return [player("player-active", "Alex", "Active", "ACTIVE")];
    },
    async listFitnessResults() {
      throw new Error("permission denied");
    },
  };
  await assert.rejects(
    loadProClubFitnessWeeklyTrainingRead({
      clubId: CLUB_ID,
      referenceDate: REFERENCE_DATE,
      definitions: [DEFINITION],
    }, failingServices),
    /permission denied/,
  );
});

test("adapter is read-only and does not import Fitness result writers", async () => {
  const source = await readFile(
    "src/lib/firestore/proClubFitnessWeeklyTrainingReadAdapter.ts",
    "utf8",
  );
  assert.match(source, /listProClubSquadRoster/);
  assert.match(source, /listProClubFitnessResultsForWeeklyTrainingRead/);
  assert.match(source, /selectProClubFitnessWeeklyTrainingReadV1/);
  assert.doesNotMatch(source, /createProClubFitnessResults|setDoc|addDoc|updateDoc|deleteDoc/);
});
