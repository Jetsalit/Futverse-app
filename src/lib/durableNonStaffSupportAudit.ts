import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { NonStaffSupportRole } from "./superAdminNonStaffSupportModel";
import { isExactActiveSuperAdmin, isExactDocumentId } from "./superAdminSupportModel";

export type PendingNonStaffSupportExitAction =
  | "SUPERADMIN_NONSTAFF_WORK_ENDED"
  | "SUPERADMIN_NONSTAFF_WORK_INVALIDATED"
  | "SUPERADMIN_NONSTAFF_WORK_ABORTED";

export interface PendingNonStaffSupportExitAudit {
  logDocId: string;
  actorUid: string;
  action: PendingNonStaffSupportExitAction;
  academyId: string;
  mode: "WORK_AS_NONSTAFF";
  targetUid: string;
  effectiveRole: NonStaffSupportRole;
  createdAt: number;
}

export interface ActiveNonStaffSupportSessionMarker {
  sessionId: string;
  actorUid: string;
  academyId: string;
  mode: "WORK_AS_NONSTAFF";
  targetUid: string;
  effectiveRole: NonStaffSupportRole;
  startedAt: number;
  tabId: string;
  heartbeatAt: number;
}

export interface NonStaffSupportAuthGuard {
  validate(): void;
}

interface FirestoreDocSnap {
  exists(): boolean;
  data(): unknown;
}

interface FirestoreOps {
  getDocFromServer: (ref: unknown) => Promise<FirestoreDocSnap>;
  setDoc: (ref: unknown, data: Record<string, unknown>) => Promise<void>;
  docRef: (dbInstance: unknown, collectionPath: string, docId: string) => unknown;
  serverTimestamp: () => unknown;
}

export const NONSTAFF_PENDING_AUDIT_KEY_PREFIX =
  "futverse_nonstaff_pending_audit:v1:";
export const NONSTAFF_ACTIVE_SESSION_KEY_PREFIX =
  "futverse_nonstaff_active_session:v1:";
export const NONSTAFF_TAB_ID_KEY = "futverse_nonstaff_support_tab_id";
export const NONSTAFF_EXIT_AUDIT_TIMEOUT_MS = 2000;
export const NONSTAFF_HEARTBEAT_INTERVAL_MS = 10_000;
export const NONSTAFF_STALE_HEARTBEAT_THRESHOLD_MS = 30_000;

let cachedTabId: string | null = null;

const isNonStaffRole = (value: unknown): value is NonStaffSupportRole =>
  value === "PARENT" || value === "PLAYER";

const getStorageKeysByPrefix = (prefix: string, storage: Storage): string[] => {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
};

export function getOrCreateNonStaffTabId(): string {
  if (cachedTabId) return cachedTabId;
  try {
    let tabId = sessionStorage.getItem(NONSTAFF_TAB_ID_KEY);
    if (!tabId) {
      tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(NONSTAFF_TAB_ID_KEY, tabId);
    }
    cachedTabId = tabId;
    return tabId;
  } catch {
    cachedTabId = `tab-fallback-${Date.now()}`;
    return cachedTabId;
  }
}

export function _resetNonStaffCachedTabId(): void {
  cachedTabId = null;
}

export function nonStaffPendingAuditStorageKey(
  actorUid: string,
  logDocId: string,
): string {
  return `${NONSTAFF_PENDING_AUDIT_KEY_PREFIX}${actorUid}:${logDocId}`;
}

export function nonStaffActiveSessionStorageKey(
  actorUid: string,
  sessionId: string,
): string {
  return `${NONSTAFF_ACTIVE_SESSION_KEY_PREFIX}${actorUid}:${sessionId}`;
}

