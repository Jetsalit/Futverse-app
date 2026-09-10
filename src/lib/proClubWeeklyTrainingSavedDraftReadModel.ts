import { isValidDocumentIdentifier } from "./proClubModel";
import {
  parseProClubWeeklyTrainingDraft,
  type ProClubTrainingBlockDraft,
  type ProClubTrainingSessionDraft,
  type ProClubWeeklyTrainingDraft,
} from "./proClubWeeklyTraining";

export interface WeeklyTrainingSavedDraftDocument {
  readonly id: string;
  readonly data: unknown;
}

export interface WeeklyTrainingSavedDraftSessionDocument {
  readonly document: WeeklyTrainingSavedDraftDocument;
  readonly blocks: readonly WeeklyTrainingSavedDraftDocument[];
}

export interface WeeklyTrainingSavedDraftTimestampOrder {
  readonly seconds: number;
  readonly nanoseconds: number;
}

export interface WeeklyTrainingSavedDraftAuditBinding {
  readonly actorUid: string;
  readonly timestamp: WeeklyTrainingSavedDraftTimestampOrder;
}

export interface WeeklyTrainingSavedDraftSessionCardinality {
  readonly sessionId: string;
  readonly orderIndex: number;
  readonly blockCount: number;
}

export interface WeeklyTrainingSavedDraftSummary {
  readonly planId: string;
  readonly clubId: string;
  readonly authorUid: string;
  readonly weekStartDate: string;
  readonly squadLabel: string;
  readonly mainObjective: string;
  readonly secondaryObjective?: string;
  readonly headCoachNote?: string;
  readonly sessionCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdAtOrder: WeeklyTrainingSavedDraftTimestampOrder;
  readonly updatedAtOrder: WeeklyTrainingSavedDraftTimestampOrder;
}

export interface WeeklyTrainingSavedDraftDetail extends WeeklyTrainingSavedDraftSummary {
  readonly draft: ProClubWeeklyTrainingDraft;
}

export type WeeklyTrainingSavedDraftModelResult<T> =
  | { readonly state: "VALID"; readonly value: T }
  | { readonly state: "INVALID"; readonly error: Error };

const SAVED_DRAFT_HIERARCHY_SCHEMA_VERSION = 2 as const;
const PLAN_FIELDS = new Set([
  "schemaVersion", "authorUid", "status", "weekStartDate", "squadLabel", "mainObjective",
  "secondaryObjective", "headCoachNote", "sessionCount", "createdAt", "createdBy", "updatedAt", "updatedBy",
]);
const SESSION_FIELDS = new Set([
  "schemaVersion", "orderIndex", "sessionDate", "startTime", "location", "objective",
  "phaseOfPlay", "plannedLoad", "durationMinutes", "blockCount", "createdAt", "createdBy", "updatedAt", "updatedBy",
]);
const BLOCK_FIELDS = new Set([
  "schemaVersion", "orderIndex", "blockType", "title", "durationMinutes", "drillReference",
  "coachingPoints", "createdAt", "createdBy", "updatedAt", "updatedBy",
]);

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
function hasOnlyFields(value: Record<string, unknown>, fields: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => fields.has(key));
}
function exactText(value: unknown, maxLength: number, required = true): string | null {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || value.trim() !== value) return null;
  if (required && value.length === 0) return null;
  if (value.length > maxLength) return null;
  return value;
}
function strictDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function boundedCount(value: unknown, min: number, max: number): number | null {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
    ? (value as number)
    : null;
}
function timestampValue(value: unknown): { iso: string; order: WeeklyTrainingSavedDraftTimestampOrder } | null {
  const raw = record(value);
  if (!raw) return null;
  const seconds = raw.seconds;
  const nanoseconds = raw.nanoseconds;
  if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanoseconds)) return null;
  if ((nanoseconds as number) < 0 || (nanoseconds as number) > 999_999_999) return null;
  const millis = (seconds as number) * 1_000 + Math.floor((nanoseconds as number) / 1_000_000);
  if (!Number.isSafeInteger(millis)) return null;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return null;
  return {
    iso: date.toISOString(),
    order: { seconds: seconds as number, nanoseconds: nanoseconds as number },
  };
}
export function compareWeeklyTrainingSavedDraftTimestampOrder(
  left: WeeklyTrainingSavedDraftTimestampOrder,
  right: WeeklyTrainingSavedDraftTimestampOrder,
): number {
  if (left.seconds !== right.seconds) return left.seconds < right.seconds ? -1 : 1;
  if (left.nanoseconds !== right.nanoseconds) return left.nanoseconds < right.nanoseconds ? -1 : 1;
  return 0;
}
function sameTimestampOrder(
  left: WeeklyTrainingSavedDraftTimestampOrder,
  right: WeeklyTrainingSavedDraftTimestampOrder,
): boolean {
  return compareWeeklyTrainingSavedDraftTimestampOrder(left, right) === 0;
}
function freshAudit(
  value: Record<string, unknown>,
  expected?: WeeklyTrainingSavedDraftAuditBinding,
): {
  createdAt: string;
  updatedAt: string;
  createdAtOrder: WeeklyTrainingSavedDraftTimestampOrder;
  updatedAtOrder: WeeklyTrainingSavedDraftTimestampOrder;
  actorUid: string;
} | null {
  if (!isValidDocumentIdentifier(value.createdBy) || !isValidDocumentIdentifier(value.updatedBy)) return null;
  if (value.createdBy !== value.updatedBy) return null;
  const createdAt = timestampValue(value.createdAt);
  const updatedAt = timestampValue(value.updatedAt);
  if (!createdAt || !updatedAt || !sameTimestampOrder(createdAt.order, updatedAt.order)) return null;
  if (
    expected &&
    (value.createdBy !== expected.actorUid || !sameTimestampOrder(createdAt.order, expected.timestamp))
  ) {
    return null;
  }
  return {
    createdAt: createdAt.iso,
    updatedAt: updatedAt.iso,
    createdAtOrder: createdAt.order,
    updatedAtOrder: updatedAt.order,
    actorUid: value.createdBy,
  };
}
function invalid<T>(message: string): WeeklyTrainingSavedDraftModelResult<T> {
  return { state: "INVALID", error: new Error(message) };
}

