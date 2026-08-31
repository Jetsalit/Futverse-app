import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getProClub,
  getProClubMembership,
  getProClubStaffAssignment,
  resolveProClubAuthoritySnapshot,
  type ProClubReadDocumentSnapshot,
  type ProClubReadOps,
} from "../src/lib/firestore/proClubReadAdapter";

type DocumentTable = Record<string, ProClubReadDocumentSnapshot>;

interface MockReadHarness {
  ops: ProClubReadOps;
  calls: string[];
}

function createReadHarness(
  documents: DocumentTable = {},
  failures: Record<string, unknown> = {},
): MockReadHarness {
  const calls: string[] = [];

  return {
    calls,
    ops: {
      async readDocument(path) {
        const key = path.join("/");
        calls.push(key);

        if (
          Object.prototype.hasOwnProperty.call(
            failures,
            key,
          )
        ) {
          throw failures[key];
        }

        return (
          documents[key] ?? {
            id: path[path.length - 1] ?? "",
            exists: false,
          }
        );
      },
    },
  };
}

const activeClub = {
  name: "FutVerse FC",
  shortName: "FVFC",
  level: "T3" as const,
  status: "ACTIVE" as const,
  country: "TH",
};

const activeMembership = {
  authorizationRole: "ADMIN" as const,
  status: "ACTIVE" as const,
};

const activeStaff = {
  staffRole: "HEAD_COACH" as const,
  status: "ACTIVE" as const,
};

