import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveAssistedRecordIdentity } from "../src/lib/assistedRecordIdentity";

const superAdmin = {
  uid: "super-1",
  name: "Super Admin",
  role: "SUPERADMIN" as const,
  status: "ACTIVE",
};

const coach = {
  uid: "coach-1",
  name: "Coach One",
  role: "COACH" as const,
  status: "ACTIVE",
  supportPresentation: true,
};

describe("resolveAssistedRecordIdentity", () => {
  it("normal actor remains both actor and owner", () => {
    assert.deepEqual(resolveAssistedRecordIdentity(superAdmin, superAdmin), {
      actorUid: "super-1",
      ownerUid: "super-1",
      isAssisted: false,
    });
  });

  it("active SuperAdmin support presentation separates actor from owner", () => {
    assert.deepEqual(resolveAssistedRecordIdentity(superAdmin, coach), {
      actorUid: "super-1",
      ownerUid: "coach-1",
      isAssisted: true,
    });
  });

  it("unmarked target cannot become assisted owner", () => {
    assert.deepEqual(
      resolveAssistedRecordIdentity(superAdmin, {
        ...coach,
        supportPresentation: undefined,
      }),
      {
        actorUid: "super-1",
        ownerUid: "super-1",
        isAssisted: false,
      },
    );
  });

  it("non-SuperAdmin cannot assign another owner", () => {
    const normalCoach = { ...coach, supportPresentation: undefined };
    assert.deepEqual(
      resolveAssistedRecordIdentity(normalCoach, {
        ...coach,
        uid: "other-coach",
        supportPresentation: true,
      }),
      {
        actorUid: "coach-1",
        ownerUid: "coach-1",
        isAssisted: false,
      },
    );
  });
});
