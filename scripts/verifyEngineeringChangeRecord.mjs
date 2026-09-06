import { spawnSync } from "node:child_process";

const STAGING_BRANCH = "integration/pro-club-v1";
const RISKS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const YES_NO = new Set(["YES", "NO"]);
const RECOVERY = new Set(["CODE_ONLY", "CODE_AND_DATA"]);
const OWNER_ALERT = new Set(["REQUIRED", "NOT_REQUIRED"]);

function fail(reason) {
  console.error(`ENGINEERING_CHANGE_RECORD_GATE=BLOCKED:${reason}`);
  process.exit(1);
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    fail(`GIT_${args[0].toUpperCase()}_FAILED`);
  }
  return result.stdout.trim();
}

function trailer(message, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...message.matchAll(new RegExp(`^${escaped}:\\s*(.+)$`, "gmi"))];
  if (matches.length !== 1) {
    fail(`TRAILER_${name.toUpperCase().replaceAll("-", "_")}_REQUIRED_ONCE`);
  }
  return matches[0][1].trim();
}

const branch = git(["branch", "--show-current"]);
if (branch !== STAGING_BRANCH) {
  fail(`WRONG_BRANCH:${branch || "DETACHED"}`);
}

const parentLine = git(["rev-list", "--parents", "-n", "1", "HEAD"])
  .split(/\s+/)
  .filter(Boolean);
if (parentLine.length !== 2) {
  fail("SINGLE_PARENT_COMMIT_REQUIRED");
}

const [head, parent] = parentLine;
const message = git(["log", "-1", "--pretty=%B"]);

const checkpoint = trailer(message, "Checkpoint");
const risk = trailer(message, "Risk").toUpperCase();
const dataWrite = trailer(message, "Data-Write").toUpperCase();
const schemaChange = trailer(message, "Schema-Change").toUpperCase();
const recovery = trailer(message, "Recovery").toUpperCase();
const review = trailer(message, "Review").toUpperCase();
const ownerAlert = trailer(message, "Owner-Alert").toUpperCase();

if (!/^[0-9a-f]{40}$/.test(checkpoint)) {
  fail("CHECKPOINT_SHA_INVALID");
}
if (checkpoint !== parent) {
  fail("CHECKPOINT_MUST_EQUAL_PARENT");
}
if (!RISKS.has(risk)) {
  fail("RISK_INVALID");
}
if (!YES_NO.has(dataWrite)) {
  fail("DATA_WRITE_INVALID");
}
if (!YES_NO.has(schemaChange)) {
  fail("SCHEMA_CHANGE_INVALID");
}
if (!RECOVERY.has(recovery)) {
  fail("RECOVERY_INVALID");
}
if (review !== "REQUIRED") {
  fail("INDEPENDENT_REVIEW_REQUIRED");
}
if (!OWNER_ALERT.has(ownerAlert)) {
  fail("OWNER_ALERT_INVALID");
}

const dataRecoveryRequired = dataWrite === "YES" || schemaChange === "YES";
if (dataRecoveryRequired && recovery !== "CODE_AND_DATA") {
  fail("DATA_CHANGE_REQUIRES_CODE_AND_DATA_RECOVERY");
}
if (!dataRecoveryRequired && recovery !== "CODE_ONLY") {
  fail("CODE_ONLY_CHANGE_REQUIRES_CODE_ONLY_RECOVERY");
}
if ((risk === "HIGH" || risk === "CRITICAL") && ownerAlert !== "REQUIRED") {
  fail("HIGH_RISK_REQUIRES_OWNER_ALERT");
}

console.log("ENGINEERING_CHANGE_RECORD_GATE=PASS");
console.log(`STAGING_HEAD=${head}`);
console.log(`LAST_SAFE_CHECKPOINT=${checkpoint}`);
console.log(`RISK_LEVEL=${risk}`);
console.log(`DATA_WRITE_EXPECTED=${dataWrite}`);
console.log(`SCHEMA_CHANGE=${schemaChange}`);
console.log(`RECOVERY_MODE=${recovery}`);
console.log("INDEPENDENT_REVIEW=REQUIRED");
console.log(`OWNER_ALERT=${ownerAlert}`);
