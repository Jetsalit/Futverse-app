import assert from "node:assert/strict";
import test from "node:test";
import {
  ProClubStaffRosterService,
  type ProClubStaffRosterDataSource,
  type ProClubStaffRosterDocument,
} from "../functions/src/proClubStaffRoster/service.ts";
import {
  ProClubStaffRosterError,
  STAFF_ROSTER_ERROR_CODES,
} from "../functions/src/proClubStaffRoster/core.ts";

function dataSource(overrides: Partial<ProClubStaffRosterDataSource> = {}): ProClubStaffRosterDataSource {
  const memberships = new Map<string, unknown>([
    ["owner", { authorizationRole: "OWNER", status: "ACTIVE" }],
    ["coach", { authorizationRole: "MEMBER", status: "ACTIVE" }],
    ["left", { authorizationRole: "MEMBER", status: "LEFT" }],
  ]);
  const users = new Map<string, unknown>([
    ["owner", { name: "Owner One", email: "owner@example.com", phone: "secret" }],
    ["coach", { name: "Coach One", email: "coach@example.com", phone: "secret" }],
    ["left", { name: "Former Staff", email: "left@example.com" }],
  ]);
  const staff: ProClubStaffRosterDocument[] = [
    { id: "coach", data: { staffRole: "HEAD_COACH", status: "ACTIVE" } },
    { id: "owner", data: { staffRole: "MANAGER", status: "ACTIVE" } },
    { id: "left", data: { staffRole: "STAFF", status: "LEFT" } },
  ];
  return {
    async readClub() { return { name: "Club", status: "ACTIVE" }; },
    async readMembership(_clubId, uid) { return memberships.get(uid) ?? null; },
    async listStaffAssignments() { return staff; },
    async readUser(uid) { return users.get(uid) ?? null; },
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) =>
    error instanceof ProClubStaffRosterError && error.code === code);
}

test("active OWNER receives only active roster entries in deterministic role order", async () => {
  const service = new ProClubStaffRosterService(dataSource());
  const result = await service.loadRoster({ requesterUid: "owner", requestBody: { clubId: "club-a" } });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.clubId, "club-a");
  assert.deepEqual(result.entries.map((entry) => entry.userId), ["owner", "coach"]);
  assert.deepEqual(result.entries.map((entry) => entry.staffRole), ["MANAGER", "HEAD_COACH"]);
});

test("response never copies email, phone, invite or permission fields from canonical user", async () => {
  const service = new ProClubStaffRosterService(dataSource());
  const result = await service.loadRoster({ requesterUid: "owner", requestBody: { clubId: "club-a" } });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("@example.com"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("phone"), false);
  assert.equal(serialized.includes("permissions"), false);
  assert.equal(serialized.includes("inviteCode"), false);
});

test("missing authenticated requester is rejected", async () => {
  const service = new ProClubStaffRosterService(dataSource());
  await expectCode(
    service.loadRoster({ requesterUid: undefined, requestBody: { clubId: "club-a" } }),
    STAFF_ROSTER_ERROR_CODES.UNAUTHORIZED,
  );
});

test("active MEMBER without reviewer authority is rejected", async () => {
  const service = new ProClubStaffRosterService(dataSource());
  await expectCode(
    service.loadRoster({ requesterUid: "coach", requestBody: { clubId: "club-a" } }),
    STAFF_ROSTER_ERROR_CODES.FORBIDDEN,
  );
});

test("inactive club is rejected before roster enumeration", async () => {
  let listed = false;
  const service = new ProClubStaffRosterService(dataSource({
    async readClub() { return { status: "INACTIVE" }; },
    async listStaffAssignments() { listed = true; return []; },
  }));
  await expectCode(
    service.loadRoster({ requesterUid: "owner", requestBody: { clubId: "club-a" } }),
    STAFF_ROSTER_ERROR_CODES.FORBIDDEN,
  );
  assert.equal(listed, false);
});

test("unexpected request keys are rejected", async () => {
  const service = new ProClubStaffRosterService(dataSource());
  await expectCode(
    service.loadRoster({ requesterUid: "owner", requestBody: { clubId: "club-a", email: "x@example.com" } }),
    STAFF_ROSTER_ERROR_CODES.INVALID_REQUEST,
  );
});

test("missing canonical membership for a staff assignment fails closed", async () => {
  const service = new ProClubStaffRosterService(dataSource({
    async listStaffAssignments() {
      return [{ id: "ghost", data: { staffRole: "STAFF", status: "ACTIVE" } }];
    },
    async readMembership(_clubId, uid) {
      return uid === "owner" ? { authorizationRole: "OWNER", status: "ACTIVE" } : null;
    },
  }));
  await expectCode(
    service.loadRoster({ requesterUid: "owner", requestBody: { clubId: "club-a" } }),
    STAFF_ROSTER_ERROR_CODES.INVALID_DATA,
  );
});

test("roster over V1 cap is rejected instead of returning an unbounded response", async () => {
  const oversized = Array.from({ length: 201 }, (_, index) => ({
    id: `staff-${index}`,
    data: { staffRole: "STAFF", status: "ACTIVE" },
  }));
  const service = new ProClubStaffRosterService(dataSource({
    async listStaffAssignments() { return oversized; },
  }));
  await expectCode(
    service.loadRoster({ requesterUid: "owner", requestBody: { clubId: "club-a" } }),
    STAFF_ROSTER_ERROR_CODES.TOO_MANY_RESULTS,
  );
});
