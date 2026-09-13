# Pro Club Existing Technical Governance Bootstrap V1 Contract Freeze

Status: `CONTRACT_FREEZE_ONLY`

Baseline: `368f773db11558b094065d8bcad2566362bafd44`

Branch: `feat/pro-club-existing-technical-governance-bootstrap-v1-contract`

## 1. Fixed scope

This contract freezes a future trusted bootstrap operation for an existing Pro Club whose canonical technical-governance document is absent. It does not implement that operation and does not authorize its execution.

The current production blocker is generic: an existing ACTIVE Pro Club and an ACTIVE Head Coach may pass Weekly Training visibility and fresh-DRAFT form validation, but a Weekly Training write remains fail-closed when the canonical current technical authority document is missing.

The required document path is exactly:

`proClubs/{clubId}/technicalGovernance/current`

The contract slice contains only this document and its static contract test. It must not change application source, Cloud Functions, Firestore Rules, indexes, schemas outside the current document, dependencies, Weekly Training behavior, or production data.

- `CONTRACT_SCOPE=EXISTING_PRO_CLUB_TECHNICAL_GOVERNANCE_CURRENT_BOOTSTRAP_ONLY`
- `TECHNICAL_GOVERNANCE_CURRENT_REQUIRED=YES`
- `EXISTING_CLUB_ONLY=YES`
- `IMPLEMENTATION_INCLUDED=NO`
- `PRODUCTION_EXECUTION_AUTHORIZED=NO`
- `PRODUCTION_WRITE_IN_CONTRACT_SLICE=NO`

## 2. Current architecture facts

The existing pure governance model already supplies `resolveProClubTechnicalAuthority`. Existing production provisioning does not create the current technical-governance document, and no reviewed production writer currently materializes it. Browser/client creation is intentionally denied by Firestore Rules.

- `CLIENT_CREATE_ALLOWED=NO`
- `CANONICAL_PRODUCTION_WRITER_EXISTS=NO`
- `PROVISIONING_CREATES_GOVERNANCE_CURRENT=NO`
- `RULE_CHANGE_REQUIRED=NO`
- `WEEKLY_CODE_CHANGE_REQUIRED=NO`

## 3. Trusted invocation boundary

Any future implementation must be an Admin SDK operation in a trusted runtime. Before any club read or mutation, it must:

1. authenticate the operator from trusted runtime context;
2. authorize that identity against deployment-controlled bootstrap policy, never a client-supplied role or a Weekly Training bypass;
3. require an explicit expected Firebase project identifier;
4. compare that identifier with the Admin SDK application's resolved project identifier; and
5. fail closed if the operator, authorization, project pin, or Admin credentials are missing or do not match.

The only tenant input is the exact existing `{clubId}` document identifier. Empty values, surrounding whitespace, slash-containing values, path-like values, and normalized or repaired alternatives are rejected. Authority UID, authority role, staff state, and membership state are never accepted from requester-controlled input.

Application Default Credentials or an equivalent trusted secret provider supplies Admin credentials. Credentials and tokens must not be accepted as command arguments, written into the canonical document, or emitted in logs or reports.

- `TRUSTED_ADMIN_WRITER_REQUIRED=YES`
- `TRUSTED_OPERATOR_VERIFICATION_REQUIRED=YES`
- `PROJECT_PIN_REQUIRED=YES`
- `SECRET_IN_DOCUMENT=NO`
- `SUPERADMIN_WEEKLY_BYPASS=FORBIDDEN`

## 4. Canonical club, staff, and membership gates

Within one consistency boundary, the future operation must read the exact existing club and require its canonical status to be `ACTIVE`. It must read canonical technical-leadership staff from:

- `proClubs/{clubId}/staff/{uid}`

For every relevant staff identity, it must read the matching membership from:

- `proClubs/{clubId}/members/{uid}`

Malformed, duplicate, path-mismatched, unsupported-role, or otherwise non-canonical records fail closed. An ACTIVE technical-leadership staff record without the same UID's matching ACTIVE membership is invalid and must not be silently discarded to manufacture a different winner.

After resolution, the selected `authorityUid` must identify both an ACTIVE canonical membership and an ACTIVE canonical staff record. The persisted `authorityRole` must exactly equal that staff record's canonical `staffRole` and must be either `TECHNICAL_DIRECTOR` or `HEAD_COACH`.

- `ACTIVE_CLUB_REQUIRED=YES`
- `CANONICAL_STAFF_REQUIRED=YES`
- `CANONICAL_MEMBERSHIP_REQUIRED=YES`
- `ACTIVE_MEMBERSHIP_REQUIRED=YES`
- `ACTIVE_STAFF_REQUIRED=YES`
- `AUTHORITY_UID_IDENTITY_PARITY_REQUIRED=YES`
- `AUTHORITY_ROLE_STAFF_ROLE_PARITY_REQUIRED=YES`

## 5. AUTO authority resolution

The future operation must call the existing `resolveProClubTechnicalAuthority` model in `AUTO` mode after the canonical-input gates pass. It must not duplicate, replace, or weaken that model.

AUTO resolution is frozen as follows:

