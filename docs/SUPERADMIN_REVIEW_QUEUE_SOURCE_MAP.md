# FutVerse SuperAdmin Command Center — Review Queue Source Map

Status: **2D.2A FROZEN DESIGN CONTRACT**
Scope: SuperAdmin Command Center v1 review/action queue
Baseline: production main `096c80940f227cb0fff1078d3a461a66ba7e03b3`

## 1. Purpose

This contract defines which review queues may appear in the SuperAdmin
Command Center and which authoritative production sources may drive them.

The queue is a presentation/read layer only.

It MUST NOT:

- become an authorization source
- invent review work
- infer pending state from missing records
- promote legacy metadata into authority
- activate the full relationship inventory from the Dashboard
- introduce production writes, migrations, or cleanup
- silently treat unavailable data as zero

Implementation principle:

**Preserve → Read → Compose → Extend**

---

## 2. Review-source states

A review source must be classified as one of:

- `LOADING`
- `PENDING`
- `CLEAR`
- `UNAVAILABLE`
- `NOT_CONNECTED`

Semantics:

### LOADING
The authoritative read is currently incomplete.

### PENDING
The authoritative read completed and confirmed one or more items requiring
review.

### CLEAR
The authoritative read completed and confirmed zero items requiring review.

### UNAVAILABLE
An authoritative source exists, but its current state could not be confirmed.

### NOT_CONNECTED
The Command Center does not currently have a safe authoritative review source
for this review category.

`0`, `UNAVAILABLE`, and `NOT_CONNECTED` are never interchangeable.

---

## 3. User Approvals

Review id:

`user-approvals`

Status:

**CONNECTED**

Authoritative source:

`users/{uid}`

Pending semantics:

Use the existing hardened account approval model only.

A review item may be counted only when the account is confirmed by the current
approval contract as awaiting SuperAdmin approval.

Destination:

`Users & Access → Approval Queue`

Rules:

- do not infer pending from requested role alone
- do not infer approval state from legacy academy pointers
- reuse existing account approval authority
- read failures fail closed as `UNAVAILABLE`

---

## 4. Profile Claims

Review id:

`profile-claims`

Status:

**CONNECTED**

Authoritative source:

`profile_claims/{claimId}`

Authoritative pending aggregate:

`status == "PENDING"`

The existing Command Center aggregate read is the source of truth for the
review count.

Destination:

`Users & Access → Profile Claims`

Rules:

- do not use the limited Profile Claims list as the Dashboard count
- do not fall back to cached/list count when aggregate read fails
- `0` is valid only after authoritative aggregate success
- failures become `UNAVAILABLE`

---

## 5. Membership Review

Review id:

`membership-review`

Status:

**NOT_CONNECTED UNDER CURRENT SECURITY RULES**

Canonical source:

`academies/{academyId}/members/{uid}`

Relevant authoritative Membership state:

`status == "PENDING"`

Potential Command Center read strategy:

A dedicated aggregate over Membership documents may be used only after runtime
authorization and query behavior are proven.

Candidate:

`collectionGroup("members")`
with
`where("status", "==", "PENDING")`

This candidate is NOT approved for production wiring until tests prove:

1. active SuperAdmin can execute the aggregate
2. ordinary users cannot execute the global aggregate
3. malformed/noncanonical membership evidence cannot create false pending work
4. exact count semantics are preserved
5. no full relationship inventory activation is required

Destination after verification:

`Users & Access → Relationships`

The existing Relationships module remains the review destination. 2D.2 does
not introduce a new SuperAdmin navigation tab solely for Membership Review.

The review destination may filter or highlight authoritative Membership
evidence requiring attention after navigation.

Until the aggregate contract is proven:

`membership-review = NOT_CONNECTED`
### 2D.2B Runtime Result

Tested against the current production Firestore Rules contract.

Observed behavior:

- active SuperAdmin is denied a global `collectionGroup("members")` query
- active SuperAdmin is denied a global pending Membership aggregate
- ordinary users are denied the same global query
- inactive SuperAdmin is denied the same global query
- Academy-scoped Membership reads remain the currently authorized read shape

Decision:

`membership-review` remains `NOT_CONNECTED` in Command Center v1.

2D.2 MUST NOT expand Firestore Rules solely to create a Dashboard counter.

2D.2 MUST NOT fall back to reading every Academy Membership collection.

