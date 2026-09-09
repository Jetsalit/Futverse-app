# Pro Club Weekly Training Persistence / Rules V1 — Contract Freeze

## Status

Foundation only. This slice does **not** deploy Firestore Rules, call production HTTP endpoints, or write production data.

`firestore.rules` remains unchanged in this foundation slice. Security behavior is proven first against an isolated Firestore Emulator rules fixture. Production-rules integration is a separate reviewed slice.

## Canonical normalized paths

Weekly plan metadata:

`proClubs/{clubId}/weeklyTrainingPlans/{planId}`

Session documents:

`proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}`

Block documents:

`proClubs/{clubId}/weeklyTrainingPlans/{planId}/sessions/{sessionId}/blocks/{blockId}`

Current technical authority snapshot:

`proClubs/{clubId}/technicalGovernance/current`

Canonical membership and staff evidence remain:

`proClubs/{clubId}/members/{uid}`

`proClubs/{clubId}/staff/{uid}`

Academy paths and repositories MUST NOT be reused for Pro Club weekly training.

## Why persistence is normalized

The domain model remains a convenient nested weekly-plan object, but authoritative Firestore persistence MUST NOT place arbitrary session/block arrays inside the plan document. Firestore Rules cannot safely iterate and validate arbitrary nested array elements. A client bypassing the UI could otherwise persist malformed authoritative data while still satisfying top-level authorization.

V1 therefore normalizes plan metadata, sessions, and blocks into separately rule-validatable documents. The pure persistence builder deterministically maps a domain-valid plan to those documents before any future write adapter is connected.

## Identity and authority invariants

1. `clubId`, `planId`, `sessionId`, `blockId`, and actor UID are path/request identities. Client payloads do not grant authority.
2. A Weekly Training write requires all of the following at the exact same `clubId`:
   - signed-in actor;
   - `users/{uid}.status` is `ACTIVE` or `Active`;
   - canonical membership has `status == ACTIVE`;
   - canonical staff assignment has `status == ACTIVE`;
   - actor staff role is `HEAD_COACH` for the foundation write path;
   - current technical authority is read only from `technicalGovernance/current`;
   - the authority snapshot points to an ACTIVE canonical membership and ACTIVE staff assignment whose role exactly matches the snapshot.
3. Staff assignment alone never grants tenant authority.
4. Global `users.role`, Academy authority, and SUPERADMIN labels do not bypass Pro Club tenant authority.
5. `technicalGovernance/current` is a trusted authority snapshot. V1 client create/update/delete is denied.
6. Rules MUST NOT infer AUTO authority by listing the club staff collection.
7. Rules helpers must remain within Firestore document-access limits; repeated reads are not a reason to remove an authorization check.
8. Session and block document IDs are canonical identities, not labels. Rules must bind each ID to the payload it represents.

## Foundation write boundary

This foundation proves only the safest persistence behavior:

- `HEAD_COACH` may create their own `DRAFT` plan metadata.
- The same author may create/update session and block documents only while the parent plan remains their own `DRAFT`.
- The author may update DRAFT plan metadata while stored/requested status remains `DRAFT`.
- Cross-author writes are denied.
- Cross-club evidence is denied.
- Inactive account, membership, or staff evidence is denied.
- Staff-only users without ACTIVE canonical Membership are denied.
- Client transition away from `DRAFT` is denied.
- Client delete remains denied in this foundation.

Technical Director co-authoring and lifecycle transitions (`SUBMITTED`, `IN_REVIEW`, `NEEDS_REVISION`, `APPROVED`, `PUBLISHED`) remain intentionally closed until the atomic transition + historical provenance contract is connected.

## Plan metadata document

A DRAFT plan metadata document contains only:

- `schemaVersion: 1`
- `authorUid`
- `status: DRAFT`
- `weekStartDate`
- `squadLabel`
- `mainObjective`
- optional `secondaryObjective`
- optional `headCoachNote`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`

The plan metadata document does **not** embed `sessions`, `clubId`, or `planId`.

`weekStartDate` must be a real strict calendar date, not merely a string that matches `YYYY-MM-DD`.

## Session document

A session document contains only:

- `schemaVersion: 1`
- `orderIndex`
- `sessionDate`
- `startTime`
- `location`
- `objective`
- `phaseOfPlay`
- `plannedLoad`
- `durationMinutes`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`

The deterministic V1 session ID is exactly `YYYY-MM-DD-HHmm`, derived from the same `sessionDate` and `startTime` stored in the document.

Rules must enforce all of the following:

- `sessionDate` is a real strict calendar date;
- `sessionDate` falls from `weekStartDate` through `weekStartDate + 6 days` inclusive;
- `sessionId` exactly equals `sessionDate + '-' + startTime-without-colon`;
- update cannot change `sessionDate` or `startTime` in place, because doing so would change canonical document identity.

This prevents duplicate authoritative slots from being created under arbitrary IDs and prevents a document from retaining an ID that no longer represents its payload.

## Block document

A block document contains only:

- `schemaVersion: 1`
- `orderIndex`
- `blockType`
- `title`
- `durationMinutes`
- optional `drillReference`
- `coachingPoints` (1–10 bounded non-empty strings)
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`

The deterministic V1 block ID is coupled exactly to validated order:

- `orderIndex: 0` -> `block-01`
- ...
- `orderIndex: 11` -> `block-12`

No `block-00`, `block-13`, `block-99`, duplicate order index under a second canonical ID, or mismatched ID/order pair is valid.

`drillReference` follows the same exact-document-identifier contract as `isValidDocumentIdentifier`: non-empty, no leading/trailing whitespace, no `/`, while internal spaces remain valid.

Rules validate each block document directly, including the bounded coaching-point list. Cross-document aggregate constraints such as the sum of all block minutes remain enforced by the domain parser before normalization and are not opened in root production rules in this foundation.

## Timestamp contract

For newly created plan/session/block documents:

- `createdAt == request.time`
- `updatedAt == request.time`
- `createdBy == request.auth.uid`
- `updatedBy == request.auth.uid`

For DRAFT updates:

- `createdAt`, `createdBy`, and `schemaVersion` are immutable;
- plan `authorUid` is immutable;
- session `orderIndex`, `sessionDate`, and `startTime` are immutable;
- block `orderIndex` is immutable;
- `updatedAt == request.time`;
- `updatedBy == request.auth.uid`.

## Read boundary

Foundation read access requires an ACTIVE account and ACTIVE canonical Membership in the exact club. Relationship evidence rules elsewhere remain unchanged; weekly technical work is not readable merely because an inactive historical relationship document exists.

## Repository boundary

`src/lib/firestore/proClubWeeklyTrainingPersistence.ts` is a pure normalization/path foundation only. It must:

- construct Pro Club paths only;
- reject padded/path-like identifiers;
- accept only a domain-valid plan for the exact path tenant;
- normalize plan metadata, sessions, and blocks into deterministic path/payload bundles;
- never call Academy repositories;
- contain no Firebase write, production HTTP, or deployment behavior.

## Deferred

Deferred to later reviewed slices:

- integration into root `firestore.rules`;
- canonical governance snapshot writer/control-plane;
- TD co-author writes;
- submit/review/revision/approve/publish atomic transitions;
- append-only historical action evidence;
- production repository write adapter/batch semantics;
- aggregate transition consistency across normalized children;
- editable UI wiring;
- production rollout.

## Production safety

- `PRODUCTION_DEPLOYED=NO`
- `PRODUCTION_HTTP_CALLED=NO`
- `PRODUCTION_DATA_WRITTEN=NO`
