export const RESOLUTION_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CANDIDATE_NOT_FOUND: "CANDIDATE_NOT_FOUND",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ResolutionErrorCode =
  (typeof RESOLUTION_ERROR_CODES)[keyof typeof RESOLUTION_ERROR_CODES];

export class ProClubStaffCandidateResolutionError extends Error {
  constructor(
    readonly code: ResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProClubStaffCandidateResolutionError";
  }
}

export interface ResolveStaffCandidateRequestInput {
  clubId: string;
  email: string;
}

export interface ResolvedStaffCandidate {
  targetUid: string;
  email: string;
  displayName: string | null;
}

const DOCUMENT_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidDocumentIdentifier(value: unknown): value is string {
  return typeof value === "string" && DOCUMENT_ID_REGEX.test(value);
}

// RFC 5322 compliant standard email validation regex
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function normalizeAndValidateEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProClubStaffCandidateResolutionError(
      RESOLUTION_ERROR_CODES.INVALID_REQUEST,
      "Email must be a string",
    );
  }

  const trimmed = value.trim().toLowerCase();

  if (trimmed.length === 0 || trimmed.length > 254) {
    throw new ProClubStaffCandidateResolutionError(
      RESOLUTION_ERROR_CODES.INVALID_REQUEST,
      "Email length is invalid",
    );
  }

  // Reject partial search / wildcards / multi-values
  if (
    trimmed.includes("*") ||
    trimmed.includes("?") ||
    trimmed.includes(",") ||
    trimmed.includes(";") ||
    trimmed.includes(" ")
  ) {
    throw new ProClubStaffCandidateResolutionError(
      RESOLUTION_ERROR_CODES.INVALID_REQUEST,
      "Wildcard or partial email searches are forbidden",
    );
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    throw new ProClubStaffCandidateResolutionError(
      RESOLUTION_ERROR_CODES.INVALID_REQUEST,
      "Invalid email format",
    );
  }

  return trimmed;
}

export function validateAndNormalizeCandidateRequest(
  body: unknown,
): ResolveStaffCandidateRequestInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProClubStaffCandidateResolutionError(
      RESOLUTION_ERROR_CODES.INVALID_REQUEST,
      "Request body must be a JSON object",
    );
  }

  const record = body as Record<string, unknown>;

  const allowedKeys = new Set(["clubId", "email"]);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.INVALID_REQUEST,
        `Unexpected key '${key}' in request body`,
      );
    }
  }

  const clubId = record.clubId;
  if (!isValidDocumentIdentifier(clubId)) {
    throw new ProClubStaffCandidateResolutionError(
      RESOLUTION_ERROR_CODES.INVALID_REQUEST,
      "Invalid or missing clubId",
    );
  }

  const email = normalizeAndValidateEmail(record.email);

  return {
    clubId,
    email,
  };
}