function parsePlanSummary(input: {
  clubId: unknown;
  actorUid: unknown;
  document: WeeklyTrainingSavedDraftDocument;
}): WeeklyTrainingSavedDraftModelResult<WeeklyTrainingSavedDraftSummary> {
  if (!isValidDocumentIdentifier(input.clubId) || !isValidDocumentIdentifier(input.actorUid)) {
    return invalid("Invalid saved-DRAFT tenant or actor identity.");
  }
  if (!isValidDocumentIdentifier(input.document.id)) return invalid("Invalid saved-DRAFT plan identity.");
  const raw = record(input.document.data);
  if (!raw || !hasOnlyFields(raw, PLAN_FIELDS)) return invalid("Saved-DRAFT plan contains non-canonical fields.");
  if (raw.schemaVersion !== SAVED_DRAFT_HIERARCHY_SCHEMA_VERSION || raw.status !== "DRAFT" || raw.authorUid !== input.actorUid) {
    return invalid("Saved-DRAFT plan binding is invalid.");
  }
  if (!strictDate(raw.weekStartDate)) return invalid("Saved-DRAFT week start is invalid.");
  const squadLabel = exactText(raw.squadLabel, 100);
  const mainObjective = exactText(raw.mainObjective, 500);
  const secondaryObjective = exactText(raw.secondaryObjective, 500, false);
  const headCoachNote = exactText(raw.headCoachNote, 2_000, false);
  const sessionCount = boundedCount(raw.sessionCount, 1, 14);
  if (squadLabel === null || mainObjective === null || secondaryObjective === null || headCoachNote === null || sessionCount === null) {
    return invalid("Saved-DRAFT plan content or hierarchy cardinality is invalid.");
  }
  const auditValue = freshAudit(raw, {
    actorUid: input.actorUid,
    timestamp: timestampValue(raw.createdAt)?.order ?? { seconds: Number.NaN, nanoseconds: Number.NaN },
  });
  if (!auditValue || auditValue.actorUid !== input.actorUid) {
    return invalid("Saved-DRAFT plan fresh-save audit metadata is invalid.");
  }
  return {
    state: "VALID",
    value: {
      planId: input.document.id,
      clubId: input.clubId,
      authorUid: input.actorUid,
      weekStartDate: raw.weekStartDate,
      squadLabel,
      mainObjective,
      ...(secondaryObjective ? { secondaryObjective } : {}),
      ...(headCoachNote ? { headCoachNote } : {}),
      sessionCount,
      createdAt: auditValue.createdAt,
      updatedAt: auditValue.updatedAt,
      createdAtOrder: auditValue.createdAtOrder,
      updatedAtOrder: auditValue.updatedAtOrder,
    },
  };
}

