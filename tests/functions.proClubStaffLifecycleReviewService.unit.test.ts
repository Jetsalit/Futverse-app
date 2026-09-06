import assert from "node:assert/strict";
import test from "node:test";
import {
  ProClubStaffLifecycleReviewError,
  createProClubStaffLifecycleReviewServiceV1,
  type ProClubStaffLifecycleReviewDocumentV1,
} from "../functions/src/proClubStaffLifecycleReview/service.ts";

const timestamp = (ms: number) => ({ toMillis: () => ms });

function source(actorRole: "OWNER" | "ADMIN" | "MEMBER" = "OWNER") {
  const memberships: Record<string, unknown> = {
    actor: { authorizationRole: actorRole, status: "ACTIVE" },
    active: { authorizationRole: "MEMBER", status: "ACTIVE" },
    inactive: { authorizationRole: "MEMBER", status: "INACTIVE" },
    left: { authorizationRole: "MEMBER", status: "LEFT" },
  };
  const staff: ProClubStaffLifecycleReviewDocumentV1[] = [
    { id: "active", data: { staffRole: "HEAD_COACH", status: "ACTIVE" } },
    { id: "inactive", data: { staffRole: "ANALYST", status: "INACTIVE" } },
    { id: "left", data: { staffRole: "PHYSIO", status: "LEFT" } },
  ];
  const history: ProClubStaffLifecycleReviewDocumentV1[] = [
    {
      id: "event-1",
      data: {
        schemaVersion: 1,
        clubId: "club-1",
        userId: "inactive",
        action: "DEACTIVATE",
        previousAuthorizationRole: "MEMBER",
        nextAuthorizationRole: "MEMBER",
        previousMembershipStatus: "ACTIVE",
        nextMembershipStatus: "INACTIVE",
        previousStaffRole: "ANALYST",
        nextStaffRole: "ANALYST",
        previousStaffStatus: "ACTIVE",
        nextStaffStatus: "INACTIVE",
        changedBy: "actor",
        eventId: "event-1",
        changedAt: timestamp(1000),
      },
    },
  ];
  return {
    readClub: async () => ({ name: "Club", status: "ACTIVE" }),
    readMembership: async (_clubId: string, uid: string) => memberships[uid] ?? null,
    listStaffAssignments: async () => staff,
    listHistory: async () => history,
    readUser: async (uid: string) => ({ name: uid === "inactive" ? "Analyst One" : "Staff One" }),
  };
}

test("review returns only inactive/left canonical staff and privacy-minimal history", async () => {
  const service = createProClubStaffLifecycleReviewServiceV1(source());
  const result = await service.loadReview({ requesterUid: "actor", requestBody: { clubId: "club-1" } });
  assert.equal(result.inactiveEntries.length, 1);
  assert.equal(result.inactiveEntries[0].displayName, "Analyst One");
  assert.equal(result.leftEntries.length, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].changedAtMs, 1000);
  assert.ok(!Object.hasOwn(result.events[0], "changedBy"));
});

test("non-reviewer is denied before lifecycle enumeration", async () => {
  let listed = false;
  const base = source("MEMBER");
  const service = createProClubStaffLifecycleReviewServiceV1({
    ...base,
    listStaffAssignments: async () => { listed = true; return []; },
  });
  await assert.rejects(
    () => service.loadReview({ requesterUid: "actor", requestBody: { clubId: "club-1" } }),
    (error: unknown) => {
      assert.equal((error as ProClubStaffLifecycleReviewError).code, "FORBIDDEN");
      return true;
    },
  );
  assert.equal(listed, false);
});

test("misaligned membership/staff lifecycle fails closed", async () => {
  const base = source();
  const service = createProClubStaffLifecycleReviewServiceV1({
    ...base,
    readMembership: async (_clubId: string, uid: string) =>
      uid === "inactive" ? { authorizationRole: "MEMBER", status: "ACTIVE" } : base.readMembership(_clubId, uid),
  });
  await assert.rejects(
    () => service.loadReview({ requesterUid: "actor", requestBody: { clubId: "club-1" } }),
    (error: unknown) => {
      assert.equal((error as ProClubStaffLifecycleReviewError).code, "INVALID_DATA");
      return true;
    },
  );
});
