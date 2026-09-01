# FutVerse Organization Runtime Selection V1
# React Auth Lifecycle Contract Succession Gap Freeze

Status: FROZEN CONTRACT ADDENDUM FOR REACT AUTH LIFECYCLE IMPLEMENTATION

Baseline:

- base branch: `main`
- base SHA: `a7dbb9b78ac57b2857718d9cfda6d94e20dc178f`
- remediation branch: `fix/organization-runtime-react-auth-lifecycle-contract-succession-gap`

## 1. Purpose

This addendum repairs one contract-succession omission discovered during the
separately reviewed React Auth Lifecycle implementation.

The production implementation itself did not expose an Academy authority,
Pro Club authority, persistence, Firebase, or TypeScript defect.

The discovered failure is a historical phase-specific provider-absence guard
that remained in:

`tests/organizationRuntimeProClubAuthorityBridgeContract.test.ts`

after the later React Auth Lifecycle Contract explicitly approved:

`OrganizationRuntimeProvider`

## 2. Baseline provider-absence inventory

At base SHA:

`a7dbb9b78ac57b2857718d9cfda6d94e20dc178f`

exactly two Organization Runtime Contract tests contain the historical:

`OrganizationRuntimeProvider|OrganizationProvider`

provider-absence assertion:

1. `tests/organizationRuntimeSelectionContract.test.ts`
2. `tests/organizationRuntimeProClubAuthorityBridgeContract.test.ts`

The React Auth Lifecycle Contract already approved succession of the first
guard.

It omitted succession of the second guard.

`CONTRACT GAP != PRODUCTION AUTHORITY DEFECT`

## 3. Historical Pro Club Contract intent

The frozen Pro Club Authority Bridge Contract remains historically correct for
its own phase.

That earlier slice explicitly states:

`No provider or UI integration`

and separately states:

`React/provider integration requires a later dedicated slice.`

Therefore its provider-absence assertion is phase-specific and must not become
a permanent architecture ban once the later dedicated React slice is approved.

The historical Pro Club Contract document itself remains unchanged.

`PHASE-SPECIFIC ABSENCE GUARD != PERMANENT PROVIDER BAN`

## 4. Exact succession authorization

This addendum authorizes the React Auth Lifecycle implementation to modify one
additional existing test file:

`tests/organizationRuntimeProClubAuthorityBridgeContract.test.ts`

The modification is limited strictly to the superseded provider-absence
assertion that reads `src/main.tsx`.

Equivalent approved succession:

- retire the historical negative assertion forbidding
  `OrganizationRuntimeProvider|OrganizationProvider`
- replace it with a compatibility assertion requiring the approved
  `<OrganizationRuntimeProvider>` presence
- preserve the surrounding Academy authority checks
- preserve every unrelated Pro Club bridge Contract assertion

No other assertion in that file is approved for modification.

The succession-gap Contract test is a permanent transition guard and must
remain valid after the authorized provider succession occurs.

Its live-state rule is exact:

- before `OrganizationRuntimeProvider` is mounted in `src/main.tsx`, both
  historical provider-absence guards must remain present
- after `OrganizationRuntimeProvider` is mounted in `src/main.tsx`, both
  superseded provider-absence guards must be retired
- a partial state where provider integration exists while either historical
  provider-absence guard remains is forbidden

The succession-gap Contract test itself must not require a later modification
merely because the authorized succession was completed.

`PARTIAL SUCCESSION != AUTHORIZED SUCCESSION`

## 5. Expanded implementation candidate scope

With this addendum, the approved React Auth Lifecycle implementation candidate
may modify exactly five paths:

1. add `src/contexts/OrganizationRuntimeContext.tsx`
2. modify `src/main.tsx`
3. add `tests/organizationRuntimeReactAuthLifecycle.test.ts`
4. update `tests/organizationRuntimeSelectionContract.test.ts` only for its
   superseded phase-specific provider-absence guard
5. update `tests/organizationRuntimeProClubAuthorityBridgeContract.test.ts`
   only for its superseded phase-specific provider-absence guard

No additional production source path is approved.

Production source scope remains exactly:

- `src/contexts/OrganizationRuntimeContext.tsx`
- `src/main.tsx`

## 6. Preserved boundaries

This addendum does not authorize modification of:

- `src/contexts/AuthContext.tsx`
- `src/contexts/AcademyContext.tsx`
- `src/contexts/SupportPresentedUserBridge.tsx`
- `src/contexts/SuperAdminSupportContext.tsx`
- `src/contexts/SuperAdminNonStaffSupportContext.tsx`
- `src/lib/organizationRuntimeSelection.ts`
- Pro Club authority bridge production code
- Firestore Rules
- `package.json`
- Match
- Academy authority
- Pro Club authority semantics
- runtime persistence
- organization selection UI

The React lifecycle runtime actor remains:

`actualUser.uid`

and never support-presented:

`currentUser.uid`

## 7. Addendum exact scope

This Contract Succession Gap Freeze may add exactly:

- `docs/ORGANIZATION_RUNTIME_SELECTION_V1_REACT_AUTH_LIFECYCLE_SUCCESSION_GAP_FREEZE.md`
- `tests/organizationRuntimeReactAuthLifecycleSuccessionGapContract.test.ts`

No production source file may change during this remediation.

No existing file may change during this remediation.

## 8. Review gate

Team 1 may author this addendum but must not approve it for commit.

Team 2 must independently verify:

- the baseline contains exactly two historical provider-absence guards
- Selection Contract succession was already approved
- Pro Club Contract test succession was omitted
- the Pro Club historical Contract reserved later React/provider integration
- the new authorization is limited to exactly one additional existing test
- production source remains unchanged
- existing Organization Runtime baseline regression remains GREEN
- TypeScript remains GREEN
- exact two-file remediation scope is preserved

Only Team 2 GREEN may advance this addendum to controlled commit.

## 9. Exit

After this addendum is reviewed, committed, pushed, merged, and synchronized to
the implementation branch baseline, the paused React Auth Lifecycle
implementation may resume.

The paused implementation must not be discarded merely because this contract
succession omission was discovered.

`PRESERVE IMPLEMENTATION / REPAIR CONTRACT / THEN RESUME`