function parseSession(
  document: WeeklyTrainingSavedDraftDocument,
  expectedAudit: WeeklyTrainingSavedDraftAuditBinding,
): {
  orderIndex: number;
  blockCount: number;
  value: Omit<ProClubTrainingSessionDraft, "blocks">;
} | null {
  if (!isValidDocumentIdentifier(document.id)) return null;
  const raw = record(document.data);
  if (
    !raw ||
    !hasOnlyFields(raw, SESSION_FIELDS) ||
    raw.schemaVersion !== SAVED_DRAFT_HIERARCHY_SCHEMA_VERSION ||
    !freshAudit(raw, expectedAudit)
  ) return null;
  if (!Number.isInteger(raw.orderIndex) || (raw.orderIndex as number) < 0 || (raw.orderIndex as number) > 13) return null;
  const blockCount = boundedCount(raw.blockCount, 1, 12);
  if (blockCount === null) return null;
  const candidate = {
    sessionDate: raw.sessionDate,
    startTime: raw.startTime,
    location: raw.location,
    objective: raw.objective,
    phaseOfPlay: raw.phaseOfPlay,
    plannedLoad: raw.plannedLoad,
    durationMinutes: raw.durationMinutes,
    blocks: [{ blockType: "OTHER", title: "Probe", durationMinutes: 1, coachingPoints: ["Probe"] }],
  };
  const probe = parseProClubWeeklyTrainingDraft({
    clubId: "probe-club",
    authorUid: "probe-user",
    weekStartDate: raw.sessionDate,
    squadLabel: "Probe",
    mainObjective: "Probe",
    sessions: [candidate],
  });
  if (probe.state !== "VALID") return null;
  const parsed = probe.value.sessions[0];
  if (!parsed) return null;
  if (document.id !== `${parsed.sessionDate}-${parsed.startTime.replace(":", "")}`) return null;
  const { blocks: _blocks, ...withoutBlocks } = parsed;
  return { orderIndex: raw.orderIndex as number, blockCount, value: withoutBlocks };
}

function parseBlock(
  document: WeeklyTrainingSavedDraftDocument,
  expectedAudit: WeeklyTrainingSavedDraftAuditBinding,
): {
  orderIndex: number;
  value: ProClubTrainingBlockDraft;
} | null {
  if (!isValidDocumentIdentifier(document.id)) return null;
  const raw = record(document.data);
  if (
    !raw ||
    !hasOnlyFields(raw, BLOCK_FIELDS) ||
    raw.schemaVersion !== SAVED_DRAFT_HIERARCHY_SCHEMA_VERSION ||
    !freshAudit(raw, expectedAudit)
  ) return null;
  if (!Number.isInteger(raw.orderIndex) || (raw.orderIndex as number) < 0 || (raw.orderIndex as number) > 11) return null;
  const candidate = {
    blockType: raw.blockType,
    title: raw.title,
    durationMinutes: raw.durationMinutes,
    ...(raw.drillReference !== undefined ? { drillReference: raw.drillReference } : {}),
    coachingPoints: raw.coachingPoints,
  };
  const blockDuration = typeof raw.durationMinutes === "number" ? raw.durationMinutes : 15;
  const probe = parseProClubWeeklyTrainingDraft({
    clubId: "probe-club",
    authorUid: "probe-user",
    weekStartDate: "2026-01-05",
    squadLabel: "Probe",
    mainObjective: "Probe",
    sessions: [{
      sessionDate: "2026-01-05",
      startTime: "10:00",
      location: "Probe",
      objective: "Probe",
      phaseOfPlay: "GENERAL",
      plannedLoad: "LOW",
      durationMinutes: Math.max(15, blockDuration),
      blocks: [candidate],
    }],
  });
  if (probe.state !== "VALID") return null;
  const parsed = probe.value.sessions[0]?.blocks[0];
  if (!parsed) return null;
  if (document.id !== `block-${String((raw.orderIndex as number) + 1).padStart(2, "0")}`) return null;
  return { orderIndex: raw.orderIndex as number, value: parsed };
}

export function buildWeeklyTrainingSavedDraftSummary(input: {
  readonly clubId: unknown;
  readonly actorUid: unknown;
  readonly document: WeeklyTrainingSavedDraftDocument;
}): WeeklyTrainingSavedDraftModelResult<WeeklyTrainingSavedDraftSummary> {
  return parsePlanSummary(input);
}

