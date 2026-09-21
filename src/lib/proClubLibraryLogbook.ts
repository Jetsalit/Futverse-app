import type { ProClubStaffRole } from "../types/ProClub";
import type { Drill } from "./drillDataModel";
import type { ProClubStaffSubmissionRecord } from "./proClubStaffSubmissions";

export const PRO_CLUB_LIBRARY_LOGBOOK_ROLES = [
  "TECHNICAL_DIRECTOR",
  "HEAD_COACH",
  "ASSISTANT_COACH",
  "GK_COACH",
  "FITNESS_COACH",
  "ANALYST",
  "PHYSIO",
] as const;

export type ProClubLibraryLogbookRole =
  (typeof PRO_CLUB_LIBRARY_LOGBOOK_ROLES)[number];

export const PRO_CLUB_LIBRARY_LOGBOOK_ROLE_LABELS: Readonly<
  Record<ProClubLibraryLogbookRole, string>
> = {
  TECHNICAL_DIRECTOR: "Technical Director",
  HEAD_COACH: "Head Coach",
  ASSISTANT_COACH: "Assistant Coach",
  GK_COACH: "GK Coach",
  FITNESS_COACH: "Fitness Coach",
  ANALYST: "Analyst",
  PHYSIO: "Physio",
};

export const PRO_CLUB_LIBRARY_LOGBOOK_VIEWS = [
  "MY_LOGBOOK",
  "TEAM_SHARED",
  "CLUB_LIBRARY",
  "FAVOURITES",
  "RECENT",
] as const;

export type ProClubLibraryLogbookView =
  (typeof PRO_CLUB_LIBRARY_LOGBOOK_VIEWS)[number];

export const PRO_CLUB_LIBRARY_LOGBOOK_VIEW_LABELS: Readonly<
  Record<ProClubLibraryLogbookView, string>
> = {
  MY_LOGBOOK: "My Logbook",
  TEAM_SHARED: "Team Shared",
  CLUB_LIBRARY: "Club Library",
  FAVOURITES: "Favourites",
  RECENT: "Recent",
};

export type ProClubLibraryLogbookRoleFilter =
  | "ALL"
  | ProClubLibraryLogbookRole;

export type ProClubLibraryLogbookEntrySource =
  | "DRILL"
  | "STAFF_SUBMISSION";

export interface ProClubLibraryLogbookEntry {
  readonly key: string;
  readonly source: ProClubLibraryLogbookEntrySource;
  readonly referenceId: string;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly ownerUid: string;
  readonly staffRole: ProClubLibraryLogbookRole | null;
  readonly status: string | null;
  readonly isShared: boolean;
  readonly isFavourite: boolean;
  readonly recency: number;
  readonly targetPlanId: string | null;
  readonly targetSessionDate: string | null;
}

export interface ComposeProClubLibraryLogbookEntriesInput {
  readonly drills: readonly Drill[];
  readonly submissions: readonly ProClubStaffSubmissionRecord[];
  readonly actorUid: string;
  readonly view: ProClubLibraryLogbookView;
  readonly roleFilter?: ProClubLibraryLogbookRoleFilter;
  readonly favouriteKeys?: readonly string[];
  readonly query?: string;
}

export function isProClubLibraryLogbookRole(
  role: ProClubStaffRole | null | undefined,
): role is ProClubLibraryLogbookRole {
  return PRO_CLUB_LIBRARY_LOGBOOK_ROLES.some((candidate) => candidate === role);
}

export function proClubLibraryLogbookEntryKey(
  source: ProClubLibraryLogbookEntrySource,
  referenceId: string,
): string {
  return `${source}:${referenceId}`;
}

function toEpochMillis(value: unknown): number {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (!value || typeof value !== "object") return 0;

  const candidate = value as {
    toMillis?: () => number;
    seconds?: unknown;
    nanoseconds?: unknown;
  };

  if (typeof candidate.toMillis === "function") {
    try {
      const millis = candidate.toMillis();
      return Number.isFinite(millis) ? millis : 0;
    } catch {
      return 0;
    }
  }

  if (typeof candidate.seconds === "number") {
    const nanos =
      typeof candidate.nanoseconds === "number" ? candidate.nanoseconds : 0;
    return candidate.seconds * 1000 + nanos / 1_000_000;
  }

  return 0;
}

function drillRecency(drill: Drill): number {
  const legacy = drill as Drill & { createdAt?: unknown; updatedAt?: unknown };
  return (
    toEpochMillis(legacy.updatedAt) ||
    toEpochMillis(legacy.createdAt) ||
    toEpochMillis(drill.date)
  );
}

