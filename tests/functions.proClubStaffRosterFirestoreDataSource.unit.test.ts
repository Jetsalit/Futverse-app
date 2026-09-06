import assert from "node:assert/strict";
import test from "node:test";
import { createFirestoreProClubStaffRosterDataSource } from "../functions/src/proClubStaffRoster/firestoreDataSource.ts";

function createMockFirestore() {
  const staffDocs = Array.from({ length: 3 }, (_, index) => ({
    id: `staff-${index + 1}`,
    data: () => ({ staffRole: "STAFF", status: "ACTIVE" }),
  }));
  let observedLimit: number | null = null;

  const firestore: any = {
    collection(name: string) {
      return {
        doc(id: string) {
          if (name === "users") {
            return {
              async get() {
                return { exists: true, data: () => ({ name: `User ${id}` }) };
              },
            };
          }
          if (name === "proClubs") {
            return {
              async get() {
                return { exists: true, data: () => ({ status: "ACTIVE" }) };
              },
              collection(subcollection: string) {
                if (subcollection === "staff") {
                  return {
                    limit(value: number) {
                      observedLimit = value;
                      return {
                        async get() {
                          return { docs: staffDocs };
                        },
                      };
                    },
                  };
                }
                return {
                  doc(uid: string) {
                    return {
                      async get() {
                        return {
                          exists: uid !== "missing",
                          data: () => ({ authorizationRole: "MEMBER", status: "ACTIVE" }),
                        };
                      },
                    };
                  },
                };
              },
            };
          }
          throw new Error(`unexpected collection ${name}`);
        },
      };
    },
  };

  return { firestore, getObservedLimit: () => observedLimit };
}

test("server data source uses bounded staff query and returns minimal raw documents", async () => {
  const { firestore, getObservedLimit } = createMockFirestore();
  const source = createFirestoreProClubStaffRosterDataSource(firestore);
  const docs = await source.listStaffAssignments("club-1");

  assert.equal(getObservedLimit(), 201);
  assert.deepEqual(docs[0], {
    id: "staff-1",
    data: { staffRole: "STAFF", status: "ACTIVE" },
  });
});

test("missing membership normalizes to null", async () => {
  const { firestore } = createMockFirestore();
  const source = createFirestoreProClubStaffRosterDataSource(firestore);
  assert.equal(await source.readMembership("club-1", "missing"), null);
});

test("user read returns canonical user payload without transformation", async () => {
  const { firestore } = createMockFirestore();
  const source = createFirestoreProClubStaffRosterDataSource(firestore);
  assert.deepEqual(await source.readUser("staff-1"), { name: "User staff-1" });
});