export function buildWeeklyTrainingSavedDraftSessionCardinality(
  document: WeeklyTrainingSavedDraftDocument,
  expectedAudit: WeeklyTrainingSavedDraftAuditBinding,
): WeeklyTrainingSavedDraftModelResult<WeeklyTrainingSavedDraftSessionCardinality> {
  const parsed = parseSession(document, expectedAudit);
  if (!parsed) return invalid("Saved-DRAFT session metadata or fresh-save audit binding is invalid.");
  return {
    state: "VALID",
    value: {
      sessionId: document.id,
      orderIndex: parsed.orderIndex,
      blockCount: parsed.blockCount,
    },
  };
}

export function sortWeeklyTrainingSavedDraftSummaries(
  summaries: readonly WeeklyTrainingSavedDraftSummary[],
): readonly WeeklyTrainingSavedDraftSummary[] {
  return [...summaries].sort((a, b) => {
    const byUpdated = compareWeeklyTrainingSavedDraftTimestampOrder(b.updatedAtOrder, a.updatedAtOrder);
    return byUpdated !== 0 ? byUpdated : b.planId.localeCompare(a.planId);
  });
}

export function buildWeeklyTrainingSavedDraftDetail(input: {
  readonly clubId: unknown;
  readonly actorUid: unknown;
  readonly planDocument: WeeklyTrainingSavedDraftDocument;
  readonly sessions: readonly WeeklyTrainingSavedDraftSessionDocument[];
}): WeeklyTrainingSavedDraftModelResult<WeeklyTrainingSavedDraftDetail> {
  const summaryResult = parsePlanSummary({ clubId: input.clubId, actorUid: input.actorUid, document: input.planDocument });
  if (summaryResult.state !== "VALID") {
    return summaryResult as WeeklyTrainingSavedDraftModelResult<WeeklyTrainingSavedDraftDetail>;
  }
  if (input.sessions.length !== summaryResult.value.sessionCount) {
    return invalid("Saved-DRAFT session hierarchy cardinality does not match the trusted plan metadata.");
  }
  const expectedAudit: WeeklyTrainingSavedDraftAuditBinding = {
    actorUid: summaryResult.value.authorUid,
    timestamp: summaryResult.value.createdAtOrder,
  };
  const parsedSessions = input.sessions.map((entry) => {
    const session = parseSession(entry.document, expectedAudit);
    if (!session || entry.blocks.length !== session.blockCount) return null;
    const blocks = entry.blocks.map((document) => parseBlock(document, expectedAudit));
    if (blocks.some((block) => block === null)) return null;
    const orderedBlocks = (blocks as Array<NonNullable<(typeof blocks)[number]>>).sort((a, b) => a.orderIndex - b.orderIndex);
    if (orderedBlocks.some((block, index) => block.orderIndex !== index)) return null;
    return { orderIndex: session.orderIndex, value: { ...session.value, blocks: orderedBlocks.map((block) => block.value) } };
  });
  if (parsedSessions.some((session) => session === null)) {
    return invalid("Saved-DRAFT child hierarchy contains invalid, incomplete, or audit-divergent data.");
  }
  const orderedSessions = (parsedSessions as Array<NonNullable<(typeof parsedSessions)[number]>>).sort((a, b) => a.orderIndex - b.orderIndex);
  if (orderedSessions.some((session, index) => session.orderIndex !== index)) {
    return invalid("Saved-DRAFT session ordering is invalid.");
  }
  const summary = summaryResult.value;
  const reconstructed = {
    clubId: summary.clubId,
    authorUid: summary.authorUid,
    weekStartDate: summary.weekStartDate,
    squadLabel: summary.squadLabel,
    mainObjective: summary.mainObjective,
    ...(summary.secondaryObjective ? { secondaryObjective: summary.secondaryObjective } : {}),
    ...(summary.headCoachNote ? { headCoachNote: summary.headCoachNote } : {}),
    sessions: orderedSessions.map((session) => session.value),
  };
  const parsedDraft = parseProClubWeeklyTrainingDraft(reconstructed);
  if (parsedDraft.state !== "VALID") {
    return invalid(`Saved-DRAFT hierarchy failed canonical reconstruction: ${parsedDraft.errors.join(" ")}`);
  }
  return { state: "VALID", value: { ...summary, draft: parsedDraft.value } };
}
