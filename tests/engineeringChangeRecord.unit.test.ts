import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const gateScript = resolve("scripts/verifyEngineeringChangeRecord.mjs");

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function makeRepo(options: { checkpointMode?: "parent" | "ancestor" | "unknown"; risk?: string; dataWrite?: string; schemaChange?: string; recovery?: string; review?: string; ownerAlert?: string }) {
  const dir = mkdtempSync(join(tmpdir(), "futverse-change-record-"));
  run("git", ["init"], dir);
  run("git", ["config", "user.email", "ci@example.invalid"], dir);
  run("git", ["config", "user.name", "FutVerse CI"], dir);
  run("git", ["checkout", "-b", "integration/pro-club-v1"], dir);
  writeFileSync(join(dir, "baseline.txt"), "baseline\n");
  run("git", ["add", "baseline.txt"], dir);
  run("git", ["commit", "-m", "baseline"], dir);
  const baseline = run("git", ["rev-parse", "HEAD"], dir);

  writeFileSync(join(dir, "middle.txt"), "middle\n");
  run("git", ["add", "middle.txt"], dir);
  run("git", ["commit", "-m", "middle"], dir);
  const parent = run("git", ["rev-parse", "HEAD"], dir);

  const checkpoint = options.checkpointMode === "ancestor" ? baseline : options.checkpointMode === "unknown" ? "0000000000000000000000000000000000000000" : parent;
  writeFileSync(join(dir, "change.txt"), "change\n");
  run("git", ["add", "change.txt"], dir);
  const message = [
    "test: governed change", "", `Checkpoint: ${checkpoint}`,
    `Risk: ${options.risk ?? "MEDIUM"}`, `Data-Write: ${options.dataWrite ?? "NO"}`,
    `Schema-Change: ${options.schemaChange ?? "NO"}`, `Recovery: ${options.recovery ?? "CODE_ONLY"}`,
    `Review: ${options.review ?? "REQUIRED"}`, `Owner-Alert: ${options.ownerAlert ?? "NOT_REQUIRED"}`,
  ].join("\n");
  run("git", ["commit", "-m", message], dir);
  return { dir, baseline, parent };
}

function gate(dir: string) { return spawnSync(process.execPath, [gateScript], { cwd: dir, encoding: "utf8" }); }

test("accepts parent checkpoint", () => {
  const { dir, parent } = makeRepo({ checkpointMode: "parent" });
  const result = gate(dir);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(`LAST_SAFE_CHECKPOINT=${parent}`));
});

test("accepts an older known-good ancestor checkpoint", () => {
  const { dir, baseline } = makeRepo({ checkpointMode: "ancestor" });
  const result = gate(dir);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(`LAST_SAFE_CHECKPOINT=${baseline}`));
});

test("rejects unavailable checkpoint", () => {
  const { dir } = makeRepo({ checkpointMode: "unknown" });
  const result = gate(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CHECKPOINT_COMMIT_NOT_AVAILABLE/);
});

test("data-changing work requires CODE_AND_DATA recovery", () => {
  const { dir } = makeRepo({ dataWrite: "YES", recovery: "CODE_ONLY" });
  const result = gate(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATA_CHANGE_REQUIRES_CODE_AND_DATA_RECOVERY/);
});

test("high-risk work requires an Owner Alert", () => {
  const { dir } = makeRepo({ risk: "HIGH", ownerAlert: "NOT_REQUIRED" });
  const result = gate(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HIGH_RISK_REQUIRES_OWNER_ALERT/);
});

test("independent review cannot be omitted", () => {
  const { dir } = makeRepo({ review: "OPTIONAL" });
  const result = gate(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /INDEPENDENT_REVIEW_REQUIRED/);
});
