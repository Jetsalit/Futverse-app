import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { isExactActiveSuperAdmin, isExactDocumentId } from "./superAdminSupportModel";

// ==========================================
// Types
// ==========================================

export type PendingSupportExitAction =
  | "SUPERADMIN_STAFF_WORK_ENDED"
  | "SUPERADMIN_ACADEMY_WORKSPACE_ENDED"
  | "SUPERADMIN_STAFF_WORK_INVALIDATED"
  | "SUPERADMIN_STAFF_WORK_ABORTED"
  | "SUPERADMIN_ACADEMY_WORKSPACE_ABORTED";

export interface PendingSupportExitAudit {
  logDocId: string;
  actorUid: string;
  action: PendingSupportExitAction;
  academyId: string;
  mode: "ACADEMY_WORKSPACE" | "WORK_AS_STAFF";
  targetUid: string | null;
  effectiveTenantRole: "ADMIN" | "COACH" | null;
  createdAt: number;
}

export interface ActiveSupportSessionMarker {
  sessionId: string;
  actorUid: string;
  academyId: string;
  mode: "ACADEMY_WORKSPACE" | "WORK_AS_STAFF";
  targetUid: string | null;
  tenantRole: "ADMIN" | "COACH" | null;
  startedAt: number;
  tabId: string;
  heartbeatAt: number;
}

export interface AuthGuard {
  validate(): void;
}

export interface FirestoreDocSnap {
  exists(): boolean;
  data(): unknown;
}

export interface FirestoreOps {
  getDocFromServer: (ref: unknown) => Promise<FirestoreDocSnap>;
  setDoc: (ref: unknown, data: Record<string, unknown>) => Promise<void>;
  docRef: (dbInstance: unknown, collectionPath: string, docId: string) => unknown;
  serverTimestamp: () => unknown;
}

// ==========================================
// Constants
// ==========================================

export const PENDING_AUDIT_KEY_PREFIX = "futverse_pending_audit:v2:";
export const ACTIVE_SESSION_KEY_PREFIX = "futverse_active_session:v2:";
export const TAB_ID_KEY = "futverse_support_tab_id";
export const EXIT_AUDIT_TIMEOUT_MS = 2000;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const STALE_HEARTBEAT_THRESHOLD_MS = 30_000;

// ==========================================
// Storage key helpers
// ==========================================

export function pendingAuditStorageKey(actorUid: string, logDocId: string): string {
  return `${PENDING_AUDIT_KEY_PREFIX}${actorUid}:${logDocId}`;
}

export function activeSessionStorageKey(actorUid: string, sessionId: string): string {
  return `${ACTIVE_SESSION_KEY_PREFIX}${actorUid}:${sessionId}`;
}

// ==========================================
// Tab ID management
// ==========================================

let cachedTabId: string | null = null;

export function getOrCreateTabId(): string {
  if (cachedTabId) return cachedTabId;
  try {
    let tabId = sessionStorage.getItem(TAB_ID_KEY);
    if (!tabId) {
      tabId = "tab-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(TAB_ID_KEY, tabId);
    }
    cachedTabId = tabId;
    return tabId;
  } catch {
    cachedTabId = "tab-fallback-" + Date.now();
    return cachedTabId;
  }
}

/** Reset cached tab ID — for testing only. */
export function _resetCachedTabId(): void {
  cachedTabId = null;
}

// ==========================================
// Internal helper: enumerate storage keys by prefix
// ==========================================

function getStorageKeysByPrefix(prefix: string, storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  return keys;
}

// ==========================================
// Validation
// ==========================================

const WORK_AS_STAFF_ACTIONS: readonly string[] = [
  "SUPERADMIN_STAFF_WORK_ENDED",
  "SUPERADMIN_STAFF_WORK_INVALIDATED",
  "SUPERADMIN_STAFF_WORK_ABORTED",
];

const ACADEMY_WORKSPACE_ACTIONS: readonly string[] = [
  "SUPERADMIN_ACADEMY_WORKSPACE_ENDED",
  "SUPERADMIN_ACADEMY_WORKSPACE_ABORTED",
];

