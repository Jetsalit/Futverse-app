# Pro Club OWNER + Technical Director Dual Role V1 Addendum

Status: IMPLEMENTATION CANDIDATE

## Purpose

An existing Pro Club OWNER may also hold the football staff role TECHNICAL_DIRECTOR. Tenant authorization and football staff responsibility are separate contracts and must not overwrite one another.

## Canonical state

For one exact user and club:

- `proClubs/{clubId}/members/{uid}` remains `{ authorizationRole: "OWNER", status: "ACTIVE" }`.
- `proClubs/{clubId}/staff/{uid}` may independently be `{ staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" }`.

The staff assignment does not downgrade OWNER to MEMBER and does not grant OWNER authority to another user.

## Trusted assignment rules

The Spark-safe trusted local operation:

- pins project `futverse-d7872`;
- derives the operator exclusively from `FUTVERSE_LOCAL_OPERATOR_UID`;
- verifies that operator is an ACTIVE SUPERADMIN;
- requires one canonical ACTIVE Pro Club;
- auto-resolves exactly one canonical ACTIVE OWNER membership;
- requires that OWNER user account to be ACTIVE;
- creates the TECHNICAL_DIRECTOR staff assignment only if no staff assignment exists;
- treats an existing identical ACTIVE TECHNICAL_DIRECTOR assignment as idempotent NOOP;
- refuses to overwrite any different role or inactive staff assignment;
- supports dry-run before any production write.

## Runtime consequence

The existing Pro Club authority resolver will preserve `membershipAuthorizationRole = OWNER` and expose `staffRole = TECHNICAL_DIRECTOR`. Existing Squad and Attendance read contracts already allow any ACTIVE staff assignment to read their canonical data. Mutation contracts remain unchanged.

Weekly Training authoring and Technical Review persistence are not opened by this addendum. Those remain a separate reviewed slice.
