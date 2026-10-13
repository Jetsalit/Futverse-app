# Pro Club Drill Submission V1 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let authorized Pro Club Head Coaches and GK Coaches submit immutable drill evidence for Technical Governance review without changing Academy behavior or the existing text-submission contract.

**Architecture:** New Pro Club drills receive immutable tenant provenance. Sending creates one immutable submission containing an exact source snapshot; small lifecycle records live in a separate review collection. A shared read-only viewer renders the snapshot, while Pro Club adapters and existing Technical Governance authorize submission and review.

**Tech Stack:** TypeScript, React, Firebase Firestore, Firestore Security Rules, React-Konva, Node test runner, Firebase Rules Unit Testing.

**Spec:** User-approved attachment C:\Users\asus\.codex\attachments\06956f2c-0f55-4af5-a005-051e6ddd1cb7\Pasted text.txt; shared snapshot/viewer contract from the preceding design decisions.

## Global Constraints

- Start from origin/main commit 4d66b839904f04acf572cfc10b729d1e05a372b2 on branch feat/pro-club-drill-submission-v1.
- Never access or modify the dirty V2 worktree at C:\Users\asus\AppData\Local\Temp\futverse-superadmin-spark-structural-v2.
- Submission path: proClubs/{clubId}/drillSubmissions/{submissionId}; review path: proClubs/{clubId}/drillSubmissionReviews/{submissionId}.
- Submission evidence is create-only; no review document at an authorized successful read means effective status SUBMITTED.
- Do not use nested visual documents, paired creates, getAfter()/existsAfter() dependencies, or mutable snapshots.
- Authorize only current proven Pro Club Head Coach and GK Coach drill-authoring paths; do not infer capability from role strings alone.
- New Pro Club drill provenance is organizationType: PRO_CLUB and organizationId: clubId; provenance and created_by are immutable.
- Snapshot the exact current source details, raw canvas_data, and persisted previewImage; preserve BOTH when present.
- Size preflight uses the published Firestore document-size formula and actual document path; reject above 1,044,480 bytes before any write.
- Review uses only current technicalGovernance/current; enforce same-club authority and existing self-review denial.
- Keep existing staffSubmissions and Academy UI, Rules, and behavior unchanged. No Academy adapter or reviewer authority.
- No Functions, Blaze, Cloud Storage, Path1, commits, pushes, merges, or deployments.
- After Rules changes and before broad tests, require both raw and canonical Rules headroom to be at least 4,096 bytes; otherwise stop without minifying or refactoring unrelated Rules.

## Review Focus

- Legacy or unprovenanced drills remain readable but cannot be submitted; pin in Task 1.
- Assisted identity or another owner's drill cannot become the source; source creator must equal the authenticated author; pin in Tasks 1 and 3.
- Snapshot values preserve photo, canvas fields, optional details, and BOTH independently of later source edits; pin in Tasks 2 and 3.
- A review lookup error is not absence; only a successful authorized absence maps to SUBMITTED; pin in Task 3.
- Oversize preflight must happen before repository create, including actual path and UTF-8 content; pin in Tasks 2 and 3.

---

### Task 1: Pro Club drill provenance and authoring scope

**Files:**
- Modify: src/lib/drillDataModel.ts
- Modify: src/hooks/useDrillDatabase.ts
- Modify: src/components/TacticBoard.tsx
- Modify: src/components/pro-club/operations/ProClubGKTrainingWorkspace.tsx
- Modify: src/components/pro-club/operations/ProClubTrainingDrillReferencePicker.tsx
- Modify: src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx
- Create: src/lib/proClubDrillProvenance.ts
- Test: tests/proClubDrillProvenance.unit.test.ts
- Test: tests/drillDataModel.test.ts
- Test: tests/drillOwnership.test.ts
- Test: tests/proClubGKTrainingWorkspace.unit.test.ts

**Interfaces:**
- Consume: exact active Pro Club authority already passed into GK Training and Head Coach Weekly Training.
- Produce: resolveProClubDrillProvenance(authority): ProClubDrillProvenance | null, accepting only active, same-organization Head Coach or GK Coach authority; optional persisted organizationType/organizationId; TacticBoard supplies the resolved provenance only from those guarded Pro Club surfaces.

