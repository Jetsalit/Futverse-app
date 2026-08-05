# Offline Membership and Invite Backfill Dry-Run

> **Sensitive offline review data:** input and output may contain emails, Firebase Auth UIDs, and Academy document IDs. Store them in an access-controlled location and do not commit real exports.

This tool validates an offline JSON export and produces reviewable plans. It does not import Firebase libraries, load credentials, make network requests, or write to Firestore. Generated plans are documentation artifacts only and must never be executed automatically.

## Input contract

The input is a UTF-8 JSON file:

```json
{
  "exportedAt": "2026-08-05T00:00:00.000Z",
  "academies": [
    {
      "id": "academy-a",
      "name": "Academy A",
      "inviteCode": "FUT-ACADEMY-A",
      "status": "ACTIVE"
    }
  ],
  "users": [
    {
      "uid": "admin-a",
      "email": "admin-a@example.com",
      "role": "ADMIN",
      "requestedRole": null,
      "status": "Active",
      "academyId": "academy-a",
      "activeAcademyId": "academy-a",
      "tenantRole": "ADMIN"
    }
  ],
  "memberships": [
    {
      "userId": "admin-a",
      "academyId": "academy-a",
      "role": "ADMIN",
      "status": "ACTIVE",
      "source": "LEGACY_MIGRATION"
    }
  ],
  "academyInvites": [
    {
      "inviteCode": "FUT-ACADEMY-A",
      "academyId": "academy-a",
      "status": "ACTIVE"
    }
  ]
}
```

Academy document IDs are authoritative. Academy display names, requested Academy names, email addresses, and UIDs are never substituted for an Academy ID.

Existing `CLAIM_APPROVAL` Memberships must include `approvalClaimId`. A proposed `LEGACY_MIGRATION` Membership never includes it.

## Command

Use only an offline fixture or a separately obtained read-only export:

```powershell
npx.cmd tsx scripts/membershipBackfillDryRun.ts --input tests/fixtures/membership-backfill/valid.json --output .tmp/membership-backfill-review
```

Exit codes:

- `0`: plans generated with no blockers
- `1`: malformed input or fatal validation failure
- `2`: plans generated, but manual blockers exist

The command does not read Firebase configuration and does not accept project IDs or credentials.

## Output files

The output directory contains:

- `summary.json` and `summary.md`: counts, input SHA-256, generated time, blocker totals, and safety verdict
- `academy-invite-plan.json` and `.csv`: unambiguous canonical invite proposals
- `membership-backfill-plan.json` and `.csv`: unambiguous legacy Membership proposals
- `already-satisfied.json`: matching ACTIVE records that require no write
- `manual-review.json`: compatible but non-ACTIVE or revoked records
- `blockers.json`: explicit issues and required manual actions

CSV cells beginning with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with an apostrophe to prevent spreadsheet formula execution.

## Blocker meanings

| Code | Meaning |
|---|---|
| `DUPLICATE_INVITE_CODE` | More than one Academy normalizes to the same invite code |
| `INVALID_INVITE_CODE` | Code is missing the canonical pattern or exceeds 32 characters |
| `MISSING_INVITE_CODE` | Academy has no invite code |
| `INVITE_REGISTRY_CONFLICT` | Existing registry ownership/status is ambiguous or inconsistent |
| `MISSING_UID` | No authoritative user UID/document ID exists |
| `MISSING_ACADEMY_POINTER` | ADMIN/COACH has no Academy document ID pointer |
| `ACADEMY_NOT_FOUND` | Pointer does not match an exported Academy document ID |
| `ACADEMY_POINTER_CONFLICT` | `academyId` and `activeAcademyId` differ |
| `UNSUPPORTED_ROLE` | Role cannot map safely to ADMIN or COACH |
| `ROLE_CONFLICT` | User role fields disagree |
| `USER_NOT_ACTIVE` | User is not clearly active |
| `EXISTING_MEMBERSHIP_CONFLICT` | Existing Membership differs or is non-ACTIVE |
| `MULTIPLE_ACADEMY_ASSIGNMENTS` | Existing Memberships span multiple Academies |
| `DISPLAY_NAME_ONLY_MAPPING` | Only a non-authoritative Academy name is available |
| `INVALID_EXISTING_MEMBERSHIP` | Existing Membership violates the required schema |
| `DUPLICATE_UID` | Fatal duplicate user identity in input |
| `DUPLICATE_ACADEMY_ID` | Fatal duplicate Academy document ID in input |

## Review procedure

1. Verify the input SHA-256 against the source export.
2. Review every blocker and manual-review record.
3. Review every proposed ADMIN Membership individually.
4. Confirm Academy IDs without relying on names.
5. Confirm normalized invite codes are globally unique.
6. Identify a real, audited migration actor UID to replace `<MIGRATION_ACTOR_UID>`.
7. Keep server timestamps as placeholders during planning.
8. Obtain approval for a separate execution design.

Do not convert these plans into writes automatically. Before any future execution, back up Firestore, approve the exact write set, define rollback procedures, and revalidate that every user and Academy is still current. This Sprint does not perform that execution.
