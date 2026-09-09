import type { ProClubStaffRole } from "../types/ProClub";
import { isProClubStaffRole, isValidDocumentIdentifier } from "./proClubModel";
import {
  canTransitionProClubTechnicalWorkStatus,
  isProClubTechnicalWorkStatus,
  resolveProClubTechnicalAuthorityAction,
  resolveProClubTechnicalCapabilities,
  type ProClubTechnicalAuthorityAction,
  type ProClubTechnicalAuthorityResolution,
  type ProClubTechnicalAuthorityRole,
  type ProClubTechnicalWorkStatus,
} from "./proClubTechnicalGovernance";

export type ProClubTrainingPhaseOfPlay =
  | "GENERAL"
  | "IN_POSSESSION"
  | "OUT_OF_POSSESSION"
  | "TRANSITION_TO_ATTACK"
  | "TRANSITION_TO_DEFEND"
  | "SET_PIECES";

export type ProClubTrainingPlannedLoad = "LOW" | "MODERATE" | "HIGH";

export type ProClubTrainingBlockType =
  | "WARM_UP"
  | "TECHNICAL"
  | "TACTICAL"
  | "GAME"
  | "CONDITIONING"
  | "COOL_DOWN"
  | "OTHER";

export interface ProClubTrainingBlockDraft {
  blockType: ProClubTrainingBlockType;
  title: string;
  durationMinutes: number;
  drillReference?: string;
  coachingPoints: readonly string[];
}

export interface ProClubTrainingSessionDraft {
  sessionDate: string;
  startTime: string;
  location: string;
  objective: string;
  phaseOfPlay: ProClubTrainingPhaseOfPlay;
  plannedLoad: ProClubTrainingPlannedLoad;
  durationMinutes: number;
  blocks: readonly ProClubTrainingBlockDraft[];
}

export interface ProClubWeeklyTrainingDraft {
  clubId: string;
  authorUid: string;
  weekStartDate: string;
  squadLabel: string;
  mainObjective: string;
  secondaryObjective?: string;
  headCoachNote?: string;
  technicalDirectorNote?: string;
  sessions: readonly ProClubTrainingSessionDraft[];
}

export type ProClubWeeklyTrainingParseResult =
  | { state: "VALID"; value: ProClubWeeklyTrainingDraft }
  | { state: "INVALID"; errors: readonly string[] };

export type ProClubWeeklyTrainingWorkflowAction =
  | "EDIT"
  | "SUBMIT"
  | "BEGIN_REVIEW"
  | "REQUEST_REVISION"
  | "APPROVE"
  | "PUBLISH";

export type ProClubWeeklyTrainingWorkflowDenialReason =
  | "INVALID_INPUT"
  | "AUTHORITY_UNRESOLVED"
  | "INVALID_STATUS_FOR_ACTION"
  | "NOT_PERMITTED"
  | "SELF_WORK_MUST_PUBLISH";

export interface ProClubWeeklyTrainingBoundContext {
  actorUid: string;
  actorRole: ProClubStaffRole;
  authorUid: string;
  technicalAuthorityUid: string;
  technicalAuthorityRole: ProClubTechnicalAuthorityRole;
}

export type ProClubWeeklyTrainingWorkflowDecision =
  | ({
      allowed: true;
      action: ProClubWeeklyTrainingWorkflowAction;
      fromStatus: ProClubTechnicalWorkStatus;
      toStatus: ProClubTechnicalWorkStatus;
      authorityAction: ProClubTechnicalAuthorityAction;
    } & ProClubWeeklyTrainingBoundContext)
  | {
      allowed: false;
      action: ProClubWeeklyTrainingWorkflowAction | null;
      reason: ProClubWeeklyTrainingWorkflowDenialReason;
    };

export interface ProClubWeeklyTrainingActionProvenance {
  actorUid: string;
  actorRole: ProClubStaffRole;
  authorUid: string;
  action: ProClubWeeklyTrainingWorkflowAction;
  fromStatus: ProClubTechnicalWorkStatus;
  toStatus: ProClubTechnicalWorkStatus;
  technicalAuthorityUid: string;
  technicalAuthorityRole: ProClubTechnicalAuthorityRole;
  occurredAt: string;
}

const PLAN_FIELDS = new Set([
  "clubId",
  "authorUid",
  "weekStartDate",
  "squadLabel",
  "mainObjective",
  "secondaryObjective",
  "headCoachNote",
  "technicalDirectorNote",
  "sessions",
]);

