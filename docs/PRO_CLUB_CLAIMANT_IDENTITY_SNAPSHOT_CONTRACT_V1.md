# Pro Club claimant identity snapshot — PR #55 P2

This additive contract extends the V1 onboarding claim with an immutable
`claimantIdentity` map. It leaves invite, membership, staff and approval-proof
schemas unchanged. Canonical account eligibility remains the P1 App gate.

## Canonical source and exact schema

The source is the server-read `users/{request.auth.uid}` document. Its `name`
field supplies `claimantIdentity.displayName`; its `email` field supplies
`claimantIdentity.email`. `AuthContext.actualUser` comes from that same document,
but its email presentation uses Firebase Auth email, so claim creation reads the
document directly instead of trusting UI input or a support-presented user.

The snapshot contains each of those canonical fields that is a nonblank string,
copied exactly without trimming or normalization. It must contain at least one.
No other snapshot keys are allowed. A canonical field that is absent, blank or
not a string is omitted, never invented. Registration requires email matched to
the Firebase Auth token; name is populated by the registration UI but is not
required by the existing user Rules. Legacy accounts may have only one field.

`userId` remains the claimant UID and must equal the authenticated actor. The
deterministic claim ID and exact invite bind that UID, club and requested role.
New claims require the snapshot. `schemaVersion` remains `1` for this additive
field; readers still accept the prior schema without identity.

Verified means matching the canonical account at claim creation. It is not an
external verification of a person's real-world name. Existing owner profile
editing permissions are unchanged. The snapshot is historical and does not
change when the canonical profile changes later.

## Creation and lifecycle enforcement

The repository accepts an invitation code and expected actor UID, reads that
actor's user document from the server internally, and derives the snapshot.
Callers cannot supply name/email arguments. Actor checks surround the read.

Firestore Rules are final authority: the user must exist, snapshot fields must
exactly match the canonical document, and all existing invite/claim creation
conditions remain required. A stale profile read can fail the write; the client
does not retry using unverified identity.

Both `PENDING -> APPROVED` and `PENDING -> REJECTED` require a valid snapshot
already present on the claim and preserve it unchanged. Replacement, removal,
late insertion or modification of any snapshot field is denied. Approval keeps
the existing five-document atomic claim/proof/member/staff/invite operation.
Rejection keeps the existing atomic claim rejection plus invite revocation and
creates no membership, staff or approval proof.

## Reviewer read and presentation

Active OWNER/ADMIN authority still comes only from canonical membership in the
exact club. Reviewers read identity inside that club's existing pending-claim
query and exact claim reads. No user-document get, users-directory list, global
role shortcut or cross-club identity read is added for reviewers.

Cards show available name/email, claimant UID as a secondary account reference,
requested role and request time. Both decision confirmations repeat that
identity, role and canonical club name. Invitation suffix remains secondary.

## Existing claims and unavailable identity

Legacy claims without identity are possible under the prior Rules and fixtures.
No assumption about production claim inventory is needed. No migration or
backfill is performed or required for safe compatibility.

Legacy claims remain readable and display **Identity unavailable**. Malformed
identity maps also display this state. Both Approve and Reject are disabled in
the reviewer UI and refused by the repository and Rules. Rejection is blocked
because it irreversibly revokes the matching invite; the user requires a
verified human target before either decision. No fallback guesses from UID,
generic names, unapproved user lookup or silent decision are allowed.

Previously terminal claims remain readable as history. Existing membership
authority is not rewritten. Legacy pending claims require a separately approved
resolution process if the product later needs them to progress; this change
does not create one.

## Preservation and release boundary

P1 commit `609a0e256de4cae2330e7a2ca6a3e523f2f12df8` remains untouched.
AuthContext, Academy routing/runtime, the deferred LOW navigation finding and
unrelated Rules remain unchanged. P2 is a separate local commit. Neither P1 nor
P2 is pushed until the requested second independent review.
