# FutVerse Pro Club Technical Governance V1 Contract Freeze

Status: PROPOSED CONTRACT SLICE — MODEL / PURE TESTS ONLY

## 1. Baseline and Safety Boundary

- Repository: `Jetsalit/Futverse-app`
- Base branch: `main`
- Exact base commit: `c9f3079691e899c8f78efdd26e52f4a5727ec636`
- Working branch: `feat/pro-club-technical-governance-v1-contract`

This slice may add only:

1. `docs/PRO_CLUB_TECHNICAL_GOVERNANCE_V1_CONTRACT_FREEZE.md`
2. `src/lib/proClubTechnicalGovernance.ts`
3. `tests/proClubTechnicalGovernance.unit.test.ts`

This slice must not modify:

- `firestore.rules`
- `firebase.json`
- `firebase.spark.json`
- `functions/**`
- `src/App.tsx`
- `src/components/**`
- Pro Club onboarding/provisioning runtime
- production data
- production deployment configuration

No production deploy, production HTTP call, production Firestore write, membership mutation, staff mutation, rename, provisioning, or force push is authorized by this slice.

## 2. Business Reality

Thai professional football club structures are not stable enough to hard-code a permanent assumption that every club has a Technical Director or that the same title always has the same final technical authority.

Examples that must be supported:

- a club with an ACTIVE Technical Director who co-authors, reviews, and approves technical work;
- a club with no Technical Director where the ACTIVE Head Coach is the highest technical authority;
- a former Head Coach later becoming Technical Director while a new Head Coach is appointed;
- a club with an unusual structure where SuperAdmin explicitly selects which ACTIVE Technical Director or Head Coach is the technical authority;
- a role change must not rewrite the historical role under which an old action was performed.

Therefore:

```text
STAFF ROLE != PERMANENT TECHNICAL AUTHORITY
```

and:

```text
TECHNICAL AUTHORITY IS RESOLVED FROM CURRENT CANONICAL STAFF STATE + GOVERNANCE CONFIG
```

## 3. Existing Invariants Preserved

This contract preserves the existing Pro Club authority model:

- `authorizationRole` remains `OWNER | ADMIN | MEMBER`;
- football staff role remains separate from tenant authorization;
- `TECHNICAL_DIRECTOR` and `HEAD_COACH` are functional staff roles, not tenant authority;
- this resolver never grants membership, Firestore access, or platform privilege;
- caller-supplied presentation role must never replace canonical ACTIVE staff assignment checks in future repository/service integration.

## 4. Governance Modes

V1 supports:

- `AUTO`
- `TECHNICAL_DIRECTOR`
- `HEAD_COACH`

### AUTO

AUTO is the default operational policy:

1. if exactly one ACTIVE Technical Director candidate exists, resolve that person;
2. otherwise, if exactly one ACTIVE Head Coach candidate exists, resolve that person;
3. if multiple ACTIVE candidates exist for the selected role, fail closed as `AMBIGUOUS`;
4. if no candidate exists, fail closed as `MISSING`.

### Explicit role mode

`TECHNICAL_DIRECTOR` or `HEAD_COACH` requires an ACTIVE candidate of exactly that role.

### Explicit selected UID

For unusual club structures, governance config may include `selectedAuthorityUid`.

The selected UID:

- must be an exact canonical document identifier;
- must reference an ACTIVE `TECHNICAL_DIRECTOR` or `HEAD_COACH` candidate;
- must match explicit role mode when mode is not AUTO;
- never grants tenant membership or platform authority.

The governance config has an exact field boundary. Only `authorityMode` and optional `selectedAuthorityUid` are accepted. Any unexpected field, including a misspelled selection field, must fail closed instead of being ignored or falling back to AUTO behavior.

## 5. Fail-Closed Requirements

The resolver must never guess when inputs are ambiguous or malformed.

It must fail closed for:

- malformed governance mode;
- unexpected governance config field;
- malformed candidate shape;
- duplicate candidate UID;
- padded/path-like UID;
- selected UID not ACTIVE;
- selected UID not a Head Coach or Technical Director;
- selected UID conflicting with an explicit role mode;
- multiple ACTIVE Technical Directors in AUTO without an explicit selected UID;
- multiple ACTIVE Head Coaches when Head Coach resolution is required without an explicit selected UID.

## 6. Capability Model

UI/workflow logic should depend on capabilities, not scattered role-name checks.

Frozen V1 capabilities:

- `canCreateTrainingPlan`
- `canEditTrainingPlan`
- `canCoAuthorTrainingPlan`
- `canSubmitTechnicalWork`
- `canReviewTechnicalWork`
- `canApproveSubmittedWork`
- `canPublishOwnTechnicalWork`

Head Coach and Technical Director may both participate in plan authoring, but only the exact resolved authority may review/approve/publish as authority.

This capability resolver is a presentation/workflow contract only. Future persistent writes must still independently verify canonical tenant membership, ACTIVE staff assignment, exact club identity, actor UID, and current technical authority server/rules-side as appropriate.

## 7. Self-Approval Rule

The highest technical authority must not conceptually approve its own work.

If resolved authority is also the work author:

```text
PUBLISH_OWN_WORK
```

If resolved authority reviews work authored by somebody else:

```text
REVIEW_AND_APPROVE
```

This allows Head Coach-led clubs to operate without inventing a fake approver.

## 8. Shared Technical Work Lifecycle

V1 freezes a common lifecycle:

```text
DRAFT
  ├─> SUBMITTED -> IN_REVIEW -> APPROVED
  │                         └-> NEEDS_REVISION -> SUBMITTED
  └─> PUBLISHED
```

`DRAFT -> PUBLISHED` is intended for the resolved authority publishing its own work.

`APPROVED` and `PUBLISHED` are terminal in this pure V1 model.

No persistent schema or Firestore path is introduced in this slice.

## 9. Historical Audit Requirement for Future Persistence

Future technical work persistence must snapshot action provenance at action time, including at minimum:

- actor UID;
- actor effective staff role at action time;
- action timestamp;
- technical authority role/UID where relevant;
- work status transition.

A later role change must never rewrite historical provenance.

Example:

```text
2026-06-01: Coach A approves as HEAD_COACH
2026-07-01: Coach A becomes TECHNICAL_DIRECTOR
```

The June action remains historically `HEAD_COACH`.

## 10. Explicitly Deferred

This slice does not define or implement:

- Firestore paths for governance config;
- SuperAdmin governance UI;
- staff role history persistence;
- training plan persistence;
- department report persistence;
- Dashboard or Role Workspace UI;
- Firestore Rules;
- server endpoints;
- production rollout.

Those require successor slices after this pure contract is independently reviewed and accepted.
