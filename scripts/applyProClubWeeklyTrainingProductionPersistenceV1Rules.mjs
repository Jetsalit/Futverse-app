import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FUNCTION_ANCHOR = "match /proClubs/{clubId}/technicalGovernance/current {";
const MATCH_ANCHOR = "match /proClubs/{clubId}/weeklyTrainingPlans/{planId} {";
const PATCH_MARKER = "Pro Club Weekly Training Production Persistence V1 — schema-v2 create-only.";

const FUNCTIONS = `// ${PATCH_MARKER}
function proClubWeeklyTrainingProductionManifestPathV2(clubId, planId) {
  return /databases/$(database)/documents/proClubs/$(clubId)/weeklyTrainingDraftCreateRequests/$(planId);
}

function proClubWeeklyTrainingProductionPlanPathV2(clubId, planId) {
  return /databases/$(database)/documents/proClubs/$(clubId)/weeklyTrainingPlans/$(planId);
}

function proClubWeeklyTrainingClubIsActiveV2(clubId) {
  let clubPath = /databases/$(database)/documents/proClubs/$(clubId);
  let club = get(clubPath).data;
  return exists(clubPath)
    && validProClubDocumentForAuthorityV1(club)
    && club.get('status', '') == 'ACTIVE';
}

function proClubWeeklyTrainingActorIsActiveHeadCoachV2(clubId) {
  let membershipPath = /databases/$(database)/documents/proClubs/$(clubId)/members/$(request.auth.uid);
  let staffPath = /databases/$(database)/documents/proClubs/$(clubId)/staff/$(request.auth.uid);
  let membership = get(membershipPath).data;
  let staff = get(staffPath).data;
  return currentUserIsActive()
    && exists(membershipPath)
    && exists(staffPath)
    && validProClubMembershipDataV1(membership)
    && validProClubStaffDataV1(staff)
    && membership.get('status', '') == 'ACTIVE'
    && staff.get('status', '') == 'ACTIVE'
    && staff.get('staffRole', '') == 'HEAD_COACH';
}

function proClubWeeklyTrainingExactFreshAuditV2(data) {
  return data.get('createdAt', null) == request.time
    && data.get('updatedAt', null) == request.time
    && data.get('createdBy', '') == request.auth.uid
    && data.get('updatedBy', '') == request.auth.uid;
}

function proClubWeeklyTrainingValidManifestKeysV2(data) {
  return data.keys().hasOnly([
      'schemaVersion', 'requestId', 'planId', 'actorUid', 'weekStartDate',
      'sessionCount', 'documentCount', 'createdAt', 'createdBy'
    ])
    && data.keys().hasAll([
      'schemaVersion', 'requestId', 'planId', 'actorUid', 'weekStartDate',
      'sessionCount', 'documentCount', 'createdAt', 'createdBy'
    ]);
}

function proClubWeeklyTrainingValidManifestCreateV2(clubId, planId) {
  let data = request.resource.data;
  let projectedPlan = getAfter(proClubWeeklyTrainingProductionPlanPathV2(clubId, planId)).data;
  return proClubWeeklyTrainingClubIsActiveV2(clubId)
    && proClubWeeklyTrainingActorIsActiveHeadCoachV2(clubId)
    && proClubWeeklyTrainingCurrentAuthorityIsValidV1(clubId)
    && proClubWeeklyTrainingValidManifestKeysV2(data)
    && data.get('schemaVersion', 0) == 1
    && data.get('requestId', '') == planId
    && data.get('planId', '') == planId
    && data.get('actorUid', '') == request.auth.uid
    && proClubWeeklyTrainingStrictCalendarDateV1(data.get('weekStartDate', ''))
    && data.get('sessionCount', 0) is int
    && data.get('sessionCount', 0) >= 1
    && data.get('sessionCount', 0) <= 14
    && data.get('documentCount', 0) is int
    && data.get('documentCount', 0) >= 4
    && data.get('documentCount', 0) <= 184
    && data.get('createdAt', null) == request.time
    && data.get('createdBy', '') == request.auth.uid
    && projectedPlan.get('schemaVersion', 0) == 2
    && projectedPlan.get('status', '') == 'DRAFT'
    && projectedPlan.get('authorUid', '') == request.auth.uid
    && projectedPlan.get('weekStartDate', '') == data.get('weekStartDate', '')
    && projectedPlan.get('sessionCount', 0) == data.get('sessionCount', 0)
    && projectedPlan.get('createdAt', null) == request.time
    && projectedPlan.get('updatedAt', null) == request.time
    && projectedPlan.get('createdBy', '') == request.auth.uid
    && projectedPlan.get('updatedBy', '') == request.auth.uid;
}

function proClubWeeklyTrainingProjectedManifestV2(clubId, planId) {
  return getAfter(proClubWeeklyTrainingProductionManifestPathV2(clubId, planId)).data;
}

function proClubWeeklyTrainingBoundToProjectedManifestV2(clubId, planId) {
  let manifest = proClubWeeklyTrainingProjectedManifestV2(clubId, planId);
  return isSignedIn()
    && manifest.get('schemaVersion', 0) == 1
    && manifest.get('requestId', '') == planId
    && manifest.get('planId', '') == planId
    && manifest.get('actorUid', '') == request.auth.uid
    && manifest.get('createdAt', null) == request.time
    && manifest.get('createdBy', '') == request.auth.uid;
}

function proClubWeeklyTrainingValidPlanKeysV2(data) {
  return data.keys().hasOnly([
      'schemaVersion', 'authorUid', 'status', 'weekStartDate', 'squadLabel',
      'mainObjective', 'secondaryObjective', 'headCoachNote', 'sessionCount',
      'createdAt', 'createdBy', 'updatedAt', 'updatedBy'
    ])
    && data.keys().hasAll([
      'schemaVersion', 'authorUid', 'status', 'weekStartDate', 'squadLabel',
      'mainObjective', 'sessionCount', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'
    ]);
}

function proClubWeeklyTrainingValidPlanCreateV2(clubId, planId) {
  let data = request.resource.data;
  let manifest = proClubWeeklyTrainingProjectedManifestV2(clubId, planId);
  return proClubWeeklyTrainingBoundToProjectedManifestV2(clubId, planId)
    && proClubWeeklyTrainingValidPlanKeysV2(data)
    && data.get('schemaVersion', 0) == 2
    && data.get('authorUid', '') == request.auth.uid
    && data.get('status', '') == 'DRAFT'
    && data.get('weekStartDate', '') == manifest.get('weekStartDate', '')
    && proClubWeeklyTrainingNormalizedTextV1(data.get('squadLabel', ''), 100)
    && proClubWeeklyTrainingNormalizedTextV1(data.get('mainObjective', ''), 500)
    && (!data.keys().hasAny(['secondaryObjective'])
      || proClubWeeklyTrainingNormalizedTextV1(data.secondaryObjective, 500))
    && (!data.keys().hasAny(['headCoachNote'])
      || proClubWeeklyTrainingNormalizedTextV1(data.headCoachNote, 2000))
    && data.get('sessionCount', 0) == manifest.get('sessionCount', 0)
    && proClubWeeklyTrainingExactFreshAuditV2(data);
}

function proClubWeeklyTrainingValidSessionKeysV2(data) {
  return data.keys().hasOnly([
      'schemaVersion', 'orderIndex', 'sessionDate', 'startTime', 'location',
      'objective', 'phaseOfPlay', 'plannedLoad', 'durationMinutes', 'blockCount',
      'createdAt', 'createdBy', 'updatedAt', 'updatedBy'
    ])
    && data.keys().hasAll([
      'schemaVersion', 'orderIndex', 'sessionDate', 'startTime', 'location',
      'objective', 'phaseOfPlay', 'plannedLoad', 'durationMinutes', 'blockCount',
      'createdAt', 'createdBy', 'updatedAt', 'updatedBy'
    ]);
}

function proClubWeeklyTrainingValidSessionCreateV2(clubId, planId, sessionId) {
  let data = request.resource.data;
  return proClubWeeklyTrainingBoundToProjectedManifestV2(clubId, planId)
    && proClubWeeklyTrainingValidSessionKeysV2(data)
    && data.get('schemaVersion', 0) == 2
    && data.get('orderIndex', -1) is int
    && data.get('orderIndex', -1) >= 0
    && data.get('orderIndex', -1) <= 13
    && proClubWeeklyTrainingStrictCalendarDateV1(data.get('sessionDate', ''))
    && data.get('startTime', '') is string
    && data.get('startTime', '').matches('^([01][0-9]|2[0-3]):[0-5][0-9]$')
    && proClubWeeklyTrainingSessionIdMatchesPayloadV1(sessionId, data)
    && proClubWeeklyTrainingNormalizedTextV1(data.get('location', ''), 200)
    && proClubWeeklyTrainingNormalizedTextV1(data.get('objective', ''), 500)
    && data.get('phaseOfPlay', '') in [
      'GENERAL', 'IN_POSSESSION', 'OUT_OF_POSSESSION',
      'TRANSITION_TO_ATTACK', 'TRANSITION_TO_DEFEND', 'SET_PIECES'
    ]
    && data.get('plannedLoad', '') in ['LOW', 'MODERATE', 'HIGH']
    && data.get('durationMinutes', 0) is int
    && data.get('durationMinutes', 0) >= 15
    && data.get('durationMinutes', 0) <= 360
    && data.get('blockCount', 0) is int
    && data.get('blockCount', 0) >= 1
    && data.get('blockCount', 0) <= 12
    && proClubWeeklyTrainingExactFreshAuditV2(data);
}

function proClubWeeklyTrainingValidBlockKeysV2(data) {
  return data.keys().hasOnly([
      'schemaVersion', 'orderIndex', 'blockType', 'title', 'durationMinutes',
      'drillReference', 'coachingPoints', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'
    ])
    && data.keys().hasAll([
      'schemaVersion', 'orderIndex', 'blockType', 'title', 'durationMinutes',
      'coachingPoints', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'
    ]);
}

function proClubWeeklyTrainingValidBlockCreateV2(clubId, planId, sessionId, blockId) {
  let data = request.resource.data;
  return proClubWeeklyTrainingBoundToProjectedManifestV2(clubId, planId)
    && proClubWeeklyTrainingValidBlockKeysV2(data)
    && data.get('schemaVersion', 0) == 2
    && data.get('orderIndex', -1) is int
    && data.get('orderIndex', -1) >= 0
    && data.get('orderIndex', -1) <= 11
    && proClubWeeklyTrainingBlockIdMatchesOrderV1(blockId, data.get('orderIndex', -1))
    && data.get('blockType', '') in [
      'WARM_UP', 'TECHNICAL', 'TACTICAL', 'GAME',
      'CONDITIONING', 'COOL_DOWN', 'OTHER'
    ]
    && proClubWeeklyTrainingNormalizedTextV1(data.get('title', ''), 200)
    && data.get('durationMinutes', 0) is int
    && data.get('durationMinutes', 0) >= 1
    && data.get('durationMinutes', 0) <= 180
    && (!data.keys().hasAny(['drillReference'])
      || proClubWeeklyTrainingValidExactDocumentIdentifierV1(data.drillReference))
    && proClubWeeklyTrainingValidCoachingPointsV1(data.get('coachingPoints', []))
    && proClubWeeklyTrainingExactFreshAuditV2(data);
}
`;

