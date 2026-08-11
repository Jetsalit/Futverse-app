# Nonstaff player association migration

PLAYER and PARENT access is authorized only by documents at:

`academies/{academyId}/nonstaffUsers/{uid}/playerAssociations/{playerId}`

Each document uses the canonical Player document ID as its own document ID and contains exactly:

```json
{
  "userId": "firebase-auth-uid",
  "academyId": "canonical-academy-document-id",
  "playerId": "canonical-player-document-id",
  "role": "PLAYER or PARENT",
  "status": "ACTIVE"
}
```

`status` may later be changed to `INACTIVE` or `REVOKED`. Only exact `ACTIVE` records authorize a Player document read. ACTIVE Academy ADMIN Membership holders and active SUPERADMIN accounts may create, update, or delete records. PLAYER and PARENT clients cannot write them.

## Required migration process

No legacy record is migrated automatically. In particular, do not derive an association from any combination of:

- `users/{uid}.academyId`
- `users/{uid}.activeAcademyId`
- `users/{uid}.linkedPlayerId`
- `academies/{academyId}/players/{playerId}.linkedUserId`

Those fields are not sufficient proof of identity or relationship. An operator must independently verify the Firebase UID, Academy document, canonical Player document, and PLAYER/PARENT relationship before provisioning each association. A PARENT with multiple verified children receives one exact document per child.

Until a verified association is provisioned, the account intentionally has no player-profile access. Existing legacy pointers may remain for routing or reporting, but they must not be used to prepare automatic writes or to infer a relationship.
