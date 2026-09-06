import assert from "node:assert/strict";
import test from "node:test";
import {
  ProClubStaffRosterClientError,
  createProClubStaffRosterRepository,
  parseProClubStaffRosterResponseV1,
} from "../src/lib/proClubStaffRosterRepository.ts";

const activeEntry = {
  schemaVersion: 1 as const,
  clubId: "club-1",
  userId: "staff-1",
  displayName: "Coach One",
  authorizationRole: "MEMBER" as const,
  membershipStatus: "ACTIVE" as const,
  staffRole: "HEAD_COACH" as const,
  staffStatus: "ACTIVE" as const,
};

test("parses exact active roster response", () => {
  const result = parseProClubStaffRosterResponseV1({
    schemaVersion: 1,
    clubId: "club-1",
    entries: [activeEntry],
  }, "club-1");
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].staffRole, "HEAD_COACH");
});

test("rejects cross-club response", () => {
  assert.throws(() => parseProClubStaffRosterResponseV1({
    schemaVersion: 1,
    clubId: "club-2",
    entries: [],
  }, "club-1"), ProClubStaffRosterClientError);
});

test("rejects inactive or private-field roster entries", () => {
  assert.throws(() => parseProClubStaffRosterResponseV1({
    schemaVersion: 1,
    clubId: "club-1",
    entries: [{ ...activeEntry, staffStatus: "LEFT" }],
  }, "club-1"), ProClubStaffRosterClientError);
  assert.throws(() => parseProClubStaffRosterResponseV1({
    schemaVersion: 1,
    clubId: "club-1",
    entries: [{ ...activeEntry, email: "private@example.com" }],
  }, "club-1"), ProClubStaffRosterClientError);
});

test("rejects duplicate user ids", () => {
  assert.throws(() => parseProClubStaffRosterResponseV1({
    schemaVersion: 1,
    clubId: "club-1",
    entries: [activeEntry, { ...activeEntry }],
  }, "club-1"), ProClubStaffRosterClientError);
});

test("repository sends clubId only and revalidates authenticated actor", async () => {
  let actor = "owner-1";
  let requestBody: unknown;
  const repository = createProClubStaffRosterRepository(
    () => actor,
    async (data) => {
      requestBody = data;
      return { data: { schemaVersion: 1, clubId: "club-1", entries: [activeEntry] } };
    },
  );
  const result = await repository.loadRoster("club-1", "owner-1");
  assert.deepEqual(requestBody, { clubId: "club-1" });
  assert.equal(result.entries.length, 1);

  actor = "other-user";
  await assert.rejects(() => repository.loadRoster("club-1", "owner-1"), (error: unknown) => {
    assert.equal((error as ProClubStaffRosterClientError).code, "AUTH_CHANGED");
    return true;
  });
});

test("maps permission denial without leaking raw backend details", async () => {
  const repository = createProClubStaffRosterRepository(
    () => "owner-1",
    async () => {
      throw Object.assign(new Error("Sensitive backend detail"), { code: "functions/permission-denied" });
    },
  );
  await assert.rejects(() => repository.loadRoster("club-1", "owner-1"), (error: unknown) => {
    assert.equal((error as ProClubStaffRosterClientError).code, "REVIEWER_REQUIRED");
    assert.ok(!JSON.stringify(error).includes("Sensitive backend detail"));
    return true;
  });
});
