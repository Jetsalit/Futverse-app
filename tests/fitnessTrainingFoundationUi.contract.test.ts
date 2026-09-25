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
const fitnessTrainingWorkspace = read("src/components/pro-club/operations/ProClubFitnessTrainingWorkspace.tsx");

test("Academy keeps its Fitness route and exposes Fitness & Training in the sidebar", () => {
  assert.match(app, /case "fitness"[\s\S]*?<FitnessTesting/);
  assert.match(
    app,
    /id: "fitness"[\s\S]*?label: "Fitness & Training"[\s\S]*?roles: \["SUPERADMIN", "ADMIN", "COACH"\]/,
  );
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
  const catalogueAuthority = app.match(/canManageCatalogue=\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  assert.match(
    catalogueAuthority,
    /isSupportActive[\s\S]*?effectivePresentationRole === "SUPERADMIN"[\s\S]*?effectivePresentationRole === "ADMIN"[\s\S]*?academyFitnessCapabilities\.includes\("FITNESS_MANAGE_CATALOGUE"\)/,
  );
  assert.doesNotMatch(
    catalogueAuthority,
    /effectivePresentationRole === "COACH"/,
  );
  assert.equal(
    (academyFitness.match(/canManage=\{canManageCatalogue\}/g) ?? []).length,
    2,
  );
});

test("Pro Club navigation exposes the combined Fitness & Training workspace", () => {
  assert.match(proClubDashboard, /TRAINING: "Fitness & Training"/);
  assert.match(proClubDashboard, /<ProClubFitnessTrainingWorkspace/);
  assert.doesNotMatch(proClubDashboard, /<FitnessTestCatalogue|<ProClubFitnessResults|<ProClubHeadCoachWeeklyProductionWorkspace/);
  assert.match(proClubDashboard, /organizationId: authority\.organizationId/);
  assert.match(proClubDashboard, /organizationType: "PRO_CLUB"/);
});

test("no-data Academy reports do not render zero-normalized or fabricated charts", () => {
  assert.doesNotMatch(academyFitness, /fallback to 0 if no data/);
  assert.match(academyFitness, /No recorded fitness results for this player/);
  assert.doesNotMatch(academyFitness, /calculateVO2Max/);
});

test("Weekly Training renders persisted observation context without inference", () => {
  assert.match(trainingWorkspace, /ProClubFitnessWeeklyTrainingReadV1Selection/);
  assert.match(trainingWorkspace, /Fitness observations are context only/);
  assert.match(trainingWorkspace, /Fitness context could not be loaded\./);
  assert.match(trainingWorkspace, /prescription !== null/);
  assert.doesNotMatch(trainingWorkspace, /No recorded fitness results are connected/);
});

test("Pro Club catalogue redesign keeps measurement direction descriptive and Academy scoped", () => {
  const catalogue = read("src/components/fitness/FitnessTestCatalogue.tsx");

  assert.match(catalogue, /variant === "pro-club"/);
  assert.match(catalogue, /ArrowUp/);
  assert.match(catalogue, /ArrowDown/);
  assert.match(catalogue, /text-emerald-300/);
  assert.match(catalogue, /text-amber-300/);
  assert.match(catalogue, /higher result/);
  assert.match(catalogue, /lower result/);
  assert.match(catalogue, /v\{definition\.version\}/);
  assert.match(catalogue, /definition\.direction === "LOWER_IS_BETTER"/);
  assert.match(catalogue, /definition\.direction === "LOWER_IS_BETTER" \? \([\s\S]*?<ArrowDown[\s\S]*?text-amber-300[\s\S]*?: \([\s\S]*?<ArrowUp[\s\S]*?text-emerald-300/);
  assert.match(catalogue, /text-\[9px\].*font-bold.*uppercase/);
  assert.match(catalogue, /text-slate-300/);
  assert.match(catalogue, /text-slate-100/);
});

test("Weekly Training reads only on its selected Head Coach tab and uses Bangkok calendar date", () => {
  assert.match(fitnessTrainingWorkspace, /selectedTab !== "WEEKLY_TRAINING" \|\| !canLoadWeeklyContext/);
  assert.match(fitnessTrainingWorkspace, /calendarDateInTimeZone\(new Date\(\), "Asia\/Bangkok"\)/);
  assert.match(fitnessTrainingWorkspace, /parseCanonicalDateOnly\(referenceDate\) === null/);
  assert.match(fitnessTrainingWorkspace, /state: "READ_ERROR"/);
  assert.doesNotMatch(fitnessTrainingWorkspace, /toISOString\(\)\.slice/);
});

test("foundation adds no direct fitness persistence or client-side role promotion", () => {
  const catalogue = read("src/components/fitness/FitnessTestCatalogue.tsx");
  assert.doesNotMatch(catalogue, /firebase|firestore|setDoc|addDoc|updateDoc|deleteDoc/);
  assert.doesNotMatch(catalogue, /membershipAuthorizationRole\s*=|staffRole\s*=/);
});
