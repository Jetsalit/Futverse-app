import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  validateWeeklyTrainingDraft,
  WeeklyTrainingDraftSaveError,
  type ValidatedWeeklyTrainingDraft,
} from "./core.ts";

export interface WeeklyTrainingDraftSaveServiceDependencies {
  firestore: Firestore;
  trustedClock?: () => Date;
  planIdFactory?: () => string;
}

export interface SaveWeeklyTrainingDraftInput {
  actorUid: unknown;
  requestId: unknown;
  draft: unknown;
}

export interface SaveWeeklyTrainingDraftResult {
  status: "COMPLETED";
  requestId: string;
  clubId: string;
  planId: string;
  documentCount: number;
  createdAt: string;
}

const WEEKLY_TRAINING_DRAFT_SAVE_OPERATION =
  "PRO_CLUB_WEEKLY_TRAINING_DRAFT_SAVE" as const;
const WEEKLY_TRAINING_DRAFT_SAVE_REQUESTS =
  "weeklyTrainingDraftSaveRequests" as const;
const WEEKLY_TRAINING_DRAFT_HIERARCHY_SCHEMA_VERSION = 2 as const;

function exactId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

export function isCanonicalWeeklyTrainingDraftSaveRequestId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  );
}

function requestFingerprint(
  actorUid: string,
  draft: ValidatedWeeklyTrainingDraft,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ actorUid, draft }))
    .digest("hex");
}

function requestReceiptDocumentId(actorUid: string, requestId: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        WEEKLY_TRAINING_DRAFT_SAVE_OPERATION,
        actorUid,
        requestId,
      ]),
    )
    .digest("hex");
}