export function isValidPendingNonStaffSupportExitAudit(
  record: unknown,
): record is PendingNonStaffSupportExitAudit {
  if (!record || typeof record !== "object") return false;
  const candidate = record as Record<string, unknown>;
  return Boolean(
    isExactDocumentId(candidate.logDocId) &&
      isExactDocumentId(candidate.actorUid) &&
      isExactDocumentId(candidate.academyId) &&
      isExactDocumentId(candidate.targetUid) &&
      candidate.mode === "WORK_AS_NONSTAFF" &&
      isNonStaffRole(candidate.effectiveRole) &&
      (candidate.action === "SUPERADMIN_NONSTAFF_WORK_ENDED" ||
        candidate.action === "SUPERADMIN_NONSTAFF_WORK_INVALIDATED" ||
        candidate.action === "SUPERADMIN_NONSTAFF_WORK_ABORTED") &&
      typeof candidate.createdAt === "number" &&
      Number.isFinite(candidate.createdAt),
  );
}

export function isValidActiveNonStaffSupportSessionMarker(
  marker: unknown,
): marker is ActiveNonStaffSupportSessionMarker {
  if (!marker || typeof marker !== "object") return false;
  const candidate = marker as Record<string, unknown>;
  return Boolean(
    typeof candidate.sessionId === "string" &&
      candidate.sessionId.length > 0 &&
      isExactDocumentId(candidate.actorUid) &&
      isExactDocumentId(candidate.academyId) &&
      isExactDocumentId(candidate.targetUid) &&
      candidate.mode === "WORK_AS_NONSTAFF" &&
      isNonStaffRole(candidate.effectiveRole) &&
      typeof candidate.startedAt === "number" &&
      Number.isFinite(candidate.startedAt) &&
      typeof candidate.heartbeatAt === "number" &&
      Number.isFinite(candidate.heartbeatAt) &&
      typeof candidate.tabId === "string" &&
      candidate.tabId.length > 0,
  );
}

export function savePendingNonStaffSupportExitAudit(
  record: PendingNonStaffSupportExitAudit,
  storage: Storage = localStorage,
): void {
  if (!isValidPendingNonStaffSupportExitAudit(record)) {
    throw new Error("Invalid pending nonstaff support exit audit record.");
  }
  storage.setItem(
    nonStaffPendingAuditStorageKey(record.actorUid, record.logDocId),
    JSON.stringify(record),
  );
}

export function removePendingNonStaffSupportExitAudit(
  actorUid: string,
  logDocId: string,
  storage: Storage = localStorage,
): void {
  storage.removeItem(nonStaffPendingAuditStorageKey(actorUid, logDocId));
}

export function loadPendingNonStaffSupportExitAuditsForActor(
  actorUid: string,
  storage: Storage = localStorage,
): PendingNonStaffSupportExitAudit[] {
  const prefix = `${NONSTAFF_PENDING_AUDIT_KEY_PREFIX}${actorUid}:`;
  const records: PendingNonStaffSupportExitAudit[] = [];
  for (const key of getStorageKeysByPrefix(prefix, storage)) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (
        isValidPendingNonStaffSupportExitAudit(parsed) &&
        parsed.actorUid === actorUid
      ) {
        records.push(parsed);
      }
    } catch {
      // Corrupt records are retained and ignored rather than rewritten.
    }
  }
  return records;
}

export function saveActiveNonStaffSupportSessionMarker(
  marker: ActiveNonStaffSupportSessionMarker,
  storage: Storage = localStorage,
): void {
  if (!isValidActiveNonStaffSupportSessionMarker(marker)) {
    throw new Error("Invalid active nonstaff support session marker.");
  }
  storage.setItem(
    nonStaffActiveSessionStorageKey(marker.actorUid, marker.sessionId),
    JSON.stringify(marker),
  );
}

export function removeActiveNonStaffSupportSessionMarker(
  actorUid: string,
  sessionId: string,
  storage: Storage = localStorage,
): void {
  storage.removeItem(nonStaffActiveSessionStorageKey(actorUid, sessionId));
}

export function loadActiveNonStaffSupportSessionMarkersForActor(
  actorUid: string,
  storage: Storage = localStorage,
): ActiveNonStaffSupportSessionMarker[] {
  const prefix = `${NONSTAFF_ACTIVE_SESSION_KEY_PREFIX}${actorUid}:`;
  const records: ActiveNonStaffSupportSessionMarker[] = [];
  for (const key of getStorageKeysByPrefix(prefix, storage)) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (
        isValidActiveNonStaffSupportSessionMarker(parsed) &&
        parsed.actorUid === actorUid
      ) {
        records.push(parsed);
      }
    } catch {
      // Leave corrupt marker untouched for manual inspection/recovery.
    }
  }
  return records;
}

