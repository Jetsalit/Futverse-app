import assert from "node:assert/strict";
import test from "node:test";
import { createFirestoreProClubStaffManagementSourceV1 } from "../functions/src/proClubStaffManagement/firestoreDataSource.ts";
import {
  planProClubStaffManagementTransitionV1,
  type ProClubStaffManagementActionV1,
} from "../functions/src/proClubStaffManagement/transition.ts";
import { ProClubStaffManagementServiceError } from "../functions/src/proClubStaffManagement/service.ts";

const owner = {
  clubId: "club-1",
  actorUid: "owner-1",
  authorizationRole: "OWNER" as const,
  membershipStatus: "ACTIVE" as const,
};
const target = {
  clubId: "club-1",
  userId: "staff-1",
  authorizationRole: "MEMBER" as const,
  membershipStatus: "ACTIVE" as const,
  staffRole: "ASSISTANT_COACH" as const,
  staffStatus: "ACTIVE" as const,
};

function plan(action: ProClubStaffManagementActionV1) {
  return planProClubStaffManagementTransitionV1(owner, target, action);
}

function snapshot(data: unknown) {
  return { exists: data !== null, data: () => data ?? undefined };
}

function createFirestoreFixture(overrides: Record<string, unknown | null> = {}) {
  const values = new Map<string, unknown | null>([
    ["proClubs/club-1", { name: "Lampang FC", level: "T1", status: "ACTIVE" }],
    ["proClubs/club-1/members/owner-1", { authorizationRole: "OWNER", status: "ACTIVE" }],
    ["proClubs/club-1/members/staff-1", { authorizationRole: "MEMBER", status: "ACTIVE" }],
    ["proClubs/club-1/staff/staff-1", { staffRole: "ASSISTANT_COACH", status: "ACTIVE" }],
  ]);
  for (const [path, value] of Object.entries(overrides)) values.set(path, value);

  const updates: Array<{ path: string; data: unknown }> = [];
  const creates: Array<{ path: string; data: any }> = [];
  let transactionCount = 0;
  let eventCounter = 0;

  class DocRef {
    constructor(readonly path: string, readonly id: string) {}
    collection(name: string) {
      return new CollectionRef(`${this.path}/${name}`);
    }
    async get() {
      return snapshot(values.has(this.path) ? values.get(this.path) : null);
    }
  }
  class CollectionRef {
    constructor(readonly path: string) {}
    doc(id?: string) {
      const actualId = id ?? `event-${++eventCounter}`;
      return new DocRef(`${this.path}/${actualId}`, actualId);
    }
  }

  const firestore: any = {
    collection(name: string) {
      return new CollectionRef(name);
    },
    async runTransaction(callback: (transaction: any) => Promise<unknown>) {
      transactionCount += 1;
      const transaction = {
        async get(ref: DocRef) {
          return snapshot(values.has(ref.path) ? values.get(ref.path) : null);
        },
        update(ref: DocRef, data: unknown) {
          updates.push({ path: ref.path, data });
        },
        create(ref: DocRef, data: unknown) {
          creates.push({ path: ref.path, data });
        },
      };
      return await callback(transaction);
    },
  };

  return {
    firestore,
    updates,
    creates,
    getTransactionCount: () => transactionCount,
  };
}

function expectCode(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ProClubStaffManagementServiceError);
    assert.equal(error.code, code);
    return true;
  };
}

test("1. atomic DEACTIVATE updates membership/staff and creates one append-only history event", async () => {
  const fixture = createFirestoreFixture();
  const source = createFirestoreProClubStaffManagementSourceV1(fixture.firestore);
  await source.applyAtomicPlan({
    clubId: "club-1",
    targetUid: "staff-1",
    requesterUid: "owner-1",
    plan: plan({ type: "DEACTIVATE" }),
  });

  assert.equal(fixture.updates.length, 2);
  assert.deepEqual(fixture.updates[0], {
    path: "proClubs/club-1/members/staff-1",
    data: { authorizationRole: "MEMBER", status: "INACTIVE" },
  });
  assert.deepEqual(fixture.updates[1], {
    path: "proClubs/club-1/staff/staff-1",
    data: { staffRole: "ASSISTANT_COACH", status: "INACTIVE" },
  });
  assert.equal(fixture.creates.length, 1);
  assert.equal(fixture.creates[0].path, "proClubs/club-1/staffManagementHistory/event-1");
  assert.equal(fixture.creates[0].data.eventId, "event-1");
  assert.equal(fixture.creates[0].data.changedBy, "owner-1");
  assert.equal(fixture.creates[0].data.action, "DEACTIVATE");
  assert.ok(fixture.creates[0].data.changedAt);
});

test("2. stale target role conflicts inside transaction and produces no writes", async () => {
  const fixture = createFirestoreFixture({
    "proClubs/club-1/staff/staff-1": { staffRole: "ANALYST", status: "ACTIVE" },
  });
  const source = createFirestoreProClubStaffManagementSourceV1(fixture.firestore);
  await assert.rejects(
    () => source.applyAtomicPlan({
      clubId: "club-1",
      targetUid: "staff-1",
      requesterUid: "owner-1",
      plan: plan({ type: "DEACTIVATE" }),
    }),
    expectCode("CONFLICT"),
  );
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.creates.length, 0);
});

