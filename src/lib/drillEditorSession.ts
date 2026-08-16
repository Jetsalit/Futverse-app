const DRILL_EDITOR_ID_KEY = "futverse:drill-editor:id";

export function setDrillEditorId(drillId: string): void {
  if (!drillId || drillId.includes("/")) {
    throw new Error("Invalid drill editor document ID.");
  }
  sessionStorage.setItem(DRILL_EDITOR_ID_KEY, drillId);
}

export function getDrillEditorId(): string | null {
  try {
    const value = sessionStorage.getItem(DRILL_EDITOR_ID_KEY);
    return value && !value.includes("/") ? value : null;
  } catch {
    return null;
  }
}

export function clearDrillEditorId(): void {
  try {
    sessionStorage.removeItem(DRILL_EDITOR_ID_KEY);
  } catch {
    // Session storage is best-effort editor navigation state only.
  }
}
