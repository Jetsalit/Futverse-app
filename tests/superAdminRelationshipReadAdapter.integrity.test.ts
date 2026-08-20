import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  loadSuperAdminRelationshipInventory,
  type SuperAdminReadDocument,
  type SuperAdminRelationshipReadOps,
} from "../src/lib/firestore/superAdminRelationshipReadAdapter";

function makeOps(
  associationDocs: SuperAdminReadDocument[],
): SuperAdminRelationshipReadOps {
  return {
    async listCollection(path) {
      const key = path.join("/");
      if (key === "users") {
        return [
          {
            id: "parent-1",
            data: { role: "PARENT", status: "ACTIVE" },
          },
        ];
      }
      if (key === "academies") {
        return [
          {
            id: "academy-talumball",
            data: { name: "Talumball Academy" },
          },
        ];
      }
      if (key === "academies/academy-talumball/members") {
        return [];
      }
      throw new Error(`Unexpected collection read: ${key}`);
    },
    async listCollectionGroup(collectionId) {
      assert.equal(collectionId, "playerAssociations");
      return associationDocs;
    },
  };
}

const exactAssociation: SuperAdminReadDocument = {
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

describe("superAdminRelationshipReadAdapter integrity guards", () => {
  it("rejects association evidence with unexpected fields instead of sanitizing it into canonical evidence", async () => {
    const result = await loadSuperAdminRelationshipInventory(
      makeOps([
        {
          ...exactAssociation,
          data: {
            ...exactAssociation.data,
            unexpectedLegacyField: "must-not-be-silently-dropped",
          },
        },
      ]),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;

    const [row] = result.inventory.rows;
    assert.equal(row.source, "UNASSIGNED");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.deepEqual(row.organizations, []);
    assert.ok(row.issues.includes("INVALID_NONSTAFF_ASSOCIATION_EVIDENCE"));
  });

  it("rejects association evidence with a missing required field", async () => {
    const malformed = { ...exactAssociation.data };
    delete malformed.status;

    const result = await loadSuperAdminRelationshipInventory(
      makeOps([{ ...exactAssociation, data: malformed }]),
    );

    assert.equal(result.state, "READY");
    if (result.state !== "READY") return;

    const [row] = result.inventory.rows;
    assert.equal(row.source, "UNASSIGNED");
    assert.equal(row.integrity, "REVIEW_REQUIRED");
    assert.deepEqual(row.organizations, []);
    assert.ok(row.issues.includes("INVALID_NONSTAFF_ASSOCIATION_EVIDENCE"));
  });

  it("concrete Firestore inventory reads are server-only so cached snapshots cannot be declared complete", () => {
    const source = readFileSync(
      new URL(
        "../src/lib/firestore/superAdminRelationshipReadAdapter.ts",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(source, /getDocsFromServer\(reference\)/);
    assert.match(
      source,
      /getDocsFromServer\(collectionGroup\(db, collectionId\)\)/,
    );
    assert.doesNotMatch(source, /\bgetDocs\(/);
  });
});
