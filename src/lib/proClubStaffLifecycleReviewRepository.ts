import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";
import { isValidDocumentIdentifier } from "./proClubModel";
import {
  parseProClubStaffLifecycleReviewResponseV1,
  type ProClubStaffLifecycleReviewResponseV1,
} from "./proClubStaffLifecycleReviewModel";

export type ProClubStaffLifecycleReviewClientErrorCode =
  | "AUTH_CHANGED"
  | "REVIEWER_REQUIRED"
  | "INVALID_DATA"
  | "UNAVAILABLE"
  | "NETWORK";

export class ProClubStaffLifecycleReviewClientError extends Error {
  constructor(readonly code: ProClubStaffLifecycleReviewClientErrorCode) {
    super(code);
    this.name = "ProClubStaffLifecycleReviewClientError";
  }
}

export function proClubStaffLifecycleReviewErrorMessage(error: unknown): string {
  if (!(error instanceof ProClubStaffLifecycleReviewClientError)) {
    return "We could not load staff history. Check your connection and try again.";
  }
  switch (error.code) {
    case "AUTH_CHANGED":
      return "Your sign-in changed. Sign in again before reviewing staff history.";
    case "REVIEWER_REQUIRED":
      return "Only an active club owner or administrator can review staff history.";
    case "INVALID_DATA":
      return "Staff history could not be verified. Refresh before continuing.";
    case "UNAVAILABLE":
      return "Staff history is unavailable right now. Please try again later.";
    default:
      return "We could not load staff history. Check your connection and try again.";
  }
}

export type LoadProClubStaffLifecycleReviewCallerV1 = (
  data: { clubId: string },
) => Promise<{ data: unknown }>;

function normalizeFunctionCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code !== "string") return "";
  return code.startsWith("functions/") ? code.slice("functions/".length) : code;
}

function mapCallableError(error: unknown): ProClubStaffLifecycleReviewClientError {
  switch (normalizeFunctionCode(error)) {
    case "unauthenticated":
      return new ProClubStaffLifecycleReviewClientError("AUTH_CHANGED");
    case "permission-denied":
      return new ProClubStaffLifecycleReviewClientError("REVIEWER_REQUIRED");
    case "invalid-argument":
      return new ProClubStaffLifecycleReviewClientError("INVALID_DATA");
    case "failed-precondition":
    case "resource-exhausted":
    case "internal":
    case "unavailable":
      return new ProClubStaffLifecycleReviewClientError("UNAVAILABLE");
    default:
      return new ProClubStaffLifecycleReviewClientError("NETWORK");
  }
}

export const defaultLoadProClubStaffLifecycleReviewCallerV1: LoadProClubStaffLifecycleReviewCallerV1 = async (data) => {
  const callable = httpsCallable<typeof data, unknown>(functions, "loadProClubStaffLifecycleReviewV1");
  return await callable(data);
};

export function createProClubStaffLifecycleReviewRepository(
  getActorUid: () => string | null,
  caller: LoadProClubStaffLifecycleReviewCallerV1 = defaultLoadProClubStaffLifecycleReviewCallerV1,
) {
  function assertActor(expectedUid: string): void {
    if (!isValidDocumentIdentifier(expectedUid) || getActorUid() !== expectedUid) {
      throw new ProClubStaffLifecycleReviewClientError("AUTH_CHANGED");
    }
  }

  return {
    async loadReview(clubId: string, expectedUid: string): Promise<ProClubStaffLifecycleReviewResponseV1> {
      assertActor(expectedUid);
      if (!isValidDocumentIdentifier(clubId)) {
        throw new ProClubStaffLifecycleReviewClientError("INVALID_DATA");
      }
      let result: { data: unknown };
      try {
        result = await caller({ clubId });
      } catch (error) {
        assertActor(expectedUid);
        throw mapCallableError(error);
      }
      assertActor(expectedUid);
      try {
        return parseProClubStaffLifecycleReviewResponseV1(result.data, clubId);
      } catch {
        throw new ProClubStaffLifecycleReviewClientError("INVALID_DATA");
      }
    },
  };
}

export const proClubStaffLifecycleReviewRepository = createProClubStaffLifecycleReviewRepository(
  () => auth.currentUser?.uid ?? null,
);
