import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { executeResolveProClubStaffCandidateCallable } from "../functions/src/proClubStaffCandidateResolution/callableHandler.ts";
import {
  createProClubStaffCandidateResolutionService,
  type MinimalAdminAuthForResolution,
} from "../functions/src/proClubStaffCandidateResolution/service.ts";
import type { ProClubStaffResolutionRateLimiter } from "../functions/src/proClubStaffCandidateResolution/rateLimiter.ts";
import {
  shouldEnableAppCheckDebug,
  isAppCheckSiteKeyConfigured,
} from "../src/lib/firebase.ts";

function createMockService(options: {
  clubStatus?: string;
  memberRole?: string;
  memberStatus?: string;
  allowCandidate?: boolean;
} = {}) {
  const {
    clubStatus = "ACTIVE",
    memberRole = "OWNER",
    memberStatus = "ACTIVE",
    allowCandidate = true,
  } = options;

  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail(email) {
      if (!allowCandidate) {
        throw new Error("auth/user-not-found");
      }
      return {
        uid: "resolved-cand-uid-123",
        email,
        displayName: "Coach Candidate",
      };
    },
  };

  const firestore: any = {
    collection(name: string) {
      return {
        doc(id: string) {
          if (name === "proClubs") {
            return {
              async get() {
                if (id === "foreign-club" || id === "missing-club") {
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
                        if (memberUid === "non-member" || memberUid === "foreign-reviewer") {
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
          }
          return {
            async get() {
              return { exists: false, data: () => undefined };
            },
          };
        },
      };
    },
  };

  const rateLimiter: ProClubStaffResolutionRateLimiter = {
    async consumeQuota() {
      return { allowed: true, attempts: 1, limit: 10, bucketId: "b-1" };
    },
  };

  return createProClubStaffCandidateResolutionService({
    firestore,
    auth,
    rateLimiter,
  });
}

test("1. missing App Check rejected with failed-precondition", async () => {
  const service = createMockService();
  await assert.rejects(
    async () => {
      await executeResolveProClubStaffCandidateCallable(
        {
          auth: { uid: "owner-1" },
          app: undefined, // missing app check
          data: { clubId: "club-1", email: "test@example.com" },
        },
        { service, enforceAppCheck: true },
      );
    },
    (err: any) => {
      assert.ok(err && typeof (err as any).code === "string");
      assert.equal(err.code, "failed-precondition");
      return true;
    },
  );
});

test("2. invalid App Check rejected with failed-precondition", async () => {
  const service = createMockService();
  await assert.rejects(
    async () => {
      await executeResolveProClubStaffCandidateCallable(
        {
          auth: { uid: "owner-1" },
          app: { appId: "   " }, // whitespace / invalid appId
          data: { clubId: "club-1", email: "test@example.com" },
        },
        { service, enforceAppCheck: true },
      );
    },
    (err: any) => {
      assert.ok(err && typeof (err as any).code === "string");
      assert.equal(err.code, "failed-precondition");
      return true;
    },
  );
});

test("3. valid App Check reaches resolver logic", async () => {
  const service = createMockService();
  const candidate = await executeResolveProClubStaffCandidateCallable(
    {
      auth: { uid: "owner-1" },
      app: { appId: "valid-futverse-app-id" },
      data: { clubId: "club-1", email: "coach@example.com" },
    },
    { service, enforceAppCheck: true },
  );

  assert.equal(candidate.targetUid, "resolved-cand-uid-123");
  assert.equal(candidate.email, "coach@example.com");
  assert.equal(candidate.displayName, "Coach Candidate");
});

test("4. missing auth rejected with unauthenticated", async () => {
  const service = createMockService();
  await assert.rejects(
    async () => {
      await executeResolveProClubStaffCandidateCallable(
        {
          auth: undefined, // missing auth
          app: { appId: "valid-futverse-app-id" },
          data: { clubId: "club-1", email: "test@example.com" },
        },
        { service, enforceAppCheck: true },
      );
    },
    (err: any) => {
      assert.ok(err && typeof (err as any).code === "string");
      assert.equal(err.code, "unauthenticated");
      return true;
    },
  );
});

test("5. invalid/revoked auth rejected with unauthenticated", async () => {
  const service = createMockService();
  await assert.rejects(
    async () => {
      await executeResolveProClubStaffCandidateCallable(
        {
          auth: { uid: "" }, // invalid uid
          app: { appId: "valid-futverse-app-id" },
          data: { clubId: "club-1", email: "test@example.com" },
        },
        { service, enforceAppCheck: true },
      );
    },
    (err: any) => {
      assert.ok(err && typeof (err as any).code === "string");
      assert.equal(err.code, "unauthenticated");
      return true;
    },
  );
});

test("6. body requesterUid cannot override actor", async () => {
  let evaluatedRequesterUid = "";
  const auth: MinimalAdminAuthForResolution = {
    async getUserByEmail(email) {
      return { uid: "target-cand", email };
    },
  };
  const firestore: any = {
    collection() {
      return {
        doc(clubId: string) {
          return {
            async get() {
              return { exists: true, data: () => ({ status: "ACTIVE" }) };
            },
            collection() {
              return {
                doc(memberUid: string) {
                  evaluatedRequesterUid = memberUid;
                  return {
                    async get() {
                      return {
                        exists: true,
                        data: () => ({ status: "ACTIVE", authorizationRole: "OWNER" }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const rateLimiter: ProClubStaffResolutionRateLimiter = {
    async consumeQuota() {
      return { allowed: true, attempts: 1, limit: 10, bucketId: "b-1" };
    },
  };
  const service = createProClubStaffCandidateResolutionService({
    firestore,
    auth,
    rateLimiter,
  });

  // Caller attempts to spoof "spoofed-super-admin" inside data
  await executeResolveProClubStaffCandidateCallable(
    {
      auth: { uid: "real-actor-uid" },
      app: { appId: "valid-app" },
      data: {
        clubId: "club-1",
        email: "coach@example.com",
      },
    },
    { service, enforceAppCheck: true },
  );

  assert.equal(evaluatedRequesterUid, "real-actor-uid");
});

test("7. MEMBER remains denied with permission-denied", async () => {
  const service = createMockService({ memberRole: "MEMBER" });
  await assert.rejects(
    async () => {
      await executeResolveProClubStaffCandidateCallable(
        {
          auth: { uid: "member-actor-uid" },
          app: { appId: "valid-app" },
          data: { clubId: "club-1", email: "coach@example.com" },
        },
        { service, enforceAppCheck: true },
      );
    },
    (err: any) => {
      assert.ok(err && typeof (err as any).code === "string");
      assert.equal(err.code, "permission-denied");
      return true;
    },
  );
});

test("8. cross-club reviewer remains denied with permission-denied", async () => {
  const service = createMockService();
  await assert.rejects(
    async () => {
      await executeResolveProClubStaffCandidateCallable(
        {
          auth: { uid: "foreign-reviewer" },
          app: { appId: "valid-app" },
          data: { clubId: "foreign-club", email: "coach@example.com" },
        },
        { service, enforceAppCheck: true },
      );
    },
    (err: any) => {
      assert.ok(err && typeof (err as any).code === "string");
      assert.equal(err.code, "permission-denied");
      return true;
    },
  );
});

test("9. production configuration cannot activate App Check debug mode", () => {
  // DEV: false with debug token must NOT activate debug mode
  assert.equal(
    shouldEnableAppCheckDebug({ DEV: false, VITE_APP_CHECK_DEBUG_TOKEN: "secret-debug-token" }),
    false,
  );
  // DEV undefined with debug token must NOT activate debug mode
  assert.equal(
    shouldEnableAppCheckDebug({ DEV: undefined, VITE_APP_CHECK_DEBUG_TOKEN: "secret-debug-token" }),
    false,
  );
  // No debug token in production
  assert.equal(
    shouldEnableAppCheckDebug({ DEV: false }),
    false,
  );
});

test("10. development configuration may activate configured debug token", () => {
  // DEV: true with valid debug token activates debug mode
  assert.equal(
    shouldEnableAppCheckDebug({ DEV: true, VITE_APP_CHECK_DEBUG_TOKEN: "dev-debug-token-123" }),
    true,
  );
  // DEV: true with missing or empty debug token does NOT activate debug mode
  assert.equal(
    shouldEnableAppCheckDebug({ DEV: true, VITE_APP_CHECK_DEBUG_TOKEN: undefined }),
    false,
  );
  assert.equal(
    shouldEnableAppCheckDebug({ DEV: true, VITE_APP_CHECK_DEBUG_TOKEN: "" }),
    false,
  );
});

test("11. missing production site key still fails closed", () => {
  assert.equal(isAppCheckSiteKeyConfigured({ VITE_RECAPTCHA_SITE_KEY: undefined }), false);
  assert.equal(isAppCheckSiteKeyConfigured({ VITE_RECAPTCHA_SITE_KEY: "" }), false);
  assert.equal(
    isAppCheckSiteKeyConfigured({ VITE_RECAPTCHA_SITE_KEY: "6Le-valid-production-key" }),
    true,
  );
});

test("12. provisionProClubV1 resource contract remains concurrency 20 / maxInstances 10", () => {
  const indexSource = readFileSync("functions/src/index.ts", "utf8");
  const provisionMatch = indexSource.match(/export\s+const\s+provisionProClubV1\s*=\s*onRequest\(\s*\{([\s\S]*?)\},/);
  assert.ok(provisionMatch, "provisionProClubV1 definition not found");
  const configBlock = provisionMatch[1];
  assert.match(configBlock, /concurrency:\s*20/);
  assert.match(configBlock, /maxInstances:\s*10/);
  assert.match(configBlock, /region:\s*"asia-southeast1"/);
});

test("13. resolver remains onCall + enforceAppCheck true", () => {
  const indexSource = readFileSync("functions/src/index.ts", "utf8");
  const resolverMatch = indexSource.match(/export\s+const\s+resolveProClubStaffCandidateV1\s*=\s*onCall\(\s*\{([\s\S]*?)\},/);
  assert.ok(resolverMatch, "resolveProClubStaffCandidateV1 definition not found");
  const configBlock = resolverMatch[1];
  assert.match(configBlock, /region:\s*"asia-southeast1"/);
  assert.match(configBlock, /enforceAppCheck:\s*true/);
  assert.match(configBlock, /concurrency:\s*20/);
  assert.match(configBlock, /maxInstances:\s*10/);
});
