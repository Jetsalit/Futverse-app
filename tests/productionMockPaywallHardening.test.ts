import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { isExplicitlyActiveAccountStatus } from "../src/lib/accountRolePolicy.js";
import { hasClientPermission } from "../src/lib/privilegedAuthorization.js";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readSource = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), "utf8");

function productionFiles(directory = join(repoRoot, "src")): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(target);
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

const authSource = readSource("src/contexts/AuthContext.tsx");
const appSource = readSource("src/App.tsx");
const paywallSource = readSource("src/components/SubscriptionPaywall.tsx");

describe("Access A6 production mock and paywall hardening", () => {
  test("1. account activation accepts only exact authoritative active statuses", () => {
    assert.equal(isExplicitlyActiveAccountStatus("Active"), true);
    assert.equal(isExplicitlyActiveAccountStatus("ACTIVE"), true);
    for (const status of [
      "active",
      "Pending",
      "PENDING",
      "Inactive",
      "INACTIVE",
      "Rejected",
      "REJECTED",
      "PAID",
      "APPROVED",
      "",
      null,
      undefined,
      1,
      {},
    ]) {
      assert.equal(isExplicitlyActiveAccountStatus(status), false);
    }
  });

  test("2. non-privileged client permission also fails closed on account status", () => {
    for (const status of ["Active", "ACTIVE"]) {
      const actor = { role: "ADMIN", status };
      assert.equal(hasClientPermission(actor, actor, ["ADMIN"]), true);
    }
    for (const status of ["Pending", "Inactive", "Rejected", undefined, null, {}]) {
      const actor = { role: "ADMIN", status };
      assert.equal(hasClientPermission(actor, actor, ["ADMIN"]), false);
    }
    assert.equal(
      hasClientPermission(
        { role: "ADMIN", status: "Active" },
        { role: "COACH", status: "Active" },
        ["COACH"],
      ),
      false,
    );
  });

  test("3. AuthContext is identity/status only and fails closed without users/{uid}", () => {
    assert.match(authSource, /onAuthStateChanged\s*\(\s*auth/);
    assert.match(authSource, /onSnapshot\s*\(\s*userRef/);
    assert.doesNotMatch(
      authSource,
      /submitSubscription|subscriptionPlan|paymentDetails|defaultUser|FileReader|setTimeout\s*\(/,
    );
    assert.match(
      authSource,
      /else\s*\{\s*setActualUser\s*\(\s*null\s*\);\s*setCurrentUser\s*\(\s*null\s*\)/,
    );
  });

  test("4. paywall is an honest fail-closed billing-unavailable screen", () => {
    assert.match(paywallSource, /Billing is unavailable/i);
    assert.match(paywallSource, /configured payment provider/i);
    assert.match(paywallSource, /logout/);
    assert.doesNotMatch(
      paywallSource,
      /type=["']file|FileReader|setTimeout\s*\(|PromptPay|QR|slip|bank account|submitSubscription|addDoc|setDoc|updateDoc|fetch\s*\(/i,
    );
  });

  test("5. account approval is not treated as subscription or payment success", () => {
    assert.match(appSource, /isExplicitlyActiveAccountStatus\s*\(\s*currentUser\.status\s*\)/);
    assert.match(appSource, /case\s+["']subscription["']\s*:/);
    assert.doesNotMatch(
      appSource,
      /isPaywallActive|subscriptionPlan|paymentDetails|status\s*===?\s*["'](?:PAID|APPROVED|SUBSCRIBED)["']/i,
    );
    assert.ok(
      appSource.indexOf("isExplicitlyActiveAccountStatus(currentUser.status)") <
        appSource.indexOf('case "subscription"'),
      "the authoritative account-status gate must run before routed protected content",
    );
  });

  test("6. production source contains no known fabricated identity, avatar, or mock constant", () => {
    const forbidden =
      /MOCK_|mockData|Teerasil|Suphanat|Supachai|Chanathip|Pep Guardiola|Jurgen Klopp|api\.dicebear\.com/i;
    const offenders = productionFiles().flatMap((file) => {
      const match = readFileSync(file, "utf8").match(forbidden);
      return match ? [`${relative(repoRoot, file)}: ${match[0]}`] : [];
    });
    assert.deepEqual(offenders, []);
    assert.equal(
      existsSync(join(repoRoot, "src/components/ProPlayerManager.tsx.bak")),
      false,
    );
  });

  test("7. roster consumers start empty and clear authoritative data on errors", () => {
    const contracts = [
      ["src/components/CoachManagement.tsx", "coaches", "setCoaches"],
      ["src/components/YouthPlayerManager.tsx", "players", "setPlayers"],
      ["src/components/ProPlayerManager.tsx", "players", "setPlayers"],
      ["src/components/FitnessTesting.tsx", "players", "setPlayers"],
      ["src/components/StartingXIBuilder.tsx", "players", "setPlayers"],
      ["src/components/ScoutDashboard.tsx", "players", "setPlayers"],
    ] as const;

    for (const [file, stateName, setter] of contracts) {
      const source = readSource(file);
      assert.match(source, /onSnapshot\s*\(/, `${file} must use a live source`);
      assert.match(
        source,
        new RegExp(`const\\s+\\[${stateName},\\s*${setter}\\]\\s*=\\s*useState(?:<[^;]+?>)?\\(\\[\\]\\)`),
        `${file} must start empty`,
      );
      assert.match(source, new RegExp(`${setter}\\(\\[\\]\\)`), `${file} must clear stale data`);
    }
  });

  test("8. unsupported operational screens expose no fake operations or timers", () => {
    const unavailableScreens = [
      "src/components/IDPDashboard.tsx",
      "src/components/IDPProfile.tsx",
      "src/components/WeeklyPeriodization.tsx",
      "src/components/RecoveryDashboard.tsx",
      "src/components/PostMatchStatsEntry.tsx",
      "src/components/YouthDevelopmentReport.tsx",
      "src/components/NotificationDrawer.tsx",
    ];
    for (const file of unavailableScreens) {
      const source = readSource(file);
      assert.match(source, /unavailable|not configured/i, `${file} must disclose unavailability`);
      assert.doesNotMatch(
        source,
        /from\s+["']firebase\/|setTimeout\s*\(|FileReader|fetch\s*\(|addDoc|setDoc|updateDoc|deleteDoc/,
        `${file} must not simulate a backend operation`,
      );
    }
  });

  test("9. Academy settings persist only implemented academy-profile fields", () => {
    const source = readSource("src/components/Settings.tsx");
    assert.match(source, /await\s+updateSettings\s*\(/);
    assert.doesNotMatch(
      source,
      /pendingSyncs|Fitness Benchmarks|Privacy & Roles|System & Sync|\["U11",\s*"U13"|setTimeout\s*\(/,
    );
    assert.match(source, /accessState\s*!==\s*["']ACTIVE_MEMBERSHIP["']/);
  });

  test("10. navigation and ProPlayer CV do not fabricate identity or IDP progress", () => {
    const cvSource = readSource("src/components/ProPlayerCV.tsx");
    const managerSource = readSource("src/components/ProPlayerManager.tsx");
    assert.doesNotMatch(appSource, /toggleSimulation|pendingSyncs|Syncing\.\.\.|Teerasil/);
    assert.doesNotMatch(cvSource, /85%|17\/20|Share Link|Export PDF/);
    assert.doesNotMatch(managerSource, /name:\s*formData\.name\s*\|\|\s*["']Unknown["']/);
    assert.doesNotMatch(
      managerSource,
      /(?:technical|tactical|physical|mental|attacking|defending):\s*70/,
    );
  });
});
