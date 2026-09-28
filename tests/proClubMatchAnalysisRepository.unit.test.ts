import assert from "node:assert/strict";
import test from "node:test";

import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import {
  completeProClubMatchAnalysisRecord,
  getProClubMatchAnalysis,
  saveProClubMatchAnalysisDraft,
  type ProClubMatchAnalysisRepositoryOps,
} from "../src/lib/firestore/proClubMatchAnalysisRepository";
import {
  createDefaultProClubAnalysisTopics,
  createEmptyProClubMatchAnalysis,
  createProClubAnalysisTopicSnapshot,
  type ProClubMatchAnalysis,
} from "../src/lib/proClubMatchAnalysis";

const CLUB = "club-a";
const UID = "analyst-a";

function authority(
  staffRole: ProClubOrganizationAuthority["staffRole"] = "ANALYST",
): ProClubOrganizationAuthority {
  return {
    organizationId: CLUB,
    organizationType: "PRO_CLUB",
    organizationName: "Club A",
    organizationLevel: "T3",
    organizationStatus: "ACTIVE",
    userId: UID,
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole,
  };
}

type Stored = { id: string; data: Record<string, unknown> };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createHarness(
  currentAuthority = authority(),
): {
  ops: ProClubMatchAnalysisRepositoryOps;
  docs: Map<string, Stored>;
} {
  const docs = new Map<string, Stored>();
  let tick = 0;

  for (const matchId of ["match-one", "match-two"]) {
    docs.set("proClubs/" + CLUB + "/matches/" + matchId, {
      id: matchId,
      data: { schemaVersion: 1, status: "DRAFT" },
    });
  }

  const ops: ProClubMatchAnalysisRepositoryOps = {
    getAuthenticatedUid: () => UID,
    async resolveAuthority(clubId, uid) {
      if (clubId !== CLUB || uid !== UID) return { state: "MISSING" };
      return { state: "FOUND", value: currentAuthority };
    },
    async readDocument(path) {
      const record = docs.get(path.join("/"));
      return record
        ? { id: record.id, exists: true, data: clone(record.data) }
        : { id: path[path.length - 1]!, exists: false };
    },
    async setDocument(path, data) {
      docs.set(path.join("/"), {
        id: path[path.length - 1]!,
        data: clone(data) as Record<string, unknown>,
      });
    },
    async updateDocument(path, data) {
      const key = path.join("/");
      const current = docs.get(key);
      if (!current) throw new Error("missing update target");
      docs.set(key, {
        id: current.id,
        data: { ...current.data, ...clone(data) as Record<string, unknown> },
      });
    },
    timestamp() {
      tick += 1;
      return new Date(Date.UTC(2026, 8, 27, 10, 0, tick));
    },
  };
  return { ops, docs };
}

function draft(matchId: string): ProClubMatchAnalysis {
  return createEmptyProClubMatchAnalysis({
    matchId,
    clubName: "Club A",
    clubLogoUrl: null,
    competitionName: "League",
    opponentName: matchId === "match-one" ? "North FC" : "South FC",
    kickoffAt: null,
    topicSnapshot: createProClubAnalysisTopicSnapshot(
      createDefaultProClubAnalysisTopics(),
    ),
  });
}

test("Analysis draft saves with a frozen topic snapshot and reopens from its match path", async () => {
  const { ops, docs } = createHarness();
  const saved = await saveProClubMatchAnalysisDraft(
    CLUB,
    "match-one",
    draft("match-one"),
    0,
    ops,
  );

  assert.equal(saved.status, "DRAFT");
  assert.equal(saved.revision, 1);
  assert.equal(saved.createdBy, UID);
  assert.equal(
    docs.get("proClubs/club-a/matches/match-one/analysis/current")?.id,
    "current",
  );

  const editedDraft = {
    ...saved,
    teamSnapshot: { ...saved.teamSnapshot, logoUrl: "https://assets.example.test/club.png" },
    matchSnapshot: { ...saved.matchSnapshot, competitionName: "League Cup" },
    opponentSnapshot: { ...saved.opponentSnapshot, logoUrl: "data:image/webp;base64,AAAA" },
    topicSnapshot: saved.topicSnapshot.map((topic) =>
      topic.id === "build-up" ? { ...topic, name: "Changed Template" } : topic,
    ),
  };
  const secondSave = await saveProClubMatchAnalysisDraft(
    CLUB,
    "match-one",
    editedDraft,
    1,
    ops,
  );

  assert.equal(secondSave.revision, 2);
  assert.equal(
    secondSave.topicSnapshot.find(({ id }) => id === "build-up")?.name,
    "Build Up",
  );
  assert.equal(secondSave.teamSnapshot.logoUrl, "https://assets.example.test/club.png");
  assert.equal(secondSave.matchSnapshot.competitionName, "League Cup");
  assert.equal(secondSave.opponentSnapshot.logoUrl, "data:image/webp;base64,AAAA");
  assert.equal(
    (await getProClubMatchAnalysis(CLUB, "match-one", ops))?.revision,
    2,
  );
});

