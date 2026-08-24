import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DASHBOARD_CSV_MIME_TYPE,
  buildSuperAdminDashboardCsv,
  dashboardCsvCell,
  dashboardExportFilename,
  type SuperAdminDashboardExportInput,
} from "../src/components/superadmin/dashboardExport.js";
import type {
  DashboardOperationalSignal,
} from "../src/components/superadmin/dashboardModel.js";

function operationalSignals(
  overrides: Partial<
    Record<
      DashboardOperationalSignal["id"],
      DashboardOperationalSignal
    >
  > = {},
): readonly DashboardOperationalSignal[] {
  const defaults: Record<
    DashboardOperationalSignal["id"],
    DashboardOperationalSignal
  > = {
    "user-approvals": {
      id: "user-approvals",
      state: "PENDING",
      count: 3,
    },
    "profile-claims": {
      id: "profile-claims",
      state: "UNAVAILABLE",
      count: null,
    },
    "payment-approvals": {
      id: "payment-approvals",
      state: "PENDING",
      count: 2,
    },
    "error-reports": {
      id: "error-reports",
      state: "UNAVAILABLE",
      count: null,
    },
  };

  return Object.values({
    ...defaults,
    ...overrides,
  });
}

function exportInput(
  overrides: Partial<SuperAdminDashboardExportInput> = {},
): SuperAdminDashboardExportInput {
  return {
    exportedAt: new Date("2026-08-08T10:20:30.000Z"),
    academyCount: 4,
    academyLoadState: "loaded",
    roleCounts: {
      coaches: 5,
      playerAccounts: 6,
      parents: 7,
      scouts: 8,
    },
    users: [],
    operationalSignals: operationalSignals(),
    recentActivities: [],
    recentActivityLoadState: "loading",
    ...overrides,
  };
}

describe("SuperAdmin Dashboard CSV export", () => {
  it("writes a UTF-8 BOM, CRLF rows, MIME type, and deterministic filename", () => {
    const csv = buildSuperAdminDashboardCsv(exportInput());

    assert.equal(csv.startsWith("\uFEFF"), true);
    assert.equal(csv.endsWith("\r\n"), true);
    assert.equal(csv.replaceAll("\r\n", "").includes("\n"), false);
    assert.equal(DASHBOARD_CSV_MIME_TYPE, "text/csv;charset=utf-8");
    assert.equal(
      dashboardExportFilename(new Date("2026-08-08T10:20:30.000Z")),
      "futverse-superadmin-dashboard-2026-08-08T10-20-30-000Z.csv",
    );
  });

  it("exports the Dashboard KPI snapshot without inventing unavailable zeroes", () => {
    const csv = buildSuperAdminDashboardCsv(exportInput());

    assert.match(csv, /"Pending Users","3"/);
    assert.match(csv, /"Academies","4"/);
    assert.match(csv, /"Coaches","5"/);
    assert.match(csv, /"Player Accounts","6"/);
    assert.match(csv, /"Parents","7"/);
    assert.match(csv, /"Scouts","8"/);
    assert.match(csv, /"Payment Approvals","2"/);
    assert.match(csv, /"Pending Profile Claims","Unavailable"/);
    assert.match(csv, /"Error Reports","Unavailable"/);
    assert.match(csv, /"Recent Activity Count","Unavailable"/);
    assert.doesNotMatch(csv, /"recent_activity"/);
  });

  it("exports Payment Approvals as Unavailable when the signal is unavailable", () => {
    const csv = buildSuperAdminDashboardCsv(exportInput({
      operationalSignals: operationalSignals({
        "payment-approvals": {
          id: "payment-approvals",
          state: "UNAVAILABLE",
          count: null,
        },
      }),
    }));

    assert.match(csv, /"Payment Approvals","Unavailable"/);
  });

  it("includes authoritative action counts and recent activity when available", () => {
    const csv = buildSuperAdminDashboardCsv(exportInput({
      operationalSignals: operationalSignals({
        "profile-claims": {
          id: "profile-claims",
          state: "PENDING",
          count: 2,
        },
        "error-reports": {
          id: "error-reports",
          state: "PENDING",
          count: 1,
        },
      }),
      recentActivityLoadState: "loaded",
      recentActivities: [{
        id: "activity-1",
        action: "User approved",
        actor: "HQ Admin",
        target: "player@example.com",
        timestamp: "2026-08-08T10:20:30.000Z",
      }],
    }));

    assert.match(csv, /"Pending Profile Claims","2"/);
    assert.match(csv, /"Error Reports","1"/);
    assert.match(csv, /"Recent Activity Count","1"/);
    assert.match(
      csv,
      /"recent_activity","Activity 1","","User approved","HQ Admin","player@example.com","2026-08-08T10:20:30.000Z"/,
    );
  });

  it("exports authoritative account role separately from requested intent metadata", () => {
    const csv = buildSuperAdminDashboardCsv(exportInput({
      users: [{
        id: "pending-coach",
        name: "Pending Coach",
        email: "coach@example.test",
        role: "USER",
        status: "Inactive",
        requestedRole: "COACH",
      }],
    }));

    assert.match(csv, /"authoritative_role"/);
    assert.match(csv, /"requested_intent"/);
    assert.match(
      csv,
      /"user_authority","User authority record"[^\r\n]*"USER","Inactive","COACH \(pending Membership intent\)"/,
    );
    assert.doesNotMatch(
      csv,
      /"authoritative_role"[^\r\n]*"COACH"/,
    );
  });

  it("quotes CSV safely, preserves UTF-8 text, and protects formula prefixes", () => {
    assert.equal(
      dashboardCsvCell('Coach "A", North'),
      '"Coach ""A"", North"',
    );
    assert.equal(
      dashboardCsvCell("=SUM(1,2)"),
      '"\'=SUM(1,2)"',
    );
    assert.equal(dashboardCsvCell("+1"), '"\'+1"');
    assert.equal(dashboardCsvCell("-1"), '"\'-1"');
    assert.equal(dashboardCsvCell("@name"), '"\'@name"');
    assert.equal(
      dashboardCsvCell("\tformula"),
      '"\'\tformula"',
    );
    assert.equal(
      dashboardCsvCell("\rformula"),
      '"\'\rformula"',
    );
    assert.equal(
      dashboardCsvCell("สวัสดี FUTVerse"),
      '"สวัสดี FUTVerse"',
    );
  });
});