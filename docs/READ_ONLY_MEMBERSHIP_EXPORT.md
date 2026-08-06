# Read-only membership planning export

This tool creates a sensitive, offline JSON input for the membership backfill dry-run planner. It is an export and review aid only. It does not authorize or perform a migration, backfill, Firestore write, IAM change, managed export, backup, or deployment.

## Least-privilege identity

Create a dedicated service account named `futverse-membership-export-reader` for a future, separately authorized run. Grant it only `roles/datastore.viewer`. Do not grant `roles/datastore.user`, `roles/datastore.owner`, `roles/datastore.importExportAdmin`, `roles/firebase.admin`, `roles/firebase.developAdmin`, Editor, Owner, Storage Admin, or a custom role containing entity-write permissions.

Before each future export, an operator outside this program must verify that the effective IAM permissions include only the required read operations (`get` and `list`) and exclude entity `create`, `update`, `delete`, import, export, and all other write-capable operations. A credential JSON file cannot prove its account's effective IAM grants, and this exporter does not attempt to do so.

Keep the service-account credential outside Git and outside the repository. Keep the output directory outside Git and outside the repository. The program requires an explicit absolute credential path; it does not use Application Default Credentials, environment-based discovery, `.firebaserc`, or implicit project/database selection. Private-key material remains in memory and is never copied into output.

## Exact read scope

The adapter may read only:

- `academies/{id}`: `id`, `name`, `inviteCode`, `status`
- `users/{uid}`: `uid`, `id`, `email`, `name`, `role`, `requestedRole`, `status`, `academyId`, `activeAcademyId`, `tenantRole`, `academyName`, `requestedAcademyName`, `deleted`, `disabled`
- `academies/{academyId}/members/{uid}`: `userId`, `academyId`, `role`, `status`, `source`, `approvalClaimId`
- `academy_invites/{normalizedInviteCode}`: `inviteCode`, `academyId`, `status`

Memberships are listed separately under each exact Academy document ID returned by the Academy read. The implementation does not use a collection-group query and accepts no free-text collection or document path.

Reads from Claims, sessions, audit logs, notifications, payments, subscriptions, billing, players, teams, matches, reports, Firebase Auth, Cloud Storage, or any other collection/service are prohibited.

Document IDs are authoritative. UIDs and Academy IDs are exact, trimmed, case-sensitive Firestore identifiers and are never normalized. A stored identity field that conflicts with its document or parent ID stops publication. An Academy Invite document ID must already be the exact canonical `FUT-[A-Z0-9-]+` code and must exactly match `inviteCode`.

## CLI contract

Every argument is required exactly once:

```text
--project-id <exact-project-id>
--database-id <exact-database-id>
--credentials <absolute-local-json-path-outside-repository>
--output <absolute-new-directory-outside-repository>
--confirm-read-only I_HAVE_VERIFIED_DATASTORE_VIEWER_ONLY
```

The database ID is never silently defaulted, including to `(default)`. Unknown, duplicate, incomplete, relative-path, missing, or mismatched arguments fail before Firebase Admin initialization. The credential must be a normal, non-linked `service_account` JSON file for the exact requested project. The output must not exist, and its existing writable parent must not be a symbolic link or junction.

## Output contract

Publication is an atomic directory rename from a temporary sibling after all validation, reads, serialization, and verification succeed. A destination race, read failure, close failure, write failure, unexpected artifact, malformed JSON, or hash mismatch removes the temporary directory and never overwrites the destination.

Exactly four files are published:

- `membership-planning-export.json` — the exact Sprint 1E JSON shape: `exportedAt`, `academies`, `users`, `memberships`, and `academyInvites`
- `membership-planning-export.sha256` — SHA-256 of the exact export bytes
- `export-manifest.json` — timing, requested project/database, service-account email, source commit, version, counts, exact queried paths, hash, and explicit no-write/non-transactional flags
- `README-SENSITIVE.txt` — handling and authorization warning

The manifest contains no credential path, private key, token, credential JSON, environment value, or arbitrary document content. The snapshot is non-transactional: records can change between reads. Firestore read charges are expected for every Academy, User, Membership, and Academy Invite document returned by the four allowed query families.

The resulting export is accepted by Sprint 1E's `parseOfflineExport` and `planDryRun`. It does not execute their generated plans. Review every proposed `ADMIN` membership manually, re-export immediately before any future approved write, and take a separate Firestore backup. Execution and rollback require separate authorization.

## Future setup and verification

The following are **NON-EXECUTED PLACEHOLDER EXAMPLES**. Replace placeholders only during a separately authorized read-only operation. They are documentation, not commands approved by this sprint.

```text
NON-EXECUTED PLACEHOLDER: create service account <membership-export-reader> in <project>
NON-EXECUTED PLACEHOLDER: grant only roles/datastore.viewer
NON-EXECUTED PLACEHOLDER: externally inspect effective IAM get/list and absence of write/import/export permissions
NON-EXECUTED PLACEHOLDER: npm.cmd run export:membership-planning -- --project-id <project> --database-id <database> --credentials <absolute-path-outside-repo> --output <new-absolute-directory-outside-repo> --confirm-read-only I_HAVE_VERIFIED_DATASTORE_VIEWER_ONLY
NON-EXECUTED PLACEHOLDER: review all four artifacts in an encrypted, access-controlled location
```
