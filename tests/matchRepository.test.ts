import test from "node:test";
import assert from "node:assert/strict";

import {
  createAcademyMatch,
  createAcademyMatchRosterPlayer,
  listAcademyMatches,
  readAcademyMatch,
  readAcademyMatchRoster,
  removeAcademyMatchRosterPlayer,
  transitionAcademyMatchStatus,
  updateAcademyMatch,
  updateAcademyMatchRosterPlayer,
  type MatchRepositoryDependencies,
  type MatchRepositoryDocumentSnapshotLike,
} from "../src/lib/firestore/matchRepository";

import {
  MATCH_SCHEMA_VERSION,
  type MatchCoreData,
  type MatchStatus,
} from "../src/lib/matchFoundation";

const SERVER_TIMESTAMP = {
  type: "SERVER_TIMESTAMP",
};

function timestamp(
  iso: string,
) {
  return {
    toDate() {
      return new Date(iso);
    },
  };
}

function documentSnapshot(
  id: string,
  data?: Record<string, unknown>,
): MatchRepositoryDocumentSnapshotLike {
  return {
    id,

    exists() {
      return data !== undefined;
    },

    data() {
      return data;
    },
  };
}

function emptySnapshot(
  id: string,
): MatchRepositoryDocumentSnapshotLike {
  return documentSnapshot(
    id,
    undefined,
  );
}

function draftMatch(): MatchCoreData {
  return {
    schemaVersion:
      MATCH_SCHEMA_VERSION,
    status: "DRAFT",
    squadLabel: "U15",
    competitionName: "League",
    opponentName: null,
    kickoffAt: null,
    venueType: null,
  };
}

function scheduledMatch(
  status: MatchStatus = "SCHEDULED",
): MatchCoreData {
  return {
    schemaVersion:
      MATCH_SCHEMA_VERSION,
    status,
    squadLabel: "U15",
    competitionName: "League",
    opponentName: "Academy B",
    kickoffAt:
      new Date(
        "2026-09-01T10:00:00.000Z",
      ),
    venueType: "HOME",
  };
}

function readyDraft(): MatchCoreData {
  return {
    ...scheduledMatch(
      "SCHEDULED",
    ),
    status: "DRAFT",
  };
}

function storedMatch(
  status: MatchStatus = "DRAFT",
): Record<string, unknown> {
  const core =
    status === "DRAFT"
    || status === "CANCELLED"
      ? {
          ...draftMatch(),
          status,
        }
      : scheduledMatch(status);

  return {
    ...core,
    createdAt:
      timestamp(
        "2026-08-25T00:00:00.000Z",
      ),
    createdBy: "coach-1",
    updatedAt:
      timestamp(
        "2026-08-25T00:30:00.000Z",
      ),
    updatedBy: "coach-1",
  };
}

function storedRoster(
  overrides:
    Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion:
      MATCH_SCHEMA_VERSION,
    futId: "FUT-001",
    firstName: "Player",
    lastName: "One",
    position: "CM",
    jerseyNumber: 8,
    createdAt:
      timestamp(
        "2026-08-25T00:00:00.000Z",
      ),
    createdBy: "coach-1",
    updatedAt:
      timestamp(
        "2026-08-25T00:30:00.000Z",
      ),
    updatedBy: "coach-1",
    ...overrides,
  };
}

function dependencies(
  overrides:
    Partial<MatchRepositoryDependencies> = {},
): MatchRepositoryDependencies {
  return {
    getAuthenticatedUid() {
      return "coach-1";
    },

    createMatchId() {
      return "match-auto";
    },

    async getMatch(
      _academyId,
      matchId,
    ) {
      return emptySnapshot(
        matchId,
      );
    },

    async listMatches() {
      return {
        docs: [],
      };
    },

    async setMatch() {},

    async updateMatch() {},

    async runMatchTransaction() {
      throw new Error(
        "runMatchTransaction not configured for this test.",
      );
    },

    async getPlayer(
      _academyId,
      playerId,
    ) {
      return documentSnapshot(
        playerId,
        {
          firstName: "Player",
          lastName: "One",
          position: "CM",
        },
      );
    },

    async getRosterPlayer(
      _academyId,
      _matchId,
      playerId,
    ) {
      return emptySnapshot(
        playerId,
      );
    },

    async listRoster() {
      return {
        docs: [],
      };
    },

    async setRosterPlayer() {},

    async updateRosterPlayer() {},

    async deleteRosterPlayer() {},

    timestamp() {
      return SERVER_TIMESTAMP;
    },

    ...overrides,
  };
}