export function isValidPendingSupportExitAudit(
  record: unknown,
): record is PendingSupportExitAudit {
  if (!record || typeof record !== "object") return false;
  const c = record as Record<string, unknown>;

  if (!isExactDocumentId(c.logDocId)) return false;
  if (!isExactDocumentId(c.actorUid)) return false;
  if (!isExactDocumentId(c.academyId)) return false;
  if (typeof c.createdAt !== "number" || !Number.isFinite(c.createdAt)) return false;

  if (c.mode === "WORK_AS_STAFF") {
    if (typeof c.action !== "string" || !WORK_AS_STAFF_ACTIONS.includes(c.action)) {
      return false;
    }
    if (c.targetUid === null || !isExactDocumentId(c.targetUid)) return false;
    if (c.effectiveTenantRole !== "ADMIN" && c.effectiveTenantRole !== "COACH") {
      return false;
    }
    return true;
  }

  if (c.mode === "ACADEMY_WORKSPACE") {
    if (typeof c.action !== "string" || !ACADEMY_WORKSPACE_ACTIONS.includes(c.action)) {
      return false;
    }
    if (c.targetUid !== null) return false;
    if (c.effectiveTenantRole !== null) return false;
    return true;
  }

  return false;
}

export function isValidActiveSessionMarker(
  marker: unknown,
): marker is ActiveSupportSessionMarker {
  if (!marker || typeof marker !== "object") return false;
  const c = marker as Record<string, unknown>;
  if (typeof c.sessionId !== "string" || c.sessionId.length === 0) return false;
  if (!isExactDocumentId(c.actorUid)) return false;
  if (!isExactDocumentId(c.academyId)) return false;
  if (c.mode !== "ACADEMY_WORKSPACE" && c.mode !== "WORK_AS_STAFF") return false;
  if (typeof c.startedAt !== "number" || !Number.isFinite(c.startedAt)) return false;
  if (typeof c.heartbeatAt !== "number" || !Number.isFinite(c.heartbeatAt)) return false;
  if (typeof c.tabId !== "string" || c.tabId.length === 0) return false;

  if (c.mode === "WORK_AS_STAFF") {
    if (c.targetUid === null || !isExactDocumentId(c.targetUid)) return false;
    if (c.tenantRole !== "ADMIN" && c.tenantRole !== "COACH") return false;
  } else {
    if (c.targetUid !== null) return false;
    if (c.tenantRole !== null) return false;
  }

  return true;
}

// ==========================================
// Pending audit storage — independent keys per record (Section C)
// ==========================================

export function savePendingSupportExitAudit(
  record: PendingSupportExitAudit,
  storage: Storage = localStorage,
): void {
  if (!isValidPendingSupportExitAudit(record)) {
    throw new Error("Invalid pending support exit audit record.");
  }
  const key = pendingAuditStorageKey(record.actorUid, record.logDocId);
  // Throws on storage failure — fail-closed
  storage.setItem(key, JSON.stringify(record));
}

export function removePendingSupportExitAudit(
  actorUid: string,
  logDocId: string,
  storage: Storage = localStorage,
): void {
  const key = pendingAuditStorageKey(actorUid, logDocId);
  storage.removeItem(key);
}

export function loadPendingSupportExitAuditsForActor(
  actorUid: string,
  storage: Storage = localStorage,
): PendingSupportExitAudit[] {
  const prefix = `${PENDING_AUDIT_KEY_PREFIX}${actorUid}:`;
  const keys = getStorageKeysByPrefix(prefix, storage);
  const results: PendingSupportExitAudit[] = [];
  for (const key of keys) {
    try {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const parsed = JSON.parse(raw);
      if (isValidPendingSupportExitAudit(parsed) && parsed.actorUid === actorUid) {
        results.push(parsed);
      } else {
        console.warn(`Skipping invalid/mismatched pending audit at key: ${key}`);
      }
    } catch (err) {
      console.warn(`Skipping corrupt pending audit at key ${key}:`, err);
    }
  }
  return results;
}

// ==========================================
// Active session marker storage (Section E)
// ==========================================

export function saveActiveSessionMarker(
  marker: ActiveSupportSessionMarker,
  storage: Storage = localStorage,
): void {
  if (!isValidActiveSessionMarker(marker)) {
    throw new Error("Invalid active session marker.");
  }
  const key = activeSessionStorageKey(marker.actorUid, marker.sessionId);
  storage.setItem(key, JSON.stringify(marker));
}

