import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = "firestore.rules";
const expectedBaselineBlob = "062bdb624b1570ed4e15b9bd18db21ac530bd325";
const marker = "function isProClubOnboardingControlActorV1(clubId)";

function gitBlobSha(text) {
  const body = Buffer.from(text, "utf8");
  return createHash("sha1")
    .update(Buffer.from(`blob ${body.length}\0`, "utf8"))
    .update(body)
    .digest("hex");
}

function replaceExactlyOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`STOP: missing root-rules anchor: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) {
    throw new Error(`STOP: ambiguous root-rules anchor: ${label}`);
  }
  return text.slice(0, first) + to + text.slice(first + from.length);
}

let rules = readFileSync(path, "utf8");

if (rules.includes(marker)) {
  console.log("ROOT_RULES_INTEGRATION=ALREADY_PRESENT");
  process.exit(0);
}

const actualBlob = gitBlobSha(rules);
if (actualBlob !== expectedBaselineBlob) {
  throw new Error(`STOP: firestore.rules baseline drift (${actualBlob})`);
}

const controlHelpers = String.raw`
    // Pro Club SuperAdmin Onboarding Control V1 — platform control-plane helpers.
    // SuperAdmin authority is explicit and never fabricated as tenant membership.
    function proClubDocumentIsActiveForOnboardingControlV1(clubId) {
      let clubPath =
        /databases/$(database)/documents/proClubs/$(clubId);
      let club = get(clubPath).data;

      return exactDocumentId(clubId)
        && exists(clubPath)
        && validProClubDocumentForAuthorityV1(club)
        && club.get('status', '') == 'ACTIVE';
    }

    function isProClubOnboardingControlActorV1(clubId) {
      return isActiveProClubReviewerV1(clubId)
        || (
          isSuperAdmin()
          && proClubDocumentIsActiveForOnboardingControlV1(clubId)
        );
    }

    function proClubSuperAdminInviteTargetIsEligibleV1(uid) {
      let userPath =
        /databases/$(database)/documents/users/$(uid);
      let user = get(userPath).data;

      return exactDocumentId(uid)
        && uid != request.auth.uid
        && exists(userPath)
        && user.get('status', '') in ['Active', 'ACTIVE']
        && user.get('role', '') != 'SUPERADMIN';
    }

    function proClubOnboardingControlAuditMatchesV1(
      data,
      actionId,
      actionType,
      clubId,
      uid,
      inviteCode,
      claimId,
      staffRole
    ) {
      return data.keys().hasAll([
          'schemaVersion',
          'actionId',
          'actionType',
          'actorUid',
          'clubId',
          'targetUid',
          'inviteCode',
          'claimId',
          'staffRole',
          'createdAt'
        ])
        && data.keys().hasOnly([
          'schemaVersion',
          'actionId',
          'actionType',
          'actorUid',
          'clubId',
          'targetUid',
          'inviteCode',
          'claimId',
          'staffRole',
          'createdAt'
        ])
        && data.get('schemaVersion', 0) == 1
        && data.get('actionId', '') == actionId
        && data.get('actionType', '') == actionType
        && data.get('actorUid', '') == request.auth.uid
        && data.get('clubId', '') == clubId
        && data.get('targetUid', '') == uid
        && data.get('inviteCode', '') == inviteCode
        && data.get('claimId', '__missing__') == claimId
        && data.get('staffRole', '') == staffRole
        && data.get('createdAt', null) == request.time;
    }

    function matchingProClubOnboardingControlAuditAfterV1(
      actionId,
      actionType,
      clubId,
      uid,
      inviteCode,
      claimId,
      staffRole
    ) {
      let auditPath =
        /databases/$(database)/documents/proClubOnboardingControlAudits/$(actionId);
      let audit = getAfter(auditPath).data;

      return existsAfter(auditPath)
        && proClubOnboardingControlAuditMatchesV1(
          audit,
          actionId,
          actionType,
          clubId,
          uid,
          inviteCode,
          claimId,
          staffRole
        );
    }

    function validProClubOnboardingControlAuditCreateV1(actionId) {
      let data = request.resource.data;
      let actionType = data.get('actionType', '');
      let clubId = data.get('clubId', '');
      let uid = data.get('targetUid', '');
      let inviteCode = data.get('inviteCode', '');
      let claimId = data.get('claimId', null);
      let staffRole = data.get('staffRole', '');
      let invitePath =
        /databases/$(database)/documents/proClubInvites/$(inviteCode);
      let claimPath =
        /databases/$(database)/documents/proClubs/$(clubId)/onboardingClaims/$(claimId);
      let proofPath =
        /databases/$(database)/documents/proClubs/$(clubId)/onboardingApprovals/$(uid);
      let memberPath =
        /databases/$(database)/documents/proClubs/$(clubId)/members/$(uid);
      let staffPath =
        /databases/$(database)/documents/proClubs/$(clubId)/staff/$(uid);

      return isSuperAdmin()
        && proClubDocumentIsActiveForOnboardingControlV1(clubId)
        && validProClubStaffRoleV1(staffRole)
        && data.get('actionId', '') == actionId
        && (
          (
            actionType == 'INVITE_ISSUED'
            && actionId == 'INVITE-' + inviteCode
            && claimId == null
            && proClubOnboardingControlAuditMatchesV1(
              data,
              actionId,
              actionType,
              clubId,
              uid,
              inviteCode,
              null,
              staffRole
            )
            && existsAfter(invitePath)
            && getAfter(invitePath).data.get('status', '') == 'ACTIVE'
            && getAfter(invitePath).data.get('clubId', '') == clubId
            && getAfter(invitePath).data.get('targetUid', '') == uid
            && getAfter(invitePath).data.get('staffRole', '') == staffRole
            && getAfter(invitePath).data.get('createdBy', '') == request.auth.uid
          )
          || (
            actionType == 'CLAIM_APPROVED'
            && exactDocumentId(claimId)
            && actionId == 'APPROVE-' + claimId
            && proClubOnboardingControlAuditMatchesV1(
              data,
              actionId,
              actionType,
              clubId,
              uid,
              inviteCode,
              claimId,
              staffRole
            )
            && existsAfter(proofPath)
            && getAfter(proofPath).data.get('status', '') == 'APPROVED'
            && getAfter(proofPath).data.get('claimId', '') == claimId
            && getAfter(proofPath).data.get('inviteCode', '') == inviteCode
            && getAfter(proofPath).data.get('staffRole', '') == staffRole
            && getAfter(proofPath).data.get('approvedBy', '') == request.auth.uid
            && getAfter(proofPath).data.get('approvedAt', null) == request.time
          )
          || (
            actionType == 'CLAIM_REJECTED'
            && exactDocumentId(claimId)
            && actionId == 'REJECT-' + claimId
            && proClubOnboardingControlAuditMatchesV1(
              data,
              actionId,
              actionType,
              clubId,
              uid,
              inviteCode,
              claimId,
              staffRole
            )
            && existsAfter(claimPath)
            && getAfter(claimPath).data.get('status', '') == 'REJECTED'
            && getAfter(claimPath).data.get('userId', '') == uid
            && existsAfter(invitePath)
            && getAfter(invitePath).data.get('status', '') == 'REVOKED'
            && !existsAfter(memberPath)
            && !existsAfter(staffPath)
            && !existsAfter(proofPath)
          )
        );
    }