test(
  "1. create Match uses canonical path identity, authenticated actor and one server timestamp",
  async () => {
    let write:
      Record<string, unknown>
      | null = null;

    const deps =
      dependencies({
        async setMatch(
          academyId,
          matchId,
          data,
        ) {
          write = {
            academyId,
            matchId,
            data,
          };
        },
      });

    const source =
      draftMatch();

    const before =
      JSON.stringify(source);

    const matchId =
      await createAcademyMatch(
        {
          academyId:
            "academy-1",
          data: source,
        },
        deps,
      );

    assert.equal(
      matchId,
      "match-auto",
    );

    assert.equal(
      JSON.stringify(source),
      before,
    );

    assert.deepEqual(
      write,
      {
        academyId:
          "academy-1",
        matchId:
          "match-auto",
        data: {
          ...draftMatch(),
          createdAt:
            SERVER_TIMESTAMP,
          createdBy:
            "coach-1",
          updatedAt:
            SERVER_TIMESTAMP,
          updatedBy:
            "coach-1",
        },
      },
    );
  },
);

test(
  "2. create Match rejects invalid domain data before write",
  async () => {
    let writes = 0;

    const deps =
      dependencies({
        async setMatch() {
          writes += 1;
        },
      });

    await assert.rejects(
      () =>
        createAcademyMatch(
          {
            academyId:
              "academy-1",
            data: {
              ...draftMatch(),
              squadLabel: "",
            },
          },
          deps,
        ),
      /Invalid Match core data/,
    );

    assert.equal(
      writes,
      0,
    );
  },
);

test(
  "3. create Match rejects missing authenticated actor",
  async () => {
    const deps =
      dependencies({
        getAuthenticatedUid() {
          return null;
        },
      });

    await assert.rejects(
      () =>
        createAcademyMatch(
          {
            academyId:
              "academy-1",
            data:
              draftMatch(),
          },
          deps,
        ),
      /Authenticated UID/,
    );
  },
);

test(
  "4. read Match keeps Firestore document ID authoritative and converts timestamps",
  async () => {
    const deps =
      dependencies({
        async getMatch(
          _academyId,
          matchId,
        ) {
          return documentSnapshot(
            matchId,
            storedMatch(),
          );
        },
      });

    const match =
      await readAcademyMatch(
        "academy-1",
        "match-1",
        deps,
      );

    assert.ok(match);

    assert.equal(
      match.id,
      "match-1",
    );

    assert.equal(
      match.status,
      "DRAFT",
    );

    assert.equal(
      match.createdAt.toISOString(),
      "2026-08-25T00:00:00.000Z",
    );

    assert.equal(
      match.updatedAt.toISOString(),
      "2026-08-25T00:30:00.000Z",
    );
  },
);

test(
  "5. malformed stored Match with unsupported field fails closed",
  async () => {
    const deps =
      dependencies({
        async getMatch(
          _academyId,
          matchId,
        ) {
          return documentSnapshot(
            matchId,
            {
              ...storedMatch(),
              academyId:
                "academy-1",
            },
          );
        },
      });

    await assert.rejects(
      () =>
        readAcademyMatch(
          "academy-1",
          "match-1",
          deps,
        ),
      /missing or unsupported fields/,
    );
  },
);

test(
  "6. list Match maps canonical snapshot identities",
  async () => {
    const deps =
      dependencies({
        async listMatches() {
          return {
            docs: [
              documentSnapshot(
                "match-1",
                storedMatch(),
              ),
              documentSnapshot(
                "match-2",
                storedMatch(
                  "SCHEDULED",
                ),
              ),
            ],
          };
        },
      });

    const matches =
      await listAcademyMatches(
        "academy-1",
        deps,
      );

    assert.deepEqual(
      matches.map(
        (match) =>
          [
            match.id,
            match.status,
          ],
      ),
      [
        [
          "match-1",
          "DRAFT",
        ],
        [
          "match-2",
          "SCHEDULED",
        ],
      ],
    );
  },
);

