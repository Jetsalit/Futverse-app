import assert from "node:assert/strict";
import test from "node:test";
import { executeLoadProClubStaffRosterCallableV1 } from "../functions/src/proClubStaffRoster/callableHandler.ts";
import type { ProClubStaffRosterService } from "../functions/src/proClubStaffRoster/service.ts";

function createService(options: {
  error?: Error;
  response?: unknown;
  onRequest?: (request: unknown) => void;
} = {}): ProClubStaffRosterService {
  return {
    async loadRoster(request: unknown) {
      options.onRequest?.(request);
      if (options.error) throw options.error;
      return (options.response ?? {
        schemaVersion: 1,
        clubId: "club-1",
        entries: [],
      }) as any;
    },
  } as ProClubStaffRosterService;
}

test("missing App Check fails closed", async () => {
  await assert.rejects(
    () => executeLoadProClubStaffRosterCallableV1(
      { auth: { uid: "owner-1" }, app: undefined, data: { clubId: "club-1" } },
      { service: createService(), enforceAppCheck: true },
    ),
    (error: any) => error?.code === "failed-precondition",
  );
});

test("missing auth is rejected", async () => {
  await assert.rejects(
    () => executeLoadProClubStaffRosterCallableV1(
      { auth: undefined, app: { appId: "app-1" }, data: { clubId: "club-1" } },
      { service: createService(), enforceAppCheck: true },
    ),
    (error: any) => error?.code === "unauthenticated",
  );
});

test("authenticated UID is the only requester identity passed to service", async () => {
  let captured: any;
  const result = await executeLoadProClubStaffRosterCallableV1(
    {
      auth: { uid: "real-owner" },
      app: { appId: "app-1" },
      data: { clubId: "club-1" },
    },
    {
      service: createService({ onRequest: (request) => { captured = request; } }),
      enforceAppCheck: true,
    },
  );

  assert.equal(captured.requesterUid, "real-owner");
  assert.deepEqual(captured.requestBody, { clubId: "club-1" });
  assert.equal(result.clubId, "club-1");
});

test("permission failures are sanitized", async () => {
  const { ProClubStaffRosterError, STAFF_ROSTER_ERROR_CODES } = await import(
    "../functions/src/proClubStaffRoster/core.ts"
  );
  await assert.rejects(
    () => executeLoadProClubStaffRosterCallableV1(
      { auth: { uid: "member-1" }, app: { appId: "app-1" }, data: { clubId: "club-1" } },
      {
        service: createService({
          error: new ProClubStaffRosterError(STAFF_ROSTER_ERROR_CODES.FORBIDDEN, "sensitive detail"),
        }),
      },
    ),
    (error: any) => error?.code === "permission-denied" && error?.message === "Reviewer authority required.",
  );
});

test("invalid canonical data is internal and does not leak raw details", async () => {
  const { ProClubStaffRosterError, STAFF_ROSTER_ERROR_CODES } = await import(
    "../functions/src/proClubStaffRoster/core.ts"
  );
  await assert.rejects(
    () => executeLoadProClubStaffRosterCallableV1(
      { auth: { uid: "owner-1" }, app: { appId: "app-1" }, data: { clubId: "club-1" } },
      {
        service: createService({
          error: new ProClubStaffRosterError(
            STAFF_ROSTER_ERROR_CODES.INVALID_DATA,
            "private canonical value leaked here",
          ),
        }),
      },
    ),
    (error: any) => {
      assert.equal(error?.code, "internal");
      assert.equal(error?.message, "Unable to load the staff roster.");
      assert.ok(!JSON.stringify(error).includes("private canonical value leaked here"));
      return true;
    },
  );
});

test("unexpected errors are sanitized", async () => {
  await assert.rejects(
    () => executeLoadProClubStaffRosterCallableV1(
      { auth: { uid: "owner-1" }, app: { appId: "app-1" }, data: { clubId: "club-1" } },
      { service: createService({ error: new Error("database host 10.0.0.5 failed") }) },
    ),
    (error: any) => {
      assert.equal(error?.code, "internal");
      assert.equal(error?.message, "Unable to load the staff roster.");
      assert.ok(!JSON.stringify(error).includes("10.0.0.5"));
      return true;
    },
  );
});
