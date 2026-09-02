# FutVerse Pro Club Staff Onboarding V1 Contract Freeze

## 1. Purpose and governing invariants

This Contract Freeze defines the security and delivery boundaries for future
Pro Club Coach and Staff onboarding. It is documentation and contract tests
only. It authorizes no production behavior, Firestore mutation, user-interface
change, or deployment.

The governing invariants are:

`REGISTRATION INTENT != ACCOUNT AUTHORITY`

`ACCOUNT ROLE != TENANT AUTHORITY`

`MEMBERSHIP AUTHORITY != FOOTBALL STAFF ROLE`

`SELECTION != AUTHORITY`

Every future onboarding phase must fail closed unless the exact canonical
evidence required by that phase exists and is valid.

## 2. Exact baseline and scope

- workspace: `C:\Users\asus\Documents\Futverse-app`
- base branch: `main`
- base commit: `9ca605de968914c1bac3edc9ced53cebd607c2fb`
- contract branch: `feat/pro-club-staff-onboarding-v1-contract`
- origin: `https://github.com/Jetsalit/Futverse-app.git`

This Contract Freeze may add exactly:

- `docs/PRO_CLUB_STAFF_ONBOARDING_V1_CONTRACT_FREEZE.md`
- `tests/proClubStaffOnboardingV1Contract.test.ts`

It must not modify production source, Firestore Rules, or predecessor tests.

The frozen source boundaries and Git blob hashes are:

- `src/App.tsx`: `d62d58aa240091f92819973ae2f28f5f38fc64e5`
- `src/contexts/AuthContext.tsx`: `a8824a9ad13eaec756e82c236041ca545bd7a87a`
- `src/contexts/academyAccessModel.ts`: `e5a437ea2af1b7bbfdab1b14b09cdf057adc1681`
- `src/components/JoinAcademy.tsx`: `e3fd3859adeb26b4ed491b495a74ee32a46996f0`
- `src/lib/accountRolePolicy.ts`: `a9c64001dcff5c427f324f594cbe5cf7c89498df`
- `src/types/Membership.ts`: `2ec3c6c334ea7a9477152a1dc28b141c17da76bd`
- `src/types/ProClub.ts`: `e0b95171b4cc1c0c783d6ac010feb8d27a98f2ea`
- `src/lib/firestore/proClubOrganizationAdapter.ts`: `52bb75b33d00231bb5142640c51bb78c10b42cc6`
- `firestore.rules`: `78f16bc6f05e53adff514674cb7a2362c77e5ae9`

## 3. Current baseline facts

Public registration currently offers `COACH` as registration intent. The
intent is classified as Membership intent, not account or tenant authority.
Selecting `COACH` during registration does not grant tenant authority.

Non-`PLAYER` registration starts as a generic `USER` in a pending/inactive
account state. Public registration creates only the canonical user and its
registration audit log. It must not create an Academy Membership, a Pro Club,
a Pro Club Membership, a Pro Club staff assignment, a tenant pointer, or an
organization authorization proof.

`JoinAcademy` is Academy-specific onboarding and remains unchanged. The
Academy Membership architecture is not replaced or generalized by this
Contract Freeze.

Canonical Pro Club tenant authority is stored at:

`proClubs/{clubId}/members/{uid}`

Football employment and operational assignment are stored separately at:

`proClubs/{clubId}/staff/{uid}`

`authorizationRole` and `staffRole` are separate security domains. Current Pro
Club Firestore Rules expose constrained exact-document reads but no client
create, update, or delete path. The current Rules do not permit end-to-end Pro
Club onboarding mutation. A dedicated Rules and Data Contract is required
before any future write path may be opened.

## 4. Public signup boundary

Future signup UI may collect non-authoritative metadata describing whether a
person intends to onboard as Coach/Staff and whether the intended organization
type is Academy or Pro Club. This data is intention only.

Public signup must never:

- grant `OWNER`, `ADMIN`, or `MEMBER`;
- grant `HEAD_COACH`, `ASSISTANT_COACH`, `FITNESS_COACH`, `ANALYST`, `PHYSIO`,
  `TEAM_MANAGER`, or `STAFF`;
- create a Pro Club;
- create a Membership;
- create a staff assignment;
- inject organization authority or runtime authorization;
- select an arbitrary club and become authorized;
- self-approve.

Any intended organization type stored in the future must remain explicitly
non-authoritative metadata.

## 5. No automatic organization creation

`PUBLIC REGISTRATION != ORGANIZATION CREATION`

Registering as Coach or Staff does not create an Academy or Pro Club. Pro Club
creation is a separate privileged organization lifecycle. A public user must
present reviewed invitation or claim evidence and receive approved assignment
before entering an organization.

## 6. Pro Club join boundary

The contractual flow is:

`Account registration`
-> `Pro Club join/invite intent`
-> `review`
-> `approved canonical Membership`
-> optional football `staff` assignment
-> `Organization Runtime selection`
-> canonical authority resolution
-> workspace

Registration and invitation intent cannot skip directly to `AUTHORIZED`.

## 7. Invite and claim safety