- [x] Add failing tests named resolvesProvenanceForActiveHeadCoachAndGkCoach, rejectsInactiveWrongTenantAndOtherStaffRoles, preservesProvenanceOnEdit, and keepsLegacyDrillsReadable; assert generic and Academy saves omit Pro Club provenance.
- [x] Run node --import tsx --test tests/proClubDrillProvenance.unit.test.ts tests/drillDataModel.test.ts tests/drillOwnership.test.ts tests/proClubGKTrainingWorkspace.unit.test.ts; verify the new provenance assertions fail.
- [x] Implement the authority resolver, optional Drill provenance fields, and explicit Pro Club TacticBoard save context. Source edits must never change existing provenance.
- [x] Rerun the same focused tests and verify they pass.

### Task 2: Shared immutable snapshot contract and size calculator

**Files:**
- Create: src/lib/drillSubmittedSnapshot.ts
- Create: src/lib/firestore/firestoreDocumentSize.ts
- Test: new tests/drillSubmittedSnapshot.unit.test.ts
- Test: new tests/firestoreDocumentSize.unit.test.ts

**Interfaces:**
- Produce: DrillSubmittedSnapshot and DrillSubmittedDetails types plus buildDrillSubmittedSnapshot(source: Readonly<Record<string, unknown>>): DrillSubmittedSnapshot; copy the exact existing keys without normalization.
- Produce: calculateFirestoreDocumentSize(pathSegments: readonly string[], data: FirestoreValue): number; implement Firebase's published formulas for document names/overhead, field names, UTF-8 strings (+1), null, booleans, 64-bit integers/doubles, timestamps, bytes, document references, GeoPoints, arrays, maps, and vectors (8 bytes per dimension). Preserve exact nested-map accounting. Reject unsupported/non-Firestore values and malformed paths rather than guessing a size.
- Ceiling: APPLICATION_MAX_CALCULATED_BYTES = 1,044,480.

- [x] Add failing tests buildsUploadedImageSnapshot, buildsBoardSnapshotPreservingRawCanvasMap, buildsBothSnapshotWithoutDroppingEitherVisual, copiesOnlyPresentDrillDetails, and doesNotChangeAfterSourceMutation.
- [x] Add failing tests countsUtf8StringBytesAndFieldNames, countsNestedMapsAndArrays, countsTimestampAndDocumentName, includesFirestoreDocumentOverhead, acceptsAtApplicationCeiling, and rejectsAboveApplicationCeiling.
- [x] Add failing coverage for every supported Firestore primitive/type (null, boolean, integer, double, timestamp, string, bytes, reference, GeoPoint, array, map, vector), plus rejectsUnsupportedValues; use SDK value instances where required so type detection matches production payloads.
- [x] Include a 1,048,577-byte document case to prove the stricter application preflight rejects a value above Firestore's 1 MiB hard limit before create is called; Task 3 additionally verifies the repository does not call its injected create operation.
- [x] Add a maximum-valid-review-document test: construct the largest Rules-valid NEEDS_REVISION and APPROVED documents using the exact review schema, maximum valid IDs/UIDs, the 2,000-character note bound at worst-case UTF-8 width, all allowed lifecycle fields, and the real review path; calculate both with the same published-formula calculator, assert the larger exact calculated size, and assert it remains far below 1 MiB. Keep the exact caps in the Rules and test fixtures aligned.
- [x] Run node --import tsx --test tests/drillSubmittedSnapshot.unit.test.ts tests/firestoreDocumentSize.unit.test.ts; verify the new tests fail.
- [x] Implement the shared snapshot contract and published-formula calculator; do not use JSON.stringify length or normalized canvas values.
- [x] Rerun the same focused tests and verify they pass, including 1,044,480-byte acceptance and 1,044,481-byte rejection.

### Task 3: Pro Club submission and review repositories

**Files:**
- Create: src/lib/firestore/proClubDrillSubmissionsRepository.ts
- Create: src/lib/proClubDrillSubmissionReview.ts
- Test: new tests/proClubDrillSubmissionsRepository.unit.test.ts
- Test: new tests/proClubDrillSubmissionReview.unit.test.ts

**Interfaces:**
- Submission API: createProClubDrillSubmission(clubId: string, submissionId: string, sourceDrillId: string, ops?: ProClubDrillSubmissionRepositoryOps): Promise<DrillSubmissionRecord>. Resolve actor and current authority inside the repository; fetch raw source, validate provenance/ownership, snapshot it, size the final path, and create exactly one document.
- Review APIs: beginProClubDrillSubmissionReview(clubId, submissionId), requestProClubDrillSubmissionRevision(clubId, submissionId, note), and approveProClubDrillSubmission(clubId, submissionId, note). Create IN_REVIEW, then allow only IN_REVIEW to NEEDS_REVISION or APPROVED. Notes retain the existing 2,000-character bound.
- Reviewer and author inbox reads join submission evidence with same-path review state; a denied or failed read is an error, never inferred absence.
- Repository operations: getAuthenticatedUid(): string | null; resolveAuthority(clubId, uid); readDocument(pathSegments); listDocuments(pathSegments); createDocument(pathSegments, data); updateDocument(pathSegments, data); timestamp(). Validate every path segment before constructing Firestore references.

