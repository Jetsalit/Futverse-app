# Pro Club Weekly Planner UI Design

Date: 2026-09-17
Baseline: `main` at `86c87556595eb3a8e787b342fa34c5bc8b185e5c`
Status: Design approved in chat; implementation not started
Scope class: Architectural UI foundation, persistence explicitly deferred

## 1. Goal

Build the first real Weekly Planner UI inside the existing Pro Club App Shell so a Head Coach can see and interact with a complete Monday-to-Sunday microcycle that reflects real football operations.

The approved visual target is a dense professional weekly planning board with:

- seven fixed day columns, Monday through Sunday;
- multiple activities inside a day;
- clear day summaries such as Training Day, Recovery Day, Match Day, Mixed Day, Rest Day, or Not set;
- visible duration, load, focus, drills, squad scope, match metadata, and time;
- compatibility with the existing FutVerse Pro Club sidebar/top-bar shell;
- no production persistence changes in this UI slice.

The purpose of this slice is to make the interaction model visible and testable before changing the strict Weekly Training production contract.

## 2. User and operating reality

Primary user: active Pro Club Head Coach.

The design must also remain structurally suitable for Academy use later because football calendars differ by level:

- one day can contain morning and evening training;
- one day can contain training plus recovery;
- match day can still contain activation, recovery, or top-up training for non-starters;
- Academy/school football can contain more than one match in the same day;
- some days are true rest days;
- some days are simply not planned yet.

The UI must not assume that one calendar day equals one activity.

## 3. Approved day/activity model for the UI slice

The planner always renders exactly seven calendar days for the selected week.

Each day is a container with zero or more activities.

UI activity types:

- `TRAINING`
- `RECOVERY`
- `MATCH`

`REST` is not treated as a normal coexisting activity. It is an exclusive day state.

`NOT_SET` is the default visual state when the planner has no existing activity and the coach has not marked the day as rest.

### 3.1 Training activity

Training reuses the existing Weekly Training session concepts wherever possible:

- date;
- start time;
- location;
- duration;
- objective/focus;
- phase of play;
- planned load;
- training blocks;
- drill references;
- coaching points.

A day may contain multiple Training activities, including morning and evening sessions.

### 3.2 Recovery activity

Recovery is a first-class UI activity because coaches may plan a dedicated recovery session rather than treating recovery as only free-text inside a normal training objective.

For the UI-only slice, Recovery may contain:

- time;
- duration;
- location;
- focus/notes;
- squad scope.

Recovery does not require a drill or training block.

### 3.3 Match activity

A day may contain zero, one, or multiple Match activities.

Each Match activity has UI fields for:

- kickoff time;
- competition;
- opponent;
- venue;
- squad/team label;
- optional competition category display such as league, cup, friendly, tournament, or other.

This slice does not create or persist a new Competition Calendar contract. Match data exists only in planner UI state unless it is later wired to an approved match source.

### 3.4 Squad scope

Activities support an explicit player-group presentation with at least:

- All squad
- Starters
- Non-starters
- Selected players

This is required for match-day top-up sessions and selective recovery work.

## 4. Day summary rules

The header of each day is derived from its current UI state.

- No activity and not rest -> `Not set`
- Rest -> `Rest Day`
- Only training activities -> `Training Day`
- Only recovery activities -> `Recovery Day`
- Only match activities -> `Match Day`; display match count when more than one
- Any combination of activity categories -> `Mixed Day`

A day can include multiple activities of the same type.

Examples:

- 08:00 Training + 17:00 Training -> Training Day
- 10:00 Recovery + 18:00 Match -> Mixed Day
- 09:00 Match + 15:00 Match -> Match Day, 2 matches
- no activities + coach marks rest -> Rest Day

## 5. Rest exclusivity

Rest is mutually exclusive with activities for that day.

When a coach marks a day as Rest:

- the UI must not retain Training, Recovery, or Match activities in that same day;
- the UI should require confirmation before discarding existing in-memory activities if any exist;
- Add Activity controls are hidden or disabled until Rest is cleared.

When Rest is cleared, the day returns to Not set unless activities are then added.

No persistence is performed in this slice.

## 6. Backward compatibility with existing Weekly Training data

The current production Weekly Training model remains authoritative and unchanged for this slice.

Existing saved `sessions` are projected into the seven-day board as Training activities based on `sessionDate`.

Important compatibility rules:

- existing sessions must render without modification;
- multiple existing sessions on the same date must appear within the same Day Card;
- existing drill/block/load/objective data must remain visible;
- missing dates in existing saved Weekly Training data must not be interpreted as Rest;
- a day with no existing session is rendered as Not set unless changed in local UI state;
- the existing saved-DRAFT read path remains read-only;
- no migration is required for current saved plans.

## 7. UI-only planner state

New Recovery, Match, Rest, and unsaved Training interactions in this slice live only in component state.

They are intentionally ephemeral:

- reload clears local additions;
- navigation away may clear local additions;
- no Firestore document is created or updated;
- no Cloud Function is called for planner persistence;
- no Firestore Rules change is required;
- no production schema field is added.

The UI must communicate this clearly. A Save Plan action may exist visually, but in this slice it must not perform a write. It should show a clear status/message that persistence is intentionally not enabled yet.

## 8. Layout and visual structure

The existing Pro Club App Shell remains intact and continues to own:

