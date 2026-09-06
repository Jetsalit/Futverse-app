import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";
import { isValidDocumentIdentifier } from "./proClubModel";
import {
  isReviewerVisibleProClubStaffRosterEntryV1,
  type ProClubStaffRosterEntryV1,
} from "./proClubStaffRosterModel";

export type ProClubStaffRosterClientErrorCode =
  | "AUTH_CHANGED"
  | "REVIEWER_REQUIRED"
  | "UNAVAILABLE"
  | "INVALID_DATA"
  | "NETWORK";

export class ProClubStaffRosterClientError extends Error {
  constructor(readonly code: ProClubStaffRosterClientErrorCode) {
    super(code);
    this.name = "ProClubStaffRosterClientError";
  }
}

export function proClubStaffRosterErrorMessage(error: unknown): string {
  if (!(error instanceof ProClubStaffRosterClientError)) {
    return "We could not load the staff roster. Check your connection and try again.";
  }
  switch (error.code) {
    case "AUTH_CHANGED":
      return "Your sign-in changed. Sign in again before loading the staff roster.";
    case "REVIEWER_REQUIRED":
      return "Only an active club owner or administrator can view the staff roster.";
    case "UNAVAILABLE":
      return "The staff roster is unavailable right now. Refresh and try again.";
    case "INVALID_DATA":
      return "The staff roster could not be verified. Contact FutVerse support before continuing.";
    default:
      return "We could not load the staff roster. Check your connection and try again.";
  }
}

export interface ProClubStaffRosterResponseV1 {
  schemaVersion: 1;
  clubId: string;
  entries: ProClubStaffRosterEntryV1[];
}

export type LoadProClubStaffRosterCallableCaller = (data: {
  clubId: string;
}) => Promise<{ data: unknown }>;

const MAX_ROSTER_ENTRIES_V1 = 200;

function normalizeFunctionCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code !== "string") return "";
  return code.startsWith("functions/") ? code.slice("functions/".length) : code;
}

function mapCallableError(error: unknown): ProClubStaffRosterClientError {
  switch (normalizeFunctionCode(error)) {
    case "unauthenticated":
      return new ProClubStaffRosterClientError("AUTH_CHANGED");
    case "permission-denied":
      return new ProClubStaffRosterClientError("REVIEWER_REQUIRED");
    case "invalid-argument":
      return new ProClubStaffRosterClientError("INVALID_DATA");
    case "failed-precondition":
    case "resource-exhausted":
      return new ProClubStaffRosterClientError("UNAVAILABLE");
    default:
      return new ProClubStaffRosterClientError("NETWORK");
  }
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record);
  if (actualKeys.length !== keys.length || !actualKeys.every((key) => keys.includes(key))) return null;
  return record;
}

export function parseProClubStaffRosterResponseV1(
  value: unknown,
  expectedClubId: string,
): ProClubStaffRosterResponseV1 {
  if (!isValidDocumentIdentifier(expectedClubId)) {
    throw new ProClubStaffRosterClientError("INVALID_DATA");
  }
  const record = exactRecord(value, ["schemaVersion", "clubId", "entries"]);
  if (
    !record ||
    record.schemaVersion !== 1 ||
    record.clubId !== expectedClubId ||
    !Array.isArray(record.entries) ||
    record.entries.length > MAX_ROSTER_ENTRIES_V1
  ) {
    throw new ProClubStaffRosterClientError("INVALID_DATA");
  }

  const seenUserIds = new Set<string>();
  const entries: ProClubStaffRosterEntryV1[] = [];
  for (const rawEntry of record.entries) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      throw new ProClubStaffRosterClientError("INVALID_DATA");
    }
    const userId = (rawEntry as Record<string, unknown>).userId;
    if (!isValidDocumentIdentifier(userId) || seenUserIds.has(userId)) {
      throw new ProClubStaffRosterClientError("INVALID_DATA");
    }
    if (!isReviewerVisibleProClubStaffRosterEntryV1(rawEntry, {
      clubId: expectedClubId,
      documentClubId: expectedClubId,
      userId,
      documentId: userId,
    })) {
      throw new ProClubStaffRosterClientError("INVALID_DATA");
    }
    seenUserIds.add(userId);
    entries.push(rawEntry);
  }

  return {
    schemaVersion: 1,
    clubId: expectedClubId,
    entries,
  };
}

export const defaultLoadProClubStaffRosterCaller: LoadProClubStaffRosterCallableCaller = async (data) => {
  const callable = httpsCallable<typeof data, unknown>(functions, "loadProClubStaffRosterV1");
  return await callable(data);
};

export function createProClubStaffRosterRepository(
  getActorUid: () => string | null,
  caller: LoadProClubStaffRosterCallableCaller = defaultLoadProClubStaffRosterCaller,
) {
  function assertActor(expectedUid: string): void {
    if (!isValidDocumentIdentifier(expectedUid) || getActorUid() !== expectedUid) {
      throw new ProClubStaffRosterClientError("AUTH_CHANGED");
    }
  }

  return {
    async loadRoster(clubId: string, expectedUid: string): Promise<ProClubStaffRosterResponseV1> {
      assertActor(expectedUid);
      if (!isValidDocumentIdentifier(clubId)) {
        throw new ProClubStaffRosterClientError("INVALID_DATA");
      }

      let result: { data: unknown };
      try {
        // UID is deliberately not caller-supplied. The callable derives identity from Firebase Auth.
        result = await caller({ clubId });
      } catch (error) {
        assertActor(expectedUid);
        throw mapCallableError(error);
      }

      assertActor(expectedUid);
      return parseProClubStaffRosterResponseV1(result.data, clubId);
    },
  };
}

export const proClubStaffRosterRepository = createProClubStaffRosterRepository(
  () => auth.currentUser?.uid ?? null,
);
