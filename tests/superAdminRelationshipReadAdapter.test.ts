import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadSuperAdminRelationshipInventory,
  type SuperAdminReadDocument,
  type SuperAdminRelationshipReadOps,
} from "../src/lib/firestore/superAdminRelationshipReadAdapter";

function makeOps(
  collections: Record<string, SuperAdminReadDocument[]>,
  associationDocs: SuperAdminReadDocument[] = [],
  onRead?: (path: string) => void,
): SuperAdminRelationshipReadOps {
  return {
    async listCollection(path) {
      const key = path.join("/");
      onRead?.(key);
      if (!(key in collections)) {
        throw new Error(`Unexpected collection read: ${key}`);
      }
      return collections[key];
    },
    async listCollectionGroup(collectionId) {
      onRead?.(`collectionGroup:${collectionId}`);
      assert.equal(collectionId, "playerAssociations");
      return associationDocs;
    },
  };
}

const academy = {
  id: "academy-talumball",
  data: { name: "Talumball Academy" },
};

const canonicalAdmin = {
  id: "admin-1",
  data: {
    userId: "admin-1",
    academyId: "academy-talumball",
    role: "ADMIN",
    status: "ACTIVE",
    source: "SUPERADMIN_ASSIGNMENT",
  },
};

const canonicalParentAssociation: SuperAdminReadDocument = {
  id: "player-1",
  path: "academies/academy-talumball/nonstaffUsers/parent-1/playerAssociations/player-1",
  data: {
    userId: "parent-1",
    academyId: "academy-talumball",
    playerId: "player-1",
    role: "PARENT",
    status: "ACTIVE",
  },
};