function drillSummary(drill: Drill): string {
  return (
    drill.description?.trim() ||
    drill.coachingPoints?.trim() ||
    drill.trainingMethod?.trim() ||
    "Existing FutVerse drill asset"
  );
}

function makeDrillEntry(
  drill: Drill,
  favouriteKeys: ReadonlySet<string>,
): ProClubLibraryLogbookEntry {
  const key = proClubLibraryLogbookEntryKey("DRILL", drill.id);
  return {
    key,
    source: "DRILL",
    referenceId: drill.id,
    title: drill.title,
    summary: drillSummary(drill),
    category: drill.category,
    ownerUid: drill.created_by,
    staffRole: null,
    status: drill.is_shared ? "SHARED" : "PRIVATE",
    isShared: drill.is_shared,
    isFavourite: favouriteKeys.has(key),
    recency: drillRecency(drill),
    targetPlanId: null,
    targetSessionDate: null,
  };
}

function makeSubmissionEntry(
  submission: ProClubStaffSubmissionRecord,
  favouriteKeys: ReadonlySet<string>,
): ProClubLibraryLogbookEntry {
  const key = proClubLibraryLogbookEntryKey(
    "STAFF_SUBMISSION",
    submission.submissionId,
  );
  return {
    key,
    source: "STAFF_SUBMISSION",
    referenceId: submission.submissionId,
    title: submission.title,
    summary: submission.summary,
    category: submission.workType,
    ownerUid: submission.authorUid,
    staffRole: submission.authorRole,
    status: submission.status,
    isShared:
      submission.status === "SUBMITTED" ||
      submission.status === "IN_REVIEW" ||
      submission.status === "APPROVED",
    isFavourite: favouriteKeys.has(key),
    recency: toEpochMillis(submission.updatedAt),
    targetPlanId: submission.targetPlanId,
    targetSessionDate: submission.targetSessionDate,
  };
}

function isEntryVisibleToActor(
  entry: ProClubLibraryLogbookEntry,
  actorUid: string,
): boolean {
  if (entry.source === "DRILL") {
    return entry.ownerUid === actorUid || entry.isShared;
  }

  // Staff Submissions must already be scoped by the existing repository
  // authority contract before they reach this presentation adapter.
  return true;
}

function matchesView(
  entry: ProClubLibraryLogbookEntry,
  view: ProClubLibraryLogbookView,
  actorUid: string,
): boolean {
  switch (view) {
    case "MY_LOGBOOK":
      return entry.ownerUid === actorUid;
    case "TEAM_SHARED":
      return entry.isShared;
    case "CLUB_LIBRARY":
      return (
        (entry.source === "DRILL" && entry.isShared) ||
        (entry.source === "STAFF_SUBMISSION" && entry.status === "APPROVED")
      );
    case "FAVOURITES":
      return entry.isFavourite;
    case "RECENT":
      return true;
  }
}

function matchesRoleFilter(
  entry: ProClubLibraryLogbookEntry,
  roleFilter: ProClubLibraryLogbookRoleFilter,
): boolean {
  if (roleFilter === "ALL") return true;

  // Existing drills do not have a canonical staff-role field. Keep them
  // role-neutral rather than inventing role metadata.
  return entry.staffRole === null || entry.staffRole === roleFilter;
}

function matchesQuery(
  entry: ProClubLibraryLogbookEntry,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;

  const roleLabel = entry.staffRole
    ? PRO_CLUB_LIBRARY_LOGBOOK_ROLE_LABELS[entry.staffRole]
    : "";

  return [
    entry.title,
    entry.summary,
    entry.category,
    entry.referenceId,
    entry.status ?? "",
    roleLabel,
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

export function composeProClubLibraryLogbookEntries(
  input: ComposeProClubLibraryLogbookEntriesInput,
): ProClubLibraryLogbookEntry[] {
  const favouriteKeys = new Set(input.favouriteKeys ?? []);
  const roleFilter = input.roleFilter ?? "ALL";

  const entries = [
    ...input.drills.map((drill) => makeDrillEntry(drill, favouriteKeys)),
    ...input.submissions.map((submission) =>
      makeSubmissionEntry(submission, favouriteKeys),
    ),
  ].filter(
    (entry) =>
      isEntryVisibleToActor(entry, input.actorUid) &&
      matchesView(entry, input.view, input.actorUid) &&
      matchesRoleFilter(entry, roleFilter) &&
      matchesQuery(entry, input.query ?? ""),
  );

  return entries.sort((left, right) => {
    if (right.recency !== left.recency) return right.recency - left.recency;
    return left.title.localeCompare(right.title);
  });
}
