import assert from "node:assert/strict";
import test from "node:test";
import { executeManageProClubStaffCallableV1 } from "../functions/src/proClubStaffManagement/callableHandler.ts";
import { ProClubStaffManagementServiceError } from "../functions/src/proClubStaffManagement/service.ts";
import type { ProClubStaffManagementServiceV1 } from "../functions/src/proClubStaffManagement/service.ts";

function service(options: { error?: Error; onRequest?: (value: unknown) => void } = {}): ProClubStaffManagementServiceV1 {
  return {
    async manageStaff(input: any) {
      options.onRequest?.(input);
      if (options.error) throw options.error;
      return {
        membership: { authorizationRole: "MEMBER", status: "ACTIVE" },
        staff: { staffRole: "HEAD_COACH", status: "ACTIVE" },
        history: {
          schemaVersion: 1, clubId: "club-1", userId: "target-1", changedBy: "owner-1", action: "CHANGE_ROLE",
          previousAuthorizationRole: "MEMBER", nextAuthorizationRole: "MEMBER",
          previousMembershipStatus: "ACTIVE", nextMembershipStatus: "ACTIVE",
          previousStaffRole: "ASSISTANT_COACH", nextStaffRole: "HEAD_COACH",
          previousStaffStatus: "ACTIVE", nextStaffStatus: "ACTIVE",
        },
      } as any;
    },
  };
}

test("1. missing App Check fails closed before service", async () => {
  let called = false;
  await assert.rejects(() => executeManageProClubStaffCallableV1({ auth: { uid: "owner-1" }, app: undefined, data: {} }, { service: service({ onRequest: () => { called = true; } }) }), (e: any) => e?.code === "failed-precondition");
  assert.equal(called, false);
});

test("2. missing auth is rejected before service", async () => {
  await assert.rejects(() => executeManageProClubStaffCallableV1({ auth: undefined, app: { appId: "app-1" }, data: {} }, { service: service() }), (e: any) => e?.code === "unauthenticated");
});

test("3. authenticated UID is the only actor passed to service", async () => {
  let captured: any;
  await executeManageProClubStaffCallableV1({ auth: { uid: "real-owner" }, app: { appId: "app-1" }, data: { clubId: "club-1", targetUid: "target-1", action: { type: "DEACTIVATE" } } }, { service: service({ onRequest: (v) => { captured = v; } }) });
  assert.equal(captured.requesterUid, "real-owner");
  assert.deepEqual(captured.requestBody, { clubId: "club-1", targetUid: "target-1", action: { type: "DEACTIVATE" } });
});

test("4. response is minimal and does not expose history actor or target identity", async () => {
  const result = await executeManageProClubStaffCallableV1({ auth: { uid: "owner-1" }, app: { appId: "app-1" }, data: {} }, { service: service() });
  assert.deepEqual(Object.keys(result).sort(), ["action", "membershipStatus", "ok", "staffRole", "staffStatus"].sort());
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("changedBy"), false); assert.equal(serialized.includes("target-1"), false); assert.equal(serialized.includes("club-1"), false);
});

test("5. permission, conflict and rate-limit errors are sanitized", async () => {
  const cases = [
    ["FORBIDDEN", "permission-denied"],
    ["CONFLICT", "aborted"],
    ["RATE_LIMIT_EXCEEDED", "resource-exhausted"],
  ] as const;
  for (const [domainCode, httpsCode] of cases) {
    await assert.rejects(() => executeManageProClubStaffCallableV1({ auth: { uid: "owner-1" }, app: { appId: "app-1" }, data: {} }, { service: service({ error: new ProClubStaffManagementServiceError(domainCode, "sensitive raw detail") }) }), (e: any) => e?.code === httpsCode && !JSON.stringify(e).includes("sensitive raw detail"));
  }
});

test("6. invalid canonical data and unexpected errors are internal and sanitized", async () => {
  for (const error of [new ProClubStaffManagementServiceError("INVALID_DATA", "secret canonical value"), new Error("db host 10.0.0.5")]) {
    await assert.rejects(() => executeManageProClubStaffCallableV1({ auth: { uid: "owner-1" }, app: { appId: "app-1" }, data: {} }, { service: service({ error }) }), (e: any) => e?.code === "internal" && e?.message === "Unable to manage staff." && !JSON.stringify(e).includes("10.0.0.5") && !JSON.stringify(e).includes("secret canonical value"));
  }
});
