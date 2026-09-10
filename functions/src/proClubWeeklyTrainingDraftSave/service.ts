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

    // Request identity is actor-global, not tenant-scoped. A Head Coach who is
    // active in multiple clubs therefore cannot reuse one logical request ID
    // to create a second hierarchy in another club. The hashed document ID
    // avoids placing the raw actor UID in the registry path; all receipt fields
    // are still checked fail-closed, so even an impossible hash collision cannot
    // silently cross-bind requests.
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

      if (
        !userSnap.exists ||
        !["Active", "ACTIVE"].includes(String(user?.status ?? ""))
      ) {
        throw new WeeklyTrainingDraftSaveError(
          "PERMISSION_DENIED",
          "Actor account is not active.",
        );
      }
      if (!clubSnap.exists || club?.status !== "ACTIVE") {
        throw new WeeklyTrainingDraftSaveError(
          "FAILED_PRECONDITION",
          "Pro Club is not active.",
        );
      }
      if (!memberSnap.exists || member?.status !== "ACTIVE") {
        throw new WeeklyTrainingDraftSaveError(
          "PERMISSION_DENIED",
          "Active Pro Club membership required.",
        );
      }
      if (
        !staffSnap.exists ||
        staff?.status !== "ACTIVE" ||
        staff?.staffRole !== "HEAD_COACH"
      ) {
        throw new WeeklyTrainingDraftSaveError(
          "PERMISSION_DENIED",
          "Active Head Coach assignment required.",
        );
      }
      if (
        !governanceSnap.exists ||
        governance?.schemaVersion !== 1 ||
        governance?.status !== "ACTIVE" ||
        !exactId(governance?.authorityUid) ||
        !["TECHNICAL_DIRECTOR", "HEAD_COACH"].includes(
          String(governance?.authorityRole ?? ""),
        )
      ) {
        throw new WeeklyTrainingDraftSaveError(
          "FAILED_PRECONDITION",
          "Valid technical governance required.",
        );
      }

      const receipt = receiptSnap.data();
      const existingPlanId = receiptSnap.exists ? receipt?.planId : undefined;

      // Validate the actor-global request binding before following any receipt
      // pointer. In particular, changed tenant/payload/actor is not a retry.
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
          !exactId(existingPlanId))
      ) {
        throw new WeeklyTrainingDraftSaveError(
          "FAILED_PRECONDITION",
          "Save request ID is already bound to different or invalid state.",
        );
      }

      const authorityUid = governance.authorityUid as string;
      const authorityMemberRef = clubRef.collection("members").doc(authorityUid);
      const authorityStaffRef = clubRef.collection("staff").doc(authorityUid);
      const existingPlanRef = receiptSnap.exists
        ? clubRef.collection("weeklyTrainingPlans").doc(existingPlanId as string)
        : null;

      const [authorityMemberSnap, authorityStaffSnap, existingPlanSnap] =
        await Promise.all([
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
        throw new WeeklyTrainingDraftSaveError(
          "FAILED_PRECONDITION",
          "Technical authority evidence is invalid.",
        );
      }

      if (receiptSnap.exists) {
        if (
          !existingPlanSnap ||
          !existingPlanSnap.exists ||
          existingPlanSnap.data()?.authorUid !== actorUid ||
          existingPlanSnap.data()?.status !== "DRAFT"
        ) {
          throw new WeeklyTrainingDraftSaveError(
            "FAILED_PRECONDITION",
            "Save request ID is already bound to different or invalid state.",
          );
        }

        return {
          status: "COMPLETED" as const,
          requestId,
          clubId: draft.clubId,
          planId: existingPlanId as string,
          documentCount: hierarchyDocumentCount,
          createdAt: receipt.createdAtIso as string,
        };
      }

      const planPayload = {
        schemaVersion: 1,
        authorUid: actorUid,
        status: "DRAFT",
        weekStartDate: draft.weekStartDate,
        squadLabel: draft.squadLabel,
        mainObjective: draft.mainObjective,
        ...(draft.secondaryObjective
          ? { secondaryObjective: draft.secondaryObjective }
          : {}),
        ...(draft.headCoachNote ? { headCoachNote: draft.headCoachNote } : {}),
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
          schemaVersion: 1,
          orderIndex: sessionIndex,
          sessionDate: session.sessionDate,
          startTime: session.startTime,
          location: session.location,
          objective: session.objective,
          phaseOfPlay: session.phaseOfPlay,
          plannedLoad: session.plannedLoad,
          durationMinutes: session.durationMinutes,
          createdAt: now,
          createdBy: actorUid,
          updatedAt: now,
          updatedBy: actorUid,
        });
        documentCount += 1;

        session.blocks.forEach((block, blockIndex) => {
          const blockRef = sessionRef
            .collection("blocks")
            .doc(blockId(blockIndex));
          transaction.create(blockRef, {
            schemaVersion: 1,
            orderIndex: blockIndex,
            blockType: block.blockType,
            title: block.title,
            durationMinutes: block.durationMinutes,
            ...(block.drillReference
              ? { drillReference: block.drillReference }
              : {}),
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

      // Global registry receipt and football hierarchy are one atomic commit.
      // There is no client Rules grant for this top-level control collection.
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
