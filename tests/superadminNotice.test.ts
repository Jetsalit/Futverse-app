import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "../src/contexts/AuthContext.js";
import {
  chunkRecipientUids,
  listActiveNoticeRecipients,
  resolveNoticeRecipients,
  sendNoticeInBatches,
  validFirebaseUid,
} from "../src/components/superadmin/noticeAudience.js";

function user(overrides: Partial<User>): User {
  return {
    id: "user-id",
    name: "Test User",
    role: "USER",
    status: "ACTIVE",
    ...overrides,
  };
}

describe("SuperAdmin notice audiences", () => {
  it("includes active accounts with valid Firebase UIDs and deduplicates them", () => {
    const recipients = listActiveNoticeRecipients([
      user({ id: "active-upper", name: "Upper" }),
      user({ id: "active-title", name: "Title", status: "Active" }),
      user({ id: "inactive", name: "Inactive", status: "INACTIVE" }),
      user({ id: "pending", name: "Pending", status: "PENDING" }),
      user({ id: "duplicate-doc", uid: "active-upper", name: "Stored UID Mismatch" }),
      user({ id: undefined, uid: " invalid ", name: "Invalid UID" }),
    ], new Map());

    assert.deepEqual(
      recipients.map((recipient) => recipient.uid),
      ["duplicate-doc", "active-title", "active-upper"],
    );
    assert.equal(validFirebaseUid(" valid-uid "), null);
    assert.equal(validFirebaseUid("valid-uid"), "valid-uid");
  });

  it("uses effective roles only and never requestedRole", () => {
    const users = [
      user({ id: "coach", role: "COACH" }),
      user({ id: "pending-coach", role: "USER", requestedRole: "COACH" }),
      user({ id: "inactive-coach", role: "COACH", status: "Inactive" }),
    ];

    const recipients = resolveNoticeRecipients(users, {
      kind: "role",
      role: "COACH",
    }, new Map());

    assert.deepEqual(recipients.map((recipient) => recipient.uid), ["coach"]);
  });

  it("supports individual, academy, academy plus role, and all-active audiences", () => {
    const users = [
      user({ id: "coach-a", name: "Coach A", role: "COACH" }),
      user({ id: "player-a", name: "Player A", role: "PLAYER" }),
      user({ id: "coach-b", name: "Coach B", role: "COACH" }),
    ];
    const academies = new Map([
      ["coach-a", "academy-a"],
      ["player-a", "academy-a"],
      ["coach-b", "academy-b"],
    ]);

    assert.deepEqual(
      resolveNoticeRecipients(users, { kind: "individual", userId: "player-a" }, academies)
        .map((recipient) => recipient.uid),
      ["player-a"],
    );
    assert.deepEqual(
      resolveNoticeRecipients(users, { kind: "academy", academyId: "academy-a" }, academies)
        .map((recipient) => recipient.uid),
      ["coach-a", "player-a"],
    );
    assert.deepEqual(
      resolveNoticeRecipients(users, {
        kind: "academy_role",
        academyId: "academy-a",
        role: "COACH",
      }, academies).map((recipient) => recipient.uid),
      ["coach-a"],
    );
    assert.equal(
      resolveNoticeRecipients(users, { kind: "all_active" }, academies).length,
      3,
    );
  });

  it("chunks recipient UIDs at no more than 500 writes and removes duplicates", () => {
    const uids = Array.from({ length: 1_201 }, (_, index) => `user-${index}`);
    uids.push("user-0");
    const chunks = chunkRecipientUids(uids);

    assert.deepEqual(chunks.map((chunk) => chunk.length), [500, 500, 201]);
    assert.equal(Math.max(...chunks.map((chunk) => chunk.length)) <= 500, true);
  });

  it("continues across batches and reports honest partial creation results", async () => {
    const uids = Array.from({ length: 1_201 }, (_, index) => `user-${index}`);
    let batchNumber = 0;
    const summary = await sendNoticeInBatches(uids, async (batch) => {
      batchNumber += 1;
      if (batchNumber === 1) return batch.length;
      if (batchNumber === 2) return 0;
      throw new Error("simulated batch failure");
    });

    assert.equal(batchNumber, 3);
    assert.deepEqual(summary, {
      requested: 1_201,
      created: 500,
      failed: 701,
      batches: [
        { batchNumber: 1, requested: 500, created: 500, failed: 0 },
        { batchNumber: 2, requested: 500, created: 0, failed: 500 },
        { batchNumber: 3, requested: 201, created: 0, failed: 201 },
      ],
    });
  });
});
