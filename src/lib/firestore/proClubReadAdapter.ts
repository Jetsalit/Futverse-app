import {
  doc,
  getDocFromServer,
} from "firebase/firestore";

import { db } from "../firebase";
import {
  hasActiveProClubMembershipAuthority,
  isValidDocumentIdentifier,
  resolveActiveProClubStaffRole,
  validateProClub,
  validateProClubMembership,
  validateProClubStaffAssignment,
} from "../proClubModel";
import type {
  ProClub,
  ProClubAuthorizationRole,
  ProClubMembership,
  ProClubStaffAssignment,
  ProClubStaffRole,
} from "../../types/ProClub";

export type ProClubReadState =
  | "FOUND"
  | "MISSING"
  | "PERMISSION_DENIED"
  | "INVALID_DATA"
  | "ERROR";

export type ProClubReadResult<T> =
  | { state: "FOUND"; value: T }
  | { state: "MISSING" }
  | { state: "PERMISSION_DENIED"; error: Error }
  | { state: "INVALID_DATA"; error: Error }
  | { state: "ERROR"; error: Error };

export interface ProClubReadDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly data?: unknown;
}

export interface ProClubReadOps {
  readDocument(
    path: readonly string[],
  ): Promise<ProClubReadDocumentSnapshot>;
}

export interface ProClubRecord {
  clubId: string;
  data: ProClub;
}

export interface ProClubMembershipRecord {
  clubId: string;
  uid: string;
  data: ProClubMembership;
}

export interface ProClubStaffAssignmentRecord {
  clubId: string;
  uid: string;
  data: ProClubStaffAssignment;
}

