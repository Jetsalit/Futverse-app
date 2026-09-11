import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = "firestore.rules";
const expectedBlob = "2be2cc7e65d7e7203ff83d828c08527bce7838ac";

function blobSha(text) {
  const body = Buffer.from(text, "utf8");
  return createHash("sha1")
    .update(Buffer.from(`blob ${body.length}\0`, "utf8"))
    .update(body)
    .digest("hex");
}

function replaceOnce(text, from, to, label) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`STOP: missing anchor ${label}`);
  if (text.indexOf(from, i + from.length) >= 0) throw new Error(`STOP: ambiguous anchor ${label}`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}

function replaceExactCount(text, from, to, expectedCount, label) {
  const parts = text.split(from);
  const count = parts.length - 1;
  if (count !== expectedCount) {
    throw new Error(`STOP: ${label} expected ${expectedCount} matches, found ${count}`);
  }
  return parts.join(to);
}

let rules = readFileSync(path, "utf8");
const actual = blobSha(rules);
if (actual !== expectedBlob) throw new Error(`STOP: firestore.rules drift (${actual})`);

rules = replaceOnce(
  rules,
  `    function proClubOnboardingControlAuditMatchesV1(\n      data,\n      actionId,\n      actionType,\n      clubId,\n      uid,\n      inviteCode,\n      claimId,\n      staffRole\n    ) {`,
  `    function proClubOnboardingControlAuditMatchesV1(\n      data,\n      actionId,\n      clubId,\n      uid,\n      inviteCode,\n      claimId,\n      staffRole\n    ) {`,
  "audit matcher argument budget",
);

rules = replaceOnce(
  rules,
  `        && data.get('actionType', '') == actionType\n`,
  "",
  "audit matcher action type field",
);

rules = replaceOnce(
  rules,
  `        && proClubOnboardingControlAuditMatchesV1(\n          audit,\n          actionId,\n          actionType,\n          clubId,\n          uid,\n          inviteCode,\n          claimId,\n          staffRole\n        );`,
  `        && audit.get('actionType', '') == actionType\n        && proClubOnboardingControlAuditMatchesV1(\n          audit,\n          actionId,\n          clubId,\n          uid,\n          inviteCode,\n          claimId,\n          staffRole\n        );`,
  "matching audit action type binding",
);

rules = replaceExactCount(
  rules,
  `              data,\n              actionId,\n              actionType,\n              clubId,`,
  `              data,\n              actionId,\n              clubId,`,
  3,
  "audit create matcher calls",
);

rules = replaceOnce(
  rules,
  `      let actionType = data.get('actionType', '');\n`,
  "",
  "remove actionType local",
);

rules = replaceOnce(
  rules,
  "            actionType == 'INVITE_ISSUED'",
  "            data.get('actionType', '') == 'INVITE_ISSUED'",
  "invite audit action discriminator",
);
rules = replaceOnce(
  rules,
  "            actionType == 'CLAIM_APPROVED'",
  "            data.get('actionType', '') == 'CLAIM_APPROVED'",
  "approval audit action discriminator",
);
rules = replaceOnce(
  rules,
  "            actionType == 'CLAIM_REJECTED'",
  "            data.get('actionType', '') == 'CLAIM_REJECTED'",
  "rejection audit action discriminator",
);

rules = replaceOnce(
  rules,
  `      let memberPath =\n        /databases/$(database)/documents/proClubs/$(clubId)/members/$(uid);\n      let staffPath =\n        /databases/$(database)/documents/proClubs/$(clubId)/staff/$(uid);\n`,
  "",
  "reduce audit create local variable count",
);

rules = replaceOnce(
  rules,
  `            && !existsAfter(memberPath)\n            && !existsAfter(staffPath)\n`,
  `            && !existsAfter(\n              /databases/$(database)/documents/proClubs/$(clubId)/members/$(uid)\n            )\n            && !existsAfter(\n              /databases/$(database)/documents/proClubs/$(clubId)/staff/$(uid)\n            )\n`,
  "inline rejection authority paths",
);

writeFileSync(path, rules, "utf8");
console.log(`ROOT_RULES_COMPILE_REMEDIATION=APPLIED`);
console.log(`BASELINE_BLOB=${actual}`);
console.log(`RESULT_BLOB=${blobSha(rules)}`);
