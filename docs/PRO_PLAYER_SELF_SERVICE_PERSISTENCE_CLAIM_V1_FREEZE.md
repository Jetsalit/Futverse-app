# Pro Player Self-Service Persistence / Claim V1 — Contract Freeze

## Status

Contract-only freeze. No Firestore Rules, Cloud Functions, repository writer, migration, production data, or deployment is changed in this slice.

Pre-work checkpoint: `cc8a6e52fdaa8fc2a2711a20bd15ffe537b3c99d`.

## 1. Problem

Professional players need to prepare and eventually submit their own FutVerse profile without gaining direct write authority over the global canonical `proPlayers` collection or lifelong FUTID identity records.

Existing boundaries are preserved:

- `proPlayers/{proPlayerId}` is a global Pro Player record and existing client create/update authority is administrative.
- `playerIdentities/{playerKey}` + `futIdRegistry/{futId}` form the lifelong identity pair.
- new Player Identity issuance remains ACTIVE SUPERADMIN-only.
- Player clients never mint FUTID values.

## 2. Critical privacy boundary

The canonical onboarding payload contains `expectedSalary` with visibility `PRIVATE` or `AUTHORIZED_CLUB_ONLY`.

The current root `proPlayers` collection is readable by signed-in users. Therefore the whole onboarding payload MUST NOT be copied into `proPlayers`.

Approved persistence must split data:

### Public-safe canonical profile

`proPlayers/{proPlayerId}` may receive only the public-safe onboarding projection. `expectedSalary` is absent.

### Private market preference

Reserved collection:

`proPlayerPrivateMarketPreferences/{playerKey}`

stores the expected-salary object under a future dedicated protected read contract. It must never inherit the broad signed-in read policy of root `proPlayers`.

### Private onboarding claim

Reserved collection:

`proPlayerOnboardingClaims/{uid}`

stores the complete submitted onboarding snapshot, including salary, for the claimant and controlled reviewer workflow. It must not be globally readable or listable by ordinary signed-in users.

### Account binding

Reserved collection:

`proPlayerAccountBindings/{uid}`

binds the Firebase account to the immutable player identity after approval.

## 3. Claim identity

V1 uses one deterministic current claim document per authenticated UID:

`proPlayerOnboardingClaims/{uid}`

The document body also carries the exact `userId`; future Rules/server logic must require path UID == authenticated UID == stored userId for self submission.

A V1 claim begins as `PENDING` and contains the validated canonical `ProPlayerOnboardingV1` snapshot.

The user must not choose or submit `playerKey`, `futId`, reviewer identity, approval state, or canonical record IDs.

## 4. Status lifecycle

Exactly:

- `PENDING`
- `APPROVED`
- `REJECTED`

Only `PENDING` may be decided.

`APPROVED` and `REJECTED` are terminal in V1. Rejection preserves the claim and submitted snapshot; it is not deleted or overwritten. A future resubmission/reconciliation version must be explicitly designed rather than silently rewriting historical evidence.

## 5. Reviewer authority

Global Pro Player identity approval is not Academy/Pro Club tenant administration.

Only an ACTIVE SUPERADMIN may decide a V1 claim because approval can lead to global canonical Pro Player creation/binding and Player Identity/FUTID issuance. ADMIN, club OWNER/ADMIN, COACH, PLAYER, PARENT and inactive SUPERADMIN are insufficient.

Future server code must re-read the authoritative `users/{reviewerUid}` document before approval/rejection and must not trust a client-supplied reviewer role/status.

## 6. Approval plan

A valid approval requires a reviewed, conflict-free `playerKey` and canonical issued FUTID. The client claimant cannot supply these identity values.

The future server-side approval transaction must fail closed if any destination already exists or conflicts. It must never blindly overwrite or auto-merge a legacy record based only on name, email, birth date, nickname, or club.

For a new identity, the logical approval outcome contains:

1. claim `PENDING -> APPROVED`;
2. public-safe canonical `proPlayers` profile without `expectedSalary`;
3. private salary/market preference record;
4. account-to-player identity binding;
5. Player Identity issuance using source `SUPERADMIN_ISSUANCE`;
6. matching FUTID registry record.

The final runtime implementation must provide one audited atomic/compensating-safe server transaction boundary that preserves the existing Player Identity atomic-pair invariant. This contract does not implement that transaction.

## 7. Duplicate and legacy safety

Before approval, future server implementation must check at minimum:

- an existing account binding for the claimant UID;
- existing Player Identity for the selected playerKey;
- existing FUTID registry claim;
- existing canonical Pro Player target;
- claim still `PENDING`;
- reviewer still ACTIVE SUPERADMIN.

Existing records are not overwritten.

Possible legacy duplicates require explicit manual reconciliation. V1 must not infer that two people are the same solely from matching personal fields.

## 8. Rejection

Rejection changes only the workflow state to `REJECTED` and preserves the original profile snapshot. It creates no Pro Player record, no account binding, no Player Identity, and no FUTID.

## 9. Client authority target for later implementation

This freeze does not change Rules, but future Rules/API must enforce:

- claimant may submit only their own valid initial PENDING claim;
- claimant cannot approve/reject, choose FUTID/playerKey, update terminal claim, or write canonical Pro Player/private market/binding/identity records directly;
- ordinary signed-in users cannot read another claimant's full claim or private salary;
- controlled reviewer reads/decisions require ACTIVE SUPERADMIN authority;
- list/query access must be deliberately scoped and must not arise from broad signed-in reads.

Because salary is sensitive, no future implementation is accepted if `expectedSalary` becomes readable from root `proPlayers`.

## 10. Existing architecture preserved

This contract does not:

- widen root `proPlayers` client write authority;
- change root `proPlayers` current Rules;
- let PLAYER mint FUTID;
- alter `playerIdentities` or `futIdRegistry` V1 schemas;
- reopen root legacy `/players`;
- create Academy or Pro Club membership;
- auto-link a club;
- auto-merge legacy players;
- delete claims or identity history;
- migrate production data.

## 11. Runtime implementation gate

Before any write-enabled slice starts, it requires a new recovery checkpoint and Data Recovery Plan because it will add user-data writes and security rules/functions.

Required later evidence includes:

1. emulator Rules tests for self-only claim creation/read;
2. cross-user claim denial;
3. broad claim list denial;
4. salary privacy denial;
5. ACTIVE SUPERADMIN review authority;
6. App Check + authenticated server entrypoint;
7. rate limiting/idempotency;
8. authoritative re-read before decision;
9. duplicate/conflict fail-closed tests;
10. atomic approval failure leaves no partial canonical/profile/identity state;
11. rejection preserves submitted claim;
12. regression for existing `proPlayers`, Player Identity, Academy player, Pro Club, FUTID and production boundaries.

Until these are implemented and pass independently, self-service persistence remains **BLOCKED** even though the form runtime can validate and review a local draft.