This Contract Freeze deliberately does not name a new collection. A future
invite/claim model requires a dedicated schema review and must enforce:

- exact UID and exact Pro Club identity;
- deterministic, replay-safe claim identity;
- an active, non-revoked invitation;
- no account-wide club discovery;
- no arbitrary `clubId` supplied as authority;
- no self-approval;
- immutable claimant identity after creation;
- reviewed approval and rejection states;
- duplicate-safe behavior;
- auditable created, approved, and rejected actors and timestamps;
- fail-closed handling for malformed or missing evidence.

The Academy claim schema must not be copied and renamed without its own
dedicated review.

## 8. Membership authority boundary

Canonical tenant authority comes only from an exact valid active document at
`proClubs/{clubId}/members/{uid}` and must pass the existing Pro Club authority
adapter and Organization Runtime chain.

`STAFF DOCUMENT ALONE != TENANT AUTHORITY`

`staffRole != authorizationRole`

A staff document without a valid active Membership cannot authorize Pro Club
workspace access.

## 9. Public onboarding privilege ceiling

Public Coach/Staff onboarding cannot self-grant `OWNER` or `ADMIN`. Granting
either role is a separate privileged management path requiring a dedicated
contract and review. If ordinary staff onboarding later creates Membership,
its authority ceiling must not exceed the role approved by a future dedicated
Membership contract. This Contract Freeze authorizes no `OWNER` or `ADMIN`
assignment implementation.

## 10. Football staff role boundary

The operational roles are:

- `HEAD_COACH`
- `ASSISTANT_COACH`
- `FITNESS_COACH`
- `ANALYST`
- `PHYSIO`
- `TEAM_MANAGER`
- `STAFF`

They describe football or presentation responsibility, not tenant authority.
Future capability mapping may use them only after canonical Membership
authority has passed.

`HEAD_COACH != tenant admin`

`staffRole != membershipAuthorizationRole`

Neither mapping may happen automatically.

## 11. Account role preservation

Global `users.role` is not a Pro Club authorization source. Onboarding must not
set a global role and then use it to bypass Membership. Future app-shell and
routing work must be organization-aware and must not force a Pro Club Coach
through Academy Membership merely because the global role is `COACH`.

This Contract Freeze does not modify `App.tsx`, `academyAccessModel.ts`,
`AuthContext.tsx`, or routing.

## 12. Account activation boundary

The current application uses account status and account role for parts of its
account lifecycle and presentation. Future Pro Club activation is a separate
tenant concern.

`ACTIVE ACCOUNT != ACTIVE PRO CLUB MEMBERSHIP`

`ACTIVE PRO CLUB MEMBERSHIP != FOOTBALL STAFF ROLE`

`ACCOUNT ACTIVATION != TENANT AUTHORIZATION`

Account activation may be an application prerequisite, but it is never a Pro
Club authorization proof. Successful Pro Club Membership approval cannot use
global account role or account status as tenant authority.

Pro Club application activation:

- must not create Membership authority;
- must not fabricate `AUTHORIZED`;
- must not use `users.role` as Pro Club authorization proof;
- must not use `activeAcademyId`;
- must not require an Academy Membership;
- must not route a Pro Club Coach through `JoinAcademy`;
- must not create or persist `activeProClubId` as authority;
- must remain subordinate to canonical
  `proClubs/{clubId}/members/{uid}` authority;
- must preserve exact `actualUser.uid` actor ownership.

The current generic `USER` and inactive account lifecycle compatibility must
receive explicit review before real Pro Club workspace entry.

## 13. Organization Runtime boundary

Onboarding approval does not permit workspace entry until canonical evidence
is resolved by the existing Organization Runtime chain:

- Organization Runtime Selection V1;
- `selectProClub`;
- a trusted runtime request;
- `resolveProClubRuntimeAuthority`;
- the canonical Pro Club adapter;
- the exact authenticated `actualUser.uid`;
- stale-generation protection.

Onboarding code must not create an `AUTHORIZED` state, reconstruct a trusted
request, or inject an authorization proof.

## 14. Authenticated actor boundary

The authenticated actor is exactly `actualUser.uid`, never:

- `currentUser.uid`;
- a support-presented UID;
- a claimed UID from a form;
- an invite owner;
- a requested user;
- a global role.

`PRESENTED USER != AUTHENTICATED ACTOR`

SuperAdmin support presentation must not replace the authenticated actor.

## 15. Academy preservation

This Contract Freeze must not change:

- `JoinAcademy`;
- Academy invite flow or Academy `profile_claims`;
- Academy Membership;
- `AcademyProvider`;
- `activeAcademyId`;
- Academy Rules;
- Academy Match authority;
- Academy staff routing.

A future shared onboarding UI requires separate review and must preserve or
strengthen Academy security.

## 16. Firestore Rules boundary

Current Pro Club Rules are the frozen read-only baseline. This Contract Freeze
adds no client mutation.

A future Pro Club Invite / Claim / Membership Rules and Data Contract must
prove at least:

