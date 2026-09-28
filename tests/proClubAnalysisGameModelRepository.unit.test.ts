import assert from "node:assert/strict";
import test from "node:test";

import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import {
  getProClubAnalysisGameModel,
  saveProClubAnalysisGameModel,
  type ProClubAnalysisGameModelRepositoryOps,
} from "../src/lib/firestore/proClubAnalysisGameModelRepository";
import {
  addProClubAnalysisTopic,
  archiveProClubAnalysisTopic,
  createProClubAnalysisTopic,
  reorderProClubAnalysisTopics,
  setProClubAnalysisTopicEnabled,
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

function createHarness(
  currentAuthority = authority(),
): {
  ops: ProClubAnalysisGameModelRepositoryOps;
  docs: Map<string, { id: string; data: Record<string, unknown> }>;
} {
  const docs = new Map<string, { id: string; data: Record<string, unknown> }>();
  let tick = 0;
  const ops: ProClubAnalysisGameModelRepositoryOps = {
    getAuthenticatedUid: () => UID,
    async resolveAuthority(clubId, uid) {
      if (clubId !== CLUB || uid !== UID) return { state: "MISSING" };
      return { state: "FOUND", value: currentAuthority };
    },
    async readDocument(path) {
      const record = docs.get(path.join("/"));
      return record
        ? { id: record.id, exists: true, data: structuredClone(record.data) }
        : { id: path[path.length - 1]!, exists: false };
    },
    async setDocument(path, data) {
      docs.set(path.join("/"), {
        id: path[path.length - 1]!,
        data: structuredClone(data) as Record<string, unknown>,
      });
    },
    async updateDocument(path, data) {
      const key = path.join("/");
      const record = docs.get(key);
      if (!record) throw new Error("missing update target");
      docs.set(key, {
        id: record.id,
        data: { ...record.data, ...structuredClone(data) as Record<string, unknown> },
      });
    },
    timestamp() {
      tick += 1;
      return new Date(Date.UTC(2026, 8, 27, 11, 0, tick));
    },
  };
  return { ops, docs };
}

test("missing Analysis Game Model reads editable defaults without creating a document", async () => {
  const { ops, docs } = createHarness();
  const model = await getProClubAnalysisGameModel(CLUB, ops);

  assert.equal(model.revision, 0);
  assert.ok(model.topics.some(({ id, name }) => id === "build-up" && name === "Build Up"));
  assert.ok(model.topics.some(({ id, section }) => id === "pressing" && section === "OUT_DEF"));
  assert.equal(docs.size, 0);
});

test("topic adds, reorder, enable/disable, and archive state survive a save and reload", async () => {
  const { ops } = createHarness();
  const defaults = (await getProClubAnalysisGameModel(CLUB, ops)).topics;
  const withTopic = addProClubAnalysisTopic(
    defaults,
    createProClubAnalysisTopic({
      id: "transition-da",
      name: "Transition D-A",
      section: "IN_POSSESSION_ATT",
      inputType: "CHECKBOX",
      displayOrder: defaults.length,
    }),
  );
  const reordered = reorderProClubAnalysisTopics(withTopic, [
    "transition-da",
    ...defaults.map(({ id }) => id),
  ]);
  const disabled = setProClubAnalysisTopicEnabled(
    reordered,
    "pressing",
    false,
  );
  const archived = archiveProClubAnalysisTopic(disabled, "width");
  const saved = await saveProClubAnalysisGameModel(CLUB, archived, 0, ops);
  const loaded = await getProClubAnalysisGameModel(CLUB, ops);

  assert.equal(saved.revision, 1);
  assert.equal(loaded.topics[0]?.id, "transition-da");
  assert.equal(loaded.topics.find(({ id }) => id === "pressing")?.enabled, false);
  assert.equal(loaded.topics.find(({ id }) => id === "width")?.archived, true);
  assert.equal(loaded.topics.find(({ id }) => id === "width")?.enabled, false);
});

test("topic template updates reject stale revisions and non-Analysis staff", async () => {
  const { ops } = createHarness();
  const model = await getProClubAnalysisGameModel(CLUB, ops);
  const saved = await saveProClubAnalysisGameModel(
    CLUB,
    model.topics,
    0,
    ops,
  );
  await assert.rejects(
    saveProClubAnalysisGameModel(CLUB, saved.topics, 0, ops),
    /stale/i,
  );

  const denied = createHarness(authority("FITNESS_COACH"));
  await assert.rejects(
    getProClubAnalysisGameModel(CLUB, denied.ops),
    /analysis|authority|role/i,
  );
});