export function removeActiveSessionMarker(
  actorUid: string,
  sessionId: string,
  storage: Storage = localStorage,
): void {
  const key = activeSessionStorageKey(actorUid, sessionId);
  storage.removeItem(key);
}

export function refreshActiveSessionHeartbeat(
  actorUid: string,
  sessionId: string,
  storage: Storage = localStorage,
): void {
  const key = activeSessionStorageKey(actorUid, sessionId);
  const raw = storage.getItem(key);
  if (raw === null) return;
  try {
    const marker = JSON.parse(raw);
    if (
      isValidActiveSessionMarker(marker) &&
      marker.actorUid === actorUid &&
      marker.sessionId === sessionId
    ) {
      marker.heartbeatAt = Date.now();
      storage.setItem(key, JSON.stringify(marker));
    }
  } catch {
    // Cannot refresh corrupt marker — leave as-is
  }
}

export function loadActiveSessionMarkersForActor(
  actorUid: string,
  storage: Storage = localStorage,
): ActiveSupportSessionMarker[] {
  const prefix = `${ACTIVE_SESSION_KEY_PREFIX}${actorUid}:`;
  const keys = getStorageKeysByPrefix(prefix, storage);
  const results: ActiveSupportSessionMarker[] = [];
  for (const key of keys) {
    try {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const parsed = JSON.parse(raw);
      if (isValidActiveSessionMarker(parsed) && parsed.actorUid === actorUid) {
        results.push(parsed);
      }
    } catch {
      // Skip corrupt markers
    }
  }
  return results;
}

export function isMarkerStale(
  marker: ActiveSupportSessionMarker,
  nowMs: number = Date.now(),
  thresholdMs: number = STALE_HEARTBEAT_THRESHOLD_MS,
): boolean {
  return (nowMs - marker.heartbeatAt) > thresholdMs;
}

// ==========================================
// Orphan marker → closure record conversion
// ==========================================

export function convertOrphanMarkerToClosureRecord(
  marker: ActiveSupportSessionMarker,
): PendingSupportExitAudit {
  const action: PendingSupportExitAction =
    marker.mode === "WORK_AS_STAFF"
      ? "SUPERADMIN_STAFF_WORK_ABORTED"
      : "SUPERADMIN_ACADEMY_WORKSPACE_ABORTED";

  return {
    logDocId: `orphan-${marker.sessionId}`,
    actorUid: marker.actorUid,
    action,
    academyId: marker.academyId,
    mode: marker.mode,
    targetUid: marker.targetUid,
    effectiveTenantRole: marker.tenantRole,
    createdAt: Date.now(),
  };
}

/**
 * Recover stale orphan markers belonging to other tabs.
 *
 * A marker is recovered ONLY when:
 * 1. It belongs to the current authenticated actor
 * 2. It is NOT owned by the current tab
 * 3. Its heartbeat exceeds the stale threshold
 * 4. A re-check immediately before conversion confirms staleness
 *    (protects against a live tab that refreshed between load and check)
 *
 * The durable closure record MUST be persisted BEFORE the marker is removed.
 */
export function recoverStaleOrphanMarkers(
  actorUid: string,
  currentTabId: string,
  storage: Storage = localStorage,
  nowMs: number = Date.now(),
): void {
  const markers = loadActiveSessionMarkersForActor(actorUid, storage);

  for (const marker of markers) {
    // Never recover own tab's markers
    if (marker.tabId === currentTabId) continue;

    // Only recover stale markers
    if (!isMarkerStale(marker, nowMs)) continue;

    // Re-check freshness immediately before conversion.
    // Another tab may have refreshed heartbeat between our initial load and now.
    const key = activeSessionStorageKey(actorUid, marker.sessionId);
    try {
      const freshRaw = storage.getItem(key);
      if (freshRaw === null) continue; // Already removed by another tab
      const freshMarker = JSON.parse(freshRaw);
      if (
        isValidActiveSessionMarker(freshMarker) &&
        !isMarkerStale(freshMarker, Date.now())
      ) {
        continue; // Heartbeat was refreshed — tab is still alive
      }
    } catch {
      continue; // Cannot verify — skip for safety
    }

    // Convert to durable closure record.
    // Closure record MUST be saved BEFORE marker is removed.
    const closureRecord = convertOrphanMarkerToClosureRecord(marker);
    try {
      savePendingSupportExitAudit(closureRecord, storage);
    } catch {
      // Cannot save closure — do NOT remove marker
      continue;
    }

    removeActiveSessionMarker(actorUid, marker.sessionId, storage);
  }
}