Even if a future global Membership read is authorized, `status == "PENDING"`
alone must not become canonical review authority because malformed Membership
documents could otherwise produce false pending work.


No per-Academy N+1 Dashboard scan is approved as fallback.

---

## 6. Parent Link Review

Review id:

`parent-link-review`

Status:

**NOT_CONNECTED**

Canonical relationship source:

`academies/{academyId}/nonstaffUsers/{uid}/playerAssociations/{playerId}`

Current canonical association statuses:

- `ACTIVE`
- `INACTIVE`
- `REVOKED`

Current data does NOT define an authoritative pending Parent Link review state.

Therefore the Command Center MUST NOT infer a review queue from:

- missing associations
- legacy `linkedPlayerId`
- legacy academy pointers
- account role alone
- relationship inventory warnings
- absence of a current link

A future Parent Link review queue requires a separately designed authoritative
request/review source.

Until then:

`parent-link-review = NOT_CONNECTED`

Existing canonical Parent relationships remain visible in Users &
Relationships.

---

## 7. Integrity / Legacy Review

Review id:

`integrity-review`

Status:

**AUTHORITATIVE DERIVED MODEL EXISTS — DASHBOARD GLOBAL COUNT NOT CONNECTED**

Current authoritative derived evidence:

SuperAdmin relationship read model can classify:

- `VERIFIED`
- `REVIEW_REQUIRED`
- `CONFLICT`
- `UNASSIGNED`

However the current relationship inventory requires broad multi-source reads,
including:

- global users
- academies
- Academy Membership collections
- non-staff player associations

The relationship inventory lifecycle intentionally activates only for:

- `users`
- `relationships`

The Command Center MUST NOT activate this full inventory globally merely to
produce a Dashboard badge/count.

Allowed v1 behavior:

- provide navigation to the existing Integrity / Relationships review surfaces
- expose coverage as not connected where no lightweight authoritative count
  exists
- keep review details inside the existing relationship/integrity modules

Until a lightweight safe source exists:

`integrity-review = NOT_CONNECTED` for Dashboard count semantics.

No precomputed integrity index or migration is introduced in 2D.2.

---

## 8. Review Queue v1 presentation contract

The Command Center Review Queue may display these categories:

1. User Approvals
2. Profile Claims
3. Membership Review
4. Parent Link Review
5. Integrity / Legacy Review

Only sources in confirmed `PENDING` state may display a numeric pending count
and actionable review requirement.

`CLEAR` may display zero and allow navigation to an existing connected module.

`UNAVAILABLE` must display an explicit unavailable state.

`NOT_CONNECTED` must display neutral partial-coverage language and must never
display zero.

Navigation availability and source availability are separate concerns.

A connected module does not imply a connected Dashboard review count.

---

## 9. Operational Signals vs Review Queue

Operational Signals answer:

**"What is the current state of each monitored source?"**

Review Queue answers:

**"What confirmed review work requires SuperAdmin attention, and where should
it be reviewed?"**

The Review Queue must consume authoritative source state rather than recreate
independent nullable counts.

No duplicate authority model may be introduced.

---

## 10. Performance boundary

The Dashboard must remain lightweight.

Forbidden in 2D.2:

- activating the full relationship inventory on Dashboard entry
- reading every Academy's Membership collection solely to render a queue badge
- global player record scans
- global FUTID scans
- fake cached review totals
- persisted derived Dashboard counters without a separate architecture review

Dedicated Firestore aggregates are preferred where their authorization and
semantics can be proven.

---

## 11. Security and data-integrity boundary

2D.2 Review Queue is read/derived presentation work.

This slice does not authorize:

- Auth changes
- Membership mutation changes
- FUTID changes
- non-staff association mutation changes
- Firestore schema migration
- record deletion
- legacy cleanup
- new notification backend
- new impersonation behavior

Any such requirement must stop this workstream for a separate architecture
review.

---

## 12. Implementation order after this contract

### 2D.2B
Prove Membership pending aggregate runtime authorization contract.

### 2D.2C
Create pure Review Queue model/types/tests.

### 2D.2D
Wire connected authoritative sources into one queue contract.

### 2D.2E
Render Review Queue UI with explicit partial coverage.

### 2D.2F
Regression, Rules, security, performance, diff and production gates.

---

## 13. Production invariant

If a review item cannot be traced to a known authoritative source and explicit
review-state semantics, it must not appear as confirmed pending work.
