import type { UserRole } from "../contexts/AuthContext";

export interface NonStaffPlayerAccessInput {
  id?: string;
  uid?: string;
  role: UserRole;
  academyId?: string | null;
  linkedPlayerId?: string | null;
}

export type NonStaffAccessLookupResult =
  | { type: "PLAYER_QUERY"; academyId: string; uid: string }
  | { type: "PARENT_DOCUMENT"; academyId: string; playerId: string }
  | { type: "UNAVAILABLE" };

function isValidIdentifier(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value) return false;
  if (value.trim() !== value) return false;
  if (value.includes("/")) return false;
  return true;
}

export function linkedPlayerLookupForUser(
  user?: NonStaffPlayerAccessInput | null,
): NonStaffAccessLookupResult {
  if (!user) return { type: "UNAVAILABLE" };

  const academyId = user.academyId;
  if (!isValidIdentifier(academyId)) {
    return { type: "UNAVAILABLE" };
  }

  if (user.role === "PLAYER") {
    const uid = user.uid || user.id;
    if (!isValidIdentifier(uid)) {
      return { type: "UNAVAILABLE" };
    }
    return {
      type: "PLAYER_QUERY",
      academyId,
      uid,
    };
  }

  if (user.role === "PARENT") {
    const linkedPlayerId = user.linkedPlayerId;
    if (!isValidIdentifier(linkedPlayerId)) {
      return { type: "UNAVAILABLE" };
    }
    return {
      type: "PARENT_DOCUMENT",
      academyId,
      playerId: linkedPlayerId,
    };
  }

  return { type: "UNAVAILABLE" };
}
