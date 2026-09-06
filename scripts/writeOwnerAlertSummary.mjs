import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "UNKNOWN";
}

function trailer(message, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = message.match(new RegExp(`^${escaped}:\\s*(.+)$`, "mi"));
  return match?.[1]?.trim() || "UNKNOWN";
}

const head = git(["rev-parse", "HEAD"]);
const branch = git(["branch", "--show-current"]);
const message = git(["log", "-1", "--pretty=%B"]);
const checkpoint = trailer(message, "Checkpoint");

const lines = [
  "## 🔴 FUTVERSE OWNER ALERT — STAGING",
  "",
  "```text",
  "STATUS=BLOCKED",
  "INCIDENT_SCOPE=STAGING_CI",
  `BRANCH=${branch}`,
  `FAILED_HEAD=${head}`,
  `LAST_SAFE_CHECKPOINT=${checkpoint}`,
  "PRODUCTION_AFFECTED=NO",
  "PRODUCTION_DATA_MUTATION=NO",
  "ROLLBACK_AVAILABLE=YES",
  "TEAM_ACTION=DEBUG_ROOT_CAUSE_THEN_FIX_OR_ROLLBACK",
  "OWNER_ACTION_REQUIRED=NO",
  "SAFE_TO_CONTINUE=NO",
  "```",
  "",
  "The staging lane is blocked. Do not merge or deploy production from this failed state.",
].join("\n");

console.log(lines);
const summary = process.env.GITHUB_STEP_SUMMARY?.trim();
if (summary) {
  appendFileSync(summary, `${lines}\n`, "utf8");
}
