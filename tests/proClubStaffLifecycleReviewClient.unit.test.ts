import assert from "node:assert/strict";
import test from "node:test";
import {
  parseProClubStaffLifecycleReviewResponseV1,
} from "../src/lib/proClubStaffLifecycleReviewModel.ts";
import {
  ProClubStaffLifecycleReviewClientError,
  createProClubStaffLifecycleReviewRepository,
} from "../src/lib/proClubStaffLifecycleReviewRepository.ts";

const response = {
  schemaVersion: 1,
  clubId: "club-1",
  inactiveEntries: [
    {
      schemaVersion: 1,
      clubId: "club-1",
      userId: "inactive-1",
      displayName: "Inactive One",
      authorizationRole: "MEMBER",
      membershipStatus: "INACTIVE",
      staffRole: "ANALYST",
      staffStatus: "INACTIVE",
    },
  ],
  leftEntries: [],
  events: [
    {
      schemaVersion: 1,
      eventId: "event-1",
      clubId: "club-1",
      userId: "inactive-1",
      action: "DEACTIVATE",
      previousAuthorizationRole: "MEMBER",
      nextAuthorizationRole: "MEMBER",
      previousMembershipStatus: "ACTIVE",
      nextMembershipStatus: "INACTIVE",
      previousStaffRole: "ANALYST",
      nextStaffRole: "ANALYST",
      previousStaffStatus: "ACTIVE",
      nextStaffStatus: "INACTIVE",
      changedAtMs: 1000,
    },
  ],
};

test("parses exact privacy-minimal lifecycle response", () => {
  const parsed = parseProClubStaffLifecycleReviewResponseV1(response, "club-1");
  assert.equal(parsed.inactiveEntries.length, 1);
  assert.equal(parsed.events.length, 1);
});

test("rejects history fields outside client contract", () => {
  const bad = {
    ...response,
    events: [{ ...response.events[0], changedBy: "owner-secret" }],
  };
  assert.throws(() => parseProClubStaffLifecycleReviewResponseV1(bad, "club-1"));
});

test("repository sends clubId only and revalidates actor", async () => {
  let actor = "owner-1";
  let sent: unknown;
  const repository = createProClubStaffLifecycleReviewRepository(
    () => actor,
    async (data) => { sent = data; return { data: response }; },
  );
  const result = await repository.loadReview("club-1", "owner-1");
  assert.deepEqual(sent, { clubId: "club-1" });
  assert.equal(result.inactiveEntries.length, 1);
  actor = "other";
  await assert.rejects(
    () => repository.loadReview("club-1", "owner-1"),
    (error: unknown) => {
      assert.equal((error as ProClubStaffLifecycleReviewClientError).code, "AUTH_CHANGED");
      return true;
    },
  );
});

test("permission denial is sanitized", async () => {
  const repository = createProClubStaffLifecycleReviewRepository(
    () => "owner-1",
    async () => { throw Object.assign(new Error("sensitive"), { code: "functions/permission-denied" }); },
  );
  await assert.rejects(
    () => repository.loadReview("club-1", "owner-1"),
    (error: unknown) => {
      assert.equal((error as ProClubStaffLifecycleReviewClientError).code, "REVIEWER_REQUIRED");
      assert.ok(!JSON.stringify(error).includes("sensitive"));
      return true;
    },
  );
});
