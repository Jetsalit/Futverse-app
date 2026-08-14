import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { isExactActiveSuperAdmin, isExactDocumentId } from "./superAdminSupportModel";
import type { SuperAdminSupportMode } from "../types/SuperAdminSupport";

export interface PendingSupportExitAudit {
  logDocId: string;
  actorUid: string;
  action: "SUPERADMIN_STAFF_WORK_ENDED" | "SUPERADMIN_ACADEMY_WORKSPACE_ENDED";
  academyId: string;
  mode: SuperAdminSupportMode;
  targetUid: string | null;
  effectiveTenantRole: "ADMIN" | "COACH" | null;
  createdAt: number;
}

export const PENDING_AUDIT_STORAGE_KEY = "futverse_pending_support_exit_audits";
export const EXIT_AUDIT_TIMEOUT_MS = 2000;

export function isValidPendingSupportExitAudit(
  record: unknown,
): record is PendingSupportExitAudit {
  if (!record || typeof record !== "object") return false;
  const candidate = record as Record<string, unknown>;

  if (!isExactDocumentId(candidate.logDocId)) return false;
  if (!isExactDocumentId(candidate.actorUid)) return false;
  if (!isExactDocumentId(candidate.academyId)) return false;

  if (
    typeof candidate.createdAt !== "number" ||
    !Number.isFinite(candidate.createdAt)
  ) {
    return false;
  }

  if (candidate.mode === "WORK_AS_STAFF") {
    if (candidate.action !== "SUPERADMIN_STAFF_WORK_ENDED") return false;
    if (candidate.targetUid === null || !isExactDocumentId(candidate.targetUid)) {
      return false;
    }
    if (
      candidate.effectiveTenantRole !== "ADMIN" &&
      candidate.effectiveTenantRole !== "COACH"
    ) {
      return false;
    }
    return true;
  }

  if (candidate.mode === "ACADEMY_WORKSPACE") {
    if (candidate.action !== "SUPERADMIN_ACADEMY_WORKSPACE_ENDED") return false;
    if (candidate.targetUid !== null) return false;
    if (candidate.effectiveTenantRole !== null) return false;
    return true;
  }

  return false;
}

export function loadPendingSupportExitAuditsStrict(
  storage: Storage = localStorage,
): PendingSupportExitAudit[] {
  const raw = storage.getItem(PENDING_AUDIT_STORAGE_KEY);
  if (raw === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      "Durable support exit audit storage is corrupt (JSON parse error): " +
        String(err),
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Durable support exit audit storage is corrupt (expected array, got " +
        typeof parsed +
        ").",
    );
  }

  for (let i = 0; i < parsed.length; i++) {
    if (!isValidPendingSupportExitAudit(parsed[i])) {
      throw new Error(
        `Durable support exit audit storage is corrupt (invalid record at index ${i}).`,
      );
    }
  }

  return parsed as PendingSupportExitAudit[];
}

export function loadPendingSupportExitAudits(
  storage: Storage = localStorage,
): PendingSupportExitAudit[] {
  try {
    return loadPendingSupportExitAuditsStrict(storage);
  } catch (err) {
    console.warn("Failed to load pending support exit audits from storage:", err);
    return [];
  }
}

export function savePendingSupportExitAudit(
  record: PendingSupportExitAudit,
  storage: Storage = localStorage,
): void {
  if (!isValidPendingSupportExitAudit(record)) {
    throw new Error("Invalid pending support exit audit record.");
  }
  const current = loadPendingSupportExitAuditsStrict(storage);
  const filtered = current.filter((r) => r.logDocId !== record.logDocId);
  filtered.push(record);
  storage.setItem(PENDING_AUDIT_STORAGE_KEY, JSON.stringify(filtered));
}

export function removePendingSupportExitAudit(
  logDocId: string,
  storage: Storage = localStorage,
): void {
  try {
    const current = loadPendingSupportExitAuditsStrict(storage);
    const updated = current.filter((r) => r.logDocId !== logDocId);
    if (updated.length === 0) {
      storage.removeItem(PENDING_AUDIT_STORAGE_KEY);
    } else {
      storage.setItem(PENDING_AUDIT_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch (err) {
    console.warn("Failed to remove pending support exit audit from storage:", err);
  }
}

export async function performBoundedExitAudit(
  dbInstance: Firestore,
  record: PendingSupportExitAudit,
  timeoutMs: number = EXIT_AUDIT_TIMEOUT_MS,
  storage: Storage = localStorage,
): Promise<void> {
  const logRef = doc(dbInstance, "logs", record.logDocId);
  const logPayload = {
    action: record.action,
    actorUid: record.actorUid,
    academyId: record.academyId,
    mode: record.mode,
    targetUid: record.targetUid,
    effectiveTenantRole: record.effectiveTenantRole,
    timestamp: serverTimestamp(),
  };

  const writePromise = setDoc(logRef, logPayload);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<"TIMEOUT">((resolve) => {
    timeoutId = setTimeout(() => resolve("TIMEOUT"), timeoutMs);
  });

  try {
    const result = await Promise.race([
      writePromise.then(() => "SUCCESS" as const),
      timeoutPromise,
    ]);
    if (timeoutId) clearTimeout(timeoutId);

    if (result === "SUCCESS") {
      removePendingSupportExitAudit(record.logDocId, storage);
    } else {
      console.warn(
        `Support exit audit write timed out after ${timeoutMs}ms; keeping durable record ${record.logDocId} for retry.`,
      );
    }
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    console.warn(
      `Support exit audit write failed or offline; keeping durable record ${record.logDocId} for retry:`,
      err,
    );
  }
}

export async function replayPendingSupportExitAuditsForActor(
  currentActor: unknown,
  dbInstance: Firestore,
  storage: Storage = localStorage,
): Promise<void> {
  if (!isExactActiveSuperAdmin(currentActor)) {
    return;
  }
  const candidate = currentActor as Record<string, unknown>;
  const authenticatedActorUid = candidate.uid || candidate.id;
  if (!isExactDocumentId(authenticatedActorUid)) {
    return;
  }

  const allRecords = loadPendingSupportExitAudits(storage);
  const myRecords = allRecords.filter(
    (r) => r.actorUid === authenticatedActorUid,
  );

  for (const record of myRecords) {
    if (!isValidPendingSupportExitAudit(record)) {
      continue;
    }
    try {
      const logRef = doc(dbInstance, "logs", record.logDocId);
      // 1. Check if document already exists
      let docExists = false;
      try {
        const snap = await getDocFromServer(logRef);
        docExists = snap.exists();
      } catch {
        try {
          const cacheSnap = await getDoc(logRef);
          docExists = cacheSnap.exists();
        } catch {
          docExists = false;
        }
      }

      if (docExists) {
        removePendingSupportExitAudit(record.logDocId, storage);
        continue;
      }

      // 2. Document does not exist, create it idempotently
      const logPayload = {
        action: record.action,
        actorUid: record.actorUid,
        academyId: record.academyId,
        mode: record.mode,
        targetUid: record.targetUid,
        effectiveTenantRole: record.effectiveTenantRole,
        timestamp: serverTimestamp(),
      };

      await setDoc(logRef, logPayload);
      removePendingSupportExitAudit(record.logDocId, storage);
    } catch (err) {
      console.warn(
        `Failed to replay pending support exit audit ${record.logDocId}:`,
        err,
      );
      try {
        const checkSnap = await getDoc(doc(dbInstance, "logs", record.logDocId));
        if (checkSnap.exists()) {
          removePendingSupportExitAudit(record.logDocId, storage);
        }
      } catch {
        // Keep pending record for subsequent retry
      }
    }
  }
}