// ==========================================
// Authoritative payload matching (Section A)
// ==========================================

const STABLE_AUDIT_FIELDS = [
  "action",
  "actorUid",
  "academyId",
  "mode",
  "targetUid",
  "effectiveTenantRole",
] as const;

export function matchesPendingAuditPayload(
  snapshotData: unknown,
  record: PendingSupportExitAudit,
): boolean {
  if (
    snapshotData === null ||
    typeof snapshotData !== "object" ||
    Array.isArray(snapshotData)
  ) {
    return false;
  }

  const data = snapshotData as Record<string, unknown>;

  for (const field of STABLE_AUDIT_FIELDS) {
    const expected = record[field];
    const actual = data[field];
    // Treat null ≡ undefined for Firestore fields that may omit null values
    if (expected === null && (actual === null || actual === undefined)) continue;
    if (expected !== actual) return false;
  }
  return true;
}

// ==========================================
// Default production Firestore ops
// ==========================================

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

// ==========================================
// Bounded exit audit — authoritative ACK only (Section A)
// ==========================================

export async function performBoundedExitAudit(
  dbInstance: unknown,
  record: PendingSupportExitAudit,
  options?: {
    timeoutMs?: number;
    storage?: Storage;
    guard?: AuthGuard;
    firestoreOps?: FirestoreOps;
  },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? EXIT_AUDIT_TIMEOUT_MS;
  const storage = options?.storage ?? localStorage;
  const guard = options?.guard;
  const ops = options?.firestoreOps ?? defaultFirestoreOps;

  const logRef = ops.docRef(dbInstance, "logs", record.logDocId);
  const logPayload: Record<string, unknown> = {
    action: record.action,
    actorUid: record.actorUid,
    academyId: record.academyId,
    mode: record.mode,
    targetUid: record.targetUid,
    effectiveTenantRole: record.effectiveTenantRole,
    timestamp: ops.serverTimestamp(),
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<"TIMEOUT">((resolve) => {
    timeoutId = setTimeout(() => resolve("TIMEOUT"), timeoutMs);
  });

  try {
    // Validate guard before write attempt
    guard?.validate();

    const writeResult = await Promise.race([
      (async () => {
        try {
          await ops.setDoc(logRef, logPayload);
          return "WRITE_SUCCESS" as const;
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code;
          if (code === "permission-denied") {
            return "PERMISSION_DENIED" as const;
          }
          return "WRITE_ERROR" as const;
        }
      })(),
      timeoutPromise,
    ]);

    if (timeoutId) clearTimeout(timeoutId);

    if (writeResult === "TIMEOUT") {
      console.warn(
        `Support exit audit timed out after ${timeoutMs}ms; keeping durable record ${record.logDocId}.`,
      );
      return;
    }

    if (writeResult === "WRITE_ERROR") {
      console.warn(
        `Support exit audit write failed; keeping durable record ${record.logDocId}.`,
      );
      return;
    }

    // WRITE_SUCCESS or PERMISSION_DENIED: attempt authoritative server confirmation
    try {
      guard?.validate();
      const confirmSnap = await ops.getDocFromServer(logRef);
      if (confirmSnap.exists()) {
        const data = confirmSnap.data();
        if (matchesPendingAuditPayload(data, record)) {
          // Authoritative exact match — acknowledged
          guard?.validate();
          removePendingSupportExitAudit(record.actorUid, record.logDocId, storage);
        } else {
          console.error(
            `Integrity error: log ${record.logDocId} exists but payload mismatch. Retaining durable record.`,
          );
        }
      } else if (writeResult === "WRITE_SUCCESS") {
        // setDoc succeeded but server says doc absent — unusual; retain
        console.warn(
          `Unexpected: setDoc succeeded but getDocFromServer says ${record.logDocId} does not exist. Retaining.`,
        );
      }
      // PERMISSION_DENIED + not exists = real permission issue → retain
    } catch (confirmErr) {
      // Server confirmation failed → retain
      console.warn(
        `Authoritative confirmation failed for ${record.logDocId}; retaining:`,
        confirmErr,
      );
    }
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    // Guard failure or other error → retain
    console.warn(`Support exit audit aborted for ${record.logDocId}:`, err);
  }
}

// ==========================================
// Authoritative replay — server-only, no cache fallback (Section A)
// ==========================================

export async function replayPendingSupportExitAuditsForActor(
  currentActor: unknown,
  dbInstance: unknown,
  options?: {
    storage?: Storage;
    guard?: AuthGuard;
    firestoreOps?: FirestoreOps;
  },
): Promise<void> {
  if (!isExactActiveSuperAdmin(currentActor)) return;

  const candidate = currentActor as Record<string, unknown>;
  const authenticatedActorUid = (candidate.uid || candidate.id) as string;
  if (!isExactDocumentId(authenticatedActorUid)) return;

  const storage = options?.storage ?? localStorage;
  const guard = options?.guard;
  const ops = options?.firestoreOps ?? defaultFirestoreOps;

  const myRecords = loadPendingSupportExitAuditsForActor(
    authenticatedActorUid,
    storage,
  );

  for (const record of myRecords) {
    try {
      // Step 1: Authoritative server read — NO cache fallback
      guard?.validate();
      const logRef = ops.docRef(dbInstance, "logs", record.logDocId);
      let serverSnap: FirestoreDocSnap;
      try {
        serverSnap = await ops.getDocFromServer(logRef);
      } catch {
        // Server read failed — retain record, try next
        continue;
      }

      // Step 2: Server document exists?
      if (serverSnap.exists()) {
        const data = serverSnap.data();
        if (matchesPendingAuditPayload(data, record)) {
          // Authoritative exact match — acknowledged
          guard?.validate();
          removePendingSupportExitAudit(record.actorUid, record.logDocId, storage);
        } else {
          console.error(
            `Integrity error: log ${record.logDocId} exists with mismatched payload. Retaining.`,
          );
        }
        continue;
      }

      // Step 3: Server confirms not exists — attempt create
      guard?.validate();
      const logPayload: Record<string, unknown> = {
        action: record.action,
        actorUid: record.actorUid,
        academyId: record.academyId,
        mode: record.mode,
        targetUid: record.targetUid,
        effectiveTenantRole: record.effectiveTenantRole,
        timestamp: ops.serverTimestamp(),
      };

      let createSucceeded = false;
      try {
        await ops.setDoc(logRef, logPayload);
        createSucceeded = true;
      } catch {
        // Create failed (race/permission) — check server for existing doc
        try {
          guard?.validate();
          const raceSnap = await ops.getDocFromServer(logRef);
          if (raceSnap.exists()) {
            const data = raceSnap.data();
            if (matchesPendingAuditPayload(data, record)) {
              guard?.validate();
              removePendingSupportExitAudit(
                record.actorUid,
                record.logDocId,
                storage,
              );
            } else {
              console.error(
                `Integrity error after race: log ${record.logDocId} mismatched. Retaining.`,
              );
            }
          }
          // Not exists after race — retain for retry
        } catch {
          // Server read after race also failed — retain
        }
        continue;
      }

      // Step 4: Create succeeded — authoritative confirmation
      if (createSucceeded) {
        try {
          guard?.validate();
          const confirmSnap = await ops.getDocFromServer(logRef);
          if (confirmSnap.exists()) {
            const data = confirmSnap.data();
            if (matchesPendingAuditPayload(data, record)) {
              guard?.validate();
              removePendingSupportExitAudit(
                record.actorUid,
                record.logDocId,
                storage,
              );
            } else {
              console.error(
                `Integrity error: created log ${record.logDocId} but confirmation mismatch. Retaining.`,
              );
            }
          }
          // Server says not exists after create — unusual; retain
        } catch {
          // Confirmation failed — retain
        }
      }
    } catch (err) {
      // Guard failure — stop ENTIRE replay (auth changed)
      console.warn("Replay aborted due to guard failure:", err);
      return;
    }
  }
}