- unauthenticated access is denied;
- arbitrary club mutation is denied;
- self-Membership grant is denied;
- self-`OWNER`/`ADMIN` escalation is denied;
- staff-only authority is denied;
- forged claims are denied;
- mismatched UID and mismatched club are denied;
- replay and duplicate behavior is safe;
- identity fields are immutable;
- only an approved transition can mutate authority;
- reviewer authority is exact;
- Academy Rules remain unchanged;
- production default deny remains intact.

No write implementation may precede that reviewed Rules contract and its
emulator tests.

## 17. No organization discovery

This Contract Freeze does not approve listing or searching all Pro Clubs,
account-wide organization enumeration, client-side membership scanning,
collection-group discovery, or guessing club IDs. V1 onboarding begins only
from a reviewed invite/claim mechanism.

## 18. No persistence shortcut

Authority must never originate from `localStorage`, `sessionStorage`, cookies,
`IndexedDB`, URL state, a persisted `activeProClubId`, a persisted
`activeOrganizationId`, or any client authority cache. Canonical evidence must
be resolved for the current authenticated runtime.

## 19. SuperAdmin boundary

SuperAdmin assignment or repair may become a separate privileged lifecycle.
This Contract does not allow support presentation or Work As Staff to create
Membership, a support target to become the authenticated actor, or generic
SuperAdmin UI to perform silent onboarding mutation. Any privileged assignment
requires a dedicated audited contract.

## 20. Required implementation succession

End-to-end onboarding must not be delivered as one broad unreviewed change.
The minimum separately reviewed slices are:

1. **Pro Club Staff Onboarding Contract Freeze** — this docs/tests-only slice.
2. **Pro Club Invite / Claim / Membership Rules & Data Contract** — exact
   schema, Firestore paths, mutation authority, and emulator/rules tests.
3. **Pro Club Onboarding Service Implementation** — reviewed transactional
   service with no UI unless explicitly approved.
4. **Registration Organization Intent / Routing Contract** — safely distinguish
   Academy and Pro Club intent without authority in account metadata. This
   slice owns reviewed Pro Club account/application lifecycle compatibility,
   including the current `USER` and inactive account states, before any
   Organization-aware Onboarding UI or Pro Club Workspace Entry. If that
   ownership is broader than this slice can safely review, it must be split
   into a separate dedicated reviewed slice before UI or workspace work.
5. **Organization-aware Onboarding UI** — preserve Academy, provide reviewed
   Pro Club invite/join UI, and add no discovery shortcut.
6. **Pro Club Workspace Entry** — select and resolve the exact Pro Club, then
   map staff capabilities only after Membership authority and enter a real
   workspace/dashboard.

Each slice requires separate tests, review, commit, and pull request.

## 21. Future user journey

`Coach creates FutVerse account`
-> chooses or declares Pro Club onboarding intent
-> supplies reviewed invite evidence
-> waits for approval
-> approved canonical Membership exists
-> optional reviewed staff assignment exists
-> account/application lifecycle permits entry
-> selects and resolves the exact Pro Club
-> Organization Runtime returns `AUTHORIZED`
-> Coach enters Pro Club workspace
-> operational capability derives from reviewed Membership plus staff
assignment

No step may skip canonical Membership authority.

## 22. Out of scope

This Contract Freeze does not implement or approve:

- Login UI changes;
- `JoinAcademy` changes;
- Join Pro Club UI;
- an organization selector;
- Pro Club dashboard wiring;
- Firestore Rules changes;
- invite, claim, Membership, or staff writes;
- user activation or global role changes;
- navigation or route changes;
- persistence;
- deployment.

## 23. Required future regression tests

A later implementation program must prove:

1. signup intent cannot authorize;
2. invite intent cannot authorize;
3. missing Membership cannot authorize;
4. inactive Membership cannot authorize;
5. active Membership can reach runtime authority;
6. staff without Membership cannot authorize;
7. `HEAD_COACH` cannot self-elevate;
8. `MEMBER` cannot become `ADMIN` through public onboarding;
9. `OWNER` cannot be self-granted;
10. exact UID mismatch fails;
11. exact club mismatch fails;
12. malformed invite fails closed;
13. revoked invite fails;
14. duplicate or replayed claim is safe;
15. claimant cannot self-approve;
16. unauthorized reviewer cannot approve;
17. approved Membership identity is exact;
18. staff assignment does not create authority;
19. authenticated actor remains `actualUser.uid`;
20. support-presented identity cannot authorize;
21. Academy onboarding remains unchanged;
22. Academy Rules remain unchanged;
23. Pro Club current read adapter remains unchanged;
24. no club-wide discovery exists;
25. no persistence shortcut exists;
26. no global-role bypass exists;
27. no direct signup Membership write exists;
28. no direct signup staff write exists;
29. stale runtime selection cannot authorize the wrong club;
30. production default-deny boundary remains intact.
31. account activation alone cannot authorize Pro Club;
32. Pro Club Coach onboarding cannot require Academy Membership or
    `activeAcademyId`;
33. changing global `users.role` cannot substitute for canonical Pro Club
    Membership.

## 24. Review gate

This Contract Freeze must receive independent Team 2 architecture and security
review before commit. Team 1 must not approve its own work. No implementation,
push, pull request, merge, or deployment is authorized by this document.
