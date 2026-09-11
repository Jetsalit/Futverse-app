import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = "firestore.rules";
const expectedBlob = "22bd052f775feac9e59334d71461a40e752b85f2";

function blobSha(text) {
  const body = Buffer.from(text, "utf8");
  return createHash("sha1")
    .update(Buffer.from(`blob ${body.length}\0`, "utf8"))
    .update(body)
    .digest("hex");
}

function replaceOnce(text, from, to, label) {
  const index = text.indexOf(from);
  if (index < 0) throw new Error(`STOP: missing anchor ${label}`);
  if (text.indexOf(from, index + from.length) >= 0) throw new Error(`STOP: ambiguous anchor ${label}`);
  return text.slice(0, index) + to + text.slice(index + from.length);
}

let rules = readFileSync(path, "utf8");
const actual = blobSha(rules);
if (actual !== expectedBlob) throw new Error(`STOP: firestore.rules drift (${actual})`);

rules = replaceOnce(
  rules,
  `    match /proClubOnboardingControlAudits/{actionId} {\n      allow get, list: if isSuperAdmin();\n      allow create: if validProClubOnboardingControlAuditCreateV1(actionId);\n      allow update, delete: if false;\n    }`,
  `    match /proClubOnboardingControlAudits/{actionId} {\n      allow get, list: if isSuperAdmin();\n      // Branch on canonical global role first so an INACTIVE SUPERADMIN fails\n      // before the expensive same-commit audit validator is evaluated.\n      allow create: if currentUserHasSuperAdminRoleV1()\n        ? (\n          currentUserIsActive()\n            ? validProClubOnboardingControlAuditCreateV1(actionId)\n            : false\n        )\n        : false;\n      allow update, delete: if false;\n    }`,
  "audit create inactive short-circuit",
);

writeFileSync(path, rules, "utf8");
console.log("ROOT_RULES_INACTIVE_AUDIT_BUDGET_REMEDIATION=APPLIED");
console.log(`BASELINE_BLOB=${actual}`);
console.log(`RESULT_BLOB=${blobSha(rules)}`);