test("Pro Club Read Adapter V1", async (t) => {
  await t.test(
    "reads only the exact canonical Pro Club paths",
    async () => {
      const harness = createReadHarness({
        "proClubs/club-1": {
          id: "club-1",
          exists: true,
          data: activeClub,
        },
        "proClubs/club-1/members/user-1": {
          id: "user-1",
          exists: true,
          data: activeMembership,
        },
        "proClubs/club-1/staff/user-1": {
          id: "user-1",
          exists: true,
          data: activeStaff,
        },
      });

      assert.equal(
        (await getProClub("club-1", harness.ops)).state,
        "FOUND",
      );
      assert.equal(
        (await getProClubMembership(
          "club-1",
          "user-1",
          harness.ops,
        )).state,
        "FOUND",
      );
      assert.equal(
        (await getProClubStaffAssignment(
          "club-1",
          "user-1",
          harness.ops,
        )).state,
        "FOUND",
      );

      assert.deepEqual(harness.calls, [
        "proClubs/club-1",
        "proClubs/club-1/members/user-1",
        "proClubs/club-1/staff/user-1",
      ]);
    },
  );

  await t.test(
    "fails closed on invalid requested identities without reading Firestore",
    async () => {
      const harness = createReadHarness();

      assert.equal(
        (await getProClub(" club-1", harness.ops)).state,
        "INVALID_DATA",
      );
      assert.equal(
        (await getProClubMembership(
          "club-1",
          "user/1",
          harness.ops,
        )).state,
        "INVALID_DATA",
      );
      assert.equal(
        (await getProClubStaffAssignment(
          "",
          "user-1",
          harness.ops,
        )).state,
        "INVALID_DATA",
      );
      assert.deepEqual(harness.calls, []);
    },
  );

  await t.test(
    "distinguishes a missing canonical document",
    async () => {
      const harness = createReadHarness();
      const result = await getProClub(
        "club-1",
        harness.ops,
      );

      assert.equal(result.state, "MISSING");
      assert.deepEqual(
        harness.calls,
        ["proClubs/club-1"],
      );
    },
  );

  await t.test(
    "preserves permission-denied instead of converting it to missing",
    async () => {
      const denied = Object.assign(
        new Error("denied"),
        { code: "permission-denied" },
      );
      const harness = createReadHarness(
        {},
        { "proClubs/club-1": denied },
      );

      const result = await getProClub(
        "club-1",
        harness.ops,
      );

      assert.equal(
        result.state,
        "PERMISSION_DENIED",
      );
    },
  );

  await t.test(
    "classifies non-permission read failures as ERROR",
    async () => {
      const unavailable = Object.assign(
        new Error("unavailable"),
        { code: "unavailable" },
      );
      const harness = createReadHarness(
        {},
        { "proClubs/club-1": unavailable },
      );

      const result = await getProClub(
        "club-1",
        harness.ops,
      );

      assert.equal(result.state, "ERROR");
    },
  );

  await t.test(
    "rejects malformed and identity-duplicating stored payloads before mapping",
    async () => {
      const clubHarness = createReadHarness({
        "proClubs/club-1": {
          id: "club-1",
          exists: true,
          data: {
            ...activeClub,
            id: "shadow-club",
          },
        },
      });

      assert.equal(
        (await getProClub(
          "club-1",
          clubHarness.ops,
        )).state,
        "INVALID_DATA",
      );

      const membershipHarness = createReadHarness({
        "proClubs/club-1/members/user-1": {
          id: "user-1",
          exists: true,
          data: {
            ...activeMembership,
            userId: "user-1",
          },
        },
      });

      assert.equal(
        (await getProClubMembership(
          "club-1",
          "user-1",
          membershipHarness.ops,
        )).state,
        "INVALID_DATA",
      );

      const staffHarness = createReadHarness({
        "proClubs/club-1/staff/user-1": {
          id: "wrong-user",
          exists: true,
          data: activeStaff,
        },
      });

      assert.equal(
        (await getProClubStaffAssignment(
          "club-1",
          "user-1",
          staffHarness.ops,
        )).state,
        "INVALID_DATA",
      );
    },
  );

  await t.test(
    "resolves active membership authority and active staff role",
    async () => {
      const harness = createReadHarness({
        "proClubs/club-1": {
          id: "club-1",
          exists: true,
          data: activeClub,
        },
        "proClubs/club-1/members/user-1": {
          id: "user-1",
          exists: true,
          data: activeMembership,
        },
        "proClubs/club-1/staff/user-1": {
          id: "user-1",
          exists: true,
          data: activeStaff,
        },
      });

      const result = await resolveProClubAuthoritySnapshot(
        "club-1",
        "user-1",
        harness.ops,
      );

      assert.equal(result.state, "FOUND");
      if (result.state !== "FOUND") return;

      assert.equal(
        result.value.hasMembershipAuthority,
        true,
      );
      assert.equal(
        result.value.authorizationRole,
        "ADMIN",
      );
      assert.equal(
        result.value.staffRole,
        "HEAD_COACH",
      );
      assert.deepEqual(harness.calls, [
        "proClubs/club-1",
        "proClubs/club-1/members/user-1",
        "proClubs/club-1/staff/user-1",
      ]);
    },
  );

  await t.test(
    "keeps active membership authority when staff assignment is missing",
    async () => {
      const harness = createReadHarness({
        "proClubs/club-1": {
          id: "club-1",
          exists: true,
          data: activeClub,
        },
        "proClubs/club-1/members/user-1": {
          id: "user-1",
          exists: true,
          data: activeMembership,
        },
      });

      const result = await resolveProClubAuthoritySnapshot(
        "club-1",
        "user-1",
        harness.ops,
      );

      assert.equal(result.state, "FOUND");
      if (result.state !== "FOUND") return;

      assert.equal(
        result.value.hasMembershipAuthority,
        true,
      );
      assert.equal(
        result.value.authorizationRole,
        "ADMIN",
      );
      assert.equal(result.value.staffRole, null);
      assert.equal(
        result.value.staffAssignment,
        null,
      );
    },
  );

  await t.test(
    "does not let inactive membership or staff-only state grant authority",
    async () => {
      const harness = createReadHarness({
        "proClubs/club-1": {
          id: "club-1",
          exists: true,
          data: activeClub,
        },
        "proClubs/club-1/members/user-1": {
          id: "user-1",
          exists: true,
          data: {
            authorizationRole: "MEMBER",
            status: "INACTIVE",
          },
        },
        "proClubs/club-1/staff/user-1": {
          id: "user-1",
          exists: true,
          data: activeStaff,
        },
      });

      const result = await resolveProClubAuthoritySnapshot(
        "club-1",
        "user-1",
        harness.ops,
      );

      assert.equal(result.state, "FOUND");
      if (result.state !== "FOUND") return;

      assert.equal(
        result.value.hasMembershipAuthority,
        false,
      );
      assert.equal(
        result.value.authorizationRole,
        null,
      );
      assert.equal(result.value.staffRole, null);
      assert.deepEqual(harness.calls, [
        "proClubs/club-1",
        "proClubs/club-1/members/user-1",
      ]);
    },
  );

  await t.test(
    "propagates staff permission denial for an otherwise authoritative member",
    async () => {
      const denied = Object.assign(
        new Error("denied"),
        { code: "firestore/permission-denied" },
      );
      const harness = createReadHarness(
        {
          "proClubs/club-1": {
            id: "club-1",
            exists: true,
            data: activeClub,
          },
          "proClubs/club-1/members/user-1": {
            id: "user-1",
            exists: true,
            data: activeMembership,
          },
        },
        {
          "proClubs/club-1/staff/user-1": denied,
        },
      );

      const result = await resolveProClubAuthoritySnapshot(
        "club-1",
        "user-1",
        harness.ops,
      );

      assert.equal(
        result.state,
        "PERMISSION_DENIED",
      );
    },
  );

  await t.test(
    "keeps the implementation read-only and server-authoritative by source contract",
    () => {
      const source = readFileSync(
        "src/lib/firestore/proClubReadAdapter.ts",
        "utf8",
      );

      assert.match(source, /\bgetDocFromServer\b/);
      assert.doesNotMatch(
        source,
        /\b(?:setDoc|updateDoc|deleteDoc|addDoc|writeBatch|runTransaction|getDocs|getDocsFromServer|collection|collectionGroup|onSnapshot)\b/,
      );
      assert.doesNotMatch(
        source,
        /\bgetDoc\s*\(/,
      );
      assert.doesNotMatch(
        source,
        /academies\//,
      );
    },
  );
});