- [x] Add failing tests createsOneSnapshotForAuthorizedHeadCoach, createsOneSnapshotForAuthorizedGkCoach, rejectsOtherRoles, rejectsDifferentOwner, rejectsDifferentClubAndForgedProvenance, usesTheExactSourceDrillId, and doesNotCreateWhenPreflightRejects.
- [x] Add failing tests mapsSuccessfulMissingReviewToSubmitted, doesNotMapReviewReadErrorToSubmitted, requiresExactCurrentTechnicalAuthority, deniesCrossClubAndSelfReview, createsInReviewThenAllowsOnlyTwoTerminalActions, boundsReviewNoteAt2000Characters, and resubmissionCreatesS2WithoutChangingS1OrR1.
- [x] Run node --import tsx --test tests/proClubDrillSubmissionsRepository.unit.test.ts tests/proClubDrillSubmissionReview.unit.test.ts; verify the new tests fail.
- [x] Implement repositories using injectable operations consistent with the existing Pro Club repository pattern; submission creation writes only the immutable submission collection.
- [x] Rerun the same repository tests and verify they pass.

### Task 4: Narrow Firestore Rules and Rules emulator coverage

**Files:**
- Modify: firestore.rules
- Create: tests/firestore.pro-club-drill-submissions.rules.test.ts

**Interfaces:**
- /drills/{drillId}: authorize provenance only for the two proven Pro Club capabilities and freeze provenance plus creator; preserve legacy reads and non-Pro-Club save behavior.
- /proClubs/{clubId}/drillSubmissions/{submissionId}: exact keys, current author capability, source exists and binds to same club/authenticated creator, create only, no update/delete.
- /proClubs/{clubId}/drillSubmissionReviews/{submissionId}: bounded keys/fields, source existence, current Technical Governance authority, same-club binding, no self-review, valid create/update transitions, no delete.

- [ ] Add emulator tests allowsProvenancedHeadCoachAndGkDrillCreate, freezesProClubProvenanceAndCreator, keepsLegacyDrillReadableButNotSubmittable, allowsOnlySameClubOwnerSourceCreate, deniesForgedAndCrossClubSubmission, deniesSubmissionUpdateAndDelete, allowsCurrentAuthorityReviewOnly, deniesCrossClubAndSelfReview, allowsOnlyInReviewTransitions, and boundsReviewNote.
- [ ] Run firebase emulators:exec --project demo-futverse-pro-club-drill-submissions --only firestore "node --import tsx --test --test-concurrency=1 tests/firestore.pro-club-drill-submissions.rules.test.ts"; verify the new Rules assertions fail against the baseline Rules.
- [ ] Add the narrowest scoped Rules needed; do not alter Academy or unrelated match/helper behavior.
- [ ] Immediately measure raw working-tree Rules bytes and canonical LF/Git-equivalent bytes against the pre-change values.
- [ ] Continue only if both raw and canonical headroom are at least 4,096 bytes; otherwise stop and report the exact headroom failure without automatic minification.
- [ ] Run the new Rules test and existing tests/firestore.drills.rules.test.ts; verify Academy fixtures/flows remain unchanged.

### Task 5: Shared read-only submitted-work viewer

**Files:**
- Create: src/components/common/SubmittedWorkViewer.tsx
- Create: src/components/common/ReadOnlyTacticBoardCanvas.tsx
- Test: new tests/submittedWorkViewer.unit.test.tsx
- Test: tests/drillRenderingContract.test.ts

**Interfaces:**
- Component: SubmittedWorkViewer({ snapshot }: { snapshot: DrillSubmittedSnapshot }); no source drill ID lookup or Firestore hook.
- Render: exact submitted image, read-only board pitch/elements/ball/lines/equipment/colors/theme, BOTH clearly, and only present submitted detail fields.
- Expose no edit, save, clear, delete, drag, drawing, or ownership callbacks.