test(
  "7. same-status nonterminal Match correction is atomic",
  async () => {
    let patch:
      Record<string, unknown>
      | null = null;

    const expected =
      draftMatch();

    const corrected = {
      ...expected,
      competitionName:
        "Corrected League",
    };

    const deps =
      dependencies({
        async runMatchTransaction(
          _academyId,
          matchId,
          buildPatch,
        ) {
          patch =
            buildPatch(
              documentSnapshot(
                matchId,
                storedMatch(
                  "DRAFT",
                ),
              ),
              SERVER_TIMESTAMP,
            );
        },
      });

    await updateAcademyMatch(
      {
        academyId:
          "academy-1",
        matchId:
          "match-1",
        expectedData:
          expected,
        data:
          corrected,
      },
      deps,
    );

    assert.ok(patch);

    assert.equal(
      patch.status,
      "DRAFT",
    );

    assert.equal(
      patch.competitionName,
      "Corrected League",
    );

    assert.equal(
      patch.createdAt,
      undefined,
    );

    assert.equal(
      patch.createdBy,
      undefined,
    );

    assert.equal(
      patch.updatedBy,
      "coach-1",
    );

    assert.equal(
      patch.updatedAt,
      SERVER_TIMESTAMP,
    );
  },
);

test(
  "7A. stale same-status correction cannot overwrite newer Match core data",
  async () => {
    let writes = 0;

    const expected =
      scheduledMatch(
        "SCHEDULED",
      );

    const corrected = {
      ...expected,
      competitionName:
        "Corrected League",
    };

    const deps =
      dependencies({
        async runMatchTransaction(
          _academyId,
          matchId,
          buildPatch,
        ) {
          buildPatch(
            documentSnapshot(
              matchId,
              {
                ...storedMatch(
                  "SCHEDULED",
                ),
                opponentName:
                  "Academy C",
              },
            ),
            SERVER_TIMESTAMP,
          );

          writes += 1;
        },
      });

    await assert.rejects(
      () =>
        updateAcademyMatch(
          {
            academyId:
              "academy-1",
            matchId:
              "match-1",
            expectedData:
              expected,
            data:
              corrected,
          },
          deps,
        ),
      /Match changed since it was loaded/,
    );

    assert.equal(
      writes,
      0,
    );
  },
);

test(
  "8. atomic lifecycle transition preserves authoritative core and writes status only",
  async () => {
    let patch:
      Record<string, unknown>
      | null = null;

    const expected =
      readyDraft();

    const deps =
      dependencies({
        async runMatchTransaction(
          _academyId,
          matchId,
          buildPatch,
        ) {
          patch =
            buildPatch(
              documentSnapshot(
                matchId,
                {
                  ...storedMatch(
                    "DRAFT",
                  ),
                  ...expected,
                },
              ),
              SERVER_TIMESTAMP,
            );
        },
      });

    await transitionAcademyMatchStatus(
      {
        academyId:
          "academy-1",
        matchId:
          "match-1",
        expectedData:
          expected,
        targetStatus:
          "SCHEDULED",
      },
      deps,
    );

    assert.deepEqual(
      patch,
      {
        status: "SCHEDULED",
        updatedAt:
          SERVER_TIMESTAMP,
        updatedBy:
          "coach-1",
      },
    );
  },
);

test(
  "8A. stale DRAFT cannot cancel an authoritative SCHEDULED Match",
  async () => {
    let writes = 0;

    const deps =
      dependencies({
        async runMatchTransaction(
          _academyId,
          matchId,
          buildPatch,
        ) {
          buildPatch(
            documentSnapshot(
              matchId,
              storedMatch(
                "SCHEDULED",
              ),
            ),
            SERVER_TIMESTAMP,
          );

          writes += 1;
        },
      });

    await assert.rejects(
      () =>
        transitionAcademyMatchStatus(
          {
            academyId:
              "academy-1",
            matchId:
              "match-1",
            expectedData:
              draftMatch(),
            targetStatus:
              "CANCELLED",
          },
          deps,
        ),
      /Match changed since it was loaded/,
    );

    assert.equal(
      writes,
      0,
    );
  },
);