function expectedDocumentCount(draft: ValidatedWeeklyTrainingDraft): number {
  return (
    1 +
    draft.sessions.length +
    draft.sessions.reduce((sum, session) => sum + session.blocks.length, 0)
  );
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function sessionId(
  session: ValidatedWeeklyTrainingDraft["sessions"][number],
): string {
  return `${session.sessionDate}-${session.startTime.replace(":", "")}`;
}

function blockId(index: number): string {
  return `block-${String(index + 1).padStart(2, "0")}`;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sameStoredKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function sameOptionalString(value: unknown, expected: string | undefined): boolean {
  return expected === undefined ? value === undefined : value === expected;
}

function sameStringArray(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function timestampParts(
  value: unknown,
): { readonly seconds: number; readonly nanoseconds: number } | null {
  if (!value || typeof value !== "object") return null;
  const seconds = (value as { seconds?: unknown }).seconds;
  const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
  if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanoseconds)) return null;
  if ((nanoseconds as number) < 0 || (nanoseconds as number) > 999_999_999) return null;
  return { seconds: seconds as number, nanoseconds: nanoseconds as number };
}

function sameTimestamp(left: unknown, right: unknown): boolean {
  const a = timestampParts(left);
  const b = timestampParts(right);
  return (
    a !== null &&
    b !== null &&
    a.seconds === b.seconds &&
    a.nanoseconds === b.nanoseconds
  );
}

function timestampMatchesIso(value: unknown, iso: string): boolean {
  const parts = timestampParts(value);
  if (!parts) return false;
  const millis = parts.seconds * 1_000 + Math.floor(parts.nanoseconds / 1_000_000);
  return Number.isSafeInteger(millis) && new Date(millis).toISOString() === iso;
}

function freshAuditMatches(
  value: Record<string, unknown>,
  actorUid: string,
  receiptCreatedAt: unknown,
): boolean {
  return (
    value.createdBy === actorUid &&
    value.updatedBy === actorUid &&
    sameTimestamp(value.createdAt, receiptCreatedAt) &&
    sameTimestamp(value.updatedAt, receiptCreatedAt)
  );
}

function persistedPlanMatchesDraft(
  value: unknown,
  actorUid: string,
  receiptCreatedAt: unknown,
  draft: ValidatedWeeklyTrainingDraft,
): boolean {
  const data = record(value);
  if (!data) return false;
  const keys = [
    "schemaVersion",
    "authorUid",
    "status",
    "weekStartDate",
    "squadLabel",
    "mainObjective",
    ...(draft.secondaryObjective ? ["secondaryObjective"] : []),
    ...(draft.headCoachNote ? ["headCoachNote"] : []),
    "sessionCount",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
  ];
  return (
    sameStoredKeys(data, keys) &&
    data.schemaVersion === WEEKLY_TRAINING_DRAFT_HIERARCHY_SCHEMA_VERSION &&
    data.authorUid === actorUid &&
    data.status === "DRAFT" &&
    data.weekStartDate === draft.weekStartDate &&
    data.squadLabel === draft.squadLabel &&
    data.mainObjective === draft.mainObjective &&
    sameOptionalString(data.secondaryObjective, draft.secondaryObjective) &&
    sameOptionalString(data.headCoachNote, draft.headCoachNote) &&
    data.sessionCount === draft.sessions.length &&
    freshAuditMatches(data, actorUid, receiptCreatedAt)
  );
}

function persistedSessionMatchesDraft(
  value: unknown,
  actorUid: string,
  receiptCreatedAt: unknown,
  session: ValidatedWeeklyTrainingDraft["sessions"][number],
  sessionIndex: number,
): boolean {
  const data = record(value);
  if (!data) return false;
  return (
    sameStoredKeys(data, [
      "schemaVersion",
      "orderIndex",
      "sessionDate",
      "startTime",
      "location",
      "objective",
      "phaseOfPlay",
      "plannedLoad",
      "durationMinutes",
      "blockCount",
      "createdAt",
      "createdBy",
      "updatedAt",
      "updatedBy",
    ]) &&
    data.schemaVersion === WEEKLY_TRAINING_DRAFT_HIERARCHY_SCHEMA_VERSION &&
    data.orderIndex === sessionIndex &&
    data.sessionDate === session.sessionDate &&
    data.startTime === session.startTime &&
    data.location === session.location &&
    data.objective === session.objective &&
    data.phaseOfPlay === session.phaseOfPlay &&
    data.plannedLoad === session.plannedLoad &&
    data.durationMinutes === session.durationMinutes &&
    data.blockCount === session.blocks.length &&
    freshAuditMatches(data, actorUid, receiptCreatedAt)
  );
}

function persistedBlockMatchesDraft(
  value: unknown,
  actorUid: string,
  receiptCreatedAt: unknown,
  block: ValidatedWeeklyTrainingDraft["sessions"][number]["blocks"][number],
  blockIndex: number,
): boolean {
  const data = record(value);
  if (!data) return false;
  const keys = [
    "schemaVersion",
    "orderIndex",
    "blockType",
    "title",
    "durationMinutes",
    ...(block.drillReference ? ["drillReference"] : []),
    "coachingPoints",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
  ];
  return (
    sameStoredKeys(data, keys) &&
    data.schemaVersion === WEEKLY_TRAINING_DRAFT_HIERARCHY_SCHEMA_VERSION &&
    data.orderIndex === blockIndex &&
    data.blockType === block.blockType &&
    data.title === block.title &&
    data.durationMinutes === block.durationMinutes &&
    sameOptionalString(data.drillReference, block.drillReference) &&
    sameStringArray(data.coachingPoints, block.coachingPoints) &&
    freshAuditMatches(data, actorUid, receiptCreatedAt)
  );
}

function invalidPersistedRequestState(): never {
  throw new WeeklyTrainingDraftSaveError(
    "FAILED_PRECONDITION",
    "Save request ID is already bound to different or invalid state.",
  );
}

export class WeeklyTrainingDraftSaveService {
  constructor(private readonly dependencies: WeeklyTrainingDraftSaveServiceDependencies) {}

  async saveFreshDraft(
    input: SaveWeeklyTrainingDraftInput,
  ): Promise<SaveWeeklyTrainingDraftResult> {
    const actorUid = input.actorUid;
    if (!exactId(actorUid)) {
      throw new WeeklyTrainingDraftSaveError(
        "PERMISSION_DENIED",
        "Authenticated actor required.",
      );
    }
    if (!isCanonicalWeeklyTrainingDraftSaveRequestId(input.requestId)) {
      throw new WeeklyTrainingDraftSaveError(
        "INVALID_ARGUMENT",
        "Canonical save request ID required.",
      );
    }
    const requestId = input.requestId;

    const draft = validateWeeklyTrainingDraft(input.draft);
    const fingerprint = requestFingerprint(actorUid, draft);
    const hierarchyDocumentCount = expectedDocumentCount(draft);
    const { firestore } = this.dependencies;
    const now = this.dependencies.trustedClock
      ? this.dependencies.trustedClock()
      : new Date();
    const createdAtIso = now.toISOString();

    const clubRef = firestore.collection("proClubs").doc(draft.clubId);
    const actorUserRef = firestore.collection("users").doc(actorUid);
    const actorMemberRef = clubRef.collection("members").doc(actorUid);
    const actorStaffRef = clubRef.collection("staff").doc(actorUid);
    const governanceRef = clubRef.collection("technicalGovernance").doc("current");

    const receiptRef = firestore
      .collection(WEEKLY_TRAINING_DRAFT_SAVE_REQUESTS)
      .doc(requestReceiptDocumentId(actorUid, requestId));

    const generatedPlanId = this.dependencies.planIdFactory?.();
    if (generatedPlanId !== undefined && !exactId(generatedPlanId)) {
      throw new WeeklyTrainingDraftSaveError(
        "FAILED_PRECONDITION",
        "Invalid server-generated plan ID.",
      );
    }
    const freshPlanRef = generatedPlanId
      ? clubRef.collection("weeklyTrainingPlans").doc(generatedPlanId)
      : clubRef.collection("weeklyTrainingPlans").doc();

    return await firestore.runTransaction(async (transaction) => {
      const [userSnap, clubSnap, memberSnap, staffSnap, governanceSnap, receiptSnap] =
        await Promise.all([
          transaction.get(actorUserRef),
          transaction.get(clubRef),
          transaction.get(actorMemberRef),
          transaction.get(actorStaffRef),
          transaction.get(governanceRef),
          transaction.get(receiptRef),
        ]);

      const user = userSnap.data();
      const club = clubSnap.data();
      const member = memberSnap.data();
      const staff = staffSnap.data();
      const governance = governanceSnap.data();

      if (!userSnap.exists || !["Active", "ACTIVE"].includes(String(user?.status ?? ""))) {
        throw new WeeklyTrainingDraftSaveError("PERMISSION_DENIED", "Actor account is not active.");
      }
      if (!clubSnap.exists || club?.status !== "ACTIVE") {
        throw new WeeklyTrainingDraftSaveError("FAILED_PRECONDITION", "Pro Club is not active.");
      }
      if (!memberSnap.exists || member?.status !== "ACTIVE") {
        throw new WeeklyTrainingDraftSaveError("PERMISSION_DENIED", "Active Pro Club membership required.");
      }
      if (!staffSnap.exists || staff?.status !== "ACTIVE" || staff?.staffRole !== "HEAD_COACH") {
        throw new WeeklyTrainingDraftSaveError("PERMISSION_DENIED", "Active Head Coach assignment required.");
      }
      if (
        !governanceSnap.exists ||
        governance?.schemaVersion !== 1 ||
        governance?.status !== "ACTIVE" ||
        !exactId(governance?.authorityUid) ||
        !["TECHNICAL_DIRECTOR", "HEAD_COACH"].includes(String(governance?.authorityRole ?? ""))
      ) {
        throw new WeeklyTrainingDraftSaveError("FAILED_PRECONDITION", "Valid technical governance required.");
      }

      const receipt = receiptSnap.data();
      const existingPlanId = receiptSnap.exists ? receipt?.planId : undefined;

      if (
        receiptSnap.exists &&
        (receipt?.schemaVersion !== 1 ||
          receipt?.operationType !== WEEKLY_TRAINING_DRAFT_SAVE_OPERATION ||
          receipt?.requestId !== requestId ||
          receipt?.actorUid !== actorUid ||
          receipt?.clubId !== draft.clubId ||
          receipt?.requestFingerprint !== fingerprint ||
          receipt?.documentCount !== hierarchyDocumentCount ||
          !isCanonicalIsoTimestamp(receipt?.createdAtIso) ||
          !timestampMatchesIso(receipt?.createdAt, receipt.createdAtIso) ||
          !exactId(existingPlanId))
      ) {
        invalidPersistedRequestState();
      }

      const authorityUid = governance.authorityUid as string;
      const authorityMemberRef = clubRef.collection("members").doc(authorityUid);
      const authorityStaffRef = clubRef.collection("staff").doc(authorityUid);
      const existingPlanRef = receiptSnap.exists
        ? clubRef.collection("weeklyTrainingPlans").doc(existingPlanId as string)
        : null;

      const [authorityMemberSnap, authorityStaffSnap, existingPlanSnap] = await Promise.all([
        transaction.get(authorityMemberRef),
        transaction.get(authorityStaffRef),
        existingPlanRef ? transaction.get(existingPlanRef) : Promise.resolve(null),
      ]);
      const authorityMember = authorityMemberSnap.data();
      const authorityStaff = authorityStaffSnap.data();

      if (
        !authorityMemberSnap.exists ||
        authorityMember?.status !== "ACTIVE" ||
        !authorityStaffSnap.exists ||
        authorityStaff?.status !== "ACTIVE" ||
        authorityStaff?.staffRole !== governance.authorityRole
      ) {
        throw new WeeklyTrainingDraftSaveError("FAILED_PRECONDITION", "Technical authority evidence is invalid.");
      }

      if (receiptSnap.exists) {
        const persistedCreatedAt = receipt?.createdAtIso;
        const receiptCreatedAt = receipt?.createdAt;
        if (
          !isCanonicalIsoTimestamp(persistedCreatedAt) ||
          !existingPlanSnap ||
          !existingPlanSnap.exists ||
          !existingPlanRef ||
          !persistedPlanMatchesDraft(existingPlanSnap.data(), actorUid, receiptCreatedAt, draft)
        ) {
          invalidPersistedRequestState();
        }

        const persistedSessions = await transaction.get(
          existingPlanRef.collection("sessions").limit(draft.sessions.length + 1),
        );
        if (persistedSessions.size !== draft.sessions.length) {
          invalidPersistedRequestState();
        }
        const sessionById = new Map(
          persistedSessions.docs.map((snapshot) => [snapshot.id, snapshot] as const),
        );

        for (const [sessionIndex, session] of draft.sessions.entries()) {
          const persistedSession = sessionById.get(sessionId(session));
          if (
            !persistedSession ||
            !persistedSessionMatchesDraft(
              persistedSession.data(),
              actorUid,
              receiptCreatedAt,
              session,
              sessionIndex,
            )
          ) {
            invalidPersistedRequestState();
          }
        }

        const persistedBlocksBySession = await Promise.all(
          draft.sessions.map((session) =>
            transaction.get(
              existingPlanRef
                .collection("sessions")
                .doc(sessionId(session))
                .collection("blocks")
                .limit(session.blocks.length + 1),
            ),
          ),
        );

        for (const [sessionIndex, session] of draft.sessions.entries()) {
          const persistedBlocks = persistedBlocksBySession[sessionIndex];
          if (!persistedBlocks || persistedBlocks.size !== session.blocks.length) {
            invalidPersistedRequestState();
          }
          const blockById = new Map(
            persistedBlocks.docs.map((snapshot) => [snapshot.id, snapshot] as const),
          );
          for (const [blockIndex, block] of session.blocks.entries()) {
            const persistedBlock = blockById.get(blockId(blockIndex));
            if (
              !persistedBlock ||
              !persistedBlockMatchesDraft(
                persistedBlock.data(),
                actorUid,
                receiptCreatedAt,
                block,
                blockIndex,
              )
            ) {
              invalidPersistedRequestState();
            }
          }
        }

        return {
          status: "COMPLETED" as const,
          requestId,
          clubId: draft.clubId,
          planId: existingPlanId as string,
          documentCount: hierarchyDocumentCount,
          createdAt: persistedCreatedAt,
        };
      }

      const planPayload = {
        schemaVersion: WEEKLY_TRAINING_DRAFT_HIERARCHY_SCHEMA_VERSION,
        authorUid: actorUid,
        status: "DRAFT",
        weekStartDate: draft.weekStartDate,
        squadLabel: draft.squadLabel,
        mainObjective: draft.mainObjective,
        ...(draft.secondaryObjective ? { secondaryObjective: draft.secondaryObjective } : {}),
        ...(draft.headCoachNote ? { headCoachNote: draft.headCoachNote } : {}),
        sessionCount: draft.sessions.length,
        createdAt: now,
        createdBy: actorUid,
        updatedAt: now,
        updatedBy: actorUid,
      };

      transaction.create(freshPlanRef, planPayload);
      let documentCount = 1;

      draft.sessions.forEach((session, sessionIndex) => {
        const sid = sessionId(session);
        const sessionRef = freshPlanRef.collection("sessions").doc(sid);
        transaction.create(sessionRef, {
          schemaVersion: WEEKLY_TRAINING_DRAFT_HIERARCHY_SCHEMA_VERSION,
          orderIndex: sessionIndex,
          sessionDate: session.sessionDate,
          startTime: session.startTime,
          location: session.location,
          objective: session.objective,
          phaseOfPlay: session.phaseOfPlay,
          plannedLoad: session.plannedLoad,
          durationMinutes: session.durationMinutes,
          blockCount: session.blocks.length,
          createdAt: now,
          createdBy: actorUid,
          updatedAt: now,
          updatedBy: actorUid,
        });
        documentCount += 1;

        session.blocks.forEach((block, blockIndex) => {
          const blockRef = sessionRef.collection("blocks").doc(blockId(blockIndex));
          transaction.create(blockRef, {
            schemaVersion: WEEKLY_TRAINING_DRAFT_HIERARCHY_SCHEMA_VERSION,
            orderIndex: blockIndex,
            blockType: block.blockType,
            title: block.title,
            durationMinutes: block.durationMinutes,
            ...(block.drillReference ? { drillReference: block.drillReference } : {}),
            coachingPoints: block.coachingPoints,
            createdAt: now,
            createdBy: actorUid,
            updatedAt: now,
            updatedBy: actorUid,
          });
          documentCount += 1;
        });
      });

      if (documentCount !== hierarchyDocumentCount) {
        throw new WeeklyTrainingDraftSaveError(
          "FAILED_PRECONDITION",
          "Weekly Training document count is inconsistent.",
        );
      }

      transaction.create(receiptRef, {
        schemaVersion: 1,
        operationType: WEEKLY_TRAINING_DRAFT_SAVE_OPERATION,
        requestId,
        actorUid,
        clubId: draft.clubId,
        requestFingerprint: fingerprint,
        planId: freshPlanRef.id,
        documentCount,
        createdAt: now,
        createdAtIso,
      });

      return {
        status: "COMPLETED" as const,
        requestId,
        clubId: draft.clubId,
        planId: freshPlanRef.id,
        documentCount,
        createdAt: createdAtIso,
      };
    });
  }
}

export function createWeeklyTrainingDraftSaveService(
  dependencies: WeeklyTrainingDraftSaveServiceDependencies,
): WeeklyTrainingDraftSaveService {
  return new WeeklyTrainingDraftSaveService(dependencies);
}
