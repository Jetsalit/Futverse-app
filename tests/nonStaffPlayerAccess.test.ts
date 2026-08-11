import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  linkedPlayerLookupForUser,
  resolveAuthoritativeAssociationSnapshot,
  type AssociationDocumentCandidate,
} from "../src/lib/nonStaffPlayerAccess";

const uid = "parent-user";

const user = (overrides: Record<string, unknown> = {}) => ({
  uid,
  role: "PARENT" as const,
  status: "ACTIVE",
  academyId: "legacy-academy",
  activeAcademyId: "tampered-academy",
  linkedPlayerId: "legacy-player",
  ...overrides,
});

const association = (
  academyId: string,
  playerId: string,
  overrides: Record<string, unknown> = {},
): AssociationDocumentCandidate => ({
  id: playerId,
  path: `academies/${academyId}/nonstaffUsers/${uid}/playerAssociations/${playerId}`,
  data: {
    userId: uid,
    academyId,
    playerId,
    role: "PARENT",
    status: "ACTIVE",
    ...overrides,
  },
});

const snapshot = (
  documents: AssociationDocumentCandidate[],
  metadata: Partial<{ fromCache: boolean; hasPendingWrites: boolean }> = {},
) => ({
  fromCache: false,
  hasPendingWrites: false,
  documents,
  ...metadata,
});

describe("authoritative nonstaff player access resolution", () => {
  it("uses only authenticated identity, active account status, and nonstaff role for lookup", () => {
    assert.deepEqual(linkedPlayerLookupForUser(user()), {
      type: "ASSOCIATION_LISTENER",
      uid,
      role: "PARENT",
    });
    assert.deepEqual(
      linkedPlayerLookupForUser(user({
        academyId: "other-academy",
        activeAcademyId: "other-academy",
        linkedPlayerId: "other-player",
      })),
      { type: "ASSOCIATION_LISTENER", uid, role: "PARENT" },
    );
  });

  it("resolves exact ACTIVE PLAYER and PARENT associations", () => {
    const parentResolution = resolveAuthoritativeAssociationSnapshot(
      user(),
      snapshot([
        association("academy-b", "player-b"),
        association("academy-a", "player-a"),
      ]),
    );
    assert.equal(parentResolution.type, "AUTHORIZED_ASSOCIATIONS");
    if (parentResolution.type === "AUTHORIZED_ASSOCIATIONS") {
      assert.deepEqual(
        parentResolution.associations.map(({ academyId, playerId }) => ({ academyId, playerId })),
        [
          { academyId: "academy-a", playerId: "player-a" },
          { academyId: "academy-b", playerId: "player-b" },
        ],
      );
    }

    const playerUid = "player-user";
    const playerResolution = resolveAuthoritativeAssociationSnapshot(
      { uid: playerUid, role: "PLAYER", status: "Active" },
      snapshot([{
        id: "profile-a",
        path: `academies/academy-a/nonstaffUsers/${playerUid}/playerAssociations/profile-a`,
        data: {
          userId: playerUid,
          academyId: "academy-a",
          playerId: "profile-a",
          role: "PLAYER",
          status: "ACTIVE",
        },
      }]),
    );
    assert.equal(playerResolution.type, "AUTHORIZED_ASSOCIATIONS");
  });

  it("fails closed for empty/deleted, inactive-only, and revoked-only snapshots", () => {
    assert.equal(
      resolveAuthoritativeAssociationSnapshot(user(), snapshot([])).type,
      "UNAVAILABLE",
    );
    assert.equal(
      resolveAuthoritativeAssociationSnapshot(
        user(),
        snapshot([association("academy-a", "player-a", { status: "INACTIVE" })]),
      ).type,
      "UNAVAILABLE",
    );
    assert.equal(
      resolveAuthoritativeAssociationSnapshot(
        user(),
        snapshot([association("academy-a", "player-a", { status: "REVOKED" })]),
      ).type,
      "UNAVAILABLE",
    );
  });

  it("removes a revoked child while preserving another exact ACTIVE child", () => {
    const resolution = resolveAuthoritativeAssociationSnapshot(
      user(),
      snapshot([
        association("academy-a", "player-a", { status: "REVOKED" }),
        association("academy-a", "player-b"),
      ]),
    );
    assert.equal(resolution.type, "AUTHORIZED_ASSOCIATIONS");
    if (resolution.type === "AUTHORIZED_ASSOCIATIONS") {
      assert.deepEqual(
        resolution.associations.map(({ playerId }) => playerId),
        ["player-b"],
      );
    }
  });

  it("fails closed for cached and pending-write snapshots", () => {
    const documents = [association("academy-a", "player-a")];
    assert.equal(
      resolveAuthoritativeAssociationSnapshot(
        user(),
        snapshot(documents, { fromCache: true }),
      ).type,
      "UNAVAILABLE",
    );
    assert.equal(
      resolveAuthoritativeAssociationSnapshot(
        user(),
        snapshot(documents, { hasPendingWrites: true }),
      ).type,
      "UNAVAILABLE",
    );
  });

  it("fails closed for inactive accounts, unknown roles, and role mismatches", () => {
    const documents = [association("academy-a", "player-a")];
    assert.equal(
      resolveAuthoritativeAssociationSnapshot(
        user({ status: "Inactive" }),
        snapshot(documents),
      ).type,
      "UNAVAILABLE",
    );
    assert.equal(
      resolveAuthoritativeAssociationSnapshot(
        user({ role: "USER" }),
        snapshot(documents),
      ).type,
      "UNAVAILABLE",
    );
    assert.equal(
      resolveAuthoritativeAssociationSnapshot(
        user(),
        snapshot([association("academy-a", "player-a", { role: "PLAYER" })]),
      ).type,
      "UNAVAILABLE",
    );
  });

  it("fails closed for UID, academy, player, path, canonical ID, or shape mismatch", () => {
    const invalidCandidates = [
      association("academy-a", "player-a", { userId: "wrong-user" }),
      association("academy-a", "player-a", { academyId: "academy-b" }),
      association("academy-a", "player-a", { playerId: "player-b" }),
      { ...association("academy-a", "player-a"), id: "different-id" },
      { ...association("academy-a", "player-a"), path: "other/playerAssociations/player-a" },
      association(" academy-a", "player-a"),
      association("academy-a", " player-a"),
      association("academy-a", "player-a", { unexpected: true }),
      association("academy-a", "player-a", { status: "UNKNOWN" }),
    ];

    for (const candidate of invalidCandidates) {
      assert.equal(
        resolveAuthoritativeAssociationSnapshot(user(), snapshot([candidate])).type,
        "UNAVAILABLE",
      );
    }
  });

  it("fails closed for duplicate canonical associations", () => {
    const candidate = association("academy-a", "player-a");
    assert.equal(
      resolveAuthoritativeAssociationSnapshot(
        user(),
        snapshot([candidate, { ...candidate }]),
      ).type,
      "UNAVAILABLE",
    );
  });
});