const SESSION_FIELDS = new Set([
  "sessionDate",
  "startTime",
  "location",
  "objective",
  "phaseOfPlay",
  "plannedLoad",
  "durationMinutes",
  "blocks",
]);

const BLOCK_FIELDS = new Set([
  "blockType",
  "title",
  "durationMinutes",
  "drillReference",
  "coachingPoints",
]);

const WORKFLOW_ACTIONS = new Set<ProClubWeeklyTrainingWorkflowAction>([
  "EDIT",
  "SUBMIT",
  "BEGIN_REVIEW",
  "REQUEST_REVISION",
  "APPROVE",
  "PUBLISH",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasOnlyFields(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(record).every((key) => allowed.has(key));
}

function readBoundedText(value: unknown, maxLength: number, required: boolean): string | null {
  if (value === undefined && !required) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (required && trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return null;
  return trimmed;
}

function isStrictDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function dateOnlyTimestamp(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function isSessionDateInWeek(sessionDate: string, weekStartDate: string): boolean {
  const deltaDays =
    (dateOnlyTimestamp(sessionDate) - dateOnlyTimestamp(weekStartDate)) / 86_400_000;
  return Number.isInteger(deltaDays) && deltaDays >= 0 && deltaDays <= 6;
}

function isStrictTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isPhaseOfPlay(value: unknown): value is ProClubTrainingPhaseOfPlay {
  return (
    value === "GENERAL" ||
    value === "IN_POSSESSION" ||
    value === "OUT_OF_POSSESSION" ||
    value === "TRANSITION_TO_ATTACK" ||
    value === "TRANSITION_TO_DEFEND" ||
    value === "SET_PIECES"
  );
}

function isPlannedLoad(value: unknown): value is ProClubTrainingPlannedLoad {
  return value === "LOW" || value === "MODERATE" || value === "HIGH";
}

function isBlockType(value: unknown): value is ProClubTrainingBlockType {
  return (
    value === "WARM_UP" ||
    value === "TECHNICAL" ||
    value === "TACTICAL" ||
    value === "GAME" ||
    value === "CONDITIONING" ||
    value === "COOL_DOWN" ||
    value === "OTHER"
  );
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function parseBlock(value: unknown, path: string, errors: string[]): ProClubTrainingBlockDraft | null {
  const record = asRecord(value);
  if (!record || !hasOnlyFields(record, BLOCK_FIELDS)) {
    errors.push(`${path} must contain only canonical training-block fields.`);
    return null;
  }

  const title = readBoundedText(record.title, 200, true);
  if (!isBlockType(record.blockType)) errors.push(`${path}.blockType is invalid.`);
  if (title === null) errors.push(`${path}.title is invalid.`);
  if (!isBoundedInteger(record.durationMinutes, 1, 180)) {
    errors.push(`${path}.durationMinutes must be an integer from 1 to 180.`);
  }

  let drillReference: string | undefined;
  if (record.drillReference !== undefined) {
    if (!isValidDocumentIdentifier(record.drillReference)) {
      errors.push(`${path}.drillReference must be an exact document identifier.`);
    } else {
      drillReference = record.drillReference;
    }
  }

  const coachingPoints: string[] = [];
  if (!Array.isArray(record.coachingPoints) || record.coachingPoints.length > 10) {
    errors.push(`${path}.coachingPoints must be an array with at most 10 items.`);
  } else {
    record.coachingPoints.forEach((point, index) => {
      const parsed = readBoundedText(point, 300, true);
      if (parsed === null) errors.push(`${path}.coachingPoints[${index}] is invalid.`);
      else coachingPoints.push(parsed);
    });
  }

  if (
    !isBlockType(record.blockType) ||
    title === null ||
    !isBoundedInteger(record.durationMinutes, 1, 180) ||
    !Array.isArray(record.coachingPoints) ||
    record.coachingPoints.length > 10 ||
    coachingPoints.length !== record.coachingPoints.length ||
    (record.drillReference !== undefined && drillReference === undefined)
  ) {
    return null;
  }

  return {
    blockType: record.blockType,
    title,
    durationMinutes: record.durationMinutes,
    ...(drillReference ? { drillReference } : {}),
    coachingPoints,
  };
}

function parseSession(
  value: unknown,
  weekStartDate: string,
  path: string,
  errors: string[],
): ProClubTrainingSessionDraft | null {
  const record = asRecord(value);
  if (!record || !hasOnlyFields(record, SESSION_FIELDS)) {
    errors.push(`${path} must contain only canonical training-session fields.`);
    return null;
  }

  const location = readBoundedText(record.location, 200, true);
  const objective = readBoundedText(record.objective, 500, true);

  if (!isStrictDate(record.sessionDate)) errors.push(`${path}.sessionDate must be a strict calendar date.`);
  else if (!isSessionDateInWeek(record.sessionDate, weekStartDate)) errors.push(`${path}.sessionDate must fall inside the plan week.`);
  if (!isStrictTime(record.startTime)) errors.push(`${path}.startTime is invalid.`);
  if (location === null) errors.push(`${path}.location is invalid.`);
  if (objective === null) errors.push(`${path}.objective is invalid.`);
  if (!isPhaseOfPlay(record.phaseOfPlay)) errors.push(`${path}.phaseOfPlay is invalid.`);
  if (!isPlannedLoad(record.plannedLoad)) errors.push(`${path}.plannedLoad is invalid.`);
  if (!isBoundedInteger(record.durationMinutes, 15, 360)) {
    errors.push(`${path}.durationMinutes must be an integer from 15 to 360.`);
  }

  const blocks: ProClubTrainingBlockDraft[] = [];
  if (!Array.isArray(record.blocks) || record.blocks.length < 1 || record.blocks.length > 12) {
    errors.push(`${path}.blocks must contain from 1 to 12 blocks.`);
  } else {
    record.blocks.forEach((block, index) => {
      const parsed = parseBlock(block, `${path}.blocks[${index}]`, errors);
      if (parsed) blocks.push(parsed);
    });
  }

  const blockDuration = blocks.reduce((sum, block) => sum + block.durationMinutes, 0);
  if (isBoundedInteger(record.durationMinutes, 15, 360) && blocks.length > 0 && blockDuration > record.durationMinutes) {
    errors.push(`${path} block duration total cannot exceed session duration.`);
  }

  if (
    !isStrictDate(record.sessionDate) ||
    !isSessionDateInWeek(record.sessionDate, weekStartDate) ||
    !isStrictTime(record.startTime) ||
    location === null ||
    objective === null ||
    !isPhaseOfPlay(record.phaseOfPlay) ||
    !isPlannedLoad(record.plannedLoad) ||
    !isBoundedInteger(record.durationMinutes, 15, 360) ||
    !Array.isArray(record.blocks) ||
    record.blocks.length < 1 ||
    record.blocks.length > 12 ||
    blocks.length !== record.blocks.length ||
    blockDuration > record.durationMinutes
  ) {
    return null;
  }

  return {
    sessionDate: record.sessionDate,
    startTime: record.startTime,
    location,
    objective,
    phaseOfPlay: record.phaseOfPlay,
    plannedLoad: record.plannedLoad,
    durationMinutes: record.durationMinutes,
    blocks,
  };
}

export function parseProClubWeeklyTrainingDraft(value: unknown): ProClubWeeklyTrainingParseResult {
  const errors: string[] = [];
  const record = asRecord(value);
  if (!record || !hasOnlyFields(record, PLAN_FIELDS)) {
    return { state: "INVALID", errors: ["Weekly training plan must contain only canonical plan fields."] };
  }

  if (!isValidDocumentIdentifier(record.clubId)) errors.push("clubId must be an exact document identifier.");
  if (!isValidDocumentIdentifier(record.authorUid)) errors.push("authorUid must be an exact document identifier.");
  if (!isStrictDate(record.weekStartDate)) errors.push("weekStartDate must be a strict calendar date.");

  const squadLabel = readBoundedText(record.squadLabel, 100, true);
  const mainObjective = readBoundedText(record.mainObjective, 500, true);
  const secondaryObjective = readBoundedText(record.secondaryObjective, 500, false);
  const headCoachNote = readBoundedText(record.headCoachNote, 2_000, false);
  const technicalDirectorNote = readBoundedText(record.technicalDirectorNote, 2_000, false);

  if (squadLabel === null) errors.push("squadLabel is invalid.");
  if (mainObjective === null) errors.push("mainObjective is invalid.");
  if (secondaryObjective === null) errors.push("secondaryObjective is invalid.");
  if (headCoachNote === null) errors.push("headCoachNote is invalid.");
  if (technicalDirectorNote === null) errors.push("technicalDirectorNote is invalid.");

  const sessions: ProClubTrainingSessionDraft[] = [];
  if (!Array.isArray(record.sessions) || record.sessions.length < 1 || record.sessions.length > 14) {
    errors.push("sessions must contain from 1 to 14 training sessions.");
  } else if (isStrictDate(record.weekStartDate)) {
    const seenSlots = new Set<string>();
    record.sessions.forEach((session, index) => {
      const parsed = parseSession(session, record.weekStartDate as string, `sessions[${index}]`, errors);
      if (!parsed) return;
      const slot = `${parsed.sessionDate}T${parsed.startTime}`;
      if (seenSlots.has(slot)) {
        errors.push(`sessions[${index}] duplicates another session date/time slot.`);
        return;
      }
      seenSlots.add(slot);
      sessions.push(parsed);
    });
  }

  if (errors.length > 0) return { state: "INVALID", errors };

  return {
    state: "VALID",
    value: {
      clubId: record.clubId as string,
      authorUid: record.authorUid as string,
      weekStartDate: record.weekStartDate as string,
      squadLabel: squadLabel as string,
      mainObjective: mainObjective as string,
      ...(secondaryObjective ? { secondaryObjective } : {}),
      ...(headCoachNote ? { headCoachNote } : {}),
      ...(technicalDirectorNote ? { technicalDirectorNote } : {}),
      sessions,
    },
  };
}

export function canCreateProClubWeeklyTrainingPlan(input: {
  actorUid: unknown;
  actorRole: unknown;
  authority: ProClubTechnicalAuthorityResolution;
}): boolean {
  if (!isValidDocumentIdentifier(input.actorUid) || !isProClubStaffRole(input.actorRole) || input.authority.state !== "FOUND") {
    return false;
  }
  return resolveProClubTechnicalCapabilities({
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    authority: input.authority,
  }).canCreateTrainingPlan;
}

function isWorkflowAction(value: unknown): value is ProClubWeeklyTrainingWorkflowAction {
  return typeof value === "string" && WORKFLOW_ACTIONS.has(value as ProClubWeeklyTrainingWorkflowAction);
}

function denied(
  action: ProClubWeeklyTrainingWorkflowAction | null,
  reason: ProClubWeeklyTrainingWorkflowDenialReason,
): ProClubWeeklyTrainingWorkflowDecision {
  return { allowed: false, action, reason };
}

function allowed(
  context: ProClubWeeklyTrainingBoundContext,
  action: ProClubWeeklyTrainingWorkflowAction,
  fromStatus: ProClubTechnicalWorkStatus,
  toStatus: ProClubTechnicalWorkStatus,
  authorityAction: ProClubTechnicalAuthorityAction,
): ProClubWeeklyTrainingWorkflowDecision {
  return { allowed: true, ...context, action, fromStatus, toStatus, authorityAction };
}

export function resolveProClubWeeklyTrainingWorkflow(input: {
  actorUid: unknown;
  actorRole: unknown;
  authorUid: unknown;
  currentStatus: unknown;
  authority: ProClubTechnicalAuthorityResolution;
  action: unknown;
}): ProClubWeeklyTrainingWorkflowDecision {
  const action = isWorkflowAction(input.action) ? input.action : null;
  if (
    !action ||
    !isValidDocumentIdentifier(input.actorUid) ||
    !isValidDocumentIdentifier(input.authorUid) ||
    !isProClubStaffRole(input.actorRole) ||
    !isProClubTechnicalWorkStatus(input.currentStatus)
  ) {
    return denied(action, "INVALID_INPUT");
  }
  if (input.authority.state !== "FOUND") return denied(action, "AUTHORITY_UNRESOLVED");

  const context: ProClubWeeklyTrainingBoundContext = {
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    authorUid: input.authorUid,
    technicalAuthorityUid: input.authority.authorityUid,
    technicalAuthorityRole: input.authority.authorityRole,
  };
  const capabilities = resolveProClubTechnicalCapabilities({
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    authority: input.authority,
  });
  const authorityAction = resolveProClubTechnicalAuthorityAction({
    actorUid: input.actorUid,
    authorUid: input.authorUid,
    authority: input.authority,
  });
  const actorIsAuthor = input.actorUid === input.authorUid;
  const actorIsExactAuthority =
    input.authority.authorityUid === input.actorUid && input.authority.authorityRole === input.actorRole;

  if (action === "EDIT") {
    const authorMayEdit =
      actorIsAuthor &&
      capabilities.canEditTrainingPlan &&
      (input.currentStatus === "DRAFT" || input.currentStatus === "NEEDS_REVISION");
    const authorityTdMayCoAuthor =
      !actorIsAuthor &&
      actorIsExactAuthority &&
      input.actorRole === "TECHNICAL_DIRECTOR" &&
      capabilities.canCoAuthorTrainingPlan &&
      (input.currentStatus === "DRAFT" || input.currentStatus === "SUBMITTED" || input.currentStatus === "IN_REVIEW");

    if (authorMayEdit || authorityTdMayCoAuthor) {
      return allowed(context, action, input.currentStatus, input.currentStatus, authorityAction);
    }
    return denied(
      action,
      input.currentStatus === "APPROVED" || input.currentStatus === "PUBLISHED"
        ? "INVALID_STATUS_FOR_ACTION"
        : "NOT_PERMITTED",
    );
  }

  if (action === "SUBMIT") {
    if (!actorIsAuthor || !capabilities.canSubmitTechnicalWork) return denied(action, "NOT_PERMITTED");
    if (authorityAction === "PUBLISH_OWN_WORK") return denied(action, "SELF_WORK_MUST_PUBLISH");
    if (!canTransitionProClubTechnicalWorkStatus(input.currentStatus, "SUBMITTED")) {
      return denied(action, "INVALID_STATUS_FOR_ACTION");
    }
    return allowed(context, action, input.currentStatus, "SUBMITTED", authorityAction);
  }

  if (action === "PUBLISH") {
    if (authorityAction !== "PUBLISH_OWN_WORK" || !capabilities.canPublishOwnTechnicalWork) {
      return denied(action, "NOT_PERMITTED");
    }
    if (!canTransitionProClubTechnicalWorkStatus(input.currentStatus, "PUBLISHED")) {
      return denied(action, "INVALID_STATUS_FOR_ACTION");
    }
    return allowed(context, action, input.currentStatus, "PUBLISHED", authorityAction);
  }

  if (
    authorityAction !== "REVIEW_AND_APPROVE" ||
    !actorIsExactAuthority ||
    !capabilities.canReviewTechnicalWork
  ) {
    return denied(action, "NOT_PERMITTED");
  }

  const targetStatus: ProClubTechnicalWorkStatus =
    action === "BEGIN_REVIEW"
      ? "IN_REVIEW"
      : action === "REQUEST_REVISION"
        ? "NEEDS_REVISION"
        : "APPROVED";

  if (action === "APPROVE" && !capabilities.canApproveSubmittedWork) return denied(action, "NOT_PERMITTED");
  if (!canTransitionProClubTechnicalWorkStatus(input.currentStatus, targetStatus)) {
    return denied(action, "INVALID_STATUS_FOR_ACTION");
  }
  return allowed(context, action, input.currentStatus, targetStatus, authorityAction);
}

function isOffsetAwareIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|([+-])(\d{2}):(\d{2}))$/,
  );
  if (!match) return false;

  const [, year, month, day, hour, minute, second, , zone, , offsetHour, offsetMinute] = match;
  if (!isStrictDate(`${year}-${month}-${day}`)) return false;
  if (!isBoundedInteger(Number(hour), 0, 23)) return false;
  if (!isBoundedInteger(Number(minute), 0, 59)) return false;
  if (!isBoundedInteger(Number(second), 0, 59)) return false;
  if (zone !== "Z") {
    if (!isBoundedInteger(Number(offsetHour), 0, 23)) return false;
    if (!isBoundedInteger(Number(offsetMinute), 0, 59)) return false;
  }
  return true;
}

export function buildProClubWeeklyTrainingActionProvenance(input: {
  decision: ProClubWeeklyTrainingWorkflowDecision;
  occurredAt: unknown;
}): ProClubWeeklyTrainingActionProvenance | null {
  if (!input.decision.allowed || !isOffsetAwareIsoTimestamp(input.occurredAt)) return null;

  return {
    actorUid: input.decision.actorUid,
    actorRole: input.decision.actorRole,
    authorUid: input.decision.authorUid,
    action: input.decision.action,
    fromStatus: input.decision.fromStatus,
    toStatus: input.decision.toStatus,
    technicalAuthorityUid: input.decision.technicalAuthorityUid,
    technicalAuthorityRole: input.decision.technicalAuthorityRole,
    occurredAt: input.occurredAt,
  };
}