test("3. actor authority is re-read inside transaction and downgrade to MEMBER fails closed", async () => {
  const fixture = createFirestoreFixture({
    "proClubs/club-1/members/owner-1": { authorizationRole: "MEMBER", status: "ACTIVE" },
  });
  const source = createFirestoreProClubStaffManagementSourceV1(fixture.firestore);
  await assert.rejects(
    () => source.applyAtomicPlan({
      clubId: "club-1",
      targetUid: "staff-1",
      requesterUid: "owner-1",
      plan: plan({ type: "CHANGE_ROLE", staffRole: "HEAD_COACH" }),
    }),
    expectCode("FORBIDDEN"),
  );
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.creates.length, 0);
});

test("4. club ACTIVE state is re-read and inactive club aborts atomically", async () => {
  const fixture = createFirestoreFixture({
    "proClubs/club-1": { name: "Lampang FC", level: "T1", status: "INACTIVE" },
  });
  const source = createFirestoreProClubStaffManagementSourceV1(fixture.firestore);
  await assert.rejects(
    () => source.applyAtomicPlan({
      clubId: "club-1",
      targetUid: "staff-1",
      requesterUid: "owner-1",
      plan: plan({ type: "DEACTIVATE" }),
    }),
    expectCode("CONFLICT"),
  );
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.creates.length, 0);
});

test("5. tampered plan identity is rejected before starting transaction", async () => {
  const fixture = createFirestoreFixture();
  const source = createFirestoreProClubStaffManagementSourceV1(fixture.firestore);
  const tampered = plan({ type: "DEACTIVATE" });
  tampered.history.changedBy = "spoofed-owner";
  await assert.rejects(
    () => source.applyAtomicPlan({
      clubId: "club-1",
      targetUid: "staff-1",
      requesterUid: "owner-1",
      plan: tampered,
    }),
    expectCode("INVALID_DATA"),
  );
  assert.equal(fixture.getTransactionCount(), 0);
});

test("6. invalid extra field in canonical membership fails closed with no writes", async () => {
  const fixture = createFirestoreFixture({
    "proClubs/club-1/members/staff-1": {
      authorizationRole: "MEMBER",
      status: "ACTIVE",
      email: "must-not-be-here@example.com",
    },
  });
  const source = createFirestoreProClubStaffManagementSourceV1(fixture.firestore);
  await assert.rejects(
    () => source.applyAtomicPlan({
      clubId: "club-1",
      targetUid: "staff-1",
      requesterUid: "owner-1",
      plan: plan({ type: "DEACTIVATE" }),
    }),
    expectCode("INVALID_DATA"),
  );
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.creates.length, 0);
});

test("7. optional canonical club fields do not cause false conflict", async () => {
  const fixture = createFirestoreFixture({
    "proClubs/club-1": {
      name: "Lampang FC",
      shortName: "LFC",
      level: "T1",
      status: "ACTIVE",
      country: "TH",
      logoUrl: "https://example.invalid/logo.png",
    },
  });
  const source = createFirestoreProClubStaffManagementSourceV1(fixture.firestore);
  await source.applyAtomicPlan({
    clubId: "club-1",
    targetUid: "staff-1",
    requesterUid: "owner-1",
    plan: plan({ type: "CHANGE_ROLE", staffRole: "HEAD_COACH" }),
  });
  assert.equal(fixture.updates.length, 2);
  assert.equal(fixture.creates.length, 1);
});

test("8. history persistence uses create, never update/set, and contains no contact identity", async () => {
  const fixture = createFirestoreFixture();
  const source = createFirestoreProClubStaffManagementSourceV1(fixture.firestore);
  await source.applyAtomicPlan({
    clubId: "club-1",
    targetUid: "staff-1",
    requesterUid: "owner-1",
    plan: plan({ type: "MARK_LEFT" }),
  });
  const history = fixture.creates[0].data;
  const serialized = JSON.stringify(history);
  assert.equal(serialized.includes("email"), false);
  assert.equal(serialized.includes("phone"), false);
  assert.equal(serialized.includes("displayName"), false);
  assert.equal(history.nextMembershipStatus, "LEFT");
  assert.equal(history.nextStaffStatus, "LEFT");
});

test("9. read methods preserve canonical paths and normalize missing documents to null", async () => {
  const fixture = createFirestoreFixture({
    "proClubs/club-1/staff/missing": null,
  });
  const source = createFirestoreProClubStaffManagementSourceV1(fixture.firestore);
  assert.deepEqual(await source.readMembership("club-1", "staff-1"), {
    authorizationRole: "MEMBER",
    status: "ACTIVE",
  });
  assert.equal(await source.readStaffAssignment("club-1", "missing"), null);
});
