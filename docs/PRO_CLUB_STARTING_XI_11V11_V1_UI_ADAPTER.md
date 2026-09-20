# Pro Club Starting XI 11v11 V1 — UI Adapter Slice

Status: IMPLEMENTATION CANDIDATE / NO PRODUCTION WIRING

Parent contract HEAD: `2021313f62e7ad22b5f427d5cb05b52d5e43a36a`

## Scope

This slice implements a reusable Pro Club Starting XI UI adapter on top of the frozen 11v11 pure-domain contract.

It intentionally remains disconnected from the production Pro Club dashboard until a later reviewed activation slice.

## Included

- Pro Club roster -> Starting XI player view adapter
- active-player filtering
- explicit null position -> `Position not set`
- explicit null FUTID -> `Not bound`
- 11 pitch slots
- 4-3-3 / 4-2-3-1 / 4-4-2 / 3-5-2 selector
- local-only starter placement/removal
- local-only substitute selection
- available-player search
- Game Model four-phase presentation
- local-only Position Role Assignment inputs
- Set-Piece Duties presentation placeholder
- local-only Penalty Shootout primary/back-up ordering
- local-only coach/TD notes
- Player Communication & Sync placeholder
- Matchday Control placeholder
- Audit Trail placeholder

## Preserved boundaries

The component must not:

- import Firebase Firestore APIs;
- create or call a write repository;
- modify Firestore Rules;
- modify Firebase configs;
- wire itself into `ProClubTeamDashboard`;
- mutate Academy Starting XI;
- invent a Pro Club Match path;
- write production data;
- deploy.

All user changes in this slice are React local state only and disappear on reload.

## UX note

The visual target is the approved FutVerse Pro Club 11v11 Command Center. Leadership/Captain Group is excluded. Position Role Assignments and Penalty Shootout Order remain present.

NEXT after exact-head review: reviewed Pro Club Match / Starting XI persistence contract or a controlled preview wiring slice, depending on the production critical path.
