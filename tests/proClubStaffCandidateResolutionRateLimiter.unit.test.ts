import assert from "node:assert/strict";
import test from "node:test";
import {
  createFirestoreRateLimiter,
  getResolutionRateLimitBucketId,
  type ProClubStaffResolutionRateLimiter,
} from "../functions/src/proClubStaffCandidateResolution/rateLimiter.ts";
import {
  createProClubStaffCandidateResolutionService,
  type MinimalAdminAuthForResolution,
  type MinimalUserRecord,
} from "../functions/src/proClubStaffCandidateResolution/service.ts";
import {
  ProClubStaffCandidateResolutionError,
  RESOLUTION_ERROR_CODES,
} from "../functions/src/proClubStaffCandidateResolution/core.ts";

class InMemoryFirestoreForRateLimiting {
  documents = new Map<string, Record<string, unknown>>();
  private transactionQueue: Promise<void> = Promise.resolve();

  collection(collectionName: string) {
    return {
      doc: (docId: string) => {
        const fullPath = `${collectionName}/${docId}`;
        return {
          path: fullPath,
          id: docId,
        };
      },
    };
  }

  async runTransaction<T>(
    updateFunction: (transaction: any) => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.transactionQueue = this.transactionQueue.then(async () => {
        try {
          const stage = new Map<string, Record<string, unknown>>();

          const tx = {
            get: async (docRef: { path: string }) => {
              const existing = this.documents.get(docRef.path);
              return {
                exists: existing !== undefined,
                data: () => (existing !== undefined ? { ...existing } : undefined),
              };
            },
            set: (
              docRef: { path: string },
              data: Record<string, unknown>,
              options?: { merge?: boolean },
            ) => {
              const base = options?.merge
                ? stage.get(docRef.path) ?? this.documents.get(docRef.path) ?? {}
                : {};
              stage.set(docRef.path, { ...base, ...data });
            },
          };

          const result = await updateFunction(tx);
          for (const [path, val] of stage.entries()) {
            this.documents.set(path, val);
          }
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }
}

function createMockAuthorityFirestore(options: {
  clubStatus?: string;
  memberRole?: string;
  memberStatus?: string;
} = {}) {
  const store = new InMemoryFirestoreForRateLimiting();
  const {
    clubStatus = "ACTIVE",
    memberRole = "OWNER",
    memberStatus = "ACTIVE",
  } = options;

  return {
    rateLimitingStore: store,
    collection(collectionName: string) {
      if (collectionName === "internalRateLimits") {
        return store.collection(collectionName);
      }
      if (collectionName === "proClubs") {
        return {
          doc(clubId: string) {
            return {
              async get() {
                if (clubId.startsWith("non-existent")) {
                  return { exists: false, data: () => undefined };
                }
                return {
                  exists: true,
                  data: () => ({ status: clubStatus }),
                };
              },
              collection(sub: string) {
                return {
                  doc(memberUid: string) {
                    return {
                      async get() {
                        if (memberUid.startsWith("non-member")) {
                          return { exists: false, data: () => undefined };
                        }
                        return {
                          exists: true,
                          data: () => ({
                            status: memberStatus,
                            authorizationRole: memberRole,
                          }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      return store.collection(collectionName);
    },
    async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return store.runTransaction(fn);
    },
  };
}

test("1. first authorized lookup consumes attempt #1", async () => {
  const store = new InMemoryFirestoreForRateLimiting();
  const limiter = createFirestoreRateLimiter(store as any, { maxAttempts: 10 });
  const result = await limiter.consumeQuota("requester-1");

  assert.equal(result.allowed, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.limit, 10);
});

test("2. successful lookup consumes quota", async () => {
  const firestore = createMockAuthorityFirestore();
  let getUserByEmailCalls = 0;
  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail(email) {
      getUserByEmailCalls++;
      return { uid: "target-cand-1", email, displayName: "Candidate" };
    },
  };
  const rateLimiter = createFirestoreRateLimiter(
    firestore as any,
    { maxAttempts: 10 },
  );
  const service = createProClubStaffCandidateResolutionService({
    firestore: firestore as any,
    auth,
    rateLimiter,
  });

  const res = await service.resolveCandidate({
    requesterUid: "requester-owner-1",
    requestBody: { clubId: "club-1", email: "coach@example.com" },
  });

  assert.equal(res.targetUid, "target-cand-1");
  assert.equal(getUserByEmailCalls, 1);

  // Verify rate limit doc consumed attempt 1
  const bucketId = getResolutionRateLimitBucketId("requester-owner-1");
  const doc = firestore.rateLimitingStore.documents.get(`internalRateLimits/${bucketId}`);
  assert.equal(doc?.attempts, 1);
});

test("3. unknown email consumes quota", async () => {
  const firestore = createMockAuthorityFirestore();
  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail() {
      throw new Error("auth/user-not-found");
    },
  };
  const rateLimiter = createFirestoreRateLimiter(
    firestore as any,
    { maxAttempts: 10 },
  );
  const service = createProClubStaffCandidateResolutionService({
    firestore: firestore as any,
    auth,
    rateLimiter,
  });

  await assert.rejects(
    async () => {
      await service.resolveCandidate({
        requesterUid: "requester-owner-2",
        requestBody: { clubId: "club-1", email: "nonexistent@example.com" },
      });
    },
    (err: any) => {
      assert(err instanceof ProClubStaffCandidateResolutionError);
      assert.equal(err.code, RESOLUTION_ERROR_CODES.CANDIDATE_NOT_FOUND);
      return true;
    },
  );

  // Quota was consumed despite candidate not existing
  const bucketId = getResolutionRateLimitBucketId("requester-owner-2");
  const doc = firestore.rateLimitingStore.documents.get(`internalRateLimits/${bucketId}`);
  assert.equal(doc?.attempts, 1);
});

test("4. disabled/ineligible candidate consumes quota", async () => {
  const firestore = createMockAuthorityFirestore();
  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail(email) {
      return { uid: "disabled-cand", email, disabled: true };
    },
  };
  const rateLimiter = createFirestoreRateLimiter(
    firestore as any,
    { maxAttempts: 10 },
  );
  const service = createProClubStaffCandidateResolutionService({
    firestore: firestore as any,
    auth,
    rateLimiter,
  });

  await assert.rejects(
    async () => {
      await service.resolveCandidate({
        requesterUid: "requester-owner-3",
        requestBody: { clubId: "club-1", email: "disabled@example.com" },
      });
    },
    (err: any) => {
      assert(err instanceof ProClubStaffCandidateResolutionError);
      assert.equal(err.code, RESOLUTION_ERROR_CODES.CANDIDATE_NOT_FOUND);
      return true;
    },
  );

  const bucketId = getResolutionRateLimitBucketId("requester-owner-3");
  const doc = firestore.rateLimitingStore.documents.get(`internalRateLimits/${bucketId}`);
  assert.equal(doc?.attempts, 1);
});

test("5. 10 attempts in bucket allowed", async () => {
  const store = new InMemoryFirestoreForRateLimiting();
  const limiter = createFirestoreRateLimiter(store as any, { maxAttempts: 10 });

  for (let i = 1; i <= 10; i++) {
    const result = await limiter.consumeQuota("requester-4");
    assert.equal(result.allowed, true);
    assert.equal(result.attempts, i);
  }
});

test("6. attempt 11 rejected", async () => {
  const store = new InMemoryFirestoreForRateLimiting();
  const limiter = createFirestoreRateLimiter(store as any, { maxAttempts: 10 });

  for (let i = 1; i <= 10; i++) {
    await limiter.consumeQuota("requester-5");
  }

  const result11 = await limiter.consumeQuota("requester-5");
  assert.equal(result11.allowed, false);
  assert.equal(result11.attempts, 10);
});

test("7. rejected attempt never calls getUserByEmail", async () => {
  const firestore = createMockAuthorityFirestore();
  let getUserByEmailCalls = 0;
  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail(email) {
      getUserByEmailCalls++;
      return { uid: "target-cand", email };
    },
  };
  const rateLimiter = createFirestoreRateLimiter(
    firestore as any,
    { maxAttempts: 2 },
  );
  const service = createProClubStaffCandidateResolutionService({
    firestore: firestore as any,
    auth,
    rateLimiter,
  });

  // Call 1: OK
  await service.resolveCandidate({
    requesterUid: "requester-6",
    requestBody: { clubId: "club-1", email: "cand1@example.com" },
  });
  // Call 2: OK
  await service.resolveCandidate({
    requesterUid: "requester-6",
    requestBody: { clubId: "club-1", email: "cand2@example.com" },
  });
  assert.equal(getUserByEmailCalls, 2);

  // Call 3: Exceeded limit
  await assert.rejects(
    async () => {
      await service.resolveCandidate({
        requesterUid: "requester-6",
        requestBody: { clubId: "club-1", email: "cand3@example.com" },
      });
    },
    (err: any) => {
      assert(err instanceof ProClubStaffCandidateResolutionError);
      assert.equal(err.code, RESOLUTION_ERROR_CODES.RATE_LIMIT_EXCEEDED);
      return true;
    },
  );

  // getUserByEmail was NOT called for attempt 3
  assert.equal(getUserByEmailCalls, 2);
});

test("8. different requester has independent quota", async () => {
  const store = new InMemoryFirestoreForRateLimiting();
  const limiter = createFirestoreRateLimiter(store as any, { maxAttempts: 10 });

  for (let i = 0; i < 10; i++) {
    await limiter.consumeQuota("requester-user-A");
  }

  // User A is exhausted
  const resA = await limiter.consumeQuota("requester-user-A");
  assert.equal(resA.allowed, false);

  // User B starts with fresh quota
  const resB = await limiter.consumeQuota("requester-user-B");
  assert.equal(resB.allowed, true);
  assert.equal(resB.attempts, 1);
});

test("9. changing club does NOT reset requester quota", async () => {
  const firestore = createMockAuthorityFirestore();
  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail(email) {
      return { uid: "cand", email };
    },
  };
  const rateLimiter = createFirestoreRateLimiter(
    firestore as any,
    { maxAttempts: 2 },
  );
  const service = createProClubStaffCandidateResolutionService({
    firestore: firestore as any,
    auth,
    rateLimiter,
  });

  // Call 1 on club-A
  await service.resolveCandidate({
    requesterUid: "requester-7",
    requestBody: { clubId: "club-A", email: "cand1@example.com" },
  });
  // Call 2 on club-B
  await service.resolveCandidate({
    requesterUid: "requester-7",
    requestBody: { clubId: "club-B", email: "cand2@example.com" },
  });

  // Call 3 on club-C: rejected because quota is global per requester
  await assert.rejects(
    async () => {
      await service.resolveCandidate({
        requesterUid: "requester-7",
        requestBody: { clubId: "club-C", email: "cand3@example.com" },
      });
    },
    (err: any) => {
      assert(err instanceof ProClubStaffCandidateResolutionError);
      assert.equal(err.code, RESOLUTION_ERROR_CODES.RATE_LIMIT_EXCEEDED);
      return true;
    },
  );
});

test("10. next hour/bucket restores allowance", async () => {
  const store = new InMemoryFirestoreForRateLimiting();
  const limiter = createFirestoreRateLimiter(store as any, { maxAttempts: 2 });

  const hour1 = new Date("2026-09-05T08:15:00.000Z");
  const hour2 = new Date("2026-09-05T09:05:00.000Z");

  await limiter.consumeQuota("requester-8", hour1);
  await limiter.consumeQuota("requester-8", hour1);

  // Exhausted in hour 1
  const resExhausted = await limiter.consumeQuota("requester-8", hour1);
  assert.equal(resExhausted.allowed, false);

  // Allowed in hour 2
  const resHour2 = await limiter.consumeQuota("requester-8", hour2);
  assert.equal(resHour2.allowed, true);
  assert.equal(resHour2.attempts, 1);
});

test("11. concurrent transaction attempts cannot exceed configured maximum", async () => {
  const store = new InMemoryFirestoreForRateLimiting();
  const limiter = createFirestoreRateLimiter(store as any, { maxAttempts: 10 });

  // Fire 15 concurrent calls
  const promises = Array.from({ length: 15 }, () =>
    limiter.consumeQuota("requester-concurrency"),
  );
  const results = await Promise.all(promises);

  const allowed = results.filter((r) => r.allowed);
  const rejected = results.filter((r) => !r.allowed);

  assert.equal(allowed.length, 10);
  assert.equal(rejected.length, 5);
});

test("12. unauthenticated request creates no rate-limit state", async () => {
  const firestore = createMockAuthorityFirestore();
  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail() {
      throw new Error("should not be called");
    },
  };
  const rateLimiter = createFirestoreRateLimiter(
    firestore as any,
    { maxAttempts: 10 },
  );
  const service = createProClubStaffCandidateResolutionService({
    firestore: firestore as any,
    auth,
    rateLimiter,
  });

  await assert.rejects(
    async () => {
      await service.resolveCandidate({
        requesterUid: undefined, // unauthenticated
        requestBody: { clubId: "club-1", email: "test@example.com" },
      });
    },
    (err: any) => {
      assert(err instanceof ProClubStaffCandidateResolutionError);
      assert.equal(err.code, RESOLUTION_ERROR_CODES.UNAUTHORIZED);
      return true;
    },
  );

  // Rate limit store must be completely empty
  assert.equal(firestore.rateLimitingStore.documents.size, 0);
});

test("13. MEMBER denied before rate-limit mutation", async () => {
  const firestore = createMockAuthorityFirestore({ memberRole: "MEMBER" });
  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail() {
      throw new Error("should not be called");
    },
  };
  const rateLimiter = createFirestoreRateLimiter(
    firestore as any,
    { maxAttempts: 10 },
  );
  const service = createProClubStaffCandidateResolutionService({
    firestore: firestore as any,
    auth,
    rateLimiter,
  });

  await assert.rejects(
    async () => {
      await service.resolveCandidate({
        requesterUid: "member-uid",
        requestBody: { clubId: "club-1", email: "test@example.com" },
      });
    },
    (err: any) => {
      assert(err instanceof ProClubStaffCandidateResolutionError);
      assert.equal(err.code, RESOLUTION_ERROR_CODES.FORBIDDEN);
      return true;
    },
  );

  // No rate-limit document created for denied MEMBER
  assert.equal(firestore.rateLimitingStore.documents.size, 0);
});

test("14. rate-limit documents contain no email", async () => {
  const firestore = createMockAuthorityFirestore();
  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail(email) {
      return { uid: "cand-uid", email };
    },
  };
  const rateLimiter = createFirestoreRateLimiter(
    firestore as any,
    { maxAttempts: 10 },
  );
  const service = createProClubStaffCandidateResolutionService({
    firestore: firestore as any,
    auth,
    rateLimiter,
  });

  const secretEmail = "secret-staff-email@example.com";
  await service.resolveCandidate({
    requesterUid: "requester-privacy-check",
    requestBody: { clubId: "club-1", email: secretEmail },
  });

  for (const [, docData] of firestore.rateLimitingStore.documents.entries()) {
    const rawJson = JSON.stringify(docData);
    assert(!rawJson.includes(secretEmail), "email must not appear in rate-limit doc");
  }
});

test("15. rate-limit documents contain no token/header", async () => {
  const firestore = createMockAuthorityFirestore();
  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail(email) {
      return { uid: "cand-uid", email };
    },
  };
  const rateLimiter = createFirestoreRateLimiter(
    firestore as any,
    { maxAttempts: 10 },
  );
  const service = createProClubStaffCandidateResolutionService({
    firestore: firestore as any,
    auth,
    rateLimiter,
  });

  await service.resolveCandidate({
    requesterUid: "requester-token-check",
    requestBody: { clubId: "club-1", email: "test@example.com" },
  });

  for (const [, docData] of firestore.rateLimitingStore.documents.entries()) {
    assert.equal(docData.authorizationHeader, undefined);
    assert.equal(docData.token, undefined);
    assert.equal(docData.bearer, undefined);
  }
});

test("16. rate-limit failure response contains no candidate information", async () => {
  const store = new InMemoryFirestoreForRateLimiting();
  const limiter = createFirestoreRateLimiter(store as any, { maxAttempts: 1 });

  // Consume attempt 1
  await limiter.consumeQuota("requester-clean-err");

  // Attempt 2 fails
  const failure = await limiter.consumeQuota("requester-clean-err");
  assert.equal(failure.allowed, false);

  const serialized = JSON.stringify(failure);
  assert(!serialized.includes("targetUid"));
  assert(!serialized.includes("email"));
  assert(!serialized.includes("displayName"));
});
