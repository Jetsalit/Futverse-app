import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  validateWeeklyTrainingExistingDraftEditInput,
  WeeklyTrainingExistingDraftEditError,
  type WeeklyTrainingExistingDraftEditTimestampToken,
} from "./core.ts";

export interface WeeklyTrainingExistingDraftEditServiceDependencies {
  readonly firestore: Firestore;
  readonly trustedClock?: () => Date;
}

export interface EditWeeklyTrainingExistingDraftInput {
  readonly actorUid: unknown;
  readonly planId: unknown;
  readonly expectedPlanUpdatedAt: unknown;
  readonly draft: unknown;
}

export interface EditWeeklyTrainingExistingDraftResult {
  readonly status: "COMPLETED";
  readonly clubId: string;
  readonly planId: string;
  readonly documentCount: number;
  readonly updatedAt: string;
}

const SCHEMA_VERSION = 2 as const;

function exactId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function timestampParts(value: unknown): { seconds: number; nanoseconds: number } | null {
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
  return Boolean(
    a && b && a.seconds === b.seconds && a.nanoseconds === b.nanoseconds,
  );
}

function timestampMatchesToken(
  value: unknown,
  expected: WeeklyTrainingExistingDraftEditTimestampToken,
): boolean {
  const parts = timestampParts(value);
  return Boolean(
    parts &&
    parts.seconds === expected.seconds &&
    parts.nanoseconds === expected.nanoseconds
  );
}

function sameKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function planKeys(value: Record<string, unknown>): string[] {
  return [
    "schemaVersion", "authorUid", "status", "weekStartDate", "squadLabel", "mainObjective",
    ...(value.secondaryObjective !== undefined ? ["secondaryObjective"] : []),
    ...(value.headCoachNote !== undefined ? ["headCoachNote"] : []),
    "sessionCount", "createdAt", "createdBy", "updatedAt", "updatedBy",
  ];
}

function sessionKeys(): string[] {
  return [
    "schemaVersion", "orderIndex", "sessionDate", "startTime", "location", "objective",
    "phaseOfPlay", "plannedLoad", "durationMinutes", "blockCount",
    "createdAt", "createdBy", "updatedAt", "updatedBy",
  ];
}

function blockKeys(value: Record<string, unknown>): string[] {
  return [
    "schemaVersion", "orderIndex", "blockType", "title", "durationMinutes",
    ...(value.drillReference !== undefined ? ["drillReference"] : []),
    "coachingPoints", "createdAt", "createdBy", "updatedAt", "updatedBy",
  ];
}

function sessionId(sessionDate: string, startTime: string): string {
  return `${sessionDate}-${startTime.replace(":", "")}`;
}

function blockId(index: number): string {
  return `block-${String(index + 1).padStart(2, "0")}`;
}

function conflict(message: string): never {
  throw new WeeklyTrainingExistingDraftEditError("CONFLICT", message);
}

function validatePlanAuditAndIdentity(
  data: Record<string, unknown>,
  actorUid: string,
  expectedPlanUpdatedAt: WeeklyTrainingExistingDraftEditTimestampToken,
  clubDraft: ReturnType<typeof validateWeeklyTrainingExistingDraftEditInput>["draft"],
): void {
  if (
    !sameKeys(data, planKeys(data)) ||
    data.schemaVersion !== SCHEMA_VERSION ||
    data.status !== "DRAFT" ||
    data.authorUid !== actorUid ||
    data.weekStartDate !== clubDraft.weekStartDate ||
    data.sessionCount !== clubDraft.sessions.length ||
    data.createdBy !== actorUid ||
    data.updatedBy !== actorUid ||
    !timestampParts(data.createdAt) ||
    !timestampParts(data.updatedAt)
  ) {
    conflict("Existing Weekly Training DRAFT identity or audit state changed.");
  }
  if (!timestampMatchesToken(data.updatedAt, expectedPlanUpdatedAt)) {
    conflict("Existing Weekly Training DRAFT is stale.");
  }
}

function validateChildAudit(
  data: Record<string, unknown>,
  actorUid: string,
  planCreatedAt: unknown,
  planUpdatedAt: unknown,
): void {
  if (
    data.createdBy !== actorUid ||
    data.updatedBy !== actorUid ||
    !sameTimestamp(data.createdAt, planCreatedAt) ||
    !sameTimestamp(data.updatedAt, planUpdatedAt)
  ) {
    conflict("Existing Weekly Training DRAFT hierarchy audit is incoherent.");
  }
}

function expectedDocumentCount(
  draft: ReturnType<typeof validateWeeklyTrainingExistingDraftEditInput>["draft"],
): number {
  return 1 + draft.sessions.length + draft.sessions.reduce(
    (total, session) => total + session.blocks.length,
    0,
  );
}

