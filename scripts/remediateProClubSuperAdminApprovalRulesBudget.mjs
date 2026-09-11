import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = "firestore.rules";
const expectedBlob = "1e63e05ebe3f64e6eff8551aa16ade54329fa3e6";

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

let rules = readFileSync(path, "utf8");
const actual = blobSha(rules);
if (actual !== expectedBlob) throw new Error(`STOP: firestore.rules drift (${actual})`);

const existingProofFunction = `    function validProClubApprovalProofCreateV1(clubId, uid) {\n      let proof = request.resource.data;\n      let inviteCode = proof.get('inviteCode', '');\n      let claimId = proof.get('claimId', '');\n\n      return isSignedIn()\n        && exactDocumentId(clubId)\n        && exactDocumentId(uid)\n        && validProClubInviteCodeV1(inviteCode)\n        && claimId == uid + '_PRO_CLUB_' + inviteCode\n        && isProClubOnboardingControlActorV1(clubId)\n        && proof.keys().hasOnly([\n          'schemaVersion',\n          'userId',\n          'clubId',\n          'claimId',\n          'inviteCode',\n          'membershipAuthorizationRole',\n          'staffRole',\n          'status',\n          'approvedAt',\n          'approvedBy'\n        ])\n        && proof.get('schemaVersion', 0) == 1\n        && proof.get('userId', '') == uid\n        && proof.get('clubId', '') == clubId\n        && proof.get('membershipAuthorizationRole', '') == 'MEMBER'\n        && validProClubStaffRoleV1(proof.get('staffRole', ''))\n        && proof.get('status', '') == 'APPROVED'\n        && proof.get('approvedAt', null) == request.time\n        && proof.get('approvedBy', '') == request.auth.uid\n        && validProClubApprovalEvidenceAfterV1(\n          clubId,\n          uid,\n          claimId,\n          inviteCode,\n          proof.get('staffRole', '')\n        )\n        && (\n          !isSuperAdmin()\n          || matchingProClubOnboardingControlAuditAfterV1(\n            'APPROVE-' + claimId,\n            'CLAIM_APPROVED',\n            clubId,\n            uid,\n            inviteCode,\n            claimId,\n            proof.get('staffRole', '')\n          )\n        );\n    }`;

const splitProofFunctions = `    function validProClubApprovalProofCreateV1(clubId, uid) {\n      let proof = request.resource.data;\n      let inviteCode = proof.get('inviteCode', '');\n      let claimId = proof.get('claimId', '');\n\n      return isSignedIn()\n        && exactDocumentId(clubId)\n        && exactDocumentId(uid)\n        && validProClubInviteCodeV1(inviteCode)\n        && claimId == uid + '_PRO_CLUB_' + inviteCode\n        && isActiveProClubReviewerV1(clubId)\n        && proof.keys().hasOnly([\n          'schemaVersion',\n          'userId',\n          'clubId',\n          'claimId',\n          'inviteCode',\n          'membershipAuthorizationRole',\n          'staffRole',\n          'status',\n          'approvedAt',\n          'approvedBy'\n        ])\n        && proof.get('schemaVersion', 0) == 1\n        && proof.get('userId', '') == uid\n        && proof.get('clubId', '') == clubId\n        && proof.get('membershipAuthorizationRole', '') == 'MEMBER'\n        && validProClubStaffRoleV1(proof.get('staffRole', ''))\n        && proof.get('status', '') == 'APPROVED'\n        && proof.get('approvedAt', null) == request.time\n        && proof.get('approvedBy', '') == request.auth.uid\n        && validProClubApprovalEvidenceAfterV1(\n          clubId,\n          uid,\n          claimId,\n          inviteCode,\n          proof.get('staffRole', '')\n        );\n    }\n\n    function validProClubSuperAdminApprovalProofCreateV1(clubId, uid) {\n      let proof = request.resource.data;\n      let inviteCode = proof.get('inviteCode', '');\n      let claimId = proof.get('claimId', '');\n      let staffRole = proof.get('staffRole', '');\n\n      return isSuperAdmin()\n        && proClubDocumentIsActiveForOnboardingControlV1(clubId)\n        && exactDocumentId(uid)\n        && validProClubInviteCodeV1(inviteCode)\n        && claimId == uid + '_PRO_CLUB_' + inviteCode\n        && proof.keys().hasOnly([\n          'schemaVersion',\n          'userId',\n          'clubId',\n          'claimId',\n          'inviteCode',\n          'membershipAuthorizationRole',\n          'staffRole',\n          'status',\n          'approvedAt',\n          'approvedBy'\n        ])\n        && proof.get('schemaVersion', 0) == 1\n        && proof.get('userId', '') == uid\n        && proof.get('clubId', '') == clubId\n        && proof.get('membershipAuthorizationRole', '') == 'MEMBER'\n        && validProClubStaffRoleV1(staffRole)\n        && proof.get('status', '') == 'APPROVED'\n        && proof.get('approvedAt', null) == request.time\n        && proof.get('approvedBy', '') == request.auth.uid\n        && matchingProClubOnboardingControlAuditAfterV1(\n          'APPROVE-' + claimId,\n          'CLAIM_APPROVED',\n          clubId,\n          uid,\n          inviteCode,\n          claimId,\n          staffRole\n        );\n    }`;

rules = replaceOnce(rules, existingProofFunction, splitProofFunctions, "split tenant and SuperAdmin proof paths");

rules = replaceOnce(
  rules,
  `            && getAfter(proofPath).data.get('approvedBy', '') == request.auth.uid\n            && getAfter(proofPath).data.get('approvedAt', null) == request.time\n          )`,
  `            && getAfter(proofPath).data.get('approvedBy', '') == request.auth.uid\n            && getAfter(proofPath).data.get('approvedAt', null) == request.time\n            && validProClubApprovalEvidenceAfterV1(\n              clubId,\n              uid,\n              claimId,\n              inviteCode,\n              staffRole\n            )\n          )`,
  "centralize SuperAdmin approval bundle on audit",
);

rules = replaceOnce(
  rules,
  `        allow create: if validProClubApprovalProofCreateV1(clubId, uid);`,
  `        allow create: if isSuperAdmin()\n          ? validProClubSuperAdminApprovalProofCreateV1(clubId, uid)\n          : validProClubApprovalProofCreateV1(clubId, uid);`,
  "route approval proof by actual actor",
);

writeFileSync(path, rules, "utf8");
console.log("ROOT_RULES_APPROVAL_BUDGET_REMEDIATION=APPLIED");
console.log(`BASELINE_BLOB=${actual}`);
console.log(`RESULT_BLOB=${blobSha(rules)}`);