const MATCHES = `// Pro Club Weekly Training Production Persistence V1 — manifest + schema-v2 creates.
match /proClubs/{clubId}/weeklyTrainingDraftCreateRequests/{planId} {
  allow get: if currentUserIsActive()
    && resource.data.get('actorUid', '') == request.auth.uid;
  allow list, update, delete: if false;
  allow create: if proClubWeeklyTrainingValidManifestCreateV2(clubId, planId);
}

match /proClubs/{clubId}/weeklyTrainingPlans/{planId} {
  allow create: if proClubWeeklyTrainingValidPlanCreateV2(clubId, planId);

  match /sessions/{sessionId} {
    allow create: if proClubWeeklyTrainingValidSessionCreateV2(
      clubId,
      planId,
      sessionId
    );

    match /blocks/{blockId} {
      allow create: if proClubWeeklyTrainingValidBlockCreateV2(
        clubId,
        planId,
        sessionId,
        blockId
      );
    }
  }
}

`;

function replaceOnce(source, anchor, insertion) {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`Expected exactly one Rules anchor: ${anchor}`);
  }
  return `${source.slice(0, first)}${insertion}${source.slice(first)}`;
}

export function applyProClubWeeklyTrainingProductionPersistenceV1Rules(source) {
  if (source.includes(PATCH_MARKER)) {
    throw new Error("Weekly Training production persistence V1 Rules patch is already present.");
  }
  const withFunctions = replaceOnce(source, FUNCTION_ANCHOR, `${FUNCTIONS}\n`);
  return replaceOnce(withFunctions, MATCH_ANCHOR, MATCHES);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = process.argv[2] ?? "firestore.rules";
  const outputPath = process.argv[3] ?? inputPath;
  const source = readFileSync(inputPath, "utf8");
  const patched = applyProClubWeeklyTrainingProductionPersistenceV1Rules(source);
  writeFileSync(outputPath, patched, "utf8");
}
