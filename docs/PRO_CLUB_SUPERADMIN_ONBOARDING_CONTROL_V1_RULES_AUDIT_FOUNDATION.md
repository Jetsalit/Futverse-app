# Pro Club SuperAdmin Onboarding Control V1 — Rules + Audit Foundation

## Purpose

This slice defines and tests the Firestore Rules data contract for the future Spark-native Pro Club SuperAdmin onboarding control path before root `firestore.rules` integration or runtime/UI wiring.

It is an isolated Rules foundation. It does **not** deploy Rules, change production behavior, write production data, enable Functions, change billing, or authorize merge of the contract PR.

## Accepted stacked base

- parent branch: `feat/pro-club-superadmin-onboarding-control-v1-contract`
- accepted parent HEAD: `b4dd3c22ec45b1f555ac61a401160a7161a36402`
- implementation branch: `feat/pro-club-superadmin-onboarding-control-v1-rules-audit`

## Exact audit path

SuperAdmin control actions use the global append-only registry:

`proClubOnboardingControlAudits/{actionId}`

Action IDs are deterministic:

- invitation issuance: `INVITE-{inviteCode}`
- claim approval: `APPROVE-{claimId}`
- claim rejection: `REJECT-{claimId}`

The deterministic ID prevents a successful control action from satisfying the audit requirement with an unrelated audit document.

## Exact audit schema

Every audit document contains exactly:

- `schemaVersion: 1`
- `actionId`
- `actionType`: `INVITE_ISSUED | CLAIM_APPROVED | CLAIM_REJECTED`
- `actorUid`: actual authenticated SuperAdmin UID
- `clubId`
- `targetUid`
- `inviteCode`
- `claimId`: `null` only for `INVITE_ISSUED`, otherwise exact claim ID
- `staffRole`: exact canonical Pro Club staff role
- `createdAt`: `request.time`

Audit create is allowed only for an ACTIVE canonical `SUPERADMIN`. Update and delete are always denied.

## Atomic coupling

The governing invariant is:

`SUPERADMIN CONTROL WRITE + AUDIT = SAME ATOMIC COMMIT`

A SuperAdmin invitation create succeeds only when the matching `INVITE_ISSUED` audit exists after the same atomic commit with exact actor, club, target, invite, role and timestamp bindings.

A SuperAdmin approval succeeds only when one atomic commit produces all of:

1. PENDING claim -> APPROVED;
2. canonical onboarding approval proof;
3. Membership `MEMBER / ACTIVE`;
4. Staff assignment with the exact invited role / ACTIVE;
5. ACTIVE invitation -> CONSUMED with the exact claim ID;
6. matching `CLAIM_APPROVED` audit.

A SuperAdmin rejection succeeds only when one atomic commit produces all of:

1. PENDING claim -> REJECTED;
2. ACTIVE invitation -> REVOKED;
3. no Membership, Staff or approval proof;
4. matching `CLAIM_REJECTED` audit.

The audit rule also verifies the corresponding same-commit domain mutation. Therefore a forged or standalone audit cannot satisfy the contract.

## Authority boundary

SuperAdmin control authority is based only on the actual authenticated account:

- `users/{request.auth.uid}.role == SUPERADMIN`
- account status ACTIVE
- target Pro Club ACTIVE

It does not create or require Pro Club Membership or Staff for the SuperAdmin.

Support presentation, impersonation state, selected organization, URL/local state and client-provided actor fields are never authority.

## Invitation boundary

Spark-native SuperAdmin invitation issuance accepts only exact existing account UID / Account Reference. Browser email-to-UID discovery remains out of scope and fail-closed in Spark production.

The invitation continues to enforce:

- exact canonical `FUT-PC-*` invitation identity;
- exact existing ACTIVE target account;
- target is not the authenticated actor;
- target is not a global SUPERADMIN;
- target has no existing Membership or Staff relationship in that club;
- `membershipAuthorizationRole == MEMBER` only;
- canonical football staff role only, including `HEAD_COACH`;
- ACTIVE invitation lifecycle;
- actor-bound server timestamp audit fields;
- expiration after `request.time` and no more than seven days.

## Claim boundary

The invited account must authenticate as itself. Claim identity remains deterministic:

`{targetUid}_PRO_CLUB_{inviteCode}`

The claim copies club, role and membership authority from the ACTIVE unexpired invitation. Wrong-recipient claims, replay after relationship creation, and claimant self-approval fail closed.

## Existing tenant reviewer preservation

The isolated fixture retains a minimal canonical OWNER/ADMIN reviewer path to prove that introducing SuperAdmin control authority does not require replacing tenant reviewer authority.

This fixture is **not** a replacement for root `firestore.rules`. Existing production behaviors such as all legacy reviewer read/revoke variants remain preserved until a later root-integration slice explicitly proves regressions against the real root Rules.

## Required emulator evidence

Dedicated emulator tests must cover at least:

- ACTIVE SuperAdmin invite + matching audit succeeds;
- missing, mismatched or forged invitation audit fails atomically;
- inactive SuperAdmin, global ADMIN and normal USER cannot use the SuperAdmin path;
- MEMBER ceiling cannot be escalated;
- invalid/missing/self/existing-member targets fail;
- tenant OWNER invitation still succeeds without a SuperAdmin audit;
- exact recipient can claim and wrong recipient cannot;
- SuperAdmin approval + audit succeeds atomically;
- missing/forged approval audit fails with no partial Membership/Staff/proof/invite transition;
- incomplete approval bundle rolls back;
- claimant cannot self-approve;
- SuperAdmin rejection + audit succeeds atomically;
- rejection without valid audit rolls back;
- audit update/delete is denied;
- canonical tenant OWNER approval still succeeds without a SuperAdmin audit.

## Five-question security gate for this slice

Before this slice may advance to root Rules integration:

- `INPUT` must be proven by emulator tests and exact schema validation;
- `AUTHORIZATION` must prove actual ACTIVE SuperAdmin identity and tenant reviewer preservation;
- `SECRET` must show no credential/token/config secret in the exact diff;
- `DEPENDENCY` should be `N/A (NO CHANGE)` unless the exact branch changes package/build dependencies;
- `FAILURE_BEHAVIOR` must prove fail-closed atomic rollback and no partial authority.

Any required `FAIL`, `UNKNOWN` or `NOT TESTED` means `MERGE=STOP` and root integration must not begin.

## Explicitly out of scope

This foundation does not authorize:

- editing root `firestore.rules`;
- runtime repository changes;
- UI changes;
- production Rules/Hosting/Functions/index deployment;
- production Firestore writes;
- Cloud Functions enablement;
- billing changes;
- SuperAdmin tenant membership fabrication;
- browser user-directory lookup;
- merge without independent exact-HEAD review.