export class WeeklyTrainingExistingDraftEditService {
  constructor(
    private readonly dependencies: WeeklyTrainingExistingDraftEditServiceDependencies,
  ) {}

  async editExistingDraft(
    input: EditWeeklyTrainingExistingDraftInput,
  ): Promise<EditWeeklyTrainingExistingDraftResult> {
    if (!exactId(input.actorUid)) {
      throw new WeeklyTrainingExistingDraftEditError(
        "PERMISSION_DENIED",
        "Authenticated actor required.",
      );
    }
    const actorUid = input.actorUid;
    const validated = validateWeeklyTrainingExistingDraftEditInput({
      planId: input.planId,
      expectedPlanUpdatedAt: input.expectedPlanUpdatedAt,
      draft: input.draft,
    });
    const { planId, expectedPlanUpdatedAt, draft } = validated;
    const now = this.dependencies.trustedClock?.() ?? new Date();
    const updatedAtIso = now.toISOString();
    const documentCount = expectedDocumentCount(draft);

    const clubRef = this.dependencies.firestore.collection("proClubs").doc(draft.clubId);
    const userRef = this.dependencies.firestore.collection("users").doc(actorUid);
    const memberRef = clubRef.collection("members").doc(actorUid);
    const staffRef = clubRef.collection("staff").doc(actorUid);
    const governanceRef = clubRef.collection("technicalGovernance").doc("current");
    const planRef = clubRef.collection("weeklyTrainingPlans").doc(planId);

    return await this.dependencies.firestore.runTransaction(async (transaction) => {
      const [userSnap, clubSnap, memberSnap, staffSnap, governanceSnap, planSnap] =
        await Promise.all([
          transaction.get(userRef),
          transaction.get(clubRef),
          transaction.get(memberRef),
          transaction.get(staffRef),
          transaction.get(governanceRef),
          transaction.get(planRef),
        ]);

      const user = userSnap.data();
      const club = clubSnap.data();
      const member = memberSnap.data();
      const staff = staffSnap.data();
      const governance = governanceSnap.data();

      if (!userSnap.exists || !["Active", "ACTIVE"].includes(String(user?.status ?? ""))) {
        throw new WeeklyTrainingExistingDraftEditError("PERMISSION_DENIED", "Actor account is not active.");
      }
      if (!clubSnap.exists || club?.status !== "ACTIVE") {
        throw new WeeklyTrainingExistingDraftEditError("FAILED_PRECONDITION", "Pro Club is not active.");
      }
      if (
        !memberSnap.exists ||
        member?.status !== "ACTIVE" ||
        !["OWNER", "ADMIN", "MEMBER"].includes(
          String(member?.authorizationRole ?? ""),
        )
      ) {
        throw new WeeklyTrainingExistingDraftEditError(
          "PERMISSION_DENIED",
          "Active Pro Club membership authority required.",
        );
      }
      if (!staffSnap.exists || staff?.status !== "ACTIVE" || staff?.staffRole !== "HEAD_COACH") {
        throw new WeeklyTrainingExistingDraftEditError("PERMISSION_DENIED", "Active Head Coach assignment required.");
      }
      if (
        !governanceSnap.exists ||
        governance?.schemaVersion !== 1 ||
        governance?.status !== "ACTIVE" ||
        !exactId(governance?.authorityUid) ||
        !["TECHNICAL_DIRECTOR", "HEAD_COACH"].includes(String(governance?.authorityRole ?? ""))
      ) {
        throw new WeeklyTrainingExistingDraftEditError("FAILED_PRECONDITION", "Valid technical governance required.");
      }

      const authorityUid = governance.authorityUid as string;
      const [authorityMemberSnap, authorityStaffSnap] = await Promise.all([
        transaction.get(clubRef.collection("members").doc(authorityUid)),
        transaction.get(clubRef.collection("staff").doc(authorityUid)),
      ]);
      const authorityMember = authorityMemberSnap.data();
      const authorityStaff = authorityStaffSnap.data();
      if (
        !authorityMemberSnap.exists ||
        authorityMember?.status !== "ACTIVE" ||
        !["OWNER", "ADMIN", "MEMBER"].includes(
          String(authorityMember?.authorizationRole ?? ""),
        ) ||
        !authorityStaffSnap.exists || authorityStaff?.status !== "ACTIVE" ||
        authorityStaff?.staffRole !== governance.authorityRole
      ) {
        throw new WeeklyTrainingExistingDraftEditError(
          "FAILED_PRECONDITION",
          "Technical authority evidence is invalid.",
        );
      }

      if (!planSnap.exists) conflict("Existing Weekly Training DRAFT no longer exists.");
      const plan = record(planSnap.data());
      if (!plan) conflict("Existing Weekly Training DRAFT is malformed.");
      validatePlanAuditAndIdentity(plan, actorUid, expectedPlanUpdatedAt, draft);

      const sessionQuery = planRef.collection("sessions").limit(draft.sessions.length + 1);
      const sessionSnaps = await transaction.get(sessionQuery);
      if (sessionSnaps.size !== draft.sessions.length) {
        conflict("Existing Weekly Training DRAFT session cardinality changed.");
      }
      const sessionsById = new Map(sessionSnaps.docs.map((snapshot) => [snapshot.id, snapshot] as const));

      const persistedSessions = draft.sessions.map((session, index) => {
        const id = sessionId(session.sessionDate, session.startTime);
        const snapshot = sessionsById.get(id);
        if (!snapshot) conflict("Existing Weekly Training DRAFT session identity changed.");
        const data = record(snapshot.data());
        if (
          !data ||
          !sameKeys(data, sessionKeys()) ||
          data.schemaVersion !== SCHEMA_VERSION ||
          data.orderIndex !== index ||
          data.sessionDate !== session.sessionDate ||
          data.startTime !== session.startTime ||
          data.blockCount !== session.blocks.length
        ) {
          conflict("Existing Weekly Training DRAFT session structure changed.");
        }
        validateChildAudit(data, actorUid, plan.createdAt, plan.updatedAt);
        return { snapshot, data, session, index };
      });

      const blockSnapshotsBySession = await Promise.all(
        persistedSessions.map(({ snapshot, session }) =>
          transaction.get(snapshot.ref.collection("blocks").limit(session.blocks.length + 1)),
        ),
      );

      persistedSessions.forEach(({ snapshot, session, index: sessionIndex }) => {
        const blocks = blockSnapshotsBySession[sessionIndex];
        if (!blocks || blocks.size !== session.blocks.length) {
          conflict("Existing Weekly Training DRAFT block cardinality changed.");
        }
        const byId = new Map(blocks.docs.map((blockSnapshot) => [blockSnapshot.id, blockSnapshot] as const));
        session.blocks.forEach((_block, blockIndex) => {
          const id = blockId(blockIndex);
          const blockSnapshot = byId.get(id);
          if (!blockSnapshot) conflict("Existing Weekly Training DRAFT block identity changed.");
          const data = record(blockSnapshot.data());
          if (
            !data ||
            !sameKeys(data, blockKeys(data)) ||
            data.schemaVersion !== SCHEMA_VERSION ||
            data.orderIndex !== blockIndex
          ) {
            conflict("Existing Weekly Training DRAFT block structure changed.");
          }
          validateChildAudit(data, actorUid, plan.createdAt, plan.updatedAt);
          void snapshot;
        });
      });

      transaction.update(planRef, {
        squadLabel: draft.squadLabel,
        mainObjective: draft.mainObjective,
        secondaryObjective: draft.secondaryObjective ?? FieldValue.delete(),
        headCoachNote: draft.headCoachNote ?? FieldValue.delete(),
        updatedAt: now,
        updatedBy: actorUid,
      });

      persistedSessions.forEach(({ snapshot, session, index: sessionIndex }) => {
        transaction.update(snapshot.ref, {
          location: session.location,
          objective: session.objective,
          phaseOfPlay: session.phaseOfPlay,
          plannedLoad: session.plannedLoad,
          durationMinutes: session.durationMinutes,
          updatedAt: now,
          updatedBy: actorUid,
        });
        session.blocks.forEach((block, blockIndex) => {
          const blockSnapshot = blockSnapshotsBySession[sessionIndex]?.docs.find(
            (candidate) => candidate.id === blockId(blockIndex),
          );
          if (!blockSnapshot) conflict("Existing Weekly Training DRAFT block identity changed before write.");
          transaction.update(blockSnapshot.ref, {
            blockType: block.blockType,
            title: block.title,
            durationMinutes: block.durationMinutes,
            drillReference: block.drillReference ?? FieldValue.delete(),
            coachingPoints: block.coachingPoints,
            updatedAt: now,
            updatedBy: actorUid,
          });
        });
      });

      return {
        status: "COMPLETED" as const,
        clubId: draft.clubId,
        planId,
        documentCount,
        updatedAt: updatedAtIso,
      };
    });
  }
}

export function createWeeklyTrainingExistingDraftEditService(
  dependencies: WeeklyTrainingExistingDraftEditServiceDependencies,
): WeeklyTrainingExistingDraftEditService {
  return new WeeklyTrainingExistingDraftEditService(dependencies);
}
