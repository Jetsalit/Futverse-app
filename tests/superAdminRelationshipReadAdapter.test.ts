import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadSuperAdminRelationshipInventory,
  type SuperAdminReadDocument,
  type SuperAdminRelationshipReadOps,
} from "../src/lib/firestore/superAdminRelationshipReadAdapter";

function makeOps(
  collections: Record<string, SuperAdminReadDocument[]>,
  onRead?: (path: readonly string[]) => void,
): SuperAdminRelationshipReadOps {
  return {
    async listCollection(path) {
      onRead?.(path);
      const key = path.join("/");
      if (!(key in collections)) {
        throw new Error(`Unexpected collection read: ${key}`);
      }
      return collections[key];
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

describe("superAdminRelationshipReadAdapter", () => {
  it("1. reads only global users, academies, and per-academy members in Phase 2A", async () => {
    const reads: string[] = [];
    const result = await loadSuperAdminRelationshipInventory(
      makeOps(
        {
          users: [
            {
              id: "admin-1",
              data: {
                name: "Max Coach",
                email: "max@example.com",
                role: "ADMIN",
                status: "ACTIVE",
              },
            },
          ],
          academies: [academy],
          "academies/academy-talumball/members": [canonicalAdmin],
        },
        (path) => reads.push(path.join("/")),
      ),
    );

    assert.equal(result.state, "READY");
    assert.deepEqual(reads.sort(), [
      "academies",
      "academies/academy-talumball/members",
      "users",
    ]);
    assert.equal(reads.some((path) => path.includes("playerAssociations")), false);
  });

  it("2. composes canonical staff membership into a verified relationship row", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps({
        users: [
          {
            id: "admin-1",
            data: {
              name: "Max Coach",
              email: "max@example.com",
              role: "ADMIN",
              status: "ACTIVE",
            },
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
    assert.equal(row.organizations.length, 1);
    assert.equal(row.organizations[0].organizationName, "Talumball Academy");
    assert.equal(row.organizations[0].relationship, "ADMIN");
    assert.equal(result.inventory.isCompleteForCurrentAccounts, true);
  });

  it("3. excludes the superadmin_system pseudo-academy from membership scans", async () => {
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
        (path) => reads.push(path.join("/")),
      ),
    );

    assert.equal(result.state, "READY");
    assert.equal(
      reads.includes("academies/superadmin_system/members"),
      false,
    );
  });

  it("4. preserves malformed membership evidence for resolver review instead of dropping it", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps({
        users: [
          {
            id: "admin-1",
            data: { role: "ADMIN", status: "ACTIVE" },
          },
        ],
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
    const [row] = result.inventory.rows;
    assert.equal(row.source, "UNASSIGNED");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.deepEqual(row.issues, ["INVALID_STAFF_MEMBERSHIP_EVIDENCE"]);
  });

  it("5. marks PLAYER/PARENT inventory coverage incomplete instead of pretending missing associations are authoritative", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps({
        users: [
          {
            id: "parent-1",
            data: {
              name: "Rachata",
              role: "PARENT",
              status: "ACTIVE",
            },
          },
        ],
        academies: [academy],
        "academies/academy-talumball/members": [],
      }),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;
    assert.equal(result.inventory.isCompleteForCurrentAccounts, false);
    assert.equal(
      result.inventory.coverage.nonStaffAssociations,
      "BLOCKED_BY_CURRENT_RULES",
    );
    assert.deepEqual(result.inventory.warnings, [
      "NONSTAFF_ASSOCIATION_GLOBAL_READ_BLOCKED_BY_CURRENT_RULES",
    ]);
  });

  it("6. legacy Parent evidence remains informational while nonstaff canonical coverage is blocked", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps({
        users: [
          {
            id: "parent-1",
            data: {
              role: "PARENT",
              status: "ACTIVE",
              academyId: "academy-talumball",
              linkedPlayerId: "player-1",
            },
          },
        ],
        academies: [academy],
        "academies/academy-talumball/members": [],
      }),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;
    const [row] = result.inventory.rows;
    assert.equal(row.source, "LEGACY_COMPATIBLE");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.equal(row.organizations.length, 0);
    assert.equal(row.legacyEvidence?.linkedPlayerId, "player-1");
  });

  it("7. membership read failure fails the inventory closed instead of returning partial canonical data", async () => {
    const result = await loadSuperAdminRelationshipInventory({
      async listCollection(path) {
        const key = path.join("/");
        if (key === "users") return [];
        if (key === "academies") return [academy];
        throw new Error("permission-denied");
      },
    });

    assert.equal(result.state, "UNAVAILABLE");
    if (result.state !== "UNAVAILABLE") return;
    assert.match(result.error.message, /permission-denied/);
  });

  it("8. sorts composed user rows predictably by display identity", async () => {
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
    assert.deepEqual(
      result.inventory.rows.map((row) => row.name),
      ["Alpha", "Zed"],
    );
  });

  it("9. historical lastLogin is carried through without creating online presence semantics", async () => {
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
