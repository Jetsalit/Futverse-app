import { isValidDocumentIdentifier } from "./proClubModel";

const PRO_CLUB_WORKSPACE_SESSION_KEY = "futverse.proClub.workspace.v1";

function sessionStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readProClubWorkspaceSession(): string | null {
  const storage = sessionStorageOrNull();
  if (!storage) return null;

  try {
    const clubId = storage.getItem(PRO_CLUB_WORKSPACE_SESSION_KEY);
    return isValidDocumentIdentifier(clubId) ? clubId : null;
  } catch {
    return null;
  }
}

export function rememberProClubWorkspaceSession(clubId: string): boolean {
  if (!isValidDocumentIdentifier(clubId)) return false;

  const storage = sessionStorageOrNull();
  if (!storage) return false;

  try {
    storage.setItem(PRO_CLUB_WORKSPACE_SESSION_KEY, clubId);
    return true;
  } catch {
    return false;
  }
}

export function clearProClubWorkspaceSession(): void {
  const storage = sessionStorageOrNull();
  if (!storage) return;

  try {
    storage.removeItem(PRO_CLUB_WORKSPACE_SESSION_KEY);
  } catch {
    // Session persistence is a UX convenience only. Authority never depends on it.
  }
}
