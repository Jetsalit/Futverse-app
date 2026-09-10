# FutVerse Pro Club Player / Squad V1 — Pure Domain Freeze

## Status

`PHASE=PURE_DOMAIN_ONLY`

`PARENT_CONTRACT_HEAD=212d93ec1bb9fb86a98b83305ae27537a0f3eca6`

`PERSISTENCE=NOT_AUTHORIZED`

`FIRESTORE_RULES_CHANGE=NOT_AUTHORIZED`

`UI_CHANGE=NOT_AUTHORIZED`

`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`

This slice implements only deterministic Player / Squad V1 domain validation and lifecycle rules on top of PR #136. It does not create Firestore storage, queries, transactions, security rules, UI, account linking, Match Squad integration, or production writes.

## Canonical roster status

The exact V1 statuses are:

- `ACTIVE`
- `INACTIVE`
- `RELEASED`

`RELEASED` is terminal.

## Exact lifecycle transition matrix

Initial `JOIN` creates only an `ACTIVE` roster period.

Allowed transitions after creation:

- `ACTIVE -> INACTIVE`
- `ACTIVE -> RELEASED`
- `INACTIVE -> ACTIVE`
- `INACTIVE -> RELEASED`

Forbidden transitions include:

- same-status rewrites through the lifecycle transition helper;
- `RELEASED -> ACTIVE`;
- `RELEASED -> INACTIVE`;
- `RELEASED -> RELEASED`;
- any unknown status.

A later same-status metadata correction operation may be separately designed, but lifecycle transition authorization must not be abused as a generic record editor.

## Exact V1 payload

The pure validated record contains exactly:

- `schemaVersion`
- `status`
- `squadLabel`
- `shirtNumber`
- `joinedAt`
- `releasedAt`
- `createdBy`
- `updatedBy`

The authoritative `clubId` and `proPlayerId` remain document-path/context identity and are not stored in this payload.

Unknown fields fail validation.

## Squad label

`squadLabel` is either `null` or exact trimmed non-empty text with maximum length 80 characters.

No automatic trim or silent normalization is performed.

## Shirt number

`SHIRT_NUMBER_MIN=1`

`SHIRT_NUMBER_MAX=99`

`shirtNumber` is either `null` or an integer from 1 through 99 inclusive.

The value is roster metadata only. It is not player identity, account identity, Match identity, or uniqueness authority. A later persistence/competition policy may enforce club/squad-specific shirt-number uniqueness without changing the player's identity.

## Time representation

Pure domain time values use canonical ISO-8601 UTC strings exactly representable by JavaScript `Date.toISOString()`, for example `2026-09-11T00:00:00.000Z`.

`DOMAIN_TIME_FORMAT=CANONICAL_ISO_UTC`

The domain validator does not generate trusted time. Future persistence must replace/verify write-time metadata using trusted server time where required by the persistence contract.

Rules:

- `joinedAt` is always required and canonical;
- non-RELEASED records require `releasedAt === null`;
- RELEASED records require canonical non-null `releasedAt`;
- `releasedAt` must not be earlier than `joinedAt`.

## Actor identifiers

`createdBy` and `updatedBy` are exact document identifiers: non-empty, already trimmed, and containing no `/`.

They are attribution fields, not proof of authorization. Future persistence must derive trusted actor identity from authenticated context rather than accepting arbitrary client attribution.

## Identity context

The pure context contains exact:

- `clubId`
- `proPlayerId`

Both must pass canonical document-identifier validation.

The pure module does not check whether documents exist and does not query Firestore. Existence and cross-club ACTIVE uniqueness belong to the persistence slice.

## No FUTID fabrication

This slice preserves PR #136:

`V1_PLAYER_REFERENCE=EXACT_PRO_PLAYER_DOCUMENT_ID`

`FUTID_FABRICATION=FORBIDDEN`

`PLAYER_KEY_FABRICATION=FORBIDDEN`

No FUTID/playerKey is accepted or returned by the pure roster payload.

## No authority expansion

This module performs data validation only.

It must not decide OWNER/ADMIN/HEAD_COACH/TEAM_MANAGER write authority, must not use global roles, and must not create membership/staff/technical authority.

`MUTATION_AUTHORITY=DEFERRED_TO_AUTHORIZATION_AND_RULES_SLICE`

## Exact implementation scope

Exactly three new files are authorized in this slice:

1. `docs/PRO_CLUB_PLAYER_SQUAD_V1_PURE_DOMAIN_FREEZE.md`
2. `src/lib/proClubPlayerSquad.ts`
3. `tests/proClubPlayerSquad.unit.test.ts`

PR #136 contract files remain byte-unchanged in this child slice.

No other source, Rules, Functions, UI, Match, Weekly Training, Support Mode, or Head Coach file may change.

## Acceptance gates

Before acceptance:

1. exact base/merge-base must equal `212d93ec1bb9fb86a98b83305ae27537a0f3eca6`;
2. final diff must contain exactly the three authorized files;
3. pure-domain unit tests must pass;
4. PR #136 contract test must pass unchanged;
5. Player Profile and Pro Club foundation regressions must pass;
6. TypeScript and production build must pass;
7. `git diff --check` must pass;
8. independent exact-head review must find no blocking P0/P1/P2 issue;
9. no deploy, production HTTP call, production Firestore read/write, reset, force push, or merge is authorized.

`MERGE_AUTHORIZATION=NOT_GRANTED`