1. Exactly one ACTIVE Technical Director resolves to that Technical Director.
2. Otherwise, exactly one ACTIVE Head Coach resolves to that Head Coach.
3. No eligible ACTIVE authority resolves to `MISSING` and performs no write.
4. More than one ACTIVE candidate at the winning tier resolves to `AMBIGUOUS` and performs no write.
5. Invalid canonical state, including an authority candidate without its required matching ACTIVE membership, fails closed and performs no write.

- `AUTO_AUTHORITY_RESOLUTION=YES`
- `AUTO_TECHNICAL_DIRECTOR_PRECEDENCE=YES`
- `AUTO_HEAD_COACH_FALLBACK=YES`
- `AMBIGUITY_FAIL_CLOSED=YES`
- `MISSING_FAIL_CLOSED=YES`

## 6. Exact current-document schema

The only permitted canonical document has exactly four fields:

```ts
type ProClubTechnicalGovernanceCurrentV1 = {
  schemaVersion: 1;
  status: "ACTIVE";
  authorityUid: string;
  authorityRole: "TECHNICAL_DIRECTOR" | "HEAD_COACH";
};
```

No operator identity, request identifier, timestamp, source label, tenant label, or other audit metadata belongs in this document.

- `CURRENT_DOCUMENT_EXACT_FOUR_FIELD_SCHEMA=YES`
- `CURRENT_DOCUMENT_EXTRA_FIELDS=FORBIDDEN`

## 7. Transactional and idempotent behavior

The future writer must use a transaction or an equivalently atomic trusted-side primitive. The operation must revalidate the ACTIVE club, canonical staff, matching memberships, AUTO resolution, and existing current document within that consistency boundary.

The only possible mutation is creation of:

`proClubs/{clubId}/technicalGovernance/current`

Behavior is exact:

- If the current document is absent and resolution is `FOUND`, create it once with the exact four-field schema.
- If the current document exists, first require that it has exactly the four allowed fields and satisfies every current canonical invariant.
- If an existing valid document is byte-for-value identical to the newly resolved four-field value, return `NOOP` and perform no write.
- If an existing document is malformed or differs from the resolved value, return `CONFLICT` and perform no write.
- Never update, merge, repair, replace, or delete an existing current document.
- Never write any other document.

- `CREATE_IF_ABSENT=YES`
- `IDENTICAL_REPLAY_NOOP=YES`
- `MISMATCH_CONFLICT=YES`
- `EXISTING_CURRENT_OVERWRITE=FORBIDDEN`
- `SINGLE_DOCUMENT_WRITE_BOUNDARY=YES`

## 8. Client and product boundaries

Client creation remains forbidden. Firestore Rules remain unchanged and fail closed. The bootstrap does not grant SuperAdmin, Head Coach, Technical Director, staff, or any browser actor a new client write path.

The bootstrap must not modify Weekly Training schema, UI, visibility, form validation, write authority, existing DRAFT records, or DRAFT lifecycle. It must not modify club, membership, or staff documents. It must not add lifecycle transitions or any general-purpose technical-governance editor.

- `CLIENT_WRITE_REMAINS_FORBIDDEN=YES`
- `RULE_CHANGE=FORBIDDEN`
- `WEEKLY_CODE_CHANGE=FORBIDDEN`
- `CLUB_DOCUMENT_CHANGE=FORBIDDEN`
- `MEMBERSHIP_DOCUMENT_CHANGE=FORBIDDEN`
- `STAFF_DOCUMENT_CHANGE=FORBIDDEN`
- `DRAFT_LIFECYCLE_CHANGE=FORBIDDEN`

## 9. Auditability and tenant neutrality

Execution evidence belongs outside the canonical current document in the controlled execution report and existing trusted operational logging. This contract does not add a production audit collection. Evidence must record the pinned project, exact club input, verified operator identity, precondition outcomes, resolver outcome, document outcome (`CREATED`, `NOOP`, or fail-closed result), and error classification without recording secrets.

No real club identifier, club name, user identifier, or tenant-specific branch is permitted in application source, the future writer, this contract, or its test. The operation is generic and accepts only the exact explicit `{clubId}` input.

- `AUDIT_EVIDENCE_LOCATION=CONTROLLED_EXECUTION_REPORT_ONLY`
- `NEW_PRODUCTION_AUDIT_COLLECTION=NO`
- `TENANT_HARDCODE=FORBIDDEN`

## 10. Five-question safety gate

- `INPUT_GATE=PASS`: one exact existing club document identifier; no caller-selected authority data and no normalization.
- `AUTHORIZATION_GATE=PASS`: authenticated trusted operator, deployment-controlled authorization, Admin SDK, and exact project pin are mandatory before access.
- `SECRET_GATE=PASS`: no secret input, persistence, or logging; credentials remain in the trusted runtime.
- `DEPENDENCY_GATE=PASS`: reuse the existing authority resolver and existing Admin SDK/runtime; no new dependency is authorized by this contract.
- `FAILURE_BEHAVIOR_GATE=PASS`: missing, ambiguity, invalid state, project mismatch, authorization failure, and existing-document mismatch all fail closed with no write.

## 11. Explicit exclusions

This contract does not implement, execute, deploy, or authorize a production write. It does not change Rules, indexes, Functions, application source, Weekly Training, provisioning, club administration, membership administration, staff management, schemas outside the exact current document, or any DRAFT lifecycle.