test(
  "8B. stale SCHEDULED metadata cannot be frozen into CANCELLED evidence",
  async () => {
    let writes = 0;

    const expected =
      scheduledMatch(
        "SCHEDULED",
      );

    const deps =
      dependencies({
        async runMatchTransaction(
          _academyId,
          matchId,
          buildPatch,
        ) {
          buildPatch(
            documentSnapshot(
              matchId,
              {
                ...storedMatch(
                  "SCHEDULED",
                ),
                opponentName:
                  "Academy C",
              },
            ),
            SERVER_TIMESTAMP,
          );

          writes += 1;
        },
      });

    await assert.rejects(
      () =>
        transitionAcademyMatchStatus(
          {
            academyId:
              "academy-1",
            matchId:
              "match-1",
            expectedData:
              expected,
            targetStatus:
              "CANCELLED",
          },
          deps,
        ),
      /Match changed since it was loaded/,
    );

    assert.equal(
      writes,
      0,
    );
  },
);

test(
  "8C. transaction retry fails closed when Match changes after initial snapshot",
  async () => {
    let firstPatch:
      Record<string, unknown>
      | null = null;

    let committedWrites = 0;

    const expected =
      scheduledMatch(
        "SCHEDULED",
      );

    const deps =
      dependencies({
        async runMatchTransaction(
          _academyId,
          matchId,
          buildPatch,
        ) {
          firstPatch =
            buildPatch(
              documentSnapshot(
                matchId,
                {
                  ...storedMatch(
                    "SCHEDULED",
                  ),
                  ...expected,
                },
              ),
              SERVER_TIMESTAMP,
            );

          buildPatch(
            documentSnapshot(
              matchId,
              {
                ...storedMatch(
                  "SCHEDULED",
                ),
                ...expected,
                opponentName:
                  "Academy C",
              },
            ),
            SERVER_TIMESTAMP,
          );

          committedWrites += 1;
        },
      });

    await assert.rejects(
      () =>
        transitionAcademyMatchStatus(
          {
            academyId:
              "academy-1",
            matchId:
              "match-1",
            expectedData:
              expected,
            targetStatus:
              "CANCELLED",
          },
          deps,
        ),
      /Match changed since it was loaded/,
    );

    assert.deepEqual(
      firstPatch,
      {
        status: "CANCELLED",
        updatedAt:
          SERVER_TIMESTAMP,
        updatedBy:
          "coach-1",
      },
    );

    assert.equal(
      committedWrites,
      0,
    );
  },
);

test(
  "8D. full-payload update API rejects lifecycle transitions",
  async () => {
    let transactionCalls = 0;

    const expected =
      readyDraft();

    const deps =
      dependencies({
        async runMatchTransaction() {
          transactionCalls += 1;
        },
      });

    await assert.rejects(
      () =>
        updateAcademyMatch(
          {
            academyId:
              "academy-1",
            matchId:
              "match-1",
            expectedData:
              expected,
            data:
              scheduledMatch(
                "SCHEDULED",
              ),
          },
          deps,
        ),
      /transitionAcademyMatchStatus/,
    );

    assert.equal(
      transactionCalls,
      0,
    );
  },
);

test(
  "9. lifecycle skip fails closed",
  async () => {
    let writes = 0;

    const deps =
      dependencies({
        async runMatchTransaction() {
          writes += 1;
        },
      });

    await assert.rejects(
      () =>
        transitionAcademyMatchStatus(
          {
            academyId:
              "academy-1",
            matchId:
              "match-1",
            expectedData:
              draftMatch(),
            targetStatus:
              "COMPLETED",
          },
          deps,
        ),
      /Invalid Match lifecycle transition/,
    );

    assert.equal(
      writes,
      0,
    );
  },
);

test(
  "10. terminal Match cannot receive same-status correction",
  async () => {
    let writes = 0;

    const expected =
      scheduledMatch(
        "COMPLETED",
      );

    const deps =
      dependencies({
        async runMatchTransaction(
          _academyId,
          matchId,
          buildPatch,
        ) {
          buildPatch(
            documentSnapshot(
              matchId,
              storedMatch(
                "COMPLETED",
              ),
            ),
            SERVER_TIMESTAMP,
          );

          writes += 1;
        },
      });

    await assert.rejects(
      () =>
        updateAcademyMatch(
          {
            academyId:
              "academy-1",
            matchId:
              "match-1",
            expectedData:
              expected,
            data:
              expected,
          },
          deps,
        ),
      /Terminal Match evidence/,
    );

    assert.equal(
      writes,
      0,
    );
  },
);

