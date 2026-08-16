import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  convertNonStaffOrphanMarkerToClosureRecord,
  isNonStaffMarkerStale,
  isValidActiveNonStaffSupportSessionMarker,
  isValidPendingNonStaffSupportExitAudit,
  loadActiveNonStaffSupportSessionMarkersForActor,
  loadPendingNonStaffSupportExitAuditsForActor,
  recoverStaleNonStaffOrphanMarkers,
  refreshActiveNonStaffSupportSessionHeartbeat,
  removeActiveNonStaffSupportSessionMarker,
  saveActiveNonStaffSupportSessionMarker,
  savePendingNonStaffSupportExitAudit,
} from "../src/lib/durableNonStaffSupportAudit";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const marker = {
  sessionId: "session-123",
  actorUid: "superadmin-123",
  academyId: "academy-123",
  mode: "WORK_AS_NONSTAFF" as const,
  targetUid: "parent-123",
  effectiveRole: "PARENT" as const,
  startedAt: 1000,
  tabId: "tab-a",
  heartbeatAt: 1000,
};

describe("durable nonstaff support audit", () => {
  it("accepts only exact Parent/Player nonstaff marker identity", () => {
    assert.equal(isValidActiveNonStaffSupportSessionMarker(marker), true);
    assert.equal(
      isValidActiveNonStaffSupportSessionMarker({ ...marker, effectiveRole: "COACH" }),
      false,
    );
    assert.equal(
      isValidActiveNonStaffSupportSessionMarker({ ...marker, mode: "WORK_AS_STAFF" }),
      false,
    );
  });

  it("converts an orphan marker to nonstaff ABORTED audit without changing actor or subject", () => {
    const closure = convertNonStaffOrphanMarkerToClosureRecord(marker);
    assert.equal(closure.action, "SUPERADMIN_NONSTAFF_WORK_ABORTED");
    assert.equal(closure.mode, "WORK_AS_NONSTAFF");
    assert.equal(closure.actorUid, marker.actorUid);
    assert.equal(closure.targetUid, marker.targetUid);
    assert.equal(closure.effectiveRole, marker.effectiveRole);
    assert.equal(isValidPendingNonStaffSupportExitAudit(closure), true);
  });

  it("stores active marker independently and refreshes heartbeat", () => {
    const storage = new MemoryStorage();
    saveActiveNonStaffSupportSessionMarker(marker, storage);
    assert.equal(
      loadActiveNonStaffSupportSessionMarkersForActor(marker.actorUid, storage).length,
      1,
    );
    refreshActiveNonStaffSupportSessionHeartbeat(marker.actorUid, marker.sessionId, storage);
    const refreshed = loadActiveNonStaffSupportSessionMarkersForActor(
      marker.actorUid,
      storage,
    )[0];
    assert.ok(refreshed.heartbeatAt >= marker.heartbeatAt);
    removeActiveNonStaffSupportSessionMarker(marker.actorUid, marker.sessionId, storage);
    assert.equal(
      loadActiveNonStaffSupportSessionMarkersForActor(marker.actorUid, storage).length,
      0,
    );
  });

  it("does not recover the current tab or a fresh marker", () => {
    const storage = new MemoryStorage();
    saveActiveNonStaffSupportSessionMarker(marker, storage);
    recoverStaleNonStaffOrphanMarkers(marker.actorUid, marker.tabId, storage, 100000);
    assert.equal(
      loadActiveNonStaffSupportSessionMarkersForActor(marker.actorUid, storage).length,
      1,
    );

    storage.clear();
    const fresh = { ...marker, tabId: "tab-b", heartbeatAt: 99000 };
    saveActiveNonStaffSupportSessionMarker(fresh, storage);
    recoverStaleNonStaffOrphanMarkers(marker.actorUid, "tab-a", storage, 100000);
    assert.equal(
      loadActiveNonStaffSupportSessionMarkersForActor(marker.actorUid, storage).length,
      1,
    );
    assert.equal(loadPendingNonStaffSupportExitAuditsForActor(marker.actorUid, storage).length, 0);
  });

  it("recovers a stale marker from another tab into one durable ABORTED record", () => {
    const storage = new MemoryStorage();
    const stale = { ...marker, tabId: "tab-b", heartbeatAt: 1000 };
    saveActiveNonStaffSupportSessionMarker(stale, storage);
    assert.equal(isNonStaffMarkerStale(stale, 100000), true);

    recoverStaleNonStaffOrphanMarkers(marker.actorUid, "tab-a", storage, 100000);

    assert.equal(
      loadActiveNonStaffSupportSessionMarkersForActor(marker.actorUid, storage).length,
      0,
    );
    const pending = loadPendingNonStaffSupportExitAuditsForActor(marker.actorUid, storage);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].action, "SUPERADMIN_NONSTAFF_WORK_ABORTED");
    assert.equal(pending[0].targetUid, marker.targetUid);
  });

  it("keeps pending records isolated by actor", () => {
    const storage = new MemoryStorage();
    const closure = convertNonStaffOrphanMarkerToClosureRecord(marker);
    savePendingNonStaffSupportExitAudit(closure, storage);
    assert.equal(loadPendingNonStaffSupportExitAuditsForActor(marker.actorUid, storage).length, 1);
    assert.equal(loadPendingNonStaffSupportExitAuditsForActor("other-superadmin", storage).length, 0);
  });
});