describe("superAdminRelationshipReadAdapter", () => {
  it("1. reads users, academies, staff memberships, and one global association collection-group", async () => {
    const reads: string[] = [];
    const result = await loadSuperAdminRelationshipInventory(
      makeOps(
        {
          users: [
            {
              id: "admin-1",
              data: {
                name: "Max Coach",
                role: "ADMIN",
                status: "ACTIVE",
              },
            },
          ],
          academies: [academy],
          "academies/academy-talumball/members": [canonicalAdmin],
        },
        [],
        (path) => reads.push(path),
      ),
    );

    assert.equal(result.state, "READY");
    assert.deepEqual(reads.sort(), [
      "academies",
      "academies/academy-talumball/members",
      "collectionGroup:playerAssociations",
      "users",
    ]);
  });

  it("2. composes canonical staff membership into a verified relationship row", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps({
        users: [
          {
            id: "admin-1",
            data: { name: "Max Coach", role: "ADMIN", status: "ACTIVE" },
          },
        ],
        academies: [academy],
        "academies/academy-talumball/members": [canonicalAdmin],
      }),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;
    const [row] = result.inventory.rows;
    assert.equal(row.source, "CANONICAL");
    assert.equal(row.integrity, "VERIFIED");
    assert.equal(row.organizations[0]?.relationship, "ADMIN");
    assert.equal(row.organizations[0]?.organizationName, "Talumball Academy");
  });

  it("3. composes canonical PARENT association from exact collection-group path", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps(
        {
          users: [
            {
              id: "parent-1",
              data: { name: "Parent One", role: "PARENT", status: "ACTIVE" },
            },
          ],
          academies: [academy],
          "academies/academy-talumball/members": [],
        },
        [canonicalParentAssociation],
      ),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;
    const [row] = result.inventory.rows;
    assert.equal(row.source, "CANONICAL");
    assert.equal(row.integrity, "VERIFIED");
    assert.equal(row.organizations[0]?.relationship, "PARENT");
    assert.equal(row.organizations[0]?.playerId, "player-1");
    assert.equal(row.organizations[0]?.organizationId, "academy-talumball");
    assert.equal(result.inventory.coverage.nonStaffAssociations, "AVAILABLE");
    assert.equal(result.inventory.isCompleteForCurrentAccounts, true);
  });

  it("4. composes canonical PLAYER association without using legacy routing metadata", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps(
        {
          users: [
            {
              id: "player-user",
              data: {
                role: "PLAYER",
                status: "ACTIVE",
                academyId: "legacy-other-academy",
              },
            },
          ],
          academies: [academy],
          "academies/academy-talumball/members": [],
        },
        [
          {
            id: "player-9",
            path: "academies/academy-talumball/nonstaffUsers/player-user/playerAssociations/player-9",
            data: {
              userId: "player-user",
              academyId: "academy-talumball",
              playerId: "player-9",
              role: "PLAYER",
              status: "ACTIVE",
            },
          },
        ],
      ),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;
    const [row] = result.inventory.rows;
    assert.equal(row.organizations[0]?.organizationId, "academy-talumball");
    assert.equal(row.organizations[0]?.relationship, "PLAYER");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.ok(row.issues.includes("LEGACY_ORGANIZATION_DIVERGES"));
  });

  it("5. rejects a collection-group document when canonical fields disagree with its path", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps(
        {
          users: [
            {
              id: "parent-1",
              data: { role: "PARENT", status: "ACTIVE" },
            },
          ],
          academies: [academy],
          "academies/academy-talumball/members": [],
        },
        [
          {
            ...canonicalParentAssociation,
            data: {
              ...canonicalParentAssociation.data,
              userId: "different-parent",
            },
          },
        ],
      ),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;
    const [row] = result.inventory.rows;
    assert.equal(row.source, "UNASSIGNED");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.ok(row.issues.includes("INVALID_NONSTAFF_ASSOCIATION_EVIDENCE"));
  });

  it("6. preserves malformed membership evidence for resolver review", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps({
        users: [{ id: "admin-1", data: { role: "ADMIN", status: "ACTIVE" } }],
        academies: [academy],
        "academies/academy-talumball/members": [
          {
            id: "admin-1",
            data: {
              userId: "wrong-user",
              academyId: "academy-talumball",
              role: "ADMIN",
              status: "ACTIVE",
              source: "SUPERADMIN_ASSIGNMENT",
            },
          },
        ],
      }),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;
    assert.equal(result.inventory.rows[0].integrity, "REVIEW_REQUIRED");
    assert.ok(
      result.inventory.rows[0].issues.includes("INVALID_STAFF_MEMBERSHIP_EVIDENCE"),
    );
  });

  it("7. excludes the superadmin_system pseudo-academy from membership scans", async () => {
    const reads: string[] = [];
    const result = await loadSuperAdminRelationshipInventory(
      makeOps(
        {
          users: [],
          academies: [
            { id: "superadmin_system", data: { name: "System" } },
            academy,
          ],
          "academies/academy-talumball/members": [],
        },
        [],
        (path) => reads.push(path),
      ),
    );

    assert.equal(result.state, "READY");
    assert.equal(reads.includes("academies/superadmin_system/members"), false);
  });

  it("8. a collection-group read failure fails the whole inventory closed", async () => {
    const result = await loadSuperAdminRelationshipInventory({
      async listCollection(path) {
        const key = path.join("/");
        if (key === "users") return [];
        if (key === "academies") return [];
        throw new Error(`Unexpected collection read: ${key}`);
      },
      async listCollectionGroup() {
        throw new Error("permission-denied");
      },
    });

    assert.equal(result.state, "UNAVAILABLE");
    if (result.state !== "UNAVAILABLE") return;
    assert.match(result.error.message, /permission-denied/);
  });

  it("9. a membership read failure fails the whole inventory closed", async () => {
    const result = await loadSuperAdminRelationshipInventory({
      async listCollection(path) {
        const key = path.join("/");
        if (key === "users") return [];
        if (key === "academies") return [academy];
        throw new Error("membership-permission-denied");
      },
      async listCollectionGroup() {
        return [];
      },
    });

    assert.equal(result.state, "UNAVAILABLE");
    if (result.state !== "UNAVAILABLE") return;
    assert.match(result.error.message, /membership-permission-denied/);
  });

  it("10. sorts composed user rows predictably by display identity", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps({
        users: [
          { id: "u-z", data: { name: "Zed", role: "USER", status: "ACTIVE" } },
          { id: "u-a", data: { name: "Alpha", role: "USER", status: "ACTIVE" } },
        ],
        academies: [],
      }),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;
    assert.deepEqual(result.inventory.rows.map((row) => row.name), ["Alpha", "Zed"]);
  });

  it("11. historical lastLogin is carried through without online-presence semantics", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps({
        users: [
          {
            id: "u-1",
            data: {
              name: "User One",
              role: "USER",
              status: "ACTIVE",
              lastLogin: "2026-08-20T09:00:00Z",
            },
          },
        ],
        academies: [],
      }),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;
    assert.equal(
      result.inventory.rows[0].lastKnownAccountActivity,
      "2026-08-20T09:00:00Z",
    );
    assert.equal("online" in result.inventory.rows[0], false);
  });
});
