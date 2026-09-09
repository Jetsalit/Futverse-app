from pathlib import Path

path = Path("firestore.rules")
text = path.read_text(encoding="utf-8")

insertion_anchor = "function proClubWeeklyTrainingParentDraftOwnedByActorV1(clubId, planId) {"
if text.count(insertion_anchor) != 1:
    raise SystemExit("STOP: parent helper anchor count mismatch")

helper_block = r'''function proClubWeeklyTrainingPlanPathV1(clubId, planId) {
  return /databases/$(database)/documents/proClubs/$(clubId)/weeklyTrainingPlans/$(planId);
}

function proClubWeeklyTrainingSessionPathV1(clubId, planId, sessionId) {
  return /databases/$(database)/documents/proClubs/$(clubId)/weeklyTrainingPlans/$(planId)/sessions/$(sessionId);
}

// Fresh atomic hierarchy path. Full account, Membership, Head Coach and
// technical-governance authorization is still enforced by the plan CREATE
// rule in the same atomic commit. Child rules only prove same-commit ancestry
// and keep their document-level schema, identity, date and audit checks.
function proClubWeeklyTrainingFreshPlanCreatedByActorAfterV1(clubId, planId) {
  let planPath = proClubWeeklyTrainingPlanPathV1(clubId, planId);
  let plan = getAfter(planPath).data;

  return !exists(planPath)
    && existsAfter(planPath)
    && plan.get('schemaVersion', 0) == 1
    && plan.get('status', '') == 'DRAFT'
    && plan.get('authorUid', '') == request.auth.uid;
}

function proClubWeeklyTrainingFreshSessionExistsAfterV1(
  clubId,
  planId,
  sessionId
) {
  let sessionPath = proClubWeeklyTrainingSessionPathV1(
    clubId,
    planId,
    sessionId
  );

  return !exists(sessionPath) && existsAfter(sessionPath);
}

'''
text = text.replace(insertion_anchor, helper_block + insertion_anchor, 1)

session_start = "function proClubWeeklyTrainingValidSessionCreateV1(clubId, planId, sessionId) {"
session_end = "function proClubWeeklyTrainingValidSessionUpdateV1(clubId, planId, sessionId) {"
if text.count(session_start) != 1 or text.count(session_end) != 1:
    raise SystemExit("STOP: session create span mismatch")
start = text.index(session_start)
end = text.index(session_end, start)
old_session = text[start:end]
required_session_fragments = [
    "proClubWeeklyTrainingParentDraftOwnedByActorV1(clubId, planId)",
    "proClubWeeklyTrainingValidSessionKeysV1(request.resource.data)",
    "proClubWeeklyTrainingValidSessionValuesV1(request.resource.data)",
    "proClubWeeklyTrainingSessionDateInsideParentWeekV1(",
    "proClubWeeklyTrainingValidAuditCreateV1(request.resource.data)",
]
if not all(fragment in old_session for fragment in required_session_fragments):
    raise SystemExit("STOP: session create contract drift")

new_session = r'''function proClubWeeklyTrainingSessionDateInsideFreshParentWeekV1(
  clubId,
  planId,
  data
) {
  let plan = getAfter(
    proClubWeeklyTrainingPlanPathV1(clubId, planId)
  ).data;
  let sessionDate = proClubWeeklyTrainingDateTimestampV1(
    data.get('sessionDate', '')
  );
  let weekStart = proClubWeeklyTrainingDateTimestampV1(
    plan.get('weekStartDate', '')
  );

  return proClubWeeklyTrainingStrictCalendarDateV1(
      plan.get('weekStartDate', '')
    )
    && proClubWeeklyTrainingStrictCalendarDateV1(
      data.get('sessionDate', '')
    )
    && sessionDate >= weekStart
    && sessionDate <= weekStart + duration.value(6, 'd');
}

function proClubWeeklyTrainingValidFreshAtomicSessionCreateV1(
  clubId,
  planId,
  sessionId
) {
  return proClubWeeklyTrainingFreshPlanCreatedByActorAfterV1(clubId, planId)
    && proClubWeeklyTrainingValidSessionKeysV1(request.resource.data)
    && proClubWeeklyTrainingValidSessionValuesV1(request.resource.data)
    && proClubWeeklyTrainingSessionIdMatchesPayloadV1(
      sessionId,
      request.resource.data
    )
    && proClubWeeklyTrainingSessionDateInsideFreshParentWeekV1(
      clubId,
      planId,
      request.resource.data
    )
    && proClubWeeklyTrainingValidAuditCreateV1(request.resource.data);
}

function proClubWeeklyTrainingValidSequentialSessionCreateV1(
  clubId,
  planId,
  sessionId
) {
  return proClubWeeklyTrainingParentDraftOwnedByActorV1(clubId, planId)
    && proClubWeeklyTrainingValidSessionKeysV1(request.resource.data)
    && proClubWeeklyTrainingValidSessionValuesV1(request.resource.data)
    && proClubWeeklyTrainingSessionIdMatchesPayloadV1(
      sessionId,
      request.resource.data
    )
    && proClubWeeklyTrainingSessionDateInsideParentWeekV1(
      clubId,
      planId,
      request.resource.data
    )
    && proClubWeeklyTrainingValidAuditCreateV1(request.resource.data);
}

function proClubWeeklyTrainingValidSessionCreateV1(
  clubId,
  planId,
  sessionId
) {
  return proClubWeeklyTrainingValidFreshAtomicSessionCreateV1(
      clubId,
      planId,
      sessionId
    )
    || proClubWeeklyTrainingValidSequentialSessionCreateV1(
      clubId,
      planId,
      sessionId
    );
}

'''
text = text[:start] + new_session + text[end:]

