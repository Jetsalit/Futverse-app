export type TrainingPhase =
  | "GENERAL"
  | "IN_POSSESSION"
  | "OUT_OF_POSSESSION"
  | "TRANSITION_TO_ATTACK"
  | "TRANSITION_TO_DEFEND"
  | "SET_PIECES";

export type PlannedLoad = "LOW" | "MODERATE" | "HIGH";
export type BlockType =
  | "WARM_UP"
  | "TECHNICAL"
  | "TACTICAL"
  | "GAME"
  | "CONDITIONING"
  | "COOL_DOWN"
  | "OTHER";

export const WEEKLY_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES = 1_500;

export interface ValidatedBlock {
  blockType: BlockType;
  title: string;
  durationMinutes: number;
  drillReference?: string;
  coachingPoints: string[];
}

export interface ValidatedSession {
  sessionDate: string;
  startTime: string;
  location: string;
  objective: string;
  phaseOfPlay: TrainingPhase;
  plannedLoad: PlannedLoad;
  durationMinutes: number;
  blocks: ValidatedBlock[];
}

export interface ValidatedWeeklyTrainingDraft {
  clubId: string;
  weekStartDate: string;
  squadLabel: string;
  mainObjective: string;
  secondaryObjective?: string;
  headCoachNote?: string;
  sessions: ValidatedSession[];
}

export class WeeklyTrainingDraftSaveError extends Error {
  constructor(
    readonly code:
      | "INVALID_ARGUMENT"
      | "PERMISSION_DENIED"
      | "FAILED_PRECONDITION",
    message: string,
  ) {
    super(message);
    this.name = "WeeklyTrainingDraftSaveError";
  }
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

function wellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) return false;
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return false;
  }
  return true;
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function storageSafeDrillReference(value: unknown): value is string {
  return (
    exactId(value) &&
    wellFormedUnicode(value) &&
    value !== "." &&
    value !== ".." &&
    !/^__.*__$/.test(value) &&
    utf8ByteLength(value) <= WEEKLY_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES
  );
}

function boundedText(value: unknown, max: number, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if ((required && trimmed.length === 0) || trimmed.length > max) return undefined;
  return trimmed;
}

function strictDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function strictTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function intIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function phase(value: unknown): value is TrainingPhase {
  return ["GENERAL", "IN_POSSESSION", "OUT_OF_POSSESSION", "TRANSITION_TO_ATTACK", "TRANSITION_TO_DEFEND", "SET_PIECES"].includes(String(value));
}

function load(value: unknown): value is PlannedLoad {
  return ["LOW", "MODERATE", "HIGH"].includes(String(value));
}

function blockType(value: unknown): value is BlockType {
  return ["WARM_UP", "TECHNICAL", "TACTICAL", "GAME", "CONDITIONING", "COOL_DOWN", "OTHER"].includes(String(value));
}

function parseBlock(value: unknown): ValidatedBlock {
  const rec = recordOf(value);
  if (!rec) throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid training block.");
  const allowed = new Set(["blockType", "title", "durationMinutes", "drillReference", "coachingPoints"]);
  if (Object.keys(rec).some((key) => !allowed.has(key))) throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Non-canonical block field.");
  const title = boundedText(rec.title, 200);
  if (!blockType(rec.blockType) || !title || !intIn(rec.durationMinutes, 1, 180)) {
    throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid block values.");
  }
  let drillReference: string | undefined;
  if (rec.drillReference !== undefined) {
    if (!storageSafeDrillReference(rec.drillReference)) {
      throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid or storage-unsafe drill reference.");
    }
    drillReference = rec.drillReference;
  }
  if (!Array.isArray(rec.coachingPoints) || rec.coachingPoints.length < 1 || rec.coachingPoints.length > 10) {
    throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid coaching points.");
  }
  const coachingPoints = rec.coachingPoints.map((point) => {
    const parsed = boundedText(point, 300);
    if (!parsed) throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid coaching point.");
    return parsed;
  });
  return {
    blockType: rec.blockType,
    title,
    durationMinutes: rec.durationMinutes,
    ...(drillReference ? { drillReference } : {}),
    coachingPoints,
  };
}

