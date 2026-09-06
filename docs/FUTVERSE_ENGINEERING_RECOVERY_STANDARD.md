# FutVerse Engineering Recovery & Review Standard

This standard applies to all work on `integration/pro-club-v1` and is intended to make engineering status understandable without reading source code.

## Core rules

- NO_CHECKPOINT = NO_WORK.
- BUG_WITHOUT_RECORD = NOT_ACCEPTED.
- DEBUG_WITHOUT_ROOT_CAUSE = NOT_ACCEPTED.
- FIX_WITHOUT_TEST = NOT_FIXED.
- FIX_WITHOUT_REGRESSION = NOT_COMPLETE.
- TEST_PASS_WITHOUT_REVIEW = NOT_COMPLETE.
- UNSTABLE_FIX = ROLLBACK_TO_SAFE_CHECKPOINT.
- PRODUCTION_CHANGE_WITHOUT_AUTHORIZATION = NOT_ALLOWED.

## Required change record

Every staging commit must declare these exact Git commit trailers:

```text
Checkpoint: <40-char known-good ancestor SHA>
Risk: LOW | MEDIUM | HIGH | CRITICAL
Data-Write: YES | NO
Schema-Change: YES | NO
Recovery: CODE_ONLY | CODE_AND_DATA
Review: REQUIRED
Owner-Alert: REQUIRED | NOT_REQUIRED
```

`Checkpoint` must be an available ancestor of the commit being tested, but it does not have to be the immediate parent. This is intentional: if one commit fails CI, the corrective commit may continue to reference the earlier verified safe checkpoint.

If `Data-Write=YES` or `Schema-Change=YES`, `Recovery` must be `CODE_AND_DATA`. Otherwise it must be `CODE_ONLY`.

`HIGH` and `CRITICAL` work must set `Owner-Alert=REQUIRED`.

## Bug and debug protocol

When a bug is detected, report:

```text
BUG_ID=
SEVERITY=P0|P1|P2|LOW
SYMPTOM=
EXPECTED=
ACTUAL=
FAILED_HEAD=
LAST_SAFE_CHECKPOINT=
PRODUCTION_AFFECTED=YES|NO
DATA_DAMAGE=YES|NO|INVESTIGATING
STATUS=INVESTIGATING
```

Before changing code, reproduce the bug where reasonably possible and identify the root cause. The fix must be scoped to the root cause, retested, and followed by relevant regression tests and independent review.

If repeated fixes remain unstable, stop patching and return to the Last Safe Checkpoint using a normal corrective commit or a clean branch from that checkpoint. Do not force-push shared history.

## Rollback and recovery

Code-only changes must always have a known rollback checkpoint.

Data-changing or schema-changing work must additionally define the affected data scope and a data recovery/reconciliation plan before deployment. Code rollback alone does not count as data recovery.

Production rollback, production data restore, or other destructive production mutation requires explicit owner authorization.

## Owner Alert

A failed Staging Safety workflow emits a GitHub Actions Summary containing:

```text
STATUS=BLOCKED
INCIDENT_SCOPE=STAGING_CI
FAILED_HEAD=
LAST_SAFE_CHECKPOINT=
PRODUCTION_AFFECTED=NO
PRODUCTION_DATA_MUTATION=NO
ROLLBACK_AVAILABLE=YES
TEAM_ACTION=DEBUG_ROOT_CAUSE_THEN_FIX_OR_ROLLBACK
OWNER_ACTION_REQUIRED=NO
SAFE_TO_CONTINUE=NO
```

The Owner Alert reads the declared `Checkpoint` trailer rather than guessing from `HEAD^`.

This is a staging incident signal, not a production incident notification. Production monitoring and external notification channels are separate release-infrastructure work.

## Definition of Done

A work item is not complete until applicable implementation tests, regression tests, independent review, security/data review, and recovery readiness have passed.
