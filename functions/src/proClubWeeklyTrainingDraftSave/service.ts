import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  validateWeeklyTrainingDraft,
  WeeklyTrainingDraftSaveError,
  type ValidatedWeeklyTrainingDraft,
} from "./core.ts";

export interface WeeklyTrainingDraftSaveServiceDependencies {
  firestore: Firestore;
  trustedClock?: () => Date;
}

export interface SaveWeeklyTrainingDraftInput {
  actorUid: unknown;
  draft: unknown;
}

export interface SaveWeeklyTrainingDraftResult {
  status: "COMPLETED";
  clubId: string;
  planId: string;
  documentCount: number;
  createdAt: string;
}

function exactId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("/");
}

function sessionId(session: ValidatedWeeklyTrainingDraft["sessions"][number]): string {
  return `${session.sessionDate}-${session.startTime.replace(":", "")}`;
}

function blockId(index: number): string {
  return `block-${String(index + 1).padStart(2, "0")}`;
}

export class WeeklyTrainingDraftSaveService {
  constructor(private readonly dependencies: WeeklyTrainingDraftSaveServiceDependencies) {}

  async saveFreshDraft(input: SaveWeeklyTrainingDraftInput): Promise<SaveWeeklyTrainingDraftResult> {
    const actorUid = input.actorUid;
    if (!exactId(actorUid)) {
      throw new WeeklyTrainingDraftSaveError("PERMISSION_DENIED", "Authenticated actor required.");
    }

    const draft = validateWeeklyTrainingDraft(input.draft);
    const { firestore } = this.dependencies;
    const now = this.dependencies.trustedClock ? this.dependencies.trustedClock() : new Date();
    const timestamp = Timestamp.fromDate(now);

    const clubRef = firestore.collection("proClubs").doc(draft.clubId);
    const actorUserRef = firestore.collection("users").doc(actorUid);
    const actorMemberRef = clubRef.collection("members").doc(actorUid);
    const actorStaffRef = clubRef.collection("staff").doc(actorUid);
    const governanceRef = clubRef.collection("technicalGovernance").doc("current");
    const planRef = clubRef.collection("weeklyTrainingPlans").doc();

    return await firestore.runTransaction(async (transaction) => {
      const [userSnap, clubSnap, memberSnap, staffSnap, governanceSnap] = await Promise.all([
        transaction.get(actorUserRef),
        transaction.get(clubRef),
        transaction.get(actorMemberRef),
        transaction.get(actorStaffRef),
        transaction.get(governanceRef),
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

      const authorityUid = governance.authorityUid as string;
      const authorityMemberRef = clubRef.collection("members").doc(authorityUid);
      const authorityStaffRef = clubRef.collection("staff").doc(authorityUid);
      const [authorityMemberSnap, authorityStaffSnap] = await Promise.all([
        transaction.get(authorityMemberRef),
        transaction.get(authorityStaffRef),
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

      const planPayload = {
        schemaVersion: 1,
        authorUid: actorUid,
        status: "DRAFT",
        weekStartDate: draft.weekStartDate,
        squadLabel: draft.squadLabel,
        mainObjective: draft.mainObjective,
        ...(draft.secondaryObjective ? { secondaryObjective: draft.secondaryObjective } : {}),
        ...(draft.headCoachNote ? { headCoachNote: draft.headCoachNote } : {}),
        createdAt: timestamp,
        createdBy: actorUid,
        updatedAt: timestamp,
        updatedBy: actorUid,
      };

      transaction.create(planRef, planPayload);
      let documentCount = 1;

      draft.sessions.forEach((session, sessionIndex) => {
        const sid = sessionId(session);
        const sessionRef = planRef.collection("sessions").doc(sid);
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
          createdAt: timestamp,
          createdBy: actorUid,
          updatedAt: timestamp,
          updatedBy: actorUid,
        });
        documentCount += 1;

        session.blocks.forEach((block, blockIndex) => {
          const blockRef = sessionRef.collection("blocks").doc(blockId(blockIndex));
          transaction.create(blockRef, {
            schemaVersion: 1,
            orderIndex: blockIndex,
            blockType: block.blockType,
            title: block.title,
            durationMinutes: block.durationMinutes,
            ...(block.drillReference ? { drillReference: block.drillReference } : {}),
            coachingPoints: block.coachingPoints,
            createdAt: timestamp,
            createdBy: actorUid,
            updatedAt: timestamp,
            updatedBy: actorUid,
          });
          documentCount += 1;
        });
      });

      return {
        status: "COMPLETED" as const,
        clubId: draft.clubId,
        planId: planRef.id,
        documentCount,
        createdAt: now.toISOString(),
      };
    });
  }
}

export function createWeeklyTrainingDraftSaveService(
  dependencies: WeeklyTrainingDraftSaveServiceDependencies,
): WeeklyTrainingDraftSaveService {
  return new WeeklyTrainingDraftSaveService(dependencies);
}
