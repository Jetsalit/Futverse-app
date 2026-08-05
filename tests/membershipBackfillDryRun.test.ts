import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  academyInvitePlanCsv,
  InputValidationError,
  membershipPlanCsv,
  parseOfflineExport,
  planDryRun,
  sha256Text,
  type BlockerCode,
  type OfflineExport,
} from "../scripts/membershipBackfillDryRunCore";

const FIXTURE_DIRECTORY = resolve("tests/fixtures/membership-backfill");
const FIXED_GENERATED_AT = "2026-08-05T12:00:00.000Z";
const temporaryDirectories: string[] = [];

function fixtureRaw(name: string): string {
  return readFileSync(resolve(FIXTURE_DIRECTORY, name), "utf8");
}

function fixture(name: string): OfflineExport {
  return parseOfflineExport(fixtureRaw(name));
}

function cloneFixture(name = "valid.json"): OfflineExport {
  return structuredClone(fixture(name));
}

function plan(input: OfflineExport, hash = "a".repeat(64)) {
  return planDryRun(input, hash, FIXED_GENERATED_AT);
}

function hasBlocker(result: ReturnType<typeof plan>, code: BlockerCode, entityId?: string): boolean {
  return result.blockers.some((blocker) => blocker.code === code
    && (entityId === undefined || blocker.entityId === entityId));
}

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "futverse-backfill-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory?.startsWith(tmpdir())) rmSync(directory, { recursive: true, force: true });
  }
});

test("1. valid ADMIN legacy backfill", () => {
  const result = plan(cloneFixture());
  const record = result.membershipBackfillPlan.find((item) => item.data.userId === "admin-a");
  assert.equal(record?.path, "academies/academy-a/members/admin-a");
  assert.equal(record?.data.role, "ADMIN");
  assert.equal(record?.data.source, "LEGACY_MIGRATION");
  assert.equal("approvalClaimId" in (record?.data || {}), false);
});

test("2. valid COACH legacy backfill", () => {
  const result = plan(cloneFixture());
  const record = result.membershipBackfillPlan.find((item) => item.data.userId === "coach-b");
  assert.equal(record?.path, "academies/academy-b/members/coach-b");
  assert.equal(record?.data.role, "COACH");
});

test("3. existing identical ACTIVE Membership is already satisfied", () => {
  const input = cloneFixture();
  input.memberships.push({
    userId: "admin-a",
    academyId: "academy-a",
    role: "ADMIN",
    status: "ACTIVE",
    source: "LEGACY_MIGRATION",
  });
  const result = plan(input);
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
  assert.ok(result.alreadySatisfied.some((item) => item.entityType === "MEMBERSHIP" && item.entityId === "admin-a"));
});

test("4. duplicate normalized invite code across Academies is blocked", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.equal(result.blockers.filter((item) => item.code === "DUPLICATE_INVITE_CODE").length, 2);
  assert.equal(result.academyInvitePlan.some((item) => item.data.inviteCode === "FUT-DUPLICATE"), false);
});

test("5. invalid invite-code format is blocked", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.ok(hasBlocker(result, "INVALID_INVITE_CODE", "academy-c"));
});

test("6. invite code longer than 32 characters is blocked without truncation", () => {
  const input = cloneFixture();
  const oversized = `FUT-${"A".repeat(29)}`;
  input.academies[0].inviteCode = oversized;
  const result = plan(input);
  assert.ok(hasBlocker(result, "INVALID_INVITE_CODE", input.academies[0].id));
  assert.equal(result.blockers.some((item) => item.currentValues.normalizedInviteCode === oversized), true);
});

test("7. Academy pointer to missing Academy is blocked", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.ok(hasBlocker(result, "ACADEMY_NOT_FOUND", "missing-academy"));
});

test("8. activeAcademyId and academyId conflict is blocked", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.ok(hasBlocker(result, "ACADEMY_POINTER_CONFLICT", "pointer-conflict"));
});

test("9. unsupported global role is blocked", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.ok(hasBlocker(result, "UNSUPPORTED_ROLE", "unsupported"));
});

test("10. role and tenantRole conflict is blocked", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.ok(hasBlocker(result, "ROLE_CONFLICT", "role-conflict"));
});

test("11. existing Membership for another Academy is blocked", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.ok(hasBlocker(result, "EXISTING_MEMBERSHIP_CONFLICT", "academy-a/existing-other"));
});

test("12. existing suspended Membership requires manual review", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.ok(result.manualReview.some((item) => item.entityId === "suspended"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "suspended"), false);
});

test("13. duplicate User UID is rejected as input validation failure", () => {
  assert.throws(
    () => fixture("duplicate-users.json"),
    (error: unknown) => error instanceof InputValidationError
      && error.issues.some((issue) => issue.code === "DUPLICATE_UID"),
  );
});

test("14. duplicate Academy document ID is rejected", () => {
  assert.throws(
    () => fixture("duplicate-academies.json"),
    (error: unknown) => error instanceof InputValidationError
      && error.issues.some((issue) => issue.code === "DUPLICATE_ACADEMY_ID"),
  );
});

test("15. display-name-only Academy reference is blocked", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.ok(hasBlocker(result, "DISPLAY_NAME_ONLY_MAPPING", "display-only"));
});

test("16. User without UID is blocked", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.ok(result.blockers.some((item) => item.code === "MISSING_UID"
    && item.reviewLabel === "missing-uid@example.com"));
});

test("17. User not clearly Active is blocked", () => {
  const result = plan(cloneFixture("conflicts.json"));
  assert.ok(hasBlocker(result, "USER_NOT_ACTIVE", "inactive"));
});

test("18. CSV formula-injection values are escaped", () => {
  const result = plan(cloneFixture("formula-injection.json"));
  assert.ok(academyInvitePlanCsv(result).includes("\"'=HYPERLINK"));
  assert.ok(membershipPlanCsv(result).includes("\"'=CMD()\""));
  assert.ok(membershipPlanCsv(result).includes("\"'+Formula\""));
});

test("19. plan content and ordering are deterministic", () => {
  const input = cloneFixture();
  const before = JSON.stringify(input);
  const first = plan(input);
  const second = plan(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before, "source input must not be mutated");
  assert.deepEqual(
    first.membershipBackfillPlan.map((item) => item.data.userId),
    ["admin-a", "coach-b"],
  );
});

test("20. input SHA-256 is stable", () => {
  const raw = fixtureRaw("valid.json");
  const first = sha256Text(raw);
  const second = sha256Text(raw);
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("21. malformed JSON is rejected", () => {
  assert.throws(() => fixture("malformed.json"), InputValidationError);
});

test("22. CLI exits 0 and writes all nine artifacts for a valid fixture", () => {
  const outputDirectory = makeTemporaryDirectory();
  const execution = spawnSync(process.execPath, [
    "--import",
    "tsx",
    resolve("scripts/membershipBackfillDryRun.ts"),
    "--input",
    resolve(FIXTURE_DIRECTORY, "valid.json"),
    "--output",
    outputDirectory,
  ], { cwd: resolve("."), encoding: "utf8" });
  assert.equal(execution.status, 0, execution.stderr);
  const summary = JSON.parse(readFileSync(join(outputDirectory, "summary.json"), "utf8"));
  assert.equal(summary.safeToProceed, true);
  assert.equal(summary.inputSha256, sha256Text(fixtureRaw("valid.json")));
  for (const name of [
    "summary.md",
    "academy-invite-plan.json",
    "academy-invite-plan.csv",
    "membership-backfill-plan.json",
    "membership-backfill-plan.csv",
    "already-satisfied.json",
    "manual-review.json",
    "blockers.json",
  ]) {
    assert.doesNotThrow(() => readFileSync(join(outputDirectory, name), "utf8"));
  }
});

test("23. CLI exits 2 when a plan contains manual blockers", () => {
  const outputDirectory = makeTemporaryDirectory();
  const execution = spawnSync(process.execPath, [
    "--import",
    "tsx",
    resolve("scripts/membershipBackfillDryRun.ts"),
    "--input",
    resolve(FIXTURE_DIRECTORY, "conflicts.json"),
    "--output",
    outputDirectory,
  ], { cwd: resolve("."), encoding: "utf8" });
  assert.equal(execution.status, 2, execution.stderr);
  const blockers = JSON.parse(readFileSync(join(outputDirectory, "blockers.json"), "utf8"));
  assert.ok(blockers.length > 0);
});

test("24. CLI exits 1 for malformed input and writes no plan", () => {
  const outputDirectory = makeTemporaryDirectory();
  const execution = spawnSync(process.execPath, [
    "--import",
    "tsx",
    resolve("scripts/membershipBackfillDryRun.ts"),
    "--input",
    resolve(FIXTURE_DIRECTORY, "malformed.json"),
    "--output",
    outputDirectory,
  ], { cwd: resolve("."), encoding: "utf8" });
  assert.equal(execution.status, 1);
  assert.match(execution.stderr, /Malformed JSON/);
  assert.throws(() => readFileSync(join(outputDirectory, "summary.json"), "utf8"));
});

test("25. invalid existing Membership suppresses a proposed ACTIVE write", () => {
  const input = cloneFixture();
  input.memberships.push({
    userId: "admin-a",
    academyId: "academy-a",
    role: "ADMIN",
    status: "ACTIVE",
    source: "UNRECOGNIZED_SOURCE",
  });
  const result = plan(input);
  assert.ok(hasBlocker(result, "INVALID_EXISTING_MEMBERSHIP", "admin-a@academy-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});
