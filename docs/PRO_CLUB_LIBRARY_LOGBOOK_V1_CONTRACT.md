# Pro Club Library & Logbook V1 Contract

## Purpose

Pro Club Library & Logbook V1 is a composition layer over reviewed FutVerse data and authority contracts. It must not create a second training, drill, submission, approval, or club-authority system.

## Existing canonical sources

V1 may read and compose only these existing sources:

- `drills` through the existing `useDrillDatabase()` hook, including `myDrills` and `is_shared` drills.
- Pro Club Staff Submissions through the existing repository and its existing authority checks.
- Existing Weekly Training drill references, which continue to store only the canonical drill identifier in `drillReference`.
- Existing Pro Club organization authority and Technical Governance contracts.

No new Firestore collection, document path, Firestore Rules path, or Weekly Training schema field is introduced by this V1.

## Eligible football roles

The Library & Logbook surface is available only to an ACTIVE Pro Club member with membership authority and one of these active football staff roles:

- Technical Director
- Head Coach
- Assistant Coach
- GK Coach
- Fitness Coach
- Analyst
- Physio

Manager, Team Manager, generic Staff, a missing staff role, inactive organizations, inactive memberships, and memberships without authority fail closed.

## Views

V1 exposes five presentation views:

- **My Logbook** — the actor's own drills plus Staff Submissions visible to the actor under the existing repository contract.
- **Team Shared** — existing shared drills plus visible submitted/in-review/approved Staff Submissions.
- **Club Library** — existing shared drills plus visible approved Staff Submissions. In V1, “Club Library” is a presentation lens over already-readable shared assets; it does not add club ownership metadata to legacy drills.
- **Favourites** — session-only UI favourites. V1 deliberately creates no favourite persistence path.
- **Recent** — already-readable entries ordered from existing date/timestamp metadata when available. V1 creates no activity log.

Role filters are presentation filters. Existing drills are role-neutral assets because the current drill schema contains no canonical Pro Club staff-role field. Role filters therefore narrow role-tagged Staff Submissions without inventing role metadata for drills.

## Technical Director development area

When the active staff role is Technical Director, the UI may expose these development lenses:

- Club Development
- Game Model
- Player Development
- Pathway

These lenses do not grant, infer, or replace Technical Governance review/approval authority. Game Model may navigate to the existing Game Model module. The other V1 lenses remain presentation/library organization only until a separately reviewed persistence contract exists.

## Explicit non-goals

V1 must not:

- build a new Tactic Board;
- change the existing Tactic Board persistence path;
- change Weekly Training schema or persistence;
- add or widen Staff Submission review transitions;
- translate OWNER/ADMIN membership authority into football approval authority;
- add a new Firestore collection or Rules match path;
- deploy or write Production data as part of implementation;
- delete, rewrite, or migrate Academy training data.

## Failure and visibility behavior

- Repository authority continues to control which Staff Submissions can be read.
- Authors keep author-scoped visibility; Technical Director and Head Coach use the existing technical-review read path only when that repository authorizes them.
- The Library & Logbook component performs no direct Firestore writes.
- If Staff Submission loading fails, drill assets remain usable and the submission error is surfaced without creating a fallback read path.
