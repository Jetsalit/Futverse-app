import assert from "node:assert/strict";
import test from "node:test";
import {
  createFirestoreProPlayerClaimSubmissionRateLimiterV1,
  getProPlayerClaimSubmissionRateLimitBucketIdV1,
} from "../functions/src/proPlayerOnboardingClaimSubmission/rateLimiter.ts";

class Store {
  documents = new Map<string, Record<string, unknown>>();
  private queue: Promise<void> = Promise.resolve();
  collection(name: string) { return { doc: (id: string) => ({ path: `${name}/${id}`, id }) }; }
  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        const staged = new Map<string, Record<string, unknown>>();
        try {
          const result = await fn({
            get: async (ref: any) => { const data = this.documents.get(ref.path); return { exists: data !== undefined, data: () => data ? { ...data } : undefined }; },
            set: (ref: any, data: Record<string, unknown>, options?: { merge?: boolean }) => {
              const base = options?.merge ? (staged.get(ref.path) ?? this.documents.get(ref.path) ?? {}) : {};
              staged.set(ref.path, { ...base, ...data });
            },
          });
          for (const [path, value] of staged) this.documents.set(path, value);
          resolve(result);
        } catch (error) { reject(error); }
      });
    });
  }
}

test("submission quota is requester-global, concurrent-safe and resets by UTC hour", async () => {
  const store = new Store();
  const limiter = createFirestoreProPlayerClaimSubmissionRateLimiterV1(store as any, { maxAttempts: 3 });
  const now = new Date("2026-09-06T12:20:00Z");
  const results = await Promise.all(Array.from({ length: 7 }, () => limiter.consumeQuota("player-1", now)));
  assert.equal(results.filter((r) => r.allowed).length, 3);
  assert.equal(results.filter((r) => !r.allowed).length, 4);
  assert.equal((await limiter.consumeQuota("player-1", new Date("2026-09-06T13:00:00Z"))).allowed, true);
});

test("bucket and stored quota document contain no profile, salary, FUTID or club data", async () => {
  const store = new Store();
  const now = new Date("2026-09-06T12:20:00Z");
  const limiter = createFirestoreProPlayerClaimSubmissionRateLimiterV1(store as any, { maxAttempts: 2 });
  await limiter.consumeQuota("player-2", now);
  const id = getProPlayerClaimSubmissionRateLimitBucketIdV1("player-2", now);
  assert.match(id, /^proPlayerClaimSubmission_player-2_20260906_12$/);
  const stored = store.documents.get(`internalRateLimits/${id}`)!;
  assert.deepEqual(Object.keys(stored).sort(), ["attempts", "requesterUid", "updatedAt"].sort());
  const serialized = JSON.stringify(stored);
  for (const forbidden of ["profile", "salary", "futId", "playerKey", "clubId", "email", "dateOfBirth"]) {
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
});

test("invalid requester and invalid configuration fail closed", async () => {
  const store = new Store();
  assert.throws(() => createFirestoreProPlayerClaimSubmissionRateLimiterV1(store as any, { maxAttempts: 0 }), /INVALID_PRO_PLAYER_CLAIM_RATE_LIMIT_CONFIGURATION/);
  const limiter = createFirestoreProPlayerClaimSubmissionRateLimiterV1(store as any);
  await assert.rejects(() => limiter.consumeQuota(" padded "), /INVALID_PRO_PLAYER_CLAIM_RATE_LIMIT_REQUESTER/);
});
