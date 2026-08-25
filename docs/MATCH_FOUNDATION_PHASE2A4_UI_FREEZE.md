# FutVerse Match Foundation — Phase 2A.4 UI Architecture Freeze

Status: FROZEN FOR IMPLEMENTATION

Base commit:

8d40f930b90f7ad8f3cb110f7f1accb4e48abe66

Branch:

feat/match-foundation-phase2a4-match-ui

## 1. Purpose

Phase 2A.4 introduces the first production Match workspace UI on top of
the frozen Match domain contract and the Phase 2A.3 Academy Match repository.

This phase does not implement Starting XI persistence, roster persistence
through UI, Match statistics, Parent observations, or Pro Club Match storage.

## 2. Canonical UI flow

Dashboard / Sidebar
  -> Match Workspace
  -> src/lib/firestore/matchRepository.ts
  -> Firestore Security Rules

The canonical application page identifier is:

matches

The legacy page identifier:

/coach/match-evaluation

must remain supported and render the same canonical Match Workspace.
It must not create a parallel Match system.

## 3. Tenant authority

The Match Workspace obtains academyId only from AcademyContext.

The UI must fail closed when no authoritative academyId is available.

The Match UI must not derive tenant authority from:

- global users.role
- arbitrary academyId input
- URL/user-entered tenant identity
- stored Match academyId payload

Firestore Rules remain the final authorization authority.

## 4. UI access

Match Workspace is an Academy staff capability.

UI-visible roles remain aligned with the existing Match/Starting XI surface:

- ADMIN
- COACH
- SUPERADMIN when operating through an authorized Academy workspace

PARENT, PLAYER, SCOUT, USER, and unrelated global roles do not receive
the Match Workspace through this phase.

UI guards are defense in depth only.
Firestore Rules remain authoritative.

## 5. Match Workspace operations

Phase 2A.4 may call only these Match repository operations:

- listAcademyMatches
- createAcademyMatch
- updateAcademyMatch

No UI code may directly call Firestore Match collection/document APIs.

No Match delete action may exist.

## 6. Create behavior

New Matches are created as DRAFT.

The create form may collect:

- squadLabel
- competitionName
- opponentName
- kickoffAt
- venueType

Fields optional in DRAFT remain nullable according to the frozen domain
contract.

The UI must never invent Match IDs, academyId payload fields, synthetic
identity, FUTID, or roster data.

## 7. Edit behavior

Same-status corrections are available only for non-terminal states:

- DRAFT
- SCHEDULED
- IN_PROGRESS

The UI edits the full frozen MatchCoreData shape and delegates validation
and persistence to the Match repository/domain boundary.

createdAt and createdBy are never editable UI fields.

## 8. Lifecycle controls

Allowed lifecycle actions:

DRAFT:
- Schedule
- Cancel

SCHEDULED:
- Start Match
- Cancel

IN_PROGRESS:
- Complete Match
- Cancel

COMPLETED:
- no mutation

CANCELLED:
- no mutation

Terminal Match records are rendered read-only.

The UI must not present a control for an invalid lifecycle transition.

## 9. List and detail experience

The Match Workspace contains one coherent responsive workspace rather than
parallel Match pages.

It should provide:

- Match list
- status filtering
- clear empty state
- loading state
- recoverable read error state
- selected Match detail
- create form
- edit form
- lifecycle actions
- terminal read-only state
- mobile and desktop layouts

Match cards/details should show, when available:

- squad label
- competition
- opponent
- kickoff
- venue
- status

Historical/audit fields may be displayed where useful but are never editable.

## 10. Refresh behavior

Phase 2A.4 uses the existing server-read repository API.

After create or update/lifecycle mutation, the workspace reloads the
authoritative Match list through listAcademyMatches.

This phase does not introduce a second realtime Firestore listener path.

## 11. Starting XI boundary

src/components/StartingXIBuilder.tsx is protected in Phase 2A.4.

Phase 2A.4 must not:

- persist formation
- persist lineup slots
- persist Match roster from Starting XI
- pass arbitrary Match roster identity from UI
- rewrite Starting XI player loading

Starting XI persistence belongs to Phase 2A.5.

Existing Starting XI navigation may remain for preservation until 2A.5.

## 12. Roster boundary

Although Phase 2A.3 repository exports roster operations, Phase 2A.4 UI
must not call:

- readAcademyMatchRoster
- createAcademyMatchRosterPlayer
- updateAcademyMatchRosterPlayer
- removeAcademyMatchRosterPlayer

Roster/Starting XI integration is Phase 2A.5.

## 13. Post-Match placeholder

PostMatchStatsEntry remains a fail-safe placeholder for functionality that
does not yet exist:

- Match statistics
- player ratings
- coach awards

Its copy must no longer claim that no authoritative Match backend exists,
because the canonical Match foundation and repository now exist.

This phase must not activate statistics writes.

## 14. Navigation

Dashboard receives a dedicated Matches entry in Daily Operations.

Sidebar uses the canonical `matches` page identifier.

Legacy `/coach/match-evaluation` remains compatible by rendering the
canonical workspace.

Do not delete old navigation behavior merely to simplify this phase.

## 15. Language

New Match Workspace user-facing copy must support both:

- English
- Thai

Use the existing LanguageContext translation registry.
Do not introduce a competing localization mechanism.

## 16. UI design direction

The Match Workspace should follow FutVerse's established neutral slate
application shell while being more operational and information-dense than
a generic AI-generated card page.

Use:

- clear hierarchy
- restrained status accents
- readable fixture cards
- deliberate whitespace
- responsive controls
- accessible button labels
- explicit destructive Cancel Match treatment
- strong empty/loading/error states

Avoid decorative UI that has no operational purpose.

## 17. Protected architecture

Phase 2A.4 must not modify:

- firestore.rules
- src/lib/matchFoundation.ts
- src/lib/firestore/matchRepository.ts
- src/components/StartingXIBuilder.tsx
- src/components/WeeklyPeriodization.tsx
- src/contexts/AcademyContext.tsx
- existing Match Foundation tests
- existing Match Firestore Rules tests
- existing Membership Rules tests
- Membership architecture
- FUTID architecture

## 18. Exact implementation scope

Only these files may change in Phase 2A.4:

1. docs/MATCH_FOUNDATION_PHASE2A4_UI_FREEZE.md
2. src/components/match/MatchWorkspace.tsx
3. src/components/match/matchWorkspaceModel.ts
4. tests/matchWorkspaceModel.test.ts
5. src/App.tsx
6. src/components/Dashboard.tsx
7. src/contexts/LanguageContext.tsx
8. src/components/PostMatchStatsEntry.tsx

Files 1–4 are new.
Files 5–8 are controlled modifications.

Any requirement outside this exact scope requires architecture review
before editing.

## 19. Pure UI model

Match UI-specific logic that does not require React should live in:

src/components/match/matchWorkspaceModel.ts

It may contain pure helpers for:

- Match list sorting
- status filtering
- lifecycle action derivation
- form-to-domain conversion
- datetime-local conversion/normalization

It must reuse the frozen Match domain contract rather than duplicate it.

## 20. Acceptance gate

Phase 2A.4 is acceptable only when:

- exact eight-file scope is preserved
- protected architecture hashes remain unchanged
- Match workspace model tests pass
- existing Match domain tests pass
- existing Match repository tests pass
- Match Firestore Rules tests pass
- Membership Rules regression tests pass
- TypeScript passes
- production build passes
- git diff --check passes
- no direct Firestore Match access exists in new UI code
- no roster repository operation is consumed by 2A.4 UI
- no Match delete control/API is introduced
- terminal Match UI is immutable
- legacy Match Evaluation navigation resolves to the canonical Match Workspace
- StartingXIBuilder remains byte-identical
- no commit, push, merge, or deploy occurs before explicit gate approval