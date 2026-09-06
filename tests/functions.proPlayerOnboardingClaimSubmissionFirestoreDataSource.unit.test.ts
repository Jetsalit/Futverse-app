import assert from "node:assert/strict";
import test from "node:test";
import { createFirestoreProPlayerClaimSubmissionSourceV1 } from "../functions/src/proPlayerOnboardingClaimSubmission/firestoreDataSource.ts";

class FakeFirestore {
  docs = new Map<string, Record<string, unknown>>();
  created: Array<{ path: string; data: Record<string, unknown> }> = [];
  collection(name: string) { return { doc: (id: string) => ({ path: `${name}/${id}` }) }; }
  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return fn({
      get: async (ref: any) => {
        const data = this.docs.get(ref.path);
        return { exists: data !== undefined, data: () => data ? { ...data } : undefined };
      },
      create: (ref: any, data: Record<string, unknown>) => {
        if (this.docs.has(ref.path)) throw new Error("ALREADY_EXISTS");
        this.created.push({ path: ref.path, data });
      },
    });
  }
}

test("Firestore source reads only canonical user, self claim and self binding paths", async () => {
  const db = new FakeFirestore();
  db.docs.set("users/player-1", { uid: "player-1", role: "PLAYER", status: "ACTIVE" });
  const source = createFirestoreProPlayerClaimSubmissionSourceV1(db as any);
  await source.runSubmissionTransaction(async (tx) => {
    assert.equal((await tx.getUser("player-1")).exists, true);
    assert.equal((await tx.getClaim("player-1")).exists, false);
    assert.equal((await tx.getBinding("player-1")).exists, false);
    tx.createClaim("player-1", { status: "PENDING" });
  });
  assert.deepEqual(db.created, [{ path: "proPlayerOnboardingClaims/player-1", data: { status: "PENDING" } }]);
});

test("claim writer uses create-only semantics and cannot overwrite an existing claim", async () => {
  const db = new FakeFirestore();
  db.docs.set("proPlayerOnboardingClaims/player-1", { status: "PENDING" });
  const source = createFirestoreProPlayerClaimSubmissionSourceV1(db as any);
  await assert.rejects(
    source.runSubmissionTransaction(async (tx) => tx.createClaim("player-1", { status: "PENDING" })),
    /ALREADY_EXISTS/,
  );
  assert.equal(db.created.length, 0);
});