- left sidebar;
- club identity;
- Head Coach role;
- ACTIVE status;
- top bar;
- navigation.

The Training workspace should present:

1. Weekly Planner header
   - title;
   - current week range;
   - previous/next week controls if they can be implemented without unrelated calendar work;
   - UI-only Save Plan control;
   - optional summary metrics calculated only from visible planner state.

2. Seven-day horizontal board
   - Monday through Sunday in fixed order;
   - desktop-first dense cards;
   - horizontal overflow when the viewport cannot fit seven columns;
   - each day visually distinct but consistent with the existing FutVerse dark/cyan visual language.

3. Activity cards inside each day
   - sorted by start time when a time exists;
   - activity-type badge;
   - relevant metadata only;
   - clear player-group scope;
   - compact football-workflow density rather than oversized marketing cards.

4. Day action
   - Add Activity;
   - choices: Training, Recovery, Match, Rest;
   - Rest follows the exclusivity rules above.

## 9. Interaction behavior

### Add Training

For this UI slice, adding a new training session may use an in-memory editor shaped consistently with the existing Weekly Training fields. It must not invoke the production save path.

### Add Recovery

Creates an in-memory Recovery activity for the selected day.

### Add Match

Creates an in-memory Match activity. Multiple matches on one day are allowed.

### Add Rest

Marks the day as Rest after enforcing the exclusivity rule.

### Existing saved Training sessions

Existing sessions projected from a saved Weekly Training DRAFT remain read-only in this slice unless an already-approved existing editor is explicitly entered through its current production flow. The new planner UI must not silently convert the board into an existing-DRAFT mutation surface.

## 10. Explicit non-goals for this slice

Do not implement any of the following in this UI slice:

- new Firestore schema fields;
- `dayPlans` persistence;
- `activities[]` persistence;
- Match persistence;
- Recovery persistence;
- Rest persistence;
- Firestore Rules changes;
- Cloud Functions changes;
- production write activation;
- Competition Calendar integration;
- Attendance integration;
- new Tactic Board implementation;
- automatic external fixture ingestion;
- Academy persistence wiring;
- migration of existing Weekly Training documents.

These remain later work after visual and interaction acceptance.

## 11. Security and authority constraints

The planner must remain inside the existing Pro Club authority boundary.

The active Head Coach workspace gate must continue to require the existing authorized Pro Club runtime state.

The UI-only planner must not introduce:

- client privilege escalation;
- alternate organization selection bypass;
- direct Firestore write calls;
- new callable Function invocation for planner state;
- environment-variable bypasses;
- production IDs embedded in UI source.

## 12. Likely implementation boundaries

Expected implementation should stay close to the current Weekly Training presentation code.

Likely files/components:

- `src/components/pro-club/operations/WeeklyPeriodizationBoard.tsx`
- a new focused planner/day/activity presentation component if needed to prevent the board file becoming too large;
- `src/components/pro-club/operations/ProClubHeadCoachWeeklyProductionWorkspace.tsx` only if minimal wiring is required;
- existing Weekly saved-DRAFT projection logic;
- focused unit tests for the planner contract.

Do not refactor unrelated Pro Club modules.

If implementation reveals that production models or strict validators must change for the UI slice, stop and re-scope before editing them.

## 13. Testing contract

Implementation must use test-first development.

Required coverage:

- exactly seven day columns render Monday through Sunday;
- existing Weekly Training sessions project into the correct day;
- multiple sessions on one date render inside one day;
- Training-only day resolves to Training Day;
- Recovery-only day resolves to Recovery Day;
- Match-only day resolves to Match Day;
- multiple matches on one day are supported;
- Match plus Training/Recovery resolves to Mixed Day;
- Rest is exclusive;
- clearing Rest returns to Not set when no activities exist;
- day activities sort by time where applicable;
- squad scope displays correctly;
- legacy days with no session render Not set, never inferred Rest;
- current Weekly Training block/drill/load/focus presentation remains intact;
- App Shell navigation/authority regressions remain green;
- no Firestore write/import/callable persistence boundary appears in the new planner UI;
- Save Plan does not write in this slice.

Run at minimum:

- focused new planner unit tests;
- existing Weekly Periodization Board regression tests;
- saved-DRAFT wiring regression tests;
- Pro Club App Shell regression tests;
- TypeScript/lint checks;
- production build;
- `git diff --check`.

## 14. Visual acceptance contract

After tests and build pass, the UI must be presented in a preview or deployed non-destructive surface for the user to inspect.

Acceptance target:

- visual structure closely matches the approved FutVerse Weekly Planner mockup;
- seven-day football planning is understandable at a glance;
- multiple sessions per day are obvious;
- Recovery, Rest, Match, and Mixed Day are visually distinct;
- match-day top-up for non-starters is representable;
- multiple Academy matches in one day are representable;
- dense desktop layout remains usable;
- the existing App Shell is not degraded.

The user explicitly retains final Visual Acceptance authority. If the UI does not match the approved direction, revise the UI before any persistence work begins.

## 15. Delivery order

1. Implement and verify UI-only Weekly Planner.
2. Obtain user Visual Acceptance.
3. Only after acceptance, design the persistence contract for day/activity state.
4. Only after persistence design approval, update strict client/server validators and any required production write path.
5. Then continue the original critical path to deeper Tactic Board and Attendance integration.

This order is mandatory to avoid reworking production schema before the interaction design is accepted.
