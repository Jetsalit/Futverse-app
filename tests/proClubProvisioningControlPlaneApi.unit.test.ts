import assert from "node:assert/strict";
import test from "node:test";

import {
  ProClubControlPlaneApiError,
  buildProvisioningControlPlanePath,
  normalizeProvisioningControlPlaneRequest,
} from "../src/lib/proClubProvisioningControlPlaneApi.ts";

test("control-plane paths remain same-origin and exact", () => {
  assert.equal(
    buildProvisioningControlPlanePath("provision"),
    "/api/pro-club/provision-v1",
  );
  assert.equal(
    buildProvisioningControlPlanePath("verify-audit"),
    "/api/pro-club/verify-audit-v1",
  );
});

test("provisioning request normalizes optional strings without inventing authority", () => {
  assert.deepEqual(
    normalizeProvisioningControlPlaneRequest({
      provisioningId: "pcp_test-001",
      clubId: "lampang-fc",
      name: "  Lampang Football Club  ",
      shortName: " LAMPANG ",
      level: "T3",
      country: " TH ",
      logoUrl: "   ",
      initialOwnerUid: "owner-uid-001",
    }),
    {
      provisioningId: "pcp_test-001",
      clubId: "lampang-fc",
      name: "Lampang Football Club",
      shortName: "LAMPANG",
      level: "T3",
      country: "TH",
      logoUrl: undefined,
      initialOwnerUid: "owner-uid-001",
    },
  );
});

test("client preflight rejects non-canonical document identifiers", () => {
  for (const [field, value] of [
    ["provisioningId", " pcp_bad"],
    ["clubId", "clubs/lampang"],
    ["initialOwnerUid", ""],
  ] as const) {
    assert.throws(
      () =>
        normalizeProvisioningControlPlaneRequest({
          provisioningId: field === "provisioningId" ? value : "pcp_ok",
          clubId: field === "clubId" ? value : "lampang-fc",
          name: "Lampang FC",
          level: "T3",
          initialOwnerUid: field === "initialOwnerUid" ? value : "owner-uid",
        }),
      (error: unknown) =>
        error instanceof ProClubControlPlaneApiError &&
        error.code === "ERROR_INVALID_CLIENT_INPUT",
    );
  }
});

test("client preflight rejects blank club name", () => {
  assert.throws(
    () =>
      normalizeProvisioningControlPlaneRequest({
        provisioningId: "pcp_ok",
        clubId: "lampang-fc",
        name: "   ",
        level: "T3",
        initialOwnerUid: "owner-uid",
      }),
    (error: unknown) =>
      error instanceof ProClubControlPlaneApiError &&
      error.code === "ERROR_INVALID_CLIENT_INPUT",
  );
});