test(
  "11. roster create sources identity snapshot from canonical Academy Player",
  async () => {
    let write:
      Record<string, unknown>
      | null = null;

    const deps =
      dependencies({
        async getMatch(
          _academyId,
          matchId,
        ) {
          return documentSnapshot(
            matchId,
            storedMatch(
              "DRAFT",
            ),
          );
        },

        async getPlayer(
          _academyId,
          playerId,
        ) {
          return documentSnapshot(
            playerId,
            {
              firstName:
                "Canonical",
              lastName:
                "Player",
              position:
                "ST",
              futId:
                "FUT-100",
              futID:
                "FUT-100",
            },
          );
        },

        async setRosterPlayer(
          academyId,
          matchId,
          playerId,
          data,
        ) {
          write = {
            academyId,
            matchId,
            playerId,
            data,
          };
        },
      });

    await createAcademyMatchRosterPlayer(
      {
        academyId:
          "academy-1",
        matchId:
          "match-1",
        playerId:
          "player-1",
        position:
          "RW",
        jerseyNumber:
          11,
      },
      deps,
    );

    assert.deepEqual(
      write,
      {
        academyId:
          "academy-1",
        matchId:
          "match-1",
        playerId:
          "player-1",
        data: {
          schemaVersion:
            MATCH_SCHEMA_VERSION,
          futId:
            "FUT-100",
          firstName:
            "Canonical",
          lastName:
            "Player",
          position:
            "RW",
          jerseyNumber:
            11,
          createdAt:
            SERVER_TIMESTAMP,
          createdBy:
            "coach-1",
          updatedAt:
            SERVER_TIMESTAMP,
          updatedBy:
            "coach-1",
        },
      },
    );
  },
);

test(
  "12. roster uses legacy futID only when canonical futId is absent",
  async () => {
    let writtenFutId:
      unknown = undefined;

    const deps =
      dependencies({
        async getMatch(
          _academyId,
          matchId,
        ) {
          return documentSnapshot(
            matchId,
            storedMatch(),
          );
        },

        async getPlayer(
          _academyId,
          playerId,
        ) {
          return documentSnapshot(
            playerId,
            {
              firstName: "Legacy",
              lastName: "Player",
              position: "CM",
              futID: "FUT-LEGACY",
            },
          );
        },

        async setRosterPlayer(
          _academyId,
          _matchId,
          _playerId,
          data,
        ) {
          writtenFutId =
            data.futId;
        },
      });

    await createAcademyMatchRosterPlayer(
      {
        academyId:
          "academy-1",
        matchId:
          "match-1",
        playerId:
          "player-1",
        position:
          "CM",
        jerseyNumber:
          8,
      },
      deps,
    );

    assert.equal(
      writtenFutId,
      "FUT-LEGACY",
    );
  },
);

test(
  "13. missing FUTID remains explicit null",
  async () => {
    let writtenFutId:
      unknown = "unexpected";

    const deps =
      dependencies({
        async getMatch(
          _academyId,
          matchId,
        ) {
          return documentSnapshot(
            matchId,
            storedMatch(),
          );
        },

        async getPlayer(
          _academyId,
          playerId,
        ) {
          return documentSnapshot(
            playerId,
            {
              firstName: "No",
              lastName: "Futid",
              position: "CM",
            },
          );
        },

        async setRosterPlayer(
          _academyId,
          _matchId,
          _playerId,
          data,
        ) {
          writtenFutId =
            data.futId;
        },
      });

    await createAcademyMatchRosterPlayer(
      {
        academyId:
          "academy-1",
        matchId:
          "match-1",
        playerId:
          "player-1",
        position:
          "CM",
        jerseyNumber:
          8,
      },
      deps,
    );

    assert.equal(
      writtenFutId,
      null,
    );
  },
);