`;

rules = replaceExactlyOnce(
  rules,
  "    function validProClubInviteCoreV1(data, inviteCode) {",
  controlHelpers + "\n    function validProClubInviteCoreV1(data, inviteCode) {",
  "insert control-plane helpers",
);

rules = replaceExactlyOnce(
  rules,
  "        && isActiveProClubReviewerV1(clubId)\n        && userExists(targetUid)",
  String.raw`        && isProClubOnboardingControlActorV1(clubId)
        && userExists(targetUid)
        && (
          !isSuperAdmin()
          || (
            proClubSuperAdminInviteTargetIsEligibleV1(targetUid)
            && matchingProClubOnboardingControlAuditAfterV1(
              'INVITE-' + inviteCode,
              'INVITE_ISSUED',
              clubId,
              targetUid,
              inviteCode,
              null,
              data.get('staffRole', '')
            )
          )
        )`,
  "invite actor + audit gate",
);

const proofOld = String.raw`        && isActiveProClubReviewerV1(clubId)
        && proof.keys().hasOnly([`;
const proofNew = String.raw`        && isProClubOnboardingControlActorV1(clubId)
        && proof.keys().hasOnly([`;
rules = replaceExactlyOnce(rules, proofOld, proofNew, "approval proof actor gate");

const proofTailOld = String.raw`          proof.get('staffRole', '')
        );
    }

    function validProClubApprovalEvidenceAfterV1(`;
const proofTailNew = String.raw`          proof.get('staffRole', '')
        )
        && (
          !isSuperAdmin()
          || matchingProClubOnboardingControlAuditAfterV1(
            'APPROVE-' + claimId,
            'CLAIM_APPROVED',
            clubId,
            uid,
            inviteCode,
            claimId,
            proof.get('staffRole', '')
          )
        );
    }

    function validProClubApprovalEvidenceAfterV1(`;
rules = replaceExactlyOnce(rules, proofTailOld, proofTailNew, "approval audit coupling");

const revokeActorOld = String.raw`        && isActiveProClubReviewerV1(clubId)
        && validProClubRevocationClaimStateV1(`;
const revokeActorNew = String.raw`        && isProClubOnboardingControlActorV1(clubId)
        && validProClubRevocationClaimStateV1(`;
rules = replaceExactlyOnce(rules, revokeActorOld, revokeActorNew, "revocation actor gate");

const revokeTailOld = String.raw`          resource.data.get('staffRole', '')
        );
    }

    function validProClubRevocationClaimStateV1(`;
const revokeTailNew = String.raw`          resource.data.get('staffRole', '')
        )
        && (
          !isSuperAdmin()
          || matchingProClubOnboardingControlAuditAfterV1(
            'REJECT-' + claimId,
            'CLAIM_REJECTED',
            clubId,
            uid,
            inviteCode,
            claimId,
            resource.data.get('staffRole', '')
          )
        );
    }

    function validProClubRevocationClaimStateV1(`;
rules = replaceExactlyOnce(rules, revokeTailOld, revokeTailNew, "rejection audit coupling");

const inviteMatchAnchor = "    match /proClubInvites/{inviteCode} {";
const auditMatch = String.raw`    match /proClubOnboardingControlAudits/{actionId} {
      allow get, list: if isSuperAdmin();
      allow create: if validProClubOnboardingControlAuditCreateV1(actionId);
      allow update, delete: if false;
    }

`;
rules = replaceExactlyOnce(
  rules,
  inviteMatchAnchor,
  auditMatch + inviteMatchAnchor,
  "audit collection match",
);

rules = replaceExactlyOnce(
  rules,
  String.raw`      allow get: if isSignedIn()
        && exists(
          /databases/$(database)/documents/proClubs/$(clubId)/members/$(request.auth.uid)
        );`,
  String.raw`      allow get: if isSuperAdmin()
        || (
          isSignedIn()
          && exists(
            /databases/$(database)/documents/proClubs/$(clubId)/members/$(request.auth.uid)
          )
        );`,
  "SuperAdmin exact Pro Club read",
);

rules = replaceExactlyOnce(
  rules,
  String.raw`            resource.data.get('userId', '') == request.auth.uid
            || isActiveProClubReviewerV1(clubId)`,
  String.raw`            resource.data.get('userId', '') == request.auth.uid
            || isActiveProClubReviewerV1(clubId)
            || isSuperAdmin()`,
  "SuperAdmin claim get",
);

rules = replaceExactlyOnce(
  rules,
  String.raw`        allow list: if isActiveProClubReviewerV1(clubId)
          && resource.data.clubId == clubId
          && resource.data.status == 'PENDING';`,
  String.raw`        allow list: if (
            isActiveProClubReviewerV1(clubId)
            || isSuperAdmin()
          )
          && resource.data.clubId == clubId
          && resource.data.status == 'PENDING';`,
  "SuperAdmin pending claim list",
);

rules = replaceExactlyOnce(
  rules,
  String.raw`            request.auth.uid == uid
            || isActiveProClubReviewerV1(clubId)`,
  String.raw`            request.auth.uid == uid
            || isActiveProClubReviewerV1(clubId)
            || isSuperAdmin()`,
  "SuperAdmin approval proof get",
);

if (!rules.includes(marker)) throw new Error("STOP: integration marker missing after patch");
writeFileSync(path, rules, "utf8");
console.log(`ROOT_RULES_INTEGRATION=APPLIED`);
console.log(`BASELINE_BLOB=${actualBlob}`);
console.log(`RESULT_BLOB=${gitBlobSha(rules)}`);
