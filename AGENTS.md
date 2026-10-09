# FUTVERSE Development Rules

## FUTVERSE RULE-001 — Firestore Architecture & Growth Control

**STATUS: MANDATORY — BLOCKING DEVELOPMENT GATE**

This rule applies to all FutVerse development involving Firestore data, collections, documents, fields, queries, listeners, authentication, authorization, or Firestore Security Rules.

The primary objectives are to preserve existing production functionality, maintain strong security isolation, control Firestore Rules complexity, and keep development compatible with Firebase Spark.

### 1. Mandatory Firestore Impact Assessment

Before implementing any new or changed feature, document:

- Affected collections, document paths, fields, data types, and document IDs.
- Ownership, source of truth, relationships, and lifecycle.
- Expected read, create, update, delete, query, and listener behavior.
- Whether existing Firestore Rules already support the feature securely.
- Impact on existing Academy, Pro Club, SuperAdmin, Player, Parent, Fitness, Weekly Training, Tactic Board, Analysis, and Drill Submission functionality.
- Any migration, compatibility, or data-backfill requirements.

**Required decision:**

`RULES_IMPACT=NONE | EXISTING_RULES_REUSED | RULES_CHANGE_REQUIRED`

If no Rules change or authorization behavior change is required, document that result and reuse relevant accepted evidence.

Do not modify Security Rules merely because a UI feature is added.

### 2. Mandatory Rules Size & Compiler Complexity Budget

Every actual Firestore Rules source change must measure and report:

- Exact source bytes before and after the change, using canonical LF normalization.
- Net source-byte increase or decrease.
- Applicable Firebase source-size limit: 262,144 bytes (256 KiB).
- Applicable compiled executable limit: 256,000 bytes (250 KiB).
- Compiled-size measurement when a reliable supported method is available.
- Function dependencies, helper scope, repeated validations, match-block complexity, and potential compiler-cost risks.

If compiled size cannot be measured, explicitly report:

`COMPILED_SIZE=UNKNOWN`

Never assume that reducing source bytes guarantees reducing compiled executable size.

Successful source compilation, emulator tests, or Ruleset creation does not prove that Firebase Release activation will succeed.

Prefer secure reuse of existing authorization contracts rather than unnecessary new Rules.

**While the current HTTP 400 activation issue remains unresolved, unnecessary Rules growth is prohibited.**

Any necessary expansion requires documented justification, size-budget assessment, and explicit approval.

Never remove security checks to satisfy compiler or size limits.

### 3. Mandatory Authorization & Production Preservation

Use least-privilege authorization for all Firestore operations.

For affected resources, document:

- Authorized identity and roles.
- Allowed get, list, create, update, and delete operations.
- Membership, organization, ownership, and status requirements.
- Protected fields and document-schema validation.
- Explicit unauthorized, wrong-role, cross-user, cross-organization, malformed-data, and invalid-state DENY scenarios.

Never trust client-supplied role or ownership claims without authoritative verification.

Never treat UI visibility as an authorization boundary.

**Preserve all previously approved production security behavior.**

This includes:

- Academy memberships and staff specialties.
- Pro Club memberships, staff, and technical governance.
- SuperAdmin access assignment, role changes, reactivation, and audit linkage.
- Player and Parent access.
- Fitness and Weekly Training.
- Tactic Board, Analysis, and Drill Submission.
- Cross-club and cross-Academy isolation.
- Existing protected fields and lifecycle restrictions.

Never delete working features or silently change authorized access to reduce Rules complexity.

Never substitute older production Rules for current main Rules if doing so would omit approved security contracts.

Diagnostic Rules used in a Lab are not automatically production-safe.

### 4. Mandatory Verification & Independent Review

When Security Rules or authorization semantics change:

1. Verify the exact base commit, Rules Git blob, and changed-file scope.
2. Define or reuse an affected-operation authorization matrix with both ALLOW and DENY cases.
3. Run relevant Firebase Emulator Rules tests.
4. Test affected query shapes and cross-organization access.
5. Run source validation and applicable compilation checks.
6. Run targeted regressions for affected existing functionality.
7. Obtain Team A implementation/security review and independent Team B review.
8. Stop on regressions, unauthorized scope changes, or unresolved security concerns.

**Avoid redundant work:**

- Reuse accepted tests and CI results when underlying code is unchanged.
- Do not rerun unrelated test suites without justification.
- Do not repeat failed activation experiments without a new documented hypothesis.
- Do not reopen settled reviews unless the relevant implementation changes.

For documentation-only or UI-only changes that do not alter Rules or authorization behavior, perform the applicable lightweight checks rather than full Rules regression testing.

### 5. Spark-Only & Controlled Release Policy

`SPARK_ONLY=YES`

`BLAZE=NO`

Do not automatically introduce:

- Blaze billing upgrades.
- Cloud Functions deployment.
- Cloud Run or other paid backend dependencies.
- Cloud Storage feature migrations.
- Production data mutations.
- Destructive migration or reset operations.

Any change to these restrictions requires separate explicit authorization.

Preserve existing worktrees, dirty files, production data, and approved application features.

Never use reset, restore, clean, stash, force push, destructive deletion, or overwrite operations against protected work without explicit authorization.

Use isolated worktrees for corrective changes when needed.

Verify worktree identity and Git status before committing. If Git verification is unavailable or unreliable, report the blocker; do not assume the working tree is clean or alter Git metadata to force the gate to pass.

Commit, push, pull request creation, merge, Lab activation, Production Rules activation, Hosting deployment, and production data writes must follow their applicable authorization gates.

Do not assume approval of one stage authorizes later stages.

### Mandatory Enforcement

A Firestore-related feature is not implementation-ready until its applicable architecture assessment is recorded.

A Rules change is not release-ready until its required size, security, and verification gates pass.

If a required gate fails:

**STOP. Preserve existing working functionality. Report the blocker and propose the smallest safe corrective action.**

Never bypass authorization checks, relax Rules, silently remove functionality, or upgrade the Firebase plan to make an operation succeed.

**FUTVERSE RULE-001 is mandatory for future feature planning, implementation, review, and release decisions.**
