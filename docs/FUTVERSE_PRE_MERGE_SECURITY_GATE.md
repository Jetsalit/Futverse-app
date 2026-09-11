# FutVerse Mandatory Pre-Merge Security Gate

## Status

This document is a project-wide, non-negotiable working standard for FutVerse development.

It applies to every branch, pull request, remediation, feature, migration, rules change, runtime change, UI change, script, deployment-preparation change, and security change.

The gate must not be weakened, skipped, renamed to avoid enforcement, or treated as optional. It may be changed only by an explicit owner instruction that specifically changes this standard.

## Required working sequence

Every FutVerse change must follow the preservation-safe sequence appropriate to its scope:

1. read-only baseline audit;
2. exact baseline / branch / HEAD verification;
3. isolated branch and explicit scope;
4. implementation or docs/tests-only slice as authorized;
5. focused tests plus required regressions;
6. independent review of the exact HEAD when required by the governing contract;
7. the five-question pre-merge security gate below;
8. exact-HEAD verification immediately before merge;
9. merge only when every required gate is PASS;
10. production deployment or production write only after a separate explicit authorization.

No force-push, destructive reset, production deployment, production data write, Rules deployment, Functions deployment, billing change, or credential exposure is implied by permission to continue development, review, open a PR, or merge source.

## The five mandatory questions

Before every merge, answer all five questions using evidence from the exact PR HEAD.

### 1. INPUT — Is input safe?

Verify all inputs crossing the changed boundary.

At minimum consider, where applicable:

- type, shape, length, format, normalization, canonical identity, and allowed enum validation;
- malformed, empty, oversized, duplicated, stale, replayed, expired, cross-tenant, or conflicting input;
- caller-controlled document IDs, paths, URLs, filenames, query parameters, route state, or serialized data;
- target identity binding and wrong-account / wrong-tenant cases;
- duplicate submission and concurrent action behavior;
- data copied from invitation, claim, membership, audit, or other authority evidence rather than caller-selected authority fields.

A UI constraint alone is never sufficient validation for an authority-bearing action.

### 2. AUTHORIZATION — Are permissions correct?

Verify that every read and write uses the correct authenticated authority.

At minimum consider, where applicable:

- actual authenticated actor versus presented/support/impersonated identity;
- account active/inactive state;
- global role versus tenant membership role versus football/staff role;
- exact tenant and exact document-path authority;
- privilege escalation, horizontal access, cross-tenant access, and self-approval;
- stale authority and revalidation immediately before a sensitive write;
- client state, URL state, local/session storage, cookies, cache, or UI visibility never becoming authority;
- approval/write transactions proving all required related authority evidence.

If authority is ambiguous, inferred only from UI state, or not revalidated where required, the gate is not PASS.

### 3. SECRET — Did any secret leak?

Inspect the exact diff, logs, test fixtures, documentation, screenshots, generated files, configuration, and repository history relevant to the change.

At minimum consider:

- API keys that are meant to remain secret;
- service-account keys;
- Firebase ID tokens;
- App Check tokens and debug tokens;
- access/refresh tokens;
- private keys;
- passwords;
- session cookies;
- production credentials;
- `.env` values;
- credentials accidentally echoed by scripts or tests.

Public client configuration that is intentionally public must not be mislabeled as a secret, but any credential that authorizes access must never be committed or printed.

A secret finding is a hard STOP. Rotate/revoke as appropriate before proceeding.

### 4. DEPENDENCY — Are dependencies trustworthy?

Review every dependency or supply-chain change introduced by the exact PR HEAD.

At minimum consider, where applicable:

- new package or tool necessity;
- package provenance and maintained status;
- unexpected install scripts or binary downloads;
- lockfile changes;
- version pinning / range risk;
- transitive dependency risk relevant to the changed boundary;
- whether existing platform/library capabilities can safely avoid adding a new dependency.

If the PR changes no dependency, package manifest, lockfile, external binary, or build tool, record `DEPENDENCY = N/A (NO CHANGE)` rather than inventing a PASS review that did not apply.

### 5. FAILURE_BEHAVIOR — What happens when something is abnormal?

Prove that unexpected or invalid conditions fail safely.

At minimum consider, where applicable:

- invalid, stale, expired, revoked, consumed, duplicate, or conflicting state;
- missing related documents;
- network failure and retry;
- concurrent tabs / concurrent writes;
- partial-write prevention;
- atomic transaction/batch requirements;
- default-deny behavior;
- no privilege bypass after error handling;
- no destructive fallback;
- no silent conversion of an error into higher authority;
- safe user-visible error behavior without credential or sensitive-data disclosure.

Authority-bearing multi-document changes must not leave partial authority when an operation fails.

## Mandatory result vocabulary

Each question must be recorded as exactly one of:

- `PASS`
- `FAIL`
- `UNKNOWN`
- `NOT TESTED`
- `N/A (NO CHANGE)` — allowed only for DEPENDENCY when no dependency/supply-chain surface changed, or another question only when a governing contract explicitly proves the category cannot apply.

Do not convert `UNKNOWN` or `NOT TESTED` into PASS based on confidence or expectation.

## Merge decision

Merge is allowed only when all conditions required for the change are true:

- `INPUT = PASS`;
- `AUTHORIZATION = PASS`;
- `SECRET = PASS`;
- `DEPENDENCY = PASS` or `N/A (NO CHANGE)`;
- `FAILURE_BEHAVIOR = PASS`;
- required focused tests and regressions = PASS;
- required independent review = PASS;
- PR HEAD exactly matches the reviewed/tested HEAD;
- scope matches the authorized scope;
- no unresolved security finding remains.

If any required result is `FAIL`, `UNKNOWN`, or `NOT TESTED`, the decision is:

`MERGE = STOP`

If the HEAD changes after a PASS review, all evidence affected by that change must be refreshed before merge.

## Minimum pre-merge report

Every merge decision should be able to report at least:

```text
BASE=<reviewed base SHA>
HEAD=<exact reviewed PR HEAD SHA>
SCOPE=<expected changed files / authorized boundary>

INPUT=PASS|FAIL|UNKNOWN|NOT TESTED
AUTHORIZATION=PASS|FAIL|UNKNOWN|NOT TESTED
SECRET=PASS|FAIL|UNKNOWN|NOT TESTED
DEPENDENCY=PASS|N/A (NO CHANGE)|FAIL|UNKNOWN|NOT TESTED
FAILURE_BEHAVIOR=PASS|FAIL|UNKNOWN|NOT TESTED

FOCUSED_TESTS=PASS|FAIL|NOT RUN
REGRESSION=PASS|FAIL|NOT RUN|N/A
INDEPENDENT_REVIEW=PASS|FAIL|NOT RUN|N/A
EXACT_HEAD_MATCH=PASS|FAIL
SCOPE_MATCH=PASS|FAIL

MERGE=ALLOWED|STOP
```

The report must be evidence-based. A successful build alone does not answer the five security questions.

## Production boundary

A source merge is not production authorization.

After merge, any action that deploys Hosting, Firestore Rules, Functions, indexes, server infrastructure, changes billing, invokes a production mutation, or writes production data requires the separate production/deployment/write authorization required by the governing FutVerse runbook or contract.
