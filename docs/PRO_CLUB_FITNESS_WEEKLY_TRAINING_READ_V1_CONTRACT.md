# Pro Club Fitness → Weekly Training Read Integration V1 Contract

**Slice A scope:** freeze the read-only selection policy and its pure contract. This slice adds no repository reads, runtime wiring, or persistence.

## 1. Purpose

Persisted Fitness observations are read-only context for Weekly Training. They never automatically determine training prescription, planned load, readiness, injury status, medical status, return-to-play status, selection eligibility, or player ranking. The Head Coach remains the decision maker.

## 2. Authoritative source

The authoritative source is `proClubs/{clubId}/fitnessResults/{resultId}`. Use only persisted observations accepted by the existing Pro Club Fitness Result V1 contract. Do not duplicate storage, create a Weekly Training Fitness snapshot, or copy Fitness documents into Weekly Training documents.

## 3. Tenant boundary

Every selected observation must come from the exact current tenant: `organizationType = PRO_CLUB` and `organizationId = current clubId`. A tenant mismatch is omitted fail-closed. No cross-club result may enter the connection.

## 4. Player eligibility

Current canonical roster players with `ACTIVE` or `INACTIVE` status may appear in Weekly Training context. Exclude `RELEASED`; released history remains available in Fitness history but is not current-team Weekly Training context. Do not infer health or readiness from `ACTIVE` or `INACTIVE`.

## 5. Reference date

The pure selector receives an explicit canonical `referenceDate: YYYY-MM-DD`. It does not read the current clock. Runtime wiring in a later slice supplies the Weekly Training reference date. Select only `observedOn <= referenceDate`; exclude future observations. Do not use UTC `toISOString()` date conversion. Use the existing canonical calendar-date foundation semantics.

## 6. Latest result policy

For each exact `playerKey + definitionId + definitionVersion` identity, select at most one observation: the latest canonical `observedOn` on or before the reference date. If malformed duplicate data yields the same identity and date more than once, choose the lexicographically smallest stable `resultId`. The result is independent of input array order. Do not average, combine, normalize, or calculate trends from values in V1.

## 7. Definition contract

Each selected observation resolves to the exact `definitionId` and `definitionVersion` in the supplied Fitness definition catalogue. Unknown or mismatched definition versions are omitted fail-closed. Never reinterpret an old value with a different definition version.

## 8. Recency semantics

V1 invents no stale/fresh threshold. An old valid observation may remain visible as historical context, with its `observedOn` date. Do not label observations `fresh`, `stale`, `good`, `bad`, `ready`, or `unready` unless a later independently reviewed policy defines those terms.

## 9. Output

The adapter output remains observational and may expose only factual display context: `resultId`, `playerKey`, the canonical roster display label, roster status, `definitionId`, `definitionVersion`, test name, category, measurement method, value, unit, direction, and `observedOn`. The connection explicitly retains `prescription: null`; it has no derived readiness field.

## 10. Empty and error state

Zero valid observations is a valid `NO_DATA` state. Do not fabricate zero values, charts, or placeholder results. In a later runtime adapter, a read failure remains distinguishable from genuine `NO_DATA`.

## 11. Write boundary

This integration is read-only. It does not call `setDoc`, `addDoc`, `updateDoc`, `deleteDoc`, `writeBatch`, or `runTransaction`. It does not save selected observations into Weekly Training.
