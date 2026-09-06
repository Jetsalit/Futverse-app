import assert from "node:assert/strict";
import test from "node:test";
import {
  createFirestoreProClubStaffManagementRateLimiterV1,
  getProClubStaffManagementRateLimitBucketIdV1,
} from "../functions/src/proClubStaffManagement/rateLimiter.ts";

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
            set: (ref: any, data: Record<string, unknown>, options?: { merge?: boolean }) => { const base = options?.merge ? (staged.get(ref.path) ?? this.documents.get(ref.path) ?? {}) : {}; staged.set(ref.path, { ...base, ...data }); },
          });
          for (const [path, value] of staged) this.documents.set(path, value);
          resolve(result);
        } catch (error) { reject(error); }
      });
    });
  }
}

test("1. first privileged mutation attempt consumes one global requester quota", async () => {
  const store = new Store();
  const limiter = createFirestoreProClubStaffManagementRateLimiterV1(store as any, { maxAttempts: 2 });
  const result = await limiter.consumeQuota("owner-1", new Date("2026-09-06T05:00:00Z"));
  assert.equal(result.allowed, true); assert.equal(result.attempts, 1);
});

test("2. requester quota is capped and concurrent calls cannot exceed maximum", async () => {
  const store = new Store();
  const limiter = createFirestoreProClubStaffManagementRateLimiterV1(store as any, { maxAttempts: 3 });
  const results = await Promise.all(Array.from({ length: 7 }, () => limiter.consumeQuota("owner-2", new Date("2026-09-06T05:10:00Z"))));
  assert.equal(results.filter((r) => r.allowed).length, 3);
  assert.equal(results.filter((r) => !r.allowed).length, 4);
});

test("3. next UTC hour restores allowance", async () => {
  const store = new Store();
  const limiter = createFirestoreProClubStaffManagementRateLimiterV1(store as any, { maxAttempts: 1 });
  await limiter.consumeQuota("owner-3", new Date("2026-09-06T05:59:00Z"));
  assert.equal((await limiter.consumeQuota("owner-3", new Date("2026-09-06T05:59:30Z"))).allowed, false);
  assert.equal((await limiter.consumeQuota("owner-3", new Date("2026-09-06T06:00:00Z"))).allowed, true);
});

test("4. bucket is requester-global and contains no club or target identity", () => {
  const id = getProClubStaffManagementRateLimitBucketIdV1("owner-4", new Date("2026-09-06T05:15:00Z"));
  assert.match(id, /^proClubStaffManagement_owner-4_20260906_05$/);
  assert.equal(id.includes("club-"), false); assert.equal(id.includes("target-"), false);
});

test("5. stored quota document is privacy-minimal", async () => {
  const store = new Store();
  const limiter = createFirestoreProClubStaffManagementRateLimiterV1(store as any, { maxAttempts: 2 });
  const now = new Date("2026-09-06T05:20:00Z"); await limiter.consumeQuota("owner-5", now);
  const id = getProClubStaffManagementRateLimitBucketIdV1("owner-5", now);
  const doc = store.documents.get(`internalRateLimits/${id}`)!;
  assert.deepEqual(Object.keys(doc).sort(), ["attempts", "requesterUid", "updatedAt"].sort());
  const serialized = JSON.stringify(doc); for (const forbidden of ["clubId", "targetUid", "staffRole", "action", "email", "phone"]) assert.equal(serialized.includes(forbidden), false);
});

test("6. malformed requester and invalid limiter configuration fail closed", async () => {
  const store = new Store();
  assert.throws(() => createFirestoreProClubStaffManagementRateLimiterV1(store as any, { maxAttempts: 0 }), /INVALID_STAFF_MANAGEMENT_RATE_LIMIT_CONFIGURATION/);
  const limiter = createFirestoreProClubStaffManagementRateLimiterV1(store as any);
  await assert.rejects(() => limiter.consumeQuota(" padded "), /INVALID_STAFF_MANAGEMENT_RATE_LIMIT_REQUESTER/);
});
