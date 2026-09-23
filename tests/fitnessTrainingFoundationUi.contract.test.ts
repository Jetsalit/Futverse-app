import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), "utf8");

const app = read("src/App.tsx");
const academyFitness = read("src/components/FitnessTesting.tsx");
const proClubDashboard = read("src/components/pro-club/operations/ProClubTeamDashboard.tsx");
const trainingWorkspace = read("src/components/pro-club/operations/ProClubHeadCoachWeeklyProductionWorkspace.tsx");

test("Academy keeps its Fitness route and exposes Fitness & Training in the sidebar", () => {
  assert.match(app, /case "fitness"[\s\S]*?<FitnessTesting/);
  assert.match(app, /id: "fitness"[\s\S]*?label: "Fitness & Training"/);
  assert.match(academyFitness, /<FitnessTestCatalogue/);
});

test("Academy Coach can enter Fitness from the dashboard while catalogue management uses capability", () => {
  assert.match(
    app,
    /currentPage === "fitness"[\s\S]*?canAccessTenantCapability\([\s\S]*?\["ADMIN", "COACH"\]/,
  );
  assert.match(app, /academyFitnessCapabilities\.includes\("FITNESS_MANAGE_CATALOGUE"\)/);
});

test("Academy catalogue management uses capability while SuperAdmin support keeps presentation authority", () => {
  assert.match(
    app,
    /canManageCatalogue=\{[\s\S]*?isSupportActive[\s\S]*?effectivePresentationRole === "SUPERADMIN"[\s\S]*?effectivePresentationRole === "ADMIN"[\s\S]*?academyFitnessCapabilities\.includes\("FITNESS_MANAGE_CATALOGUE"\)/,
  );
  assert.doesNotMatch(
    app,
    /canManageCatalogue=\{[\s\S]*?effectivePresentationRole === "COACH"/,
  );
  assert.equal(
    (academyFitness.match(/canManage=\{canManageCatalogue\}/g) ?? []).length,
    2,
  );
});

test("Pro Club navigation exposes the combined Fitness & Training workspace", () => {
  assert.match(proClubDashboard, /TRAINING: "Fitness & Training"/);
  assert.match(proClubDashboard, /<FitnessTestCatalogue/);
  assert.match(proClubDashboard, /organizationId: authority\.organizationId/);
  assert.match(proClubDashboard, /organizationType: "PRO_CLUB"/);
});

test("no-data Academy reports do not render zero-normalized or fabricated charts", () => {
  assert.doesNotMatch(academyFitness, /fallback to 0 if no data/);
  assert.match(academyFitness, /No recorded fitness results for this player/);
  assert.doesNotMatch(academyFitness, /calculateVO2Max/);
});

test("Weekly Training renders the typed fitness connection boundary without prescription", () => {
  assert.match(trainingWorkspace, /FitnessTrainingConnection/);
  assert.match(trainingWorkspace, /No recorded fitness results are connected to this training plan/);
  assert.match(trainingWorkspace, /does not generate training prescriptions/);
});

test("foundation adds no direct fitness persistence or client-side role promotion", () => {
  const catalogue = read("src/components/fitness/FitnessTestCatalogue.tsx");
  assert.doesNotMatch(catalogue, /firebase|firestore|setDoc|addDoc|updateDoc|deleteDoc/);
  assert.doesNotMatch(catalogue, /membershipAuthorizationRole\s*=|staffRole\s*=/);
});
