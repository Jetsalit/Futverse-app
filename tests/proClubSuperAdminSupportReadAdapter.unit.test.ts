import assert from "node:assert/strict";
import test from "node:test";

import {
  isActiveCanonicalSuperAdminSupportActor,
  readProClubSupportEnvelopeV1,
} from "../src/lib/firestore/proClubSupportReadAdapter";
import type {
  ProClubReadDocumentSnapshot,
  ProClubReadOps,
} from "../src/lib/firestore/proClubReadAdapter";

function opsFrom(
  records: Record<string, { id: string; data: unknown }>,
): ProClubReadOps {
  return {
    async readDocument(path): Promise<ProClubReadDocumentSnapshot> {
      const key = path.join("/");
      const value = records[key];
      return value
        ? { id: value.id, exists: true, data: value.data }
        : { id: path[path.length - 1] ?? "", exists: false };
    },
  };
}

const activeSuperAdmin = {
  uid: "superadmin-1",
  role: "SUPERADMIN",
  status: "ACTIVE",
};

const baseRecords = {
  "proClubs/club-a": {
    id: "club-a",
    data: { name: "Club A", level: "T3", status: "ACTIVE" },
  },
  "proClubs/club-a/members/head-coach-1": {
    id: "head-coach-1",
    data: { authorizationRole: "MEMBER", status: "ACTIVE" },
  },
  "proClubs/club-a/staff/head-coach-1": {
    id: "head-coach-1",
    data: { staffRole: "HEAD_COACH", status: "ACTIVE" },
  },
};

test("actor guard accepts only ACTIVE SUPERADMIN", () => {
  assert.equal(isActiveCanonicalSuperAdminSupportActor(activeSuperAdmin), true);
  assert.equal(
    isActiveCanonicalSuperAdminSupportActor({ ...activeSuperAdmin, role: "DATA_ADMIN" }),
    false,
  );
  assert.equal(
    isActiveCanonicalSuperAdminSupportActor({ ...activeSuperAdmin, status: "INACTIVE" }),
    false,
  );
  assert.equal(
    isActiveCanonicalSuperAdminSupportActor({ ...activeSuperAdmin, uid: "bad/id" }),
    false,
  );
});

test("read envelope is exact-target and preserves actor identity", async () => {
  const result = await readProClubSupportEnvelopeV1(
    activeSuperAdmin,
    { clubId: "club-a", subjectUid: "head-coach-1" },
    opsFrom(baseRecords),
  );

  assert.equal(result.state, "FOUND");
  if (result.state !== "FOUND") return;

  assert.equal(result.value.actorUid, "superadmin-1");
  assert.equal(result.value.club.clubId, "club-a");
  assert.equal(result.value.subjectMembership?.uid, "head-coach-1");
  assert.equal(result.value.subjectStaffAssignment?.uid, "head-coach-1");
  assert.equal(result.value.subjectStaffAssignment?.data.staffRole, "HEAD_COACH");
});

test("read envelope never synthesizes missing subject authority", async () => {
  const result = await readProClubSupportEnvelopeV1(
    activeSuperAdmin,
    { clubId: "club-a", subjectUid: "missing-user" },
    opsFrom(baseRecords),
  );

  assert.equal(result.state, "FOUND");
  if (result.state !== "FOUND") return;

  assert.equal(result.value.subjectMembership, null);
  assert.equal(result.value.subjectStaffAssignment, null);
});

test("invalid actor and target fail closed before reads", async () => {
  let reads = 0;
  const ops: ProClubReadOps = {
    async readDocument(path) {
      reads += 1;
      return { id: path[path.length - 1] ?? "", exists: false };
    },
  };

  const unauthorized = await readProClubSupportEnvelopeV1(
    { uid: "user-1", role: "USER", status: "ACTIVE" },
    { clubId: "club-a" },
    ops,
  );
  assert.equal(unauthorized.state, "UNAUTHORIZED");

  const badClub = await readProClubSupportEnvelopeV1(
    activeSuperAdmin,
    { clubId: "bad/club" },
    ops,
  );
  assert.equal(badClub.state, "INVALID_TARGET");

  const badSubject = await readProClubSupportEnvelopeV1(
    activeSuperAdmin,
    { clubId: "club-a", subjectUid: "bad/user" },
    ops,
  );
  assert.equal(badSubject.state, "INVALID_TARGET");
  assert.equal(reads, 0);
});

test("permission and malformed data remain explicit fail-closed states", async () => {
  const deniedOps: ProClubReadOps = {
    async readDocument() {
      const error = Object.assign(new Error("denied"), {
        code: "permission-denied",
      });
      throw error;
    },
  };

  const denied = await readProClubSupportEnvelopeV1(
    activeSuperAdmin,
    { clubId: "club-a" },
    deniedOps,
  );
  assert.equal(denied.state, "PERMISSION_DENIED");

  const malformed = await readProClubSupportEnvelopeV1(
    activeSuperAdmin,
    { clubId: "club-a" },
    opsFrom({
      "proClubs/club-a": {
        id: "club-a",
        data: { name: "Club A", level: "T3", status: "ACTIVE", clubId: "stored-id" },
      },
    }),
  );
  assert.equal(malformed.state, "INVALID_DATA");
});
