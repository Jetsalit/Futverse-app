import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = process.cwd();

function read(relativePath: string): string {
  const filePath = path.join(repoRoot, relativePath);

  assert.equal(
    fs.existsSync(filePath),
    true,
    `${relativePath} must exist`,
  );

  return fs
    .readFileSync(filePath, "utf8")
    .replace(/\r\n/g, "\n");
}

describe("SuperAdmin Dashboard operational signal UI wiring", () => {
  it("wires the authoritative Profile Claim aggregate into the portal", () => {
    const source = read(
      "src/components/SuperadminPortal.tsx",
    );

    assert.match(
      source,
      /loadPendingProfileClaimCount/,
    );

    assert.match(
      source,
      /firestoreSuperAdminDashboardSignalReadOps/,
    );

    assert.match(
      source,
      /deriveDashboardOperationalSignals/,
    );
  });

  it("does not use the limited Profile Claims list count as the Command Center signal", () => {
    const source = read(
      "src/components/SuperadminPortal.tsx",
    );

    assert.doesNotMatch(
      source,
      /profileClaims=\{profileClaimsLoadState === "loaded" \? pendingProfileClaimsCount : null\}/,
    );

    assert.doesNotMatch(
      source,
      /pendingProfileClaims=\{pendingProfileClaimsCount\}/,
    );
  });

  it("passes one operational signal contract through Overview and Navigation", () => {
    const source = read(
      "src/components/SuperadminPortal.tsx",
    );

    assert.match(
      source,
      /operationalSignals=\{operationalSignals\}/,
    );

    assert.ok(
      (
        source.match(
          /operationalSignals=\{operationalSignals\}/g,
        ) || []
      ).length >= 2,
      "Portal must pass the same operational signal contract to Overview and Navigation",
    );
  });

  it("PendingActions consumes operational signal states instead of nullable raw counts", () => {
    const source = read(
      "src/components/superadmin/PendingActions.tsx",
    );

    assert.match(
      source,
      /DashboardOperationalSignal/,
    );

    assert.match(
      source,
      /operationalSignals/,
    );

    assert.doesNotMatch(
      source,
      /\{count \?\? "—"\}/,
    );

    for (const state of [
      "LOADING",
      "PENDING",
      "CLEAR",
      "UNAVAILABLE",
      "NOT_CONNECTED",
    ]) {
      assert.match(
        source,
        new RegExp(state),
      );
    }
  });

  it("SystemAlerts reports partial coverage without the obsolete lazy-loaded claim", () => {
    const source = read(
      "src/components/superadmin/SystemAlerts.tsx",
    );

    assert.match(
      source,
      /DashboardOperationalSignal/,
    );

    assert.match(
      source,
      /operationalSignals/,
    );

    assert.doesNotMatch(
      source,
      /Profile Claims and Error Reports remain lazy-loaded/i,
    );

    assert.doesNotMatch(
      source,
      /profileClaimsAvailable/,
    );

    assert.doesNotMatch(
      source,
      /errorReportsAvailable/,
    );
  });

  it("Overview forwards operational signals instead of four nullable action counts", () => {
    const source = read(
      "src/components/superadmin/SuperAdminOverview.tsx",
    );

    assert.match(
      source,
      /DashboardOperationalSignal/,
    );

    assert.match(
      source,
      /operationalSignals/,
    );

    assert.doesNotMatch(
      source,
      /paymentApprovals:\s*number \| null/,
    );

    assert.doesNotMatch(
      source,
      /profileClaims:\s*number \| null/,
    );

    assert.doesNotMatch(
      source,
      /errorReports:\s*number \| null/,
    );
  });
  it("Platform Overview KPI wiring preserves authoritative metric states", () => {
    const portal = read(
      "src/components/SuperadminPortal.tsx",
    );
    const overview = read(
      "src/components/superadmin/SuperAdminOverview.tsx",
    );
    const card = read(
      "src/components/superadmin/SuperAdminKpiCard.tsx",
    );

    assert.match(
      portal,
      /academyLoadState=\{academyLoadState\}/,
    );

    assert.match(
      portal,
      /userLoadState=\{userLoadState\}/,
    );

    assert.match(
      overview,
      /deriveDashboardMetric/,
    );

    assert.match(
      overview,
      /loadState:\s*academyLoadState/,
    );

    assert.match(
      overview,
      /loadState:\s*userLoadState/,
    );

    assert.match(
      card,
      /metric:\s*DashboardMetric/,
    );

    assert.match(
      card,
      /metric\.state === "LOADING"/,
    );

    assert.match(
      card,
      /metric\.state === "READY"/,
    );

    assert.match(
      card,
      /metric\.state === "UNAVAILABLE"/,
    );

    assert.doesNotMatch(
      card,
      /value:\s*number \| null/,
    );

    assert.match(
      card,
      /:\s*"\\u2014"/,
      "Non-ready KPI values must render an em dash",
    );

    assert.doesNotMatch(
      card,
      /:\s*"\?"/,
      "Non-ready KPI values must never render a question mark",
    );

    assert.doesNotMatch(
      card,
      /value === null \? "Unavailable" : "Live"/,
    );
  });

  it("Global Search exposes loading and partial source coverage", () => {
    const portal = read(
      "src/components/SuperadminPortal.tsx",
    );
    const header = read(
      "src/components/superadmin/SuperAdminHeader.tsx",
    );
    const search = read(
      "src/components/superadmin/SuperAdminSearch.tsx",
    );

    assert.match(
      portal,
      /deriveDashboardSearchCoverage/,
    );

    assert.match(
      portal,
      /searchCoverage=\{searchCoverage\}/,
    );

    assert.match(
      header,
      /searchCoverage:\s*DashboardSearchCoverage/,
    );

    assert.match(
      header,
      /coverage=\{searchCoverage\}/,
    );

    assert.match(
      search,
      /coverage:\s*DashboardSearchCoverage/,
    );

    assert.match(
      search,
      /coverage\.state === "LOADING"/,
    );

    assert.match(
      search,
      /coverage\.state === "PARTIAL"/,
    );

    assert.match(
      search,
      /Search coverage is still loading/,
    );

    assert.match(
      search,
      /Partial search coverage/,
    );

    assert.match(
      search,
      /No results in currently loaded data/,
    );
  });

  it("never uses System Logs as the Error Reports review module", () => {
    const source = read(
      "src/components/superadmin/PendingActions.tsx",
    );

    assert.doesNotMatch(
      source,
      /id:\s*"error-reports"[\s\S]{0,240}tab:\s*"system_logs"/,
    );
  });
});