test("malformed stored Analysis is normalized and remains editable without rewriting its frozen topic snapshot", async () => {
  const { ops, docs } = createHarness();
  const saved = await saveProClubMatchAnalysisDraft(
    CLUB,
    "match-one",
    draft("match-one"),
    0,
    ops,
  );
  const path = "proClubs/club-a/matches/match-one/analysis/current";
  const stored = docs.get(path);
  assert.ok(stored);
  const malformed = clone(stored.data);
  const sections = malformed.sections as Record<string, Record<string, unknown>>;
  sections.FORMATION_LINEUP!.formation = 42;
  malformed.topicSnapshot = [
    ...(malformed.topicSnapshot as unknown[]),
    null,
  ];
  docs.set(path, { id: "current", data: malformed });

  const reopened = await getProClubMatchAnalysis(CLUB, "match-one", ops);

  assert.ok(reopened);
  assert.equal(reopened.recoveryWarning, true);
  assert.equal(reopened.recoverySaveRequired, true);
  assert.equal(reopened.sections.FORMATION_LINEUP.formation, "4-3-3");
  assert.equal(reopened.topicSnapshot.length, saved.topicSnapshot.length);

  const repaired = await saveProClubMatchAnalysisDraft(
    CLUB,
    "match-one",
    reopened,
    1,
    ops,
  );

  assert.equal(repaired.revision, 2);
  assert.equal(repaired.sections.FORMATION_LINEUP.formation, "4-3-3");
  assert.equal(repaired.recoveryWarning, true);
  assert.equal(repaired.recoverySaveRequired, undefined);
  assert.equal((docs.get(path)?.data.topicSnapshot as unknown[]).length, saved.topicSnapshot.length + 1);

  const completed = await completeProClubMatchAnalysisRecord(
    CLUB,
    "match-one",
    repaired,
    repaired.revision,
    ops,
  );
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.recoveryWarning, true);
  assert.equal((docs.get(path)?.data.topicSnapshot as unknown[]).at(-1), null);
});

test("a legacy Analysis with a null first topic entry repairs to an empty immutable snapshot", async () => {
  const { ops, docs } = createHarness();
  await saveProClubMatchAnalysisDraft(CLUB, "match-one", draft("match-one"), 0, ops);
  const path = "proClubs/club-a/matches/match-one/analysis/current";
  const stored = docs.get(path);
  assert.ok(stored);
  docs.set(path, {
    id: "current",
    data: { ...clone(stored.data), topicSnapshot: [null] },
  });

  const recovered = await getProClubMatchAnalysis(CLUB, "match-one", ops);
  assert.ok(recovered);
  assert.equal(recovered.recoveryWarning, true);
  assert.equal(recovered.recoverySaveRequired, true);
  assert.deepEqual(recovered.topicSnapshot, []);

  const repaired = await saveProClubMatchAnalysisDraft(
    CLUB,
    "match-one",
    recovered,
    recovered.revision,
    ops,
  );
  assert.equal(repaired.revision, 2);
  assert.equal(repaired.recoveryWarning, undefined);
  assert.deepEqual(repaired.topicSnapshot, []);
  assert.deepEqual(repaired.sections.IN_POSSESSION_ATT.topicValues, {});
  assert.deepEqual(docs.get(path)?.data.topicSnapshot, []);
});

test("analyses for different matches persist at independent paths", async () => {
  const { ops } = createHarness();
  const first = await saveProClubMatchAnalysisDraft(
    CLUB,
    "match-one",
    draft("match-one"),
    0,
    ops,
  );
  const second = await saveProClubMatchAnalysisDraft(
    CLUB,
    "match-two",
    draft("match-two"),
    0,
    ops,
  );

  assert.equal(first.matchSnapshot.opponentName, "North FC");
  assert.equal(second.matchSnapshot.opponentName, "South FC");
  assert.equal((await getProClubMatchAnalysis(CLUB, "match-one", ops))?.matchId, "match-one");
  assert.equal((await getProClubMatchAnalysis(CLUB, "match-two", ops))?.matchId, "match-two");
});

test("stale drafts are rejected and completed analysis cannot be edited", async () => {
  const { ops } = createHarness();
  const saved = await saveProClubMatchAnalysisDraft(
    CLUB,
    "match-one",
    draft("match-one"),
    0,
    ops,
  );

  await assert.rejects(
    saveProClubMatchAnalysisDraft(
      CLUB,
      "match-one",
      saved,
      0,
      ops,
    ),
    /stale/i,
  );

  const completed = await completeProClubMatchAnalysisRecord(
    CLUB,
    "match-one",
    saved,
    1,
    ops,
  );
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.revision, 2);

  await assert.rejects(
    saveProClubMatchAnalysisDraft(
      CLUB,
      "match-one",
      { ...completed, status: "DRAFT" },
      2,
      ops,
    ),
    /completed|immutable/i,
  );
});

test("staff outside the Analysis V1 role contract cannot read or write analyses", async () => {
  const { ops } = createHarness(authority("FITNESS_COACH"));

  await assert.rejects(
    saveProClubMatchAnalysisDraft(
      CLUB,
      "match-one",
      draft("match-one"),
      0,
      ops,
    ),
    /analysis|authority|role/i,
  );
  await assert.rejects(
    getProClubMatchAnalysis(CLUB, "match-one", ops),
    /analysis|authority|role/i,
  );
});
