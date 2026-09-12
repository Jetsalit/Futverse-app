import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DUPLICATE_V2_PLAN_MATCH = `match /proClubs/{clubId}/weeklyTrainingPlans/{planId} {
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

const V1_PLAN_CREATE =
  "  allow create: if proClubWeeklyTrainingValidDraftPlanCreateV1(clubId);";
const V1_SESSION_CREATE = `    allow create: if proClubWeeklyTrainingValidSessionCreateV1(
      clubId,
      planId,
      sessionId
    );`;
const V1_BLOCK_CREATE = `      allow create: if proClubWeeklyTrainingValidBlockCreateV1(
        clubId,
        planId,
        sessionId,
        blockId
      );`;

const DISPATCH_PLAN_CREATE = `  allow create: if request.resource.data.get('schemaVersion', 0) == 2
    ? proClubWeeklyTrainingValidPlanCreateV2(clubId, planId)
    : (
      request.resource.data.get('schemaVersion', 0) == 1
        && proClubWeeklyTrainingValidDraftPlanCreateV1(clubId)
    );`;

const DISPATCH_SESSION_CREATE = `    allow create: if request.resource.data.get('schemaVersion', 0) == 2
      ? proClubWeeklyTrainingValidSessionCreateV2(
        clubId,
        planId,
        sessionId
      )
      : (
        request.resource.data.get('schemaVersion', 0) == 1
          && proClubWeeklyTrainingValidSessionCreateV1(
            clubId,
            planId,
            sessionId
          )
      );`;

const DISPATCH_BLOCK_CREATE = `      allow create: if request.resource.data.get('schemaVersion', 0) == 2
        ? proClubWeeklyTrainingValidBlockCreateV2(
          clubId,
          planId,
          sessionId,
          blockId
        )
        : (
          request.resource.data.get('schemaVersion', 0) == 1
            && proClubWeeklyTrainingValidBlockCreateV1(
              clubId,
              planId,
              sessionId,
              blockId
            )
        );`;

const V1_PLAN_UPDATE =
  "  allow update: if proClubWeeklyTrainingValidDraftPlanUpdateV1(clubId);";
const V1_SESSION_UPDATE = `    allow update: if proClubWeeklyTrainingValidSessionUpdateV1(
      clubId,
      planId,
      sessionId
    );`;
const V1_BLOCK_UPDATE = `      allow update: if proClubWeeklyTrainingValidBlockUpdateV1(
        clubId,
        planId,
        sessionId,
        blockId
      );`;

function replaceExactlyOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing expected ${label}.`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Expected exactly one ${label}, found multiple.`);
  }
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

export function repairProClubWeeklyTrainingV1V2SingleMatchRouting(source) {
  let next = source;
  next = replaceExactlyOnce(
    next,
    DUPLICATE_V2_PLAN_MATCH,
    "",
    "duplicate schema-v2 weeklyTrainingPlans match",
  );
  next = replaceExactlyOnce(next, V1_PLAN_CREATE, DISPATCH_PLAN_CREATE, "legacy plan create rule");
  next = replaceExactlyOnce(next, V1_SESSION_CREATE, DISPATCH_SESSION_CREATE, "legacy session create rule");
  next = replaceExactlyOnce(next, V1_BLOCK_CREATE, DISPATCH_BLOCK_CREATE, "legacy block create rule");

  const matchCount = next.split("match /proClubs/{clubId}/weeklyTrainingPlans/{planId} {").length - 1;
  if (matchCount !== 1) {
    throw new Error(`Expected one canonical weeklyTrainingPlans match after repair, got ${matchCount}.`);
  }
  if (next.includes(DUPLICATE_V2_PLAN_MATCH)) {
    throw new Error("Duplicate schema-v2 Weekly Training match remains after repair.");
  }
  if (!next.includes(DISPATCH_PLAN_CREATE) || !next.includes(DISPATCH_SESSION_CREATE) || !next.includes(DISPATCH_BLOCK_CREATE)) {
    throw new Error("Schema dispatcher verification failed after repair.");
  }
  if (!next.includes(V1_PLAN_UPDATE) || !next.includes(V1_SESSION_UPDATE) || !next.includes(V1_BLOCK_UPDATE)) {
    throw new Error("Legacy schema-v1 update routing was not preserved.");
  }
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = process.argv[2] ?? "firestore.rules";
  const outputPath = process.argv[3] ?? inputPath;
  const source = readFileSync(inputPath, "utf8");
  const repaired = repairProClubWeeklyTrainingV1V2SingleMatchRouting(source);
  writeFileSync(outputPath, repaired, "utf8");
}