- [ ] Add failing tests rendersExactSubmittedImageDataUrl, rendersSubmittedBoardElementsAndLinesReadOnly, rendersBothSubmittedVisuals, rendersOnlySubmittedDetails, and doesNotReadSourceOrExposeEditingControls.
- [ ] Run node --import tsx --test tests/submittedWorkViewer.unit.test.tsx tests/drillRenderingContract.test.ts; verify the new tests fail.
- [ ] Implement the shared viewer and reuse existing Tactic Board render semantics where practical, keeping all review rendering non-interactive.
- [ ] Rerun the same viewer/rendering tests and verify they pass.

### Task 6: Send Work entry points and Technical Governance review inbox

**Files:**
- Modify: src/components/pro-club/operations/ProClubGKTrainingWorkspace.tsx
- Modify: src/components/pro-club/operations/ProClubTrainingDrillReferencePicker.tsx
- Modify: src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx
- Modify: src/components/pro-club/operations/ProClubStaffSubmissions.tsx
- Test: new tests/proClubDrillSubmissionUi.unit.test.tsx
- Test: existing tests/proClubStaffSubmissionsModel.unit.test.ts
- Test: existing tests/proClubStaffSubmissionsRepository.unit.test.ts

**Interfaces:**
- Eligible Pro Club drill cards retain exact selected drill context and expose Open Drill / Send Work.
- The Technical Governance inbox composes immutable drill submissions with existing text submissions without changing existing text submission records or lifecycle.
- Drill review opens SubmittedWorkViewer before Request Changes or Approve; legacy text submission preview uses the exact fallback text from the spec.
- Legacy preview copy: Submitted work preview unavailable for this legacy submission.

- [ ] Add UI tests sendsSelectedGkDrillWithoutRepicking, sendsSelectedHeadCoachDrillWithoutRepicking, showsEffectiveSubmittedStatusWithoutReviewDoc, opensSnapshotBeforeReviewDecision, showsAllPresentDrillDetails, showsLegacyPreviewFallback, and preservesExistingTextSubmissionReviewControls.
- [ ] Run node --import tsx --test tests/proClubDrillSubmissionUi.unit.test.tsx; verify the new tests fail.
- [ ] Add the Pro Club author actions and separate drill review cards; do not wire any Academy adapter or reviewer.
- [ ] Rerun the UI tests plus tests/proClubStaffSubmissionsModel.unit.test.ts and tests/proClubStaffSubmissionsRepository.unit.test.ts; verify all pass unchanged.

### Task 7: Targeted verification and independent reviews

**Files:**
- Review all feature diff; make no unrelated edits.

- [ ] Before lint or any broad test command, measure raw working-tree firestore.rules bytes and canonical LF/Git-equivalent bytes; verify each has at least 4,096 bytes of remaining source budget. Stop immediately if either headroom is below 4,096; do not minify or refactor unrelated Rules.
- [ ] Run npm run lint.
- [ ] Run node --import tsx --test tests/proClubDrillProvenance.unit.test.ts tests/drillDataModel.test.ts tests/drillOwnership.test.ts tests/proClubGKTrainingWorkspace.unit.test.ts tests/drillSubmittedSnapshot.unit.test.ts tests/firestoreDocumentSize.unit.test.ts tests/proClubDrillSubmissionsRepository.unit.test.ts tests/proClubDrillSubmissionReview.unit.test.ts tests/submittedWorkViewer.unit.test.tsx tests/drillRenderingContract.test.ts tests/proClubDrillSubmissionUi.unit.test.tsx tests/proClubStaffSubmissionsModel.unit.test.ts tests/proClubStaffSubmissionsRepository.unit.test.ts.
- [ ] Run firebase emulators:exec --project demo-futverse-pro-club-drill-submissions --only firestore "node --import tsx --test --test-concurrency=1 tests/firestore.pro-club-drill-submissions.rules.test.ts tests/firestore.drills.rules.test.ts".
- [ ] Record the Task 7 pre-lint Rules byte counts and headroom in the final report; Task 4's immediate post-Rules gate remains required as well.
- [ ] Have Team A independently verify the complete author → immutable S1 → read-only review → decision/resubmit flow and Academy unchanged.
- [ ] Have Team B independently attack direct Rules writes, tenant/owner spoofing, snapshot immutability, review authority/transitions, sizing bypass, Rules access calls/size, and regressions.
- [ ] Inspect exact changed files and confirm the base remains 4d66b839904f04acf572cfc10b729d1e05a372b2; stop if either review is RED.
- [ ] Report test results, review verdicts, exact headroom, and changed files. Do not commit.
