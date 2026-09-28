import assert from "node:assert/strict";
import test from "node:test";

import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import {
  getProClubAnalysisTeamLogo,
  listProClubAnalysisOpponentTeams,
  saveProClubAnalysisOpponentTeam,
  saveProClubAnalysisTeamLogo,
  type ProClubAnalysisLogoRepositoryOps,
} from "../src/lib/firestore/proClubAnalysisLogoRepository";

const CLUB = "club-a";
const UID = "analyst-a";
const LOGO = {
  dataUrl: "data:image/webp;base64,AAAA",
  mimeType: "image/webp" as const,
  width: 128,
  height: 128,
  byteSize: 3,
};

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

function harness(
  actor = authority(),
): { ops: ProClubAnalysisLogoRepositoryOps; docs: Map<string, { id: string; data: Record<string, unknown> }> } {
  const docs = new Map<string, { id: string; data: Record<string, unknown> }>();
  let tick = 0;
  const ops: ProClubAnalysisLogoRepositoryOps = {
    getAuthenticatedUid: () => UID,
    async resolveAuthority(clubId, uid) {
      if (clubId !== CLUB || uid !== UID) return { state: "MISSING" };
      return { state: "FOUND", value: actor };
    },
    async readDocument(path) {
      const item = docs.get(path.join("/"));
      return item
        ? { id: item.id, exists: true, data: structuredClone(item.data) }
        : { id: path[path.length - 1]!, exists: false };
    },
    async listDocuments(path) {
      const prefix = path.join("/") + "/";
      return {
        documents: [...docs.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, item]) => ({ id: item.id, exists: true, data: structuredClone(item.data) })),
      };
    },
    async setDocument(path, data) {
      docs.set(path.join("/"), { id: path[path.length - 1]!, data: structuredClone(data) as Record<string, unknown> });
    },
    async updateDocument(path, data) {
      const key = path.join("/");
      const item = docs.get(key);
      if (!item) throw new Error("missing update target");
      docs.set(key, { id: item.id, data: { ...item.data, ...structuredClone(data) as Record<string, unknown> } });
    },
    timestamp() {
      tick += 1;
      return new Date(Date.UTC(2026, 8, 27, 11, 0, tick));
    },
  };
  return { ops, docs };
}

test("own logo can be replaced and removed without losing audit provenance", async () => {
  const { ops } = harness();
  const saved = await saveProClubAnalysisTeamLogo(CLUB, LOGO, ops);
  assert.equal(saved?.logoUrl, LOGO.dataUrl);
  assert.equal(saved?.createdBy, UID);

  const removed = await saveProClubAnalysisTeamLogo(CLUB, null, ops);
  assert.equal(removed?.logoUrl, null);
  assert.equal(removed?.createdBy, UID);
  assert.equal(removed?.updatedBy, UID);
  assert.equal(await getProClubAnalysisTeamLogo(CLUB, ops).then((item) => item?.logoUrl), null);
});

test("opponent logo is tenant-scoped, reusable, and removable; other roles are denied", async () => {
  const { ops } = harness();
  await saveProClubAnalysisOpponentTeam(CLUB, "opponent-1", "Riverside FC", LOGO, ops);
  assert.equal((await listProClubAnalysisOpponentTeams(CLUB, ops))[0]?.logoUrl, LOGO.dataUrl);

  await saveProClubAnalysisOpponentTeam(CLUB, "opponent-1", "Riverside FC", null, ops);
  assert.equal((await listProClubAnalysisOpponentTeams(CLUB, ops))[0]?.logoUrl, null);

  const denied = harness(authority("FITNESS_COACH"));
  await assert.rejects(
    listProClubAnalysisOpponentTeams(CLUB, denied.ops),
    /analysis|authority|role/i,
  );
});