function parseSession(value: unknown, weekStartDate: string): ValidatedSession {
  const rec = recordOf(value);
  if (!rec) throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid training session.");
  const allowed = new Set(["sessionDate", "startTime", "location", "objective", "phaseOfPlay", "plannedLoad", "durationMinutes", "blocks"]);
  if (Object.keys(rec).some((key) => !allowed.has(key))) throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Non-canonical session field.");
  const location = boundedText(rec.location, 200);
  const objective = boundedText(rec.objective, 500);
  if (!strictDate(rec.sessionDate) || !strictTime(rec.startTime) || !location || !objective || !phase(rec.phaseOfPlay) || !load(rec.plannedLoad) || !intIn(rec.durationMinutes, 15, 360)) {
    throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid session values.");
  }
  const delta = dayNumber(rec.sessionDate) - dayNumber(weekStartDate);
  if (!Number.isInteger(delta) || delta < 0 || delta > 6) throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Session outside plan week.");
  if (!Array.isArray(rec.blocks) || rec.blocks.length < 1 || rec.blocks.length > 12) {
    throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid session block count.");
  }
  const blocks = rec.blocks.map(parseBlock);
  if (blocks.reduce((sum, block) => sum + block.durationMinutes, 0) > rec.durationMinutes) {
    throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Block duration exceeds session duration.");
  }
  return {
    sessionDate: rec.sessionDate,
    startTime: rec.startTime,
    location,
    objective,
    phaseOfPlay: rec.phaseOfPlay,
    plannedLoad: rec.plannedLoad,
    durationMinutes: rec.durationMinutes,
    blocks,
  };
}

export function validateWeeklyTrainingDraft(value: unknown): ValidatedWeeklyTrainingDraft {
  const rec = recordOf(value);
  if (!rec) throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid weekly training draft.");
  const allowed = new Set(["clubId", "authorUid", "weekStartDate", "squadLabel", "mainObjective", "secondaryObjective", "headCoachNote", "technicalDirectorNote", "sessions"]);
  if (Object.keys(rec).some((key) => !allowed.has(key))) throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Non-canonical plan field.");
  if (!exactId(rec.clubId) || !strictDate(rec.weekStartDate)) throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid plan identity/date.");
  const technicalDirectorNote = boundedText(rec.technicalDirectorNote, 2000, false);
  if (rec.technicalDirectorNote !== undefined && technicalDirectorNote === undefined) {
    throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid Technical Director note.");
  }
  if (technicalDirectorNote) {
    throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Technical Director note persistence is closed.");
  }
  const squadLabel = boundedText(rec.squadLabel, 100);
  const mainObjective = boundedText(rec.mainObjective, 500);
  const secondaryObjective = boundedText(rec.secondaryObjective, 500, false);
  const headCoachNote = boundedText(rec.headCoachNote, 2000, false);
  if (!squadLabel || !mainObjective || (rec.secondaryObjective !== undefined && secondaryObjective === undefined) || (rec.headCoachNote !== undefined && headCoachNote === undefined)) {
    throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid plan text.");
  }
  if (!Array.isArray(rec.sessions) || rec.sessions.length < 1 || rec.sessions.length > 14) {
    throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Invalid session count.");
  }
  const sessions = rec.sessions.map((session) => parseSession(session, rec.weekStartDate as string));
  const seen = new Set<string>();
  for (const session of sessions) {
    const slot = `${session.sessionDate}T${session.startTime}`;
    if (seen.has(slot)) throw new WeeklyTrainingDraftSaveError("INVALID_ARGUMENT", "Duplicate session slot.");
    seen.add(slot);
  }
  return {
    clubId: rec.clubId,
    weekStartDate: rec.weekStartDate as string,
    squadLabel,
    mainObjective,
    ...(secondaryObjective ? { secondaryObjective } : {}),
    ...(headCoachNote ? { headCoachNote } : {}),
    sessions,
  };
}
