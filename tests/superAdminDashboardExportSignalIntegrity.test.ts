import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSuperAdminDashboardCsv,
} from "../src/components/superadmin/dashboardExport.js";

import type {
  DashboardOperationalSignal,
} from "../src/components/superadmin/dashboardModel.js";

function buildCsv(
  operationalSignals: readonly DashboardOperationalSignal[],
): string {
  return buildSuperAdminDashboardCsv({
    exportedAt: new Date("2026-08-24T00:00:00.000Z"),
    academyCount: 1,
    academyLoadState: "loaded",
    roleCounts: {
      coaches: 0,
      playerAccounts: 0,
      parents: 0,
      scouts: 0,
    },
    users: [],
    operationalSignals,
    recentActivities: [],
    recentActivityLoadState: "loaded",
  });
}

const baseSignals: readonly DashboardOperationalSignal[] = [
  {
    id: "user-approvals",
    state: "UNAVAILABLE",
    count: null,
  },
  {
    id: "profile-claims",
    state: "PENDING",
    count: 7,
  },
  {
    id: "payment-approvals",
    state: "NOT_CONNECTED",
    count: null,
  },
  {
    id: "error-reports",
    state: "LOADING",
    count: null,
  },
];

describe("SuperAdmin Dashboard export signal integrity", () => {
  it("does not export unavailable User Approvals as zero", () => {
    const csv = buildCsv(baseSignals);

    assert.match(
      csv,
      /"summary","Pending Users","Unavailable"/,
    );

    assert.doesNotMatch(
      csv,
      /"summary","Pending Users","0"/,
    );
  });

  it("exports authoritative pending Profile Claim count", () => {
    const csv = buildCsv(baseSignals);

    assert.match(
      csv,
      /"summary","Pending Profile Claims","7"/,
    );
  });

  it("keeps NOT_CONNECTED distinct from UNAVAILABLE", () => {
    const csv = buildCsv(baseSignals);

    assert.match(
      csv,
      /"summary","Payment Approvals","Not Connected"/,
    );
  });

  it("keeps LOADING distinct from UNAVAILABLE", () => {
    const csv = buildCsv(baseSignals);

    assert.match(
      csv,
      /"summary","Error Reports","Loading"/,
    );
  });

  it("exports explicit CLEAR signals as zero", () => {
    const clearSignals: readonly DashboardOperationalSignal[] =
      baseSignals.map((signal) => ({
        ...signal,
        state: "CLEAR",
        count: 0,
      }));

    const csv = buildCsv(clearSignals);

    assert.match(
      csv,
      /"summary","Pending Users","0"/,
    );

    assert.match(
      csv,
      /"summary","Pending Profile Claims","0"/,
    );

    assert.match(
      csv,
      /"summary","Payment Approvals","0"/,
    );

    assert.match(
      csv,
      /"summary","Error Reports","0"/,
    );
  });
});
