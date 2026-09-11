import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = "firestore.rules";
const expectedBlob = "a43d4b028fb564bf6c364fb53a40513e928112b1";

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
  if (text.indexOf(from, index + from.length) >= 0) {
    throw new Error(`STOP: ambiguous anchor ${label}`);
  }
  return text.slice(0, index) + to + text.slice(index + from.length);
}

let rules = readFileSync(path, "utf8");
const actual = blobSha(rules);
if (actual !== expectedBlob) throw new Error(`STOP: firestore.rules drift (${actual})`);

rules = replaceOnce(
  rules,
  `    function isProClubOnboardingControlActorV1(clubId) {\n      return isActiveProClubReviewerV1(clubId)\n        || (\n          isSuperAdmin()\n          && proClubDocumentIsActiveForOnboardingControlV1(clubId)\n        );\n    }`,
  `    function currentUserHasSuperAdminRoleV1() {\n      return isSignedIn()\n        && userExists(request.auth.uid)\n        && currentUserData().get('role', '') == 'SUPERADMIN';\n    }\n\n    function isProClubOnboardingControlActorV1(clubId) {\n      return currentUserHasSuperAdminRoleV1()\n        ? (\n          isSuperAdmin()\n          && proClubDocumentIsActiveForOnboardingControlV1(clubId)\n        )\n        : isActiveProClubReviewerV1(clubId);\n    }`,
  "control actor role branch",
);

rules = replaceOnce(
  rules,
  `    match /proClubs/{clubId} {\n      allow get: if isSuperAdmin()\n        || (\n          isSignedIn()\n          && exists(\n            /databases/$(database)/documents/proClubs/$(clubId)/members/$(request.auth.uid)\n          )\n        );`,
  `    match /proClubs/{clubId} {\n      allow get: if isSignedIn()\n        && exists(\n          /databases/$(database)/documents/proClubs/$(clubId)/members/$(request.auth.uid)\n        );`,
  "preserve membership-scoped Pro Club root read",
);

writeFileSync(path, rules, "utf8");
console.log("ROOT_RULES_CONTROL_READ_BUDGET_REMEDIATION=APPLIED");
console.log(`BASELINE_BLOB=${actual}`);
console.log(`RESULT_BLOB=${blobSha(rules)}`);