test(
  "14. canonical and legacy FUTID conflict fails closed",
  async () => {
    let writes = 0;

    const deps =
      dependencies({
        async getMatch(
          _academyId,
          matchId,
        ) {
          return documentSnapshot(
            matchId,
            storedMatch(),
          );
        },

        async getPlayer(
          _academyId,
          playerId,
        ) {
          return documentSnapshot(
            playerId,
            {
              firstName: "Conflict",
              lastName: "Player",
              position: "CM",
              futId: "FUT-A",
              futID: "FUT-B",
            },
          );
        },

        async setRosterPlayer() {
          writes += 1;
        },
      });

    await assert.rejects(
      () =>
        createAcademyMatchRosterPlayer(
          {
            academyId:
              "academy-1",
            matchId:
              "match-1",
            playerId:
              "player-1",
            position:
              "CM",
            jerseyNumber:
              8,
          },
          deps,
        ),
      /conflicts with legacy futID/,
    );

    assert.equal(
      writes,
      0,
    );
  },
);

test(
  "15. roster update refreshes canonical identity fields but preserves creation audit",
  async () => {
    let patch:
      Record<string, unknown>
      | null = null;

    const deps =
      dependencies({
        async getMatch(
          _academyId,
          matchId,
        ) {
          return documentSnapshot(
            matchId,
            storedMatch(
              "SCHEDULED",
            ),
          );
        },

        async getRosterPlayer(
          _academyId,
          _matchId,
          playerId,
        ) {
          return documentSnapshot(
            playerId,
            storedRoster(),
          );
        },

        async getPlayer(
          _academyId,
          playerId,
        ) {
          return documentSnapshot(
            playerId,
            {
              firstName:
                "Updated",
              lastName:
                "Canonical",
              position:
                "CM",
              futId:
                "FUT-NEW",
            },
          );
        },

        async updateRosterPlayer(
          _academyId,
          _matchId,
          _playerId,
          data,
        ) {
          patch = data;
        },
      });

    await updateAcademyMatchRosterPlayer(
      {
        academyId:
          "academy-1",
        matchId:
          "match-1",
        playerId:
          "player-1",
        position:
          "AM",
        jerseyNumber:
          10,
      },
      deps,
    );

    assert.ok(patch);

    assert.equal(
      patch.firstName,
      "Updated",
    );

    assert.equal(
      patch.lastName,
      "Canonical",
    );

    assert.equal(
      patch.futId,
      "FUT-NEW",
    );

    assert.equal(
      patch.position,
      "AM",
    );

    assert.equal(
      patch.jerseyNumber,
      10,
    );

    assert.equal(
      patch.createdAt,
      undefined,
    );

    assert.equal(
      patch.createdBy,
      undefined,
    );

    assert.equal(
      patch.updatedAt,
      SERVER_TIMESTAMP,
    );

    assert.equal(
      patch.updatedBy,
      "coach-1",
    );
  },
);

test(
  "16. terminal Match blocks roster removal before delete",
  async () => {
    let deletes = 0;

    const deps =
      dependencies({
        async getMatch(
          _academyId,
          matchId,
        ) {
          return documentSnapshot(
            matchId,
            storedMatch(
              "COMPLETED",
            ),
          );
        },

        async getRosterPlayer(
          _academyId,
          _matchId,
          playerId,
        ) {
          return documentSnapshot(
            playerId,
            storedRoster(),
          );
        },

        async deleteRosterPlayer() {
          deletes += 1;
        },
      });

    await assert.rejects(
      () =>
        removeAcademyMatchRosterPlayer(
          "academy-1",
          "match-1",
          "player-1",
          deps,
        ),
      /locked for terminal Match status/,
    );

    assert.equal(
      deletes,
      0,
    );
  },
);

test(
  "17. roster read requires an authoritative Match and maps path player identity",
  async () => {
    const deps =
      dependencies({
        async getMatch(
          _academyId,
          matchId,
        ) {
          return documentSnapshot(
            matchId,
            storedMatch(),
          );
        },

        async listRoster() {
          return {
            docs: [
              documentSnapshot(
                "player-1",
                storedRoster(),
              ),
            ],
          };
        },
      });

    const roster =
      await readAcademyMatchRoster(
        "academy-1",
        "match-1",
        deps,
      );

    assert.equal(
      roster.length,
      1,
    );

    assert.equal(
      roster[0].id,
      "player-1",
    );

    assert.equal(
      roster[0].futId,
      "FUT-001",
    );
  },
);