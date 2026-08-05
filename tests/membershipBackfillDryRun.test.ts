import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  academyInvitePlanCsv,
  csvCell,
  InputValidationError,
  membershipPlanCsv,
  parseOfflineExport,
  planDryRun,
  sha256Text,
  type BlockerCode,
  type OfflineExport,
} from "../scripts/membershipBackfillDryRunCore";
import {
  executeDryRun,
  OUTPUT_NAMES,
  type ArtifactWriter,
} from "../scripts/membershipBackfillDryRun";

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

function temporaryOutputPath(name = "output"): string {
  return join(makeTemporaryDirectory(), name);
}

function userByUid(input: OfflineExport, uid: string) {
  const user = input.users.find((candidate) => candidate.uid === uid || candidate.id === uid);
  assert.ok(user, `Expected fixture user ${uid}`);
  return user;
}

function parseObject(value: unknown): OfflineExport {
  return parseOfflineExport(JSON.stringify(value));
}

function assertInputValidationError(action: () => unknown, code?: BlockerCode): void {
  assert.throws(
    action,
    (error: unknown) => error instanceof InputValidationError
      && (code === undefined || error.issues.some((issue) => issue.code === code)),
  );
}

function runCli(inputPath: string, outputPath: string, extraArguments: string[] = []) {
  return spawnSync(process.execPath, [
    "--import",
    "tsx",
    resolve("scripts/membershipBackfillDryRun.ts"),
    "--input",
    inputPath,
    "--output",
    outputPath,
    ...extraArguments,
  ], { cwd: resolve("."), encoding: "utf8" });
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
  const outputDirectory = temporaryOutputPath();
  const execution = runCli(resolve(FIXTURE_DIRECTORY, "valid.json"), outputDirectory);
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
  const outputDirectory = temporaryOutputPath();
  const execution = runCli(resolve(FIXTURE_DIRECTORY, "conflicts.json"), outputDirectory);
  assert.equal(execution.status, 2, execution.stderr);
  const blockers = JSON.parse(readFileSync(join(outputDirectory, "blockers.json"), "utf8"));
  assert.ok(blockers.length > 0);
});

test("24. CLI exits 1 for malformed input and writes no plan", () => {
  const outputDirectory = temporaryOutputPath();
  const execution = runCli(resolve(FIXTURE_DIRECTORY, "malformed.json"), outputDirectory);
  assert.equal(execution.status, 1);
  assert.match(execution.stderr, /Malformed JSON/);
  assert.equal(existsSync(outputDirectory), false);
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

test("26. conflicting uid and id is fatal", () => {
  const input = cloneFixture();
  const user = userByUid(input, "admin-a");
  user.id = "different-id";
  assert.throws(
    () => parseObject(input),
    (error: unknown) => error instanceof InputValidationError
      && error.issues.some((issue) => issue.code === "CONFLICTING_USER_IDENTITY"
        && issue.currentValues.uid === "admin-a"
        && issue.currentValues.id === "different-id"
        && issue.recommendedManualAction.length > 0),
  );
});

test("27. matching uid and id is accepted", () => {
  const input = cloneFixture();
  userByUid(input, "admin-a").id = "admin-a";
  const parsed = parseObject(input);
  assert.equal(userByUid(parsed, "admin-a").id, "admin-a");
});

test("28. null Academy record is fatal", () => {
  const input = cloneFixture() as unknown as { academies: unknown[] };
  input.academies[0] = null;
  assertInputValidationError(() => parseObject(input));
});

test("29. scalar User record is fatal with exit 1 and no output", () => {
  const root = makeTemporaryDirectory();
  const inputPath = join(root, "scalar-user.json");
  const outputPath = join(root, "output");
  const input = cloneFixture() as unknown as { users: unknown[] };
  input.users[0] = 42;
  writeFileSync(inputPath, JSON.stringify(input), "utf8");
  const execution = runCli(inputPath, outputPath);
  assert.equal(execution.status, 1, execution.stderr);
  assert.match(execution.stderr, /plain, non-null object/);
  assert.equal(existsSync(outputPath), false);
});

test("30. Array used as Membership record is fatal", () => {
  const input = cloneFixture() as unknown as { memberships: unknown[] };
  input.memberships.push([]);
  assertInputValidationError(() => parseObject(input));
});

test("31. missing academies array is fatal", () => {
  const input = cloneFixture() as Partial<OfflineExport>;
  delete input.academies;
  assertInputValidationError(() => parseObject(input));
});

test("32. missing users array is fatal", () => {
  const input = cloneFixture() as Partial<OfflineExport>;
  delete input.users;
  assertInputValidationError(() => parseObject(input));
});

test("33. missing memberships array is fatal", () => {
  const input = cloneFixture() as Partial<OfflineExport>;
  delete input.memberships;
  assertInputValidationError(() => parseObject(input));
});

test("34. missing academyInvites array is fatal", () => {
  const input = cloneFixture() as Partial<OfflineExport>;
  delete input.academyInvites;
  assertInputValidationError(() => parseObject(input));
});

test("35. leading-space UID is rejected", () => {
  const input = cloneFixture();
  userByUid(input, "admin-a").uid = " admin-a";
  assertInputValidationError(() => parseObject(input));
});

test("36. trailing-space UID is rejected", () => {
  const input = cloneFixture();
  userByUid(input, "admin-a").uid = "admin-a ";
  assertInputValidationError(() => parseObject(input));
});

test("37. leading-space Academy ID is rejected", () => {
  const input = cloneFixture();
  input.academies[0].id = " academy-b";
  assertInputValidationError(() => parseObject(input));
});

test("38. trailing-space Academy pointer is rejected", () => {
  const input = cloneFixture();
  userByUid(input, "admin-a").academyId = "academy-a ";
  assertInputValidationError(() => parseObject(input));
});

test("39. identifier containing slash is rejected", () => {
  const userInput = cloneFixture();
  userByUid(userInput, "admin-a").uid = "admin/a";
  assertInputValidationError(() => parseObject(userInput));

  const membershipInput = cloneFixture();
  membershipInput.memberships.push({
    userId: "admin/a",
    academyId: "academy-a",
    role: "ADMIN",
    status: "ACTIVE",
    source: "LEGACY_MIGRATION",
  });
  const membershipResult = plan(membershipInput);
  assert.ok(hasBlocker(membershipResult, "INVALID_EXISTING_MEMBERSHIP"));

  const inviteInput = cloneFixture();
  inviteInput.academyInvites.push({ inviteCode: "FUT-A", academyId: "academy/a", status: "ACTIVE" });
  assertInputValidationError(() => parseObject(inviteInput));
});

test("40. identifier equal to . or .. is rejected", () => {
  const dotInput = cloneFixture();
  dotInput.academies[0].id = ".";
  assertInputValidationError(() => parseObject(dotInput));
  const dotDotInput = cloneFixture();
  userByUid(dotDotInput, "admin-a").uid = "..";
  assertInputValidationError(() => parseObject(dotDotInput));
});

test("41. identifier over 1,500 UTF-8 bytes is rejected", () => {
  const input = cloneFixture();
  const oversizedIdentifier = "ก".repeat(501);
  assert.ok(Buffer.byteLength(oversizedIdentifier, "utf8") > 1_500);
  userByUid(input, "admin-a").uid = oversizedIdentifier;
  assertInputValidationError(() => parseObject(input));
});

test("42. USER with requestedRole ADMIN is not proposed", () => {
  const input = cloneFixture();
  const user = userByUid(input, "admin-a");
  user.role = "USER";
  user.requestedRole = "ADMIN";
  user.tenantRole = null;
  const result = plan(input);
  assert.ok(hasBlocker(result, "UNSUPPORTED_ROLE", "admin-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

test("43. USER with requestedRole COACH is not proposed", () => {
  const input = cloneFixture();
  const user = userByUid(input, "admin-a");
  user.role = "USER";
  user.requestedRole = "COACH";
  user.tenantRole = null;
  const result = plan(input);
  assert.ok(hasBlocker(result, "UNSUPPORTED_ROLE", "admin-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

test("44. SUPERADMIN with requestedRole ADMIN is not proposed", () => {
  const input = cloneFixture();
  const user = userByUid(input, "admin-a");
  user.role = "SUPERADMIN";
  user.requestedRole = "ADMIN";
  user.tenantRole = null;
  const result = plan(input);
  assert.ok(hasBlocker(result, "UNSUPPORTED_ROLE", "admin-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

test("45. PARENT with tenantRole ADMIN is not proposed", () => {
  const input = cloneFixture();
  const user = userByUid(input, "admin-a");
  user.role = "PARENT";
  user.tenantRole = "ADMIN";
  const result = plan(input);
  assert.ok(hasBlocker(result, "UNSUPPORTED_ROLE", "admin-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

test("46. ADMIN with tenantRole COACH is a role conflict", () => {
  const input = cloneFixture();
  userByUid(input, "admin-a").tenantRole = "COACH";
  const result = plan(input);
  assert.ok(hasBlocker(result, "ROLE_CONFLICT", "admin-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

test("47. COACH with tenantRole ADMIN is a role conflict", () => {
  const input = cloneFixture();
  userByUid(input, "coach-b").tenantRole = "ADMIN";
  const result = plan(input);
  assert.ok(hasBlocker(result, "ROLE_CONFLICT", "coach-b"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "coach-b"), false);
});

test("48. duplicate identical Membership path is fatal", () => {
  const input = cloneFixture();
  const membership = {
    userId: "admin-a",
    academyId: "academy-a",
    role: "ADMIN",
    status: "ACTIVE",
    source: "LEGACY_MIGRATION",
  };
  input.memberships.push(membership, { ...membership });
  assert.throws(
    () => parseObject(input),
    (error: unknown) => error instanceof InputValidationError
      && error.issues.some((issue) => issue.code === "DUPLICATE_MEMBERSHIP_PATH"
        && Array.isArray(issue.currentValues.records)
        && issue.currentValues.records.length === 2),
  );
});

test("49. duplicate conflicting Membership path is fatal", () => {
  const input = cloneFixture();
  input.memberships.push(
    { userId: "admin-a", academyId: "academy-a", role: "ADMIN", status: "ACTIVE", source: "LEGACY_MIGRATION" },
    { userId: "admin-a", academyId: "academy-a", role: "COACH", status: "SUSPENDED", source: "LEGACY_MIGRATION" },
  );
  assertInputValidationError(() => parseObject(input), "DUPLICATE_MEMBERSHIP_PATH");
});

test("50. Membership array order cannot change plan result", () => {
  const first = cloneFixture();
  first.memberships.push(
    { userId: "admin-a", academyId: "academy-b", role: "ADMIN", status: "ACTIVE", source: "LEGACY_MIGRATION" },
    { userId: "admin-a", academyId: "academy-a", role: "ADMIN", status: "ACTIVE", source: "LEGACY_MIGRATION" },
  );
  const second = structuredClone(first);
  second.memberships.reverse();
  assert.deepEqual(plan(first), plan(second));
});

test("51. multiple Memberships across Academies suppress writes", () => {
  const input = cloneFixture();
  input.memberships.push(
    { userId: "admin-a", academyId: "academy-a", role: "ADMIN", status: "ACTIVE", source: "LEGACY_MIGRATION" },
    { userId: "admin-a", academyId: "academy-b", role: "ADMIN", status: "ACTIVE", source: "LEGACY_MIGRATION" },
  );
  const result = plan(input);
  assert.ok(hasBlocker(result, "MULTIPLE_ACADEMY_ASSIGNMENTS", "admin-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

test("52. invalid CLAIM_APPROVAL Membership suppresses writes", () => {
  const input = cloneFixture();
  input.memberships.push({
    userId: "admin-a",
    academyId: "academy-a",
    role: "ADMIN",
    status: "ACTIVE",
    source: "CLAIM_APPROVAL",
  });
  const result = plan(input);
  assert.ok(hasBlocker(result, "INVALID_EXISTING_MEMBERSHIP", "admin-a@academy-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

test("53. deleted user is blocked", () => {
  const input = cloneFixture();
  userByUid(input, "admin-a").deleted = true;
  const result = plan(input);
  assert.ok(hasBlocker(result, "USER_NOT_ACTIVE", "admin-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

test("54. disabled user is blocked", () => {
  const input = cloneFixture();
  userByUid(input, "admin-a").disabled = true;
  const result = plan(input);
  assert.ok(hasBlocker(result, "USER_NOT_ACTIVE", "admin-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

test("55. Pending user is blocked", () => {
  const input = cloneFixture();
  userByUid(input, "admin-a").status = "Pending";
  const result = plan(input);
  assert.ok(hasBlocker(result, "USER_NOT_ACTIVE", "admin-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

test("56. Suspended user is blocked", () => {
  const input = cloneFixture();
  userByUid(input, "admin-a").status = "Suspended";
  const result = plan(input);
  assert.ok(hasBlocker(result, "USER_NOT_ACTIVE", "admin-a"));
  assert.equal(result.membershipBackfillPlan.some((item) => item.data.userId === "admin-a"), false);
});

for (const [number, label, value] of [
  [57, "=", "=FORMULA"],
  [58, "+", "+FORMULA"],
  [59, "-", "-FORMULA"],
  [60, "@", "@FORMULA"],
  [61, "tab", "\tFORMULA"],
  [62, "carriage-return", "\rFORMULA"],
] as const) {
  test(`${number}. CSV ${label} prefix is protected`, () => {
    const original = value;
    assert.ok(csvCell(value).startsWith('"\''));
    assert.equal(value, original, "CSV encoding must not mutate the JSON review value");
  });
}

test("63. unknown CLI option returns exit code 1", () => {
  const outputPath = temporaryOutputPath();
  const execution = runCli(resolve(FIXTURE_DIRECTORY, "valid.json"), outputPath, ["--execute"]);
  assert.equal(execution.status, 1);
  assert.match(execution.stderr, /Unknown argument/);
  assert.equal(existsSync(outputPath), false);
});

test("64. existing output directory is rejected without overwrite", () => {
  const root = makeTemporaryDirectory();
  const outputPath = join(root, "existing-output");
  mkdirSync(outputPath);
  const sentinelPath = join(outputPath, "sentinel.txt");
  writeFileSync(sentinelPath, "keep", "utf8");
  const execution = runCli(resolve(FIXTURE_DIRECTORY, "valid.json"), outputPath);
  assert.equal(execution.status, 1);
  assert.equal(readFileSync(sentinelPath, "utf8"), "keep");
});

test("65. output symlink is rejected", () => {
  const root = makeTemporaryDirectory();
  const targetPath = join(root, "target");
  const outputPath = join(root, "output-link");
  mkdirSync(targetPath);
  symlinkSync(targetPath, outputPath, process.platform === "win32" ? "junction" : "dir");
  const execution = runCli(resolve(FIXTURE_DIRECTORY, "valid.json"), outputPath);
  assert.equal(execution.status, 1);
  assert.deepEqual(readdirSync(targetPath), []);
});

test("66. input symlink is rejected", () => {
  const root = makeTemporaryDirectory();
  const inputPath = join(root, "input-link");
  const outputPath = join(root, "output");
  symlinkSync(FIXTURE_DIRECTORY, inputPath, process.platform === "win32" ? "junction" : "dir");
  const execution = runCli(inputPath, outputPath);
  assert.equal(execution.status, 1);
  assert.match(execution.stderr, /symbolic link/);
  assert.equal(existsSync(outputPath), false);
});

test("67. simulated write failure leaves no published output directory", () => {
  const outputPath = temporaryOutputPath();
  let writes = 0;
  const failingWriter: ArtifactWriter = (path, data, encoding) => {
    writes += 1;
    if (writes === 4) throw new Error("Simulated artifact write failure");
    writeFileSync(path, data, encoding);
  };
  assert.throws(
    () => executeDryRun(resolve(FIXTURE_DIRECTORY, "valid.json"), outputPath, failingWriter),
    /Simulated artifact write failure/,
  );
  assert.equal(existsSync(outputPath), false);
});

test("68. successful run publishes exactly nine artifacts", () => {
  const outputPath = temporaryOutputPath();
  const execution = runCli(resolve(FIXTURE_DIRECTORY, "valid.json"), outputPath);
  assert.equal(execution.status, 0, execution.stderr);
  assert.deepEqual(readdirSync(outputPath).sort(), [...OUTPUT_NAMES].sort());
});

test("69. temporary output directory is removed after failure", () => {
  const root = makeTemporaryDirectory();
  const outputPath = join(root, "failed-output");
  const failingWriter: ArtifactWriter = () => {
    throw new Error("Stop before publication");
  };
  assert.throws(
    () => executeDryRun(resolve(FIXTURE_DIRECTORY, "valid.json"), outputPath, failingWriter),
    /Stop before publication/,
  );
  assert.equal(existsSync(outputPath), false);
  assert.deepEqual(readdirSync(root).filter((name) => name.startsWith("failed-output.tmp-")), []);
});

test("70. two runs into separate fresh paths have deterministic plan content", () => {
  const root = makeTemporaryDirectory();
  const firstOutput = join(root, "first");
  const secondOutput = join(root, "second");
  assert.equal(runCli(resolve(FIXTURE_DIRECTORY, "valid.json"), firstOutput).status, 0);
  assert.equal(runCli(resolve(FIXTURE_DIRECTORY, "valid.json"), secondOutput).status, 0);

  for (const name of [
    "academy-invite-plan.json",
    "academy-invite-plan.csv",
    "membership-backfill-plan.json",
    "membership-backfill-plan.csv",
    "already-satisfied.json",
    "manual-review.json",
    "blockers.json",
  ]) {
    assert.equal(readFileSync(join(firstOutput, name), "utf8"), readFileSync(join(secondOutput, name), "utf8"));
  }
  const firstSummary = JSON.parse(readFileSync(join(firstOutput, "summary.json"), "utf8"));
  const secondSummary = JSON.parse(readFileSync(join(secondOutput, "summary.json"), "utf8"));
  delete firstSummary.generatedAt;
  delete secondSummary.generatedAt;
  assert.deepEqual(firstSummary, secondSummary);
});