export interface ProClubAuthoritySnapshot {
  clubId: string;
  uid: string;
  club: ProClub;
  membership: ProClubMembership;
  staffAssignment: ProClubStaffAssignment | null;
  hasMembershipAuthority: boolean;
  authorizationRole: ProClubAuthorizationRole | null;
  staffRole: ProClubStaffRole | null;
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(String(error));
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function classifyReadFailure<T>(
  error: unknown,
): ProClubReadResult<T> {
  const normalized = toError(error);
  const code = readErrorCode(error);

  if (
    code === "permission-denied" ||
    code === "firestore/permission-denied"
  ) {
    return {
      state: "PERMISSION_DENIED",
      error: normalized,
    };
  }

  return {
    state: "ERROR",
    error: normalized,
  };
}

function invalidData<T>(
  message: string,
): ProClubReadResult<T> {
  return {
    state: "INVALID_DATA",
    error: new Error(message),
  };
}

function isValidIdentityPair(
  clubId: unknown,
  uid: unknown,
): clubId is string {
  return (
    isValidDocumentIdentifier(clubId) &&
    isValidDocumentIdentifier(uid)
  );
}

function cloneProClub(value: ProClub): ProClub {
  return { ...value };
}

function cloneMembership(
  value: ProClubMembership,
): ProClubMembership {
  return { ...value };
}

function cloneStaffAssignment(
  value: ProClubStaffAssignment,
): ProClubStaffAssignment {
  return { ...value };
}

export const firestoreProClubReadOps: ProClubReadOps = {
  async readDocument(path) {
    const [firstSegment, ...remainingSegments] = path;

    if (
      !firstSegment ||
      !path.every(isValidDocumentIdentifier)
    ) {
      throw new Error(
        "Pro Club Firestore read path must contain exact document path segments.",
      );
    }

    const snapshot = await getDocFromServer(
      doc(
        db,
        firstSegment,
        ...remainingSegments,
      ),
    );

    return {
      id: snapshot.id,
      exists: snapshot.exists(),
      data: snapshot.exists()
        ? snapshot.data()
        : undefined,
    };
  },
};

export async function getProClub(
  clubId: string,
  ops: ProClubReadOps = firestoreProClubReadOps,
): Promise<ProClubReadResult<ProClubRecord>> {
  if (!isValidDocumentIdentifier(clubId)) {
    return invalidData(
      "Invalid Pro Club document identity.",
    );
  }

  let snapshot: ProClubReadDocumentSnapshot;

  try {
    snapshot = await ops.readDocument([
      "proClubs",
      clubId,
    ]);
  } catch (error) {
    return classifyReadFailure(error);
  }

  if (!snapshot.exists) {
    return { state: "MISSING" };
  }

  const raw = snapshot.data;

  if (
    !validateProClub(
      raw,
      {
        clubId,
        documentId: snapshot.id,
      },
    )
  ) {
    return invalidData(
      "Invalid Pro Club document data.",
    );
  }

  return {
    state: "FOUND",
    value: {
      clubId,
      data: cloneProClub(raw),
    },
  };
}

export async function getProClubMembership(
  clubId: string,
  uid: string,
  ops: ProClubReadOps = firestoreProClubReadOps,
): Promise<ProClubReadResult<ProClubMembershipRecord>> {
  if (!isValidIdentityPair(clubId, uid)) {
    return invalidData(
      "Invalid Pro Club membership path identity.",
    );
  }

  let snapshot: ProClubReadDocumentSnapshot;

  try {
    snapshot = await ops.readDocument([
      "proClubs",
      clubId,
      "members",
      uid,
    ]);
  } catch (error) {
    return classifyReadFailure(error);
  }

  if (!snapshot.exists) {
    return { state: "MISSING" };
  }

  const raw = snapshot.data;

  if (
    !validateProClubMembership(
      raw,
      {
        clubId,
        documentClubId: clubId,
        userId: uid,
        documentId: snapshot.id,
      },
    )
  ) {
    return invalidData(
      "Invalid Pro Club membership document data.",
    );
  }

  return {
    state: "FOUND",
    value: {
      clubId,
      uid,
      data: cloneMembership(raw),
    },
  };
}

export async function getProClubStaffAssignment(
  clubId: string,
  uid: string,
  ops: ProClubReadOps = firestoreProClubReadOps,
): Promise<ProClubReadResult<ProClubStaffAssignmentRecord>> {
  if (!isValidIdentityPair(clubId, uid)) {
    return invalidData(
      "Invalid Pro Club staff path identity.",
    );
  }

  let snapshot: ProClubReadDocumentSnapshot;

  try {
    snapshot = await ops.readDocument([
      "proClubs",
      clubId,
      "staff",
      uid,
    ]);
  } catch (error) {
    return classifyReadFailure(error);
  }

  if (!snapshot.exists) {
    return { state: "MISSING" };
  }

  const raw = snapshot.data;

  if (
    !validateProClubStaffAssignment(
      raw,
      {
        clubId,
        documentClubId: clubId,
        userId: uid,
        documentId: snapshot.id,
      },
    )
  ) {
    return invalidData(
      "Invalid Pro Club staff assignment document data.",
    );
  }

  return {
    state: "FOUND",
    value: {
      clubId,
      uid,
      data: cloneStaffAssignment(raw),
    },
  };
}

function forwardNonFound<T>(
  result: Exclude<
    ProClubReadResult<unknown>,
    { state: "FOUND" }
  >,
): ProClubReadResult<T> {
  return result as ProClubReadResult<T>;
}

export async function resolveProClubAuthoritySnapshot(
  clubId: string,
  uid: string,
  ops: ProClubReadOps = firestoreProClubReadOps,
): Promise<ProClubReadResult<ProClubAuthoritySnapshot>> {
  if (!isValidIdentityPair(clubId, uid)) {
    return invalidData(
      "Invalid Pro Club authority snapshot path identity.",
    );
  }

  const clubResult =
    await getProClub(
      clubId,
      ops,
    );

  if (clubResult.state !== "FOUND") {
    return forwardNonFound(clubResult);
  }

  const membershipResult =
    await getProClubMembership(
      clubId,
      uid,
      ops,
    );

  if (membershipResult.state !== "FOUND") {
    return forwardNonFound(membershipResult);
  }

  const club = clubResult.value.data;
  const membership = membershipResult.value.data;

  const clubContext = {
    clubId,
    documentId: clubId,
  };

  const membershipContext = {
    clubId,
    documentClubId: clubId,
    userId: uid,
    documentId: uid,
  };

  const hasMembershipAuthority =
    hasActiveProClubMembershipAuthority(
      club,
      clubContext,
      membership,
      membershipContext,
    );

  if (!hasMembershipAuthority) {
    return {
      state: "FOUND",
      value: {
        clubId,
        uid,
        club: cloneProClub(club),
        membership: cloneMembership(membership),
        staffAssignment: null,
        hasMembershipAuthority: false,
        authorizationRole: null,
        staffRole: null,
      },
    };
  }

  const staffResult =
    await getProClubStaffAssignment(
      clubId,
      uid,
      ops,
    );

  if (staffResult.state === "MISSING") {
    return {
      state: "FOUND",
      value: {
        clubId,
        uid,
        club: cloneProClub(club),
        membership: cloneMembership(membership),
        staffAssignment: null,
        hasMembershipAuthority: true,
        authorizationRole: membership.authorizationRole,
        staffRole: null,
      },
    };
  }

  if (staffResult.state !== "FOUND") {
    return forwardNonFound(staffResult);
  }

  const assignment = staffResult.value.data;

  const assignmentContext = {
    clubId,
    documentClubId: clubId,
    userId: uid,
    documentId: uid,
  };

  const staffRole =
    resolveActiveProClubStaffRole(
      club,
      clubContext,
      membership,
      membershipContext,
      assignment,
      assignmentContext,
    );

  return {
    state: "FOUND",
    value: {
      clubId,
      uid,
      club: cloneProClub(club),
      membership: cloneMembership(membership),
      staffAssignment: cloneStaffAssignment(assignment),
      hasMembershipAuthority: true,
      authorizationRole: membership.authorizationRole,
      staffRole,
    },
  };
}
