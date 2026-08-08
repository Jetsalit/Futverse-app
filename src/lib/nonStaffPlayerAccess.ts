import type { User } from "../contexts/AuthContext";

export type LinkedPlayerLookup =
  | { kind: "PLAYER_QUERY"; academyId: string; uid: string }
  | { kind: "PARENT_DOCUMENT"; academyId: string; playerId: string }
  | { kind: "UNAVAILABLE" };

function exactIdentifier(value: string | null | undefined): string | null {
  if (!value || value.trim() !== value || value.includes("/")) return null;
  return value;
}

export function linkedPlayerLookupForUser(
  user: Pick<User, "id" | "uid" | "role" | "academyId" | "linkedPlayerId">,
): LinkedPlayerLookup {
  const academyId = exactIdentifier(user.academyId);
  if (!academyId) return { kind: "UNAVAILABLE" };

  if (user.role === "PLAYER") {
    const uid = exactIdentifier(user.uid || user.id);
    return uid ? { kind: "PLAYER_QUERY", academyId, uid } : { kind: "UNAVAILABLE" };
  }

  if (user.role === "PARENT") {
    const playerId = exactIdentifier(user.linkedPlayerId);
    return playerId
      ? { kind: "PARENT_DOCUMENT", academyId, playerId }
      : { kind: "UNAVAILABLE" };
  }

  return { kind: "UNAVAILABLE" };
}