export function refreshActiveNonStaffSupportSessionHeartbeat(
  actorUid: string,
  sessionId: string,
  storage: Storage = localStorage,
): void {
  const key = nonStaffActiveSessionStorageKey(actorUid, sessionId);
  const raw = storage.getItem(key);
  if (!raw) return;
  try {
    const marker = JSON.parse(raw);
    if (
      isValidActiveNonStaffSupportSessionMarker(marker) &&
      marker.actorUid === actorUid &&
      marker.sessionId === sessionId
    ) {
      marker.heartbeatAt = Date.now();
      storage.setItem(key, JSON.stringify(marker));
    }
  } catch {
    // Leave corrupt marker untouched.
  }
}

export function isNonStaffMarkerStale(
  marker: ActiveNonStaffSupportSessionMarker,
  nowMs: number = Date.now(),
  thresholdMs: number = NONSTAFF_STALE_HEARTBEAT_THRESHOLD_MS,
): boolean {
  return nowMs - marker.heartbeatAt > thresholdMs;
}

export function convertNonStaffOrphanMarkerToClosureRecord(
  marker: ActiveNonStaffSupportSessionMarker,
): PendingNonStaffSupportExitAudit {
  return {
    logDocId: `orphan-${marker.sessionId}`,
    actorUid: marker.actorUid,
    action: "SUPERADMIN_NONSTAFF_WORK_ABORTED",
    academyId: marker.academyId,
    mode: "WORK_AS_NONSTAFF",
    targetUid: marker.targetUid,
    effectiveRole: marker.effectiveRole,
    createdAt: Date.now(),
  };
}

export function recoverStaleNonStaffOrphanMarkers(
  actorUid: string,
  currentTabId: string,
  storage: Storage = localStorage,
  nowMs: number = Date.now(),
): void {
  const markers = loadActiveNonStaffSupportSessionMarkersForActor(actorUid, storage);
  for (const marker of markers) {
    if (marker.tabId === currentTabId || !isNonStaffMarkerStale(marker, nowMs)) {
      continue;
    }

    const key = nonStaffActiveSessionStorageKey(actorUid, marker.sessionId);
    try {
      const freshRaw = storage.getItem(key);
      if (!freshRaw) continue;
      const freshMarker = JSON.parse(freshRaw);
      if (
        isValidActiveNonStaffSupportSessionMarker(freshMarker) &&
        !isNonStaffMarkerStale(freshMarker, Date.now())
      ) {
        continue;
      }
    } catch {
      continue;
    }

    const closure = convertNonStaffOrphanMarkerToClosureRecord(marker);
    try {
      savePendingNonStaffSupportExitAudit(closure, storage);
    } catch {
      continue;
    }
    removeActiveNonStaffSupportSessionMarker(actorUid, marker.sessionId, storage);
  }
}

const STABLE_AUDIT_FIELDS = [
  "action",
  "actorUid",
  "academyId",
  "mode",
  "targetUid",
  "effectiveRole",
] as const;

export function matchesPendingNonStaffAuditPayload(
  snapshotData: unknown,
  record: PendingNonStaffSupportExitAudit,
): boolean {
  if (!snapshotData || typeof snapshotData !== "object" || Array.isArray(snapshotData)) {
    return false;
  }
  const data = snapshotData as Record<string, unknown>;
  return STABLE_AUDIT_FIELDS.every((field) => data[field] === record[field]);
}

const defaultFirestoreOps: FirestoreOps = {
  getDocFromServer: (ref) =>
    getDocFromServer(ref as Parameters<typeof getDocFromServer>[0]),
  setDoc: (ref, data) =>
    setDoc(
      ref as Parameters<typeof setDoc>[0],
      data as Parameters<typeof setDoc>[1],
    ),
  docRef: (dbInstance, collectionPath, docId) =>
    doc(dbInstance as Firestore, collectionPath, docId),
  serverTimestamp: () => serverTimestamp(),
};