block_start = "function proClubWeeklyTrainingValidBlockCreateV1(\n  clubId,\n  planId,\n  sessionId,\n  blockId\n) {"
block_end = "function proClubWeeklyTrainingValidBlockUpdateV1(\n  clubId,\n  planId,\n  sessionId,\n  blockId\n) {"
if text.count(block_start) != 1 or text.count(block_end) != 1:
    raise SystemExit("STOP: block create span mismatch")
start = text.index(block_start)
end = text.index(block_end, start)
old_block = text[start:end]
required_block_fragments = [
    "proClubWeeklyTrainingParentDraftOwnedByActorV1(clubId, planId)",
    "proClubWeeklyTrainingSessionExistsV1(clubId, planId, sessionId)",
    "proClubWeeklyTrainingValidBlockKeysV1(request.resource.data)",
    "proClubWeeklyTrainingValidBlockValuesV1(request.resource.data)",
    "proClubWeeklyTrainingBlockIdMatchesOrderV1(",
    "proClubWeeklyTrainingValidAuditCreateV1(request.resource.data)",
]
if not all(fragment in old_block for fragment in required_block_fragments):
    raise SystemExit("STOP: block create contract drift")

new_block = r'''function proClubWeeklyTrainingValidFreshAtomicBlockCreateV1(
  clubId,
  planId,
  sessionId,
  blockId
) {
  return proClubWeeklyTrainingFreshPlanCreatedByActorAfterV1(clubId, planId)
    && proClubWeeklyTrainingFreshSessionExistsAfterV1(
      clubId,
      planId,
      sessionId
    )
    && proClubWeeklyTrainingValidBlockKeysV1(request.resource.data)
    && proClubWeeklyTrainingValidBlockValuesV1(request.resource.data)
    && proClubWeeklyTrainingBlockIdMatchesOrderV1(
      blockId,
      request.resource.data.get('orderIndex', -1)
    )
    && proClubWeeklyTrainingValidAuditCreateV1(request.resource.data);
}

function proClubWeeklyTrainingValidSequentialBlockCreateV1(
  clubId,
  planId,
  sessionId,
  blockId
) {
  return proClubWeeklyTrainingParentDraftOwnedByActorV1(clubId, planId)
    && proClubWeeklyTrainingSessionExistsV1(clubId, planId, sessionId)
    && proClubWeeklyTrainingValidBlockKeysV1(request.resource.data)
    && proClubWeeklyTrainingValidBlockValuesV1(request.resource.data)
    && proClubWeeklyTrainingBlockIdMatchesOrderV1(
      blockId,
      request.resource.data.get('orderIndex', -1)
    )
    && proClubWeeklyTrainingValidAuditCreateV1(request.resource.data);
}

function proClubWeeklyTrainingValidBlockCreateV1(
  clubId,
  planId,
  sessionId,
  blockId
) {
  return proClubWeeklyTrainingValidFreshAtomicBlockCreateV1(
      clubId,
      planId,
      sessionId,
      blockId
    )
    || proClubWeeklyTrainingValidSequentialBlockCreateV1(
      clubId,
      planId,
      sessionId,
      blockId
    );
}

'''
text = text[:start] + new_block + text[end:]

path.write_text(text, encoding="utf-8")
