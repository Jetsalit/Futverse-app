# Pro Club Starting XI 11v11 V1 — Contract / Audit Freeze

Status: CONTRACT / PURE DOMAIN FOUNDATION

Baseline main: `24e08239af7c749a3b15009f0887897e884d73b4`

## 1. Purpose

Create the reviewed foundation for the Pro Club 11v11 Starting XI Command Center before any production persistence, Firestore Rules change, runtime activation, merge or deploy.

The target UI/UX is the approved FutVerse Pro Club concept:

- Starting XI pitch
- substitutes
- available players
- Game Model
- Position Role Assignments
- Set-Piece Duties
- Penalty Shootout Order if a match requires kicks from the penalty mark
- Coach Notes
- Player Communication & Sync
- Matchday Control
- Live Change Log / Audit Trail

The Leadership / Captain Group panel is deliberately excluded.

## 2. 11v11 only

This Pro Club surface is football 11-a-side only.

Supported fixed formation foundations:

- 4-3-3
- 4-2-3-1
- 4-4-2
- 3-5-2

A future Custom formation may still contain exactly 11 lineup slots.

No Academy 7v7 formation, selector, schema, persistence or UI is part of this Pro Club V1.

## 3. Academy reuse boundary

The existing Academy `StartingXIBuilder.tsx` is reference material for interaction and visual patterns only.

Pro Club must not reuse:

- `useAcademy()` as authority;
- `academies/{academyId}/players` as the player source;
- Academy Match paths as Pro Club persistence;
- Academy-only role guards;
- assumptions that every player already has a known position.

The Academy implementation remains unchanged in this phase.

## 4. Canonical Pro Club player source

The source for player selection is the existing canonical Pro Club roster:

`proClubs/{clubId}/players/{playerKey}`

Only ACTIVE roster players are eligible.

The Starting XI foundation preserves:

- canonical `playerKey`;
- real first/last name;
- real jersey number;
- existing FUTID or explicit `null`;
- existing primary position or explicit `null`;
- canonical additional positions.

Missing FUTID must remain unbound. Missing position must remain unset. Starting XI must never infer either value.

## 5. Selection invariants

Draft UI may be incomplete while the coach is working.

A publishable Starting XI requires:

- exactly 11 occupied slots;
- 11 unique playerKeys;
- no player duplicated between Starting XI and substitutes;
- all selected identities sourced from the authoritative Pro Club roster.

Position compatibility is advisory UX only in V1. A roster player with `position = null` remains selectable. The system must not invent a football position merely to fit a formation slot.

## 6. Football-role authority target

Starting XI football authoring is targeted to ACTIVE exact-club staff with effective membership authority and either:

- HEAD_COACH
- TECHNICAL_DIRECTOR

This target permission is defense in depth. Future Firestore Rules / persistence must be reviewed independently before production writes are enabled.

OWNER/ADMIN/MEMBER tenant authorization remains separate from football staff role.

## 7. Position Role Assignments

Every one of the 11 lineup slots may have one concise tactical duty/instruction.

Examples include:

- GK — build-up start, organize back line
- LB — overlap, support wide press
- CB — cover depth, defend aerial balls
- CM — deep build-up, control tempo
- LW — hold width, attack 1v1
- ST — finish attacks, trigger first press

These role instructions do not rewrite the player's canonical roster position.

## 8. Game Model

The target Game Model has four ordered phases:

1. IN_POSSESSION
2. OUT_OF_POSSESSION
3. TRANSITION_TO_ATTACK
4. TRANSITION_TO_DEFEND

This phase freezes the domain/UI vocabulary only. It does not create persistence.

## 9. Set-piece duties

The target duty set is:

- Corner Left
- Corner Right
- Free Kick Left
- Free Kick Right
- Throw-in Left
- Throw-in Right
- Penalty

Any assignee must be a selected Starting XI or substitute player for the current match plan.

## 10. Penalty Shootout Order

The UI supports:

- primary takers 1–5;
- up to five backup takers.

The same player cannot appear twice in the shootout order.

Every listed taker must belong to the selected match squad.

This is the order for a competition situation requiring a penalty shootout after a drawn match where applicable. It is separate from the normal in-match Penalty set-piece duty.

## 11. Match and persistence boundary

The Starting XI must not persist as a disconnected standalone lineup.

Production persistence must wait for an authoritative Pro Club Match identity / adapter contract. The Academy Match collection must not be reused as a Pro Club storage shortcut.

Until that future slice is reviewed:

- no Starting XI Firestore collection/path is introduced;
- no Match path is invented;
- no Firestore Rules are changed;
- no write repository is introduced;
- no Player Sync write is introduced;
- no audit-log persistence is introduced.

## 12. Matchday control target

The approved target UX includes:

- swap players;
- adjust roles;
- reset to the last saved Starting XI;
- pre-match changes;
- audit trail.

Terminal historical Match evidence must later fail closed against destructive mutation. A completed match must not be silently rewritten.

## 13. Player communication target

The approved target UX includes a player-delivery summary:

- Sent
- Seen
- Updated

and a Send to Players action for lineup, tactical role and notes.

This phase defines UI intent only. Delivery/read-receipt persistence is not activated here.

## 14. Preservation rules

This Contract/Foundation phase must not modify:

- `firestore.rules`
- Firebase configuration
- Hosting configuration
- Functions
- Academy Starting XI runtime
- Pro Club production UI runtime
- Pro Club roster persistence
- Membership / tenant authority
- FUTID architecture
- production data

No Functions or Blaze dependency is allowed.

## 15. Acceptance gate

The foundation is acceptable only when:

- exact baseline provenance is verified;
- 11v11 fixed formations each contain exactly 11 slots;
- no 7v7 formation exists in the Pro Club model;
- unknown Pro Club position/FUTID remains explicit;
- duplicate Starting XI players fail validation;
- starter/substitute overlap fails validation;
- position role assignments align with 11 slots;
- set-piece and shootout assignees remain within the selected match squad;
- Head Coach / Technical Director target authority is explicit;
- Leadership Group is absent from the target section contract;
- targeted tests pass;
- TypeScript passes;
- production build passes;
- `git diff --check` passes;
- no Rules/runtime/deploy/production-write change occurs.

NEXT after exact-head review: Pro Club Starting XI 11v11 V1 UI adapter implementation, still without production persistence until the Pro Club Match contract is reviewed.