export async function performBoundedNonStaffExitAudit(
  dbInstance: unknown,
  record: PendingNonStaffSupportExitAudit,
  options?: {
    timeoutMs?: number;
    storage?: Storage;
    guard?: NonStaffSupportAuthGuard;
    firestoreOps?: FirestoreOps;
  },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? NONSTAFF_EXIT_AUDIT_TIMEOUT_MS;
  const storage = options?.storage ?? localStorage;
  const guard = options?.guard;
  const ops = options?.firestoreOps ?? defaultFirestoreOps;
  const logRef = ops.docRef(dbInstance, "logs", record.logDocId);
  const payload: Record<string, unknown> = {
    action: record.action,
    actorUid: record.actorUid,
    academyId: record.academyId,
    mode: record.mode,
    targetUid: record.targetUid,
    effectiveRole: record.effectiveRole,
    timestamp: ops.serverTimestamp(),
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<"TIMEOUT">((resolve) => {
    timeoutId = setTimeout(() => resolve("TIMEOUT"), timeoutMs);
  });

  try {
    guard?.validate();
    const result = await Promise.race([
      (async () => {
        try {
          await ops.setDoc(logRef, payload);
          return "WRITE_SUCCESS" as const;
        } catch (error: unknown) {
          const code = (error as { code?: string })?.code;
          return code === "permission-denied"
            ? ("PERMISSION_DENIED" as const)
            : ("WRITE_ERROR" as const);
        }
      })(),
      timeoutPromise,
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    if (result === "TIMEOUT" || result === "WRITE_ERROR") return;

    guard?.validate();
    const confirmation = await ops.getDocFromServer(logRef);
    if (
      confirmation.exists() &&
      matchesPendingNonStaffAuditPayload(confirmation.data(), record)
    ) {
      guard?.validate();
      removePendingNonStaffSupportExitAudit(record.actorUid, record.logDocId, storage);
    }
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
    // Durable record remains for replay.
  }
}

export async function replayPendingNonStaffSupportExitAuditsForActor(
  currentActor: unknown,
  dbInstance: unknown,
  options?: {
    storage?: Storage;
    guard?: NonStaffSupportAuthGuard;
    firestoreOps?: FirestoreOps;
  },
): Promise<void> {
  if (!isExactActiveSuperAdmin(currentActor)) return;
  const actor = currentActor as Record<string, unknown>;
  const actorUid = (actor.uid || actor.id) as string;
  if (!isExactDocumentId(actorUid)) return;

  const storage = options?.storage ?? localStorage;
  const guard = options?.guard;
  const ops = options?.firestoreOps ?? defaultFirestoreOps;
  const records = loadPendingNonStaffSupportExitAuditsForActor(actorUid, storage);

  for (const record of records) {
    try {
      guard?.validate();
      const logRef = ops.docRef(dbInstance, "logs", record.logDocId);
      let existing: FirestoreDocSnap;
      try {
        existing = await ops.getDocFromServer(logRef);
      } catch {
        continue;
      }

      if (existing.exists()) {
        if (matchesPendingNonStaffAuditPayload(existing.data(), record)) {
          guard?.validate();
          removePendingNonStaffSupportExitAudit(actorUid, record.logDocId, storage);
        }
        continue;
      }

      guard?.validate();
      const payload: Record<string, unknown> = {
        action: record.action,
        actorUid: record.actorUid,
        academyId: record.academyId,
        mode: record.mode,
        targetUid: record.targetUid,
        effectiveRole: record.effectiveRole,
        timestamp: ops.serverTimestamp(),
      };
      try {
        await ops.setDoc(logRef, payload);
      } catch {
        continue;
      }

      guard?.validate();
      const confirmation = await ops.getDocFromServer(logRef);
      if (
        confirmation.exists() &&
        matchesPendingNonStaffAuditPayload(confirmation.data(), record)
      ) {
        guard?.validate();
        removePendingNonStaffSupportExitAudit(actorUid, record.logDocId, storage);
      }
    } catch {
      return;
    }
  }
}
