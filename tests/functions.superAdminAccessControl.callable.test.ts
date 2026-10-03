import assert from "node:assert/strict";
import { test } from "node:test";
import {
  executeManageSuperAdminAccessControlCallable,
} from "../functions/src/superAdminAccessControl/callableHandler.ts";
import {
  SuperAdminAccessControlError,
} from "../functions/src/superAdminAccessControl/core.ts";

const APP_ID = "1:504089427500:web:3cc2c8b1283316bdee9b89";

function request() {
  return {
    operation: "MANAGE_ACCESS",
    organizationType: "PRO_CLUB",
    organizationId: "club-a",
    targetUid: "coach-a",
    presentationModeActive: false,
    desiredStaffRole: "HEAD_COACH",
    expectedActionType: "ACCESS_ASSIGNED",
    confirmedActionType: "ACCESS_ASSIGNED",
    expectedState: { membership: null, staff: null, pointerExists: false },
  };
}

function handler(service: { execute(input: unknown): Promise<unknown> }) {
  return { service, allowedAppIds: [APP_ID] };
}

function code(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

for (const [name, context, expectedCode] of [
  ["missing App Check", { auth: { uid: "sa-1" }, data: request() }, "failed-precondition"],
  ["unapproved App Check app", { auth: { uid: "sa-1" }, app: { appId: "sibling-app" }, data: request() }, "failed-precondition"],
  ["missing Firebase Authentication", { app: { appId: APP_ID }, data: request() }, "unauthenticated"],
] as const) {
  test(`rejects ${name} before calling the service`, async () => {
    let called = false;
    await assert.rejects(executeManageSuperAdminAccessControlCallable(context, handler({
      async execute() { called = true; return {}; },
    })), (error: unknown) => code(error) === expectedCode);
    assert.equal(called, false);
  });
}

test("uses Firebase Authentication uid and rejects client actor spoofing", async () => {
  let received: unknown;
  const data = { ...request(), actorUid: "forged-admin" };
  await assert.rejects(executeManageSuperAdminAccessControlCallable({
    auth: { uid: "trusted-admin" }, app: { appId: APP_ID }, data,
  }, handler({ async execute(input) { received = input; return {}; } })),
  (error: unknown) => code(error) === "invalid-argument");
  assert.equal(received, undefined);
});

test("passes a validated operation with the authenticated actor uid", async () => {
  let received: unknown;
  const result = { actionId: "audit-1", actionType: "ACCESS_ASSIGNED" };
  const actual = await executeManageSuperAdminAccessControlCallable({
    auth: { uid: "trusted-admin" }, app: { appId: APP_ID }, data: request(),
  }, handler({ async execute(input) { received = input; return result; } }));
  assert.deepEqual(received, { actorUid: "trusted-admin", request: request() });
  assert.equal(actual, result);
});

test("rejects unsupported organizations and actions before service execution", async () => {
  for (const data of [
    { ...request(), organizationType: "OTHER" },
    { ...request(), operation: "DELETE_ORGANIZATION" },
    { ...request(), presentationModeActive: true },
    { ...request(), desiredStaffRole: "OWNER" },
  ]) {
    let called = false;
    await assert.rejects(executeManageSuperAdminAccessControlCallable({
      auth: { uid: "trusted-admin" }, app: { appId: APP_ID }, data,
    }, handler({ async execute() { called = true; return {}; } })),
    (error: unknown) => code(error) === "invalid-argument");
    assert.equal(called, false);
  }
});

test("maps service authorization failures and hides unexpected details", async () => {
  await assert.rejects(executeManageSuperAdminAccessControlCallable({
    auth: { uid: "trusted-admin" }, app: { appId: APP_ID }, data: request(),
  }, handler({ async execute() { throw new SuperAdminAccessControlError("PERMISSION_DENIED", "Not SuperAdmin."); } })),
  (error: unknown) => code(error) === "permission-denied");

  await assert.rejects(executeManageSuperAdminAccessControlCallable({
    auth: { uid: "trusted-admin" }, app: { appId: APP_ID }, data: request(),
  }, handler({ async execute() { throw new Error("private backend detail"); } })),
  (error: unknown) => code(error) === "internal" && (error as Error).message === "An internal error occurred.");
});
