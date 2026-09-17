# Pro Club Weekly Planner UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved UI-only FutVerse Weekly Planner inside the existing Pro Club Training workspace, rendering exactly seven Monday-to-Sunday Day Cards with multi-session Training, Recovery, Match, Rest, Mixed Day, and local-only interaction behavior while preserving the current production Weekly Training schema and write boundaries.

**Architecture:** Keep the current saved Weekly Training `sessions` contract authoritative and project it into a new pure UI planner model. Add a focused interactive board and focused day-card/activity presentation components; keep `WeeklyPeriodizationBoard` as the compatibility wrapper used by the current saved-DRAFT read path. All new Recovery/Match/Rest/new-Training edits are React-local state only and never enter the existing save client, Firestore adapters, Functions, or Rules.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Lucide React, Node test runner, `react-dom/server`, existing FutVerse Pro Club App Shell and Weekly Training models.

**Spec:** `docs/superpowers/specs/2026-09-17-pro-club-weekly-planner-ui-design.md`

## Global Constraints

- Baseline implementation must start from accepted `main` SHA `86c87556595eb3a8e787b342fa34c5bc8b185e5c` plus the approved spec/plan documentation only.
- Render exactly seven calendar days in fixed Monday-to-Sunday order.
- A day may contain zero or more activities; multiple Training sessions and multiple Matches on the same date are valid.
- UI activity categories are `TRAINING`, `RECOVERY`, and `MATCH`; `REST` is an exclusive day state and `NOT_SET` is the empty default.
- Existing saved `sessions` remain authoritative Training activities and stay read-only inside the new planner surface.
- New Recovery, Match, Rest, and locally added Training activities are ephemeral component state only.
- Days with no saved session must render `Not set`; never infer `Rest` from absence of training data.
- No Firestore schema fields, Firestore Rules, Functions, production write paths, Competition Calendar integration, Attendance integration, or Academy persistence wiring in this plan.
- `Save Plan` must be visible but must not perform a write; it must communicate that persistence is intentionally disabled for this UI slice.
- Existing Pro Club App Shell authority/navigation behavior must remain unchanged.
- Existing Weekly Training blocks, drill references, load, objective/focus, time, duration, and location must remain visible for saved Training activities.
- Implementation uses TDD: RED before GREEN for every code task.
- No reset, no force push, no production deployment, and no production data write during implementation/review.

---

## File Structure

### New files

- `src/components/pro-club/operations/weeklyPlannerUiModel.ts`
  - Pure types and deterministic functions for seven-day projection, local activity creation, day summaries, rest exclusivity, and activity ordering.
  - No React, Firebase, Firestore, runtime capability, environment, or persistence imports.

- `src/components/pro-club/operations/WeeklyPlannerActivityCard.tsx`
  - Presentation-only rendering for one Training, Recovery, or Match activity.
  - Saved Training activities expose existing block/drill/load/focus data; local activities expose only their approved UI fields.

- `src/components/pro-club/operations/WeeklyPlannerDayCard.tsx`
  - Presentation and local interaction controls for one day.
  - Owns the Add Activity inline composer UI supplied through callbacks/state from the parent planner.

- `src/components/pro-club/operations/WeeklyPlannerBoard.tsx`
  - Interactive weekly surface.
  - Seeds state from the pure projection model, owns ephemeral Recovery/Match/Rest/new-Training state, derives summary metrics, and renders all seven Day Cards.

- `tests/proClubWeeklyPlannerUiModel.unit.test.ts`
  - Pure-model tests: seven days, multi-session, multi-match, mixed-day, Rest exclusivity, ordering, legacy `Not set`.

- `tests/proClubWeeklyPlannerBoardUi.unit.test.tsx`
  - Static/render contract tests: seven columns, saved Training detail, player scope, no-write boundary, Save Plan disabled behavior contract, App-Shell-compatible visual structure.

### Modified files

- `src/components/pro-club/operations/WeeklyPeriodizationBoard.tsx`
  - Preserve its public `board` prop and existing import boundary.
  - Delegate the detailed weekly rendering to `WeeklyPlannerBoard` so existing saved-DRAFT wiring does not change.

- `tests/proClubWeeklyPeriodizationBoardUi.unit.test.tsx`
  - Replace the old assumption that missing weekdays must not render with the new exactly-seven-days contract.
  - Preserve presentation-only / no-write / saved-DRAFT wiring assertions.

- `tests/proClubHeadCoachWeeklyProductionVisibilityV1.unit.test.tsx`
  - Only change if required to acknowledge the new board presentation text while preserving the same authority boundary.

No other files should be modified unless a focused test proves a direct dependency. If implementation requires changes to `src/lib/proClubWeeklyTraining.ts`, any Firestore adapter, `firestore.rules`, `functions/`, or a runtime capability flag, stop and re-scope before editing.

---

### Task 1: Pure seven-day planner UI model

**Files:**
- Create: `src/components/pro-club/operations/weeklyPlannerUiModel.ts`
- Create: `tests/proClubWeeklyPlannerUiModel.unit.test.ts`

**Interfaces:**
- Consumes: `ProClubWeeklyPeriodizationBoard` from `src/lib/proClubWeeklyPeriodizationBoard.ts`.
- Produces:
  - `type WeeklyPlannerSquadScope = "ALL_SQUAD" | "STARTERS" | "NON_STARTERS" | "SELECTED_PLAYERS"`
  - `type WeeklyPlannerLocalActivity = WeeklyPlannerLocalTrainingActivity | WeeklyPlannerRecoveryActivity | WeeklyPlannerMatchActivity`
  - `type WeeklyPlannerActivity = WeeklyPlannerSavedTrainingActivity | WeeklyPlannerLocalActivity`
  - `interface WeeklyPlannerDay { date: string; dayOfWeek: ...; rest: boolean; activities: readonly WeeklyPlannerActivity[] }`
  - `interface WeeklyPlannerState { weekStartDate: string; days: readonly WeeklyPlannerDay[] }`
  - `buildWeeklyPlannerState(board)`
  - `summarizeWeeklyPlannerDay(day)`
  - `addWeeklyPlannerActivity(state, date, activity)`
  - `markWeeklyPlannerDayRest(state, date)`
  - `clearWeeklyPlannerDayRest(state, date)`
  - `removeWeeklyPlannerLocalActivity(state, date, activityId)`
  - `sortWeeklyPlannerActivities(activities)`

- [ ] **Step 1: Write failing model tests for seven fixed days and saved-session projection**

Create `tests/proClubWeeklyPlannerUiModel.unit.test.ts` with an input board whose `weekStartDate` is Monday `2026-09-14` and saved Training sessions on Monday twice and Saturday once. Assert:

```ts
const state = buildWeeklyPlannerState(board);
assert.equal(state.days.length, 7);
assert.deepEqual(state.days.map((day) => day.dayOfWeek), [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
]);
assert.deepEqual(state.days.map((day) => day.date), [
  "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20",
]);
assert.equal(state.days[0].activities.length, 2);
assert.equal(state.days[1].activities.length, 0);
assert.equal(state.days[1].rest, false);
assert.equal(summarizeWeeklyPlannerDay(state.days[1]).label, "Not set");
```

Saved activity assertions must verify `source === "SAVED_TRAINING"`, `activityType === "TRAINING"`, and that `sessionDate`, `startTime`, `durationMinutes`, `plannedLoad`, `objective`, `location`, and `blocks` survive projection unchanged.

- [ ] **Step 2: Run model test to verify RED**

Run:

```bash
node --import tsx --test tests/proClubWeeklyPlannerUiModel.unit.test.ts
```

Expected: FAIL because `weeklyPlannerUiModel.ts` and exported functions/types do not exist.

- [ ] **Step 3: Implement minimal types and deterministic Monday-to-Sunday projection**

Create `weeklyPlannerUiModel.ts` with these exact core discriminants:

```ts
export type WeeklyPlannerSquadScope =
  | "ALL_SQUAD"
  | "STARTERS"
  | "NON_STARTERS"
  | "SELECTED_PLAYERS";

export interface WeeklyPlannerSavedTrainingActivity {
  readonly id: string;
  readonly source: "SAVED_TRAINING";
  readonly activityType: "TRAINING";
  readonly squadScope: "ALL_SQUAD";
  readonly session: ProClubWeeklyPeriodizationBoard["sessions"][number];
}

export interface WeeklyPlannerLocalTrainingActivity {
  readonly id: string;
  readonly source: "LOCAL_UI";
  readonly activityType: "TRAINING";
  readonly startTime: string;
  readonly durationMinutes: number;
  readonly title: string;
  readonly focus: string;
  readonly location: string;
  readonly plannedLoad: "LOW" | "MODERATE" | "HIGH";
  readonly squadScope: WeeklyPlannerSquadScope;
}

export interface WeeklyPlannerRecoveryActivity {
  readonly id: string;
  readonly source: "LOCAL_UI";
  readonly activityType: "RECOVERY";
  readonly startTime: string;
  readonly durationMinutes: number;
  readonly focus: string;
  readonly location: string;
  readonly squadScope: WeeklyPlannerSquadScope;
}

export interface WeeklyPlannerMatchActivity {
  readonly id: string;
  readonly source: "LOCAL_UI";
  readonly activityType: "MATCH";
  readonly kickoffTime: string;
  readonly competition: string;
  readonly competitionCategory: "LEAGUE" | "CUP" | "FRIENDLY" | "TOURNAMENT" | "OTHER";
  readonly opponent: string;
  readonly venue: string;
  readonly squadLabel: string;
  readonly squadScope: WeeklyPlannerSquadScope;
}
```

Use UTC date arithmetic from `weekStartDate` to create exactly seven dates. Group saved sessions by `sessionDate`. Generate saved IDs as `saved-training:${sessionDate}:${startTime}:${originalIndex}` so multiple sessions on one day remain distinct.

- [ ] **Step 4: Add failing tests for day summaries, multiple matches, Mixed Day, ordering, and Rest exclusivity**

Add tests with local activities using stable IDs such as `local-match-1` and `local-recovery-1` and assert:

```ts
assert.equal(summarizeWeeklyPlannerDay(trainingOnlyDay).label, "Training Day");
assert.equal(summarizeWeeklyPlannerDay(recoveryOnlyDay).label, "Recovery Day");
assert.equal(summarizeWeeklyPlannerDay(oneMatchDay).label, "Match Day");
assert.equal(summarizeWeeklyPlannerDay(twoMatchDay).detail, "2 matches");
assert.equal(summarizeWeeklyPlannerDay(mixedDay).label, "Mixed Day");
```

Assert a local 09:00 Match sorts before a 10:00 Recovery and a 17:00 Training. Assert `markWeeklyPlannerDayRest()` returns the target day with `rest === true` and `activities.length === 0`; `clearWeeklyPlannerDayRest()` returns `rest === false` and no activities. Assert `addWeeklyPlannerActivity()` on a Rest day first clears Rest and adds the activity.

- [ ] **Step 5: Run model test to verify new assertions are RED**

Run the same targeted test command. Expected: FAIL on unimplemented summary/mutation helpers.

- [ ] **Step 6: Implement summary, mutation, removal, and stable time sorting**

Implement `summarizeWeeklyPlannerDay()` with exact precedence:

```ts
if (day.rest) return { label: "Rest Day", detail: "Rest & recover" };
if (day.activities.length === 0) return { label: "Not set", detail: "No activity planned" };
const types = new Set(day.activities.map((activity) => activity.activityType));
if (types.size > 1) return { label: "Mixed Day", detail: `${day.activities.length} activities` };
if (types.has("TRAINING")) return { label: "Training Day", detail: `${count} ${count === 1 ? "session" : "sessions"}` };
if (types.has("RECOVERY")) return { label: "Recovery Day", detail: `${count} ${count === 1 ? "session" : "sessions"}` };
return { label: "Match Day", detail: `${count} ${count === 1 ? "match" : "matches"}` };
```

Sorting key is `session.startTime` for saved Training, `startTime` for local Training/Recovery, and `kickoffTime` for Match. Maintain original order as a stable tie-breaker.

- [ ] **Step 7: Run model tests GREEN**

Run:

```bash
node --import tsx --test tests/proClubWeeklyPlannerUiModel.unit.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/components/pro-club/operations/weeklyPlannerUiModel.ts tests/proClubWeeklyPlannerUiModel.unit.test.ts
git commit -m "feat(pro-club): add weekly planner ui model"
```

---

### Task 2: Activity and seven-day Day Card presentation

**Files:**
- Create: `src/components/pro-club/operations/WeeklyPlannerActivityCard.tsx`
- Create: `src/components/pro-club/operations/WeeklyPlannerDayCard.tsx`
- Create: `tests/proClubWeeklyPlannerBoardUi.unit.test.tsx`

**Interfaces:**
- Consumes Task 1 types and `summarizeWeeklyPlannerDay()`.
- `WeeklyPlannerActivityCard({ activity })` renders one discriminated activity.
- `WeeklyPlannerDayCard({ day, onAddActivity, onMarkRest, onClearRest, onRemoveLocalActivity })` renders one day and exposes interaction callbacks without persistence.

- [ ] **Step 1: Write failing static rendering tests for saved Training and seven Day Card semantics**

In `tests/proClubWeeklyPlannerBoardUi.unit.test.tsx`, render a `WeeklyPlannerDayCard` containing one saved Training activity. Assert visible text includes:

```text
MON
14 SEP 2026
Training Day
08:00
60 min
LOW
Restore movement quality
Training Ground A
Movement preparation
Passing rhythm
Drill reference: drill-passing-rhythm
All squad
```

Render empty, recovery-only, match-only, mixed, and rest days and assert exact labels `Not set`, `Recovery Day`, `Match Day`, `Mixed Day`, `Rest Day`.

- [ ] **Step 2: Run board UI test RED**

```bash
node --import tsx --test tests/proClubWeeklyPlannerBoardUi.unit.test.tsx
```

Expected: FAIL because the two new components do not exist.

- [ ] **Step 3: Implement `WeeklyPlannerActivityCard` presentation**

Saved Training card must render existing session fields and blocks. Use these visual badge labels:

- `Training` for both saved/local Training
- `Recovery` for Recovery
- competition category label for Match, e.g. `Cup Match`, `League Match`, `Friendly Match`, `Tournament Match`, or `Match`

Squad display mapping must be:

```ts
ALL_SQUAD -> "All squad"
STARTERS -> "Starters"
NON_STARTERS -> "Non-starters"
SELECTED_PLAYERS -> "Selected players"
```

Saved Training cards must not expose private plan metadata, actor IDs, club IDs, author IDs, or Head Coach notes.

- [ ] **Step 4: Implement `WeeklyPlannerDayCard` presentation with day header and Add Activity surface**

The day card must:

- render abbreviated weekday and localized date;
- show derived summary label/detail;
- render all activities in `sortWeeklyPlannerActivities(day.activities)` order;
- render a Rest placeholder when `day.rest` is true;
- render `+ Add Activity` when not resting;
- render `Clear Rest` when resting;
- render remove controls only for `source === "LOCAL_UI"`; saved Training remains read-only.

Do not add any persistence imports.

- [ ] **Step 5: Run board UI tests GREEN**

```bash
node --import tsx --test tests/proClubWeeklyPlannerBoardUi.unit.test.tsx
```

Expected: PASS for Day Card/activity presentation tests.

- [ ] **Step 6: Add source-boundary assertions**

Read both new component source files and assert they do not contain or import:

```text
firebase
/firestore/
setDoc
addDoc
updateDoc
deleteDoc
writeBatch
runTransaction
httpsCallable
saveProClubWeeklyTrainingFreshDraftForCurrentRuntime
VITE_
process.env
```

Run the targeted test and confirm PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/components/pro-club/operations/WeeklyPlannerActivityCard.tsx src/components/pro-club/operations/WeeklyPlannerDayCard.tsx tests/proClubWeeklyPlannerBoardUi.unit.test.tsx
git commit -m "feat(pro-club): add weekly planner day cards"
```

---

### Task 3: Interactive local-only Weekly Planner board

**Files:**
- Create: `src/components/pro-club/operations/WeeklyPlannerBoard.tsx`
- Modify: `tests/proClubWeeklyPlannerBoardUi.unit.test.tsx`

**Interfaces:**
- Consumes `ProClubWeeklyPeriodizationBoard`.
- Produces `WeeklyPlannerBoard({ board })`.
- Parent owns ephemeral state seeded from `buildWeeklyPlannerState(board)`.
- Uses `WeeklyPlannerDayCard` callbacks to mutate only local state.

- [ ] **Step 1: Write failing tests for the full seven-column weekly board contract**

Render `WeeklyPlannerBoard` with saved sessions only on Monday and Saturday. Assert:

```ts
assert.equal((markup.match(/data-weekly-planner-day=/g) ?? []).length, 7);
```

Assert visible weekday order is MON, TUE, WED, THU, FRI, SAT, SUN. Assert Tuesday through Friday render `Not set` rather than disappearing. Assert a day with two saved sessions displays both session times and `2 sessions`.

Assert board markup includes:

```text
Weekly Training Plan
UI PREVIEW
7-day microcycle
Save Plan
Persistence not enabled
```

- [ ] **Step 2: Run full board test RED**

```bash
node --import tsx --test tests/proClubWeeklyPlannerBoardUi.unit.test.tsx
```

Expected: FAIL because `WeeklyPlannerBoard` does not exist.

- [ ] **Step 3: Implement board shell and local summary metrics**

Implement a dark FutVerse board header and horizontal day lane:

```tsx
<div aria-label="Weekly planner days" className="flex min-w-max gap-3 overflow-x-auto pb-3">
  {planner.days.map((day) => <WeeklyPlannerDayCard ... />)}
</div>
```

Each Day Card should be approximately `min-w-[15rem]` to `min-w-[17rem]` so seven columns form a dense professional desktop board and scroll horizontally on narrower screens.

Summary metrics are derived only from visible state:

- Training duration: sum saved/local Training duration minutes only.
- Sessions: count Training + Recovery activities.
- Matches: count Match activities.
- Average load: map LOW=1, MODERATE=2, HIGH=3 for Training activities with load; display one decimal or `—` when none.

- [ ] **Step 4: Add failing interaction tests using `react-test-renderer` only if already installed; otherwise test pure callbacks through exported helper state transitions**

Do not add a dependency. If `react-test-renderer` is absent, expose these small pure helpers from `WeeklyPlannerBoard.tsx` or the model and test them through Task 1 model functions:

- add Recovery to an empty day -> Recovery Day;
- add Match twice -> Match Day / 2 matches;
- add Recovery to Match day -> Mixed Day;
- mark Rest on a day with local activities -> activities cleared and Rest Day;
- clear Rest -> Not set;
- add Training to Rest -> Rest cleared and Training Day.

Expected initial run: RED until board callback wiring uses those helpers.

- [ ] **Step 5: Implement inline Add Activity composer without persistence**

When `+ Add Activity` is selected, show type choices `Training`, `Recovery`, `Match`, `Rest` for that day.

Use a compact inline form with these exact local fields:

**Training**

```ts
{
  startTime: "09:00",
  durationMinutes: 60,
  title: "Training session",
  focus: "",
  location: "",
  plannedLoad: "MODERATE",
  squadScope: "ALL_SQUAD"
}
```

**Recovery**

```ts
{
  startTime: "10:00",
  durationMinutes: 45,
  focus: "Recovery & mobility",
  location: "",
  squadScope: "ALL_SQUAD"
}
```

**Match**

```ts
{
  kickoffTime: "18:00",
  competition: "",
  competitionCategory: "LEAGUE",
  opponent: "",
  venue: "",
  squadLabel: "First Team",
  squadScope: "ALL_SQUAD"
}
```

Activity IDs must be generated locally without external calls, using a deterministic per-mount counter such as `local:${activityType.toLowerCase()}:${counter}`.

Rest must invoke `markWeeklyPlannerDayRest()` and, when activities exist, use `window.confirm("Mark this day as Rest and remove local planner activities for this day?")`. Saved Training activities must prevent Rest rather than silently discard authoritative saved sessions; show an inline message `Saved training exists on this day. Rest cannot replace saved training in UI preview.`

- [ ] **Step 6: Implement local-only Save Plan behavior**

`Save Plan` must not call any async API. Its click handler only sets a local status message:

```text
UI preview only — persistence is intentionally not enabled yet.
```

The button must be `type="button"` and no submit form should wrap the weekly board.

- [ ] **Step 7: Run board UI/model tests GREEN**

```bash
node --import tsx --test tests/proClubWeeklyPlannerUiModel.unit.test.ts tests/proClubWeeklyPlannerBoardUi.unit.test.tsx
```

Expected: all PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/components/pro-club/operations/WeeklyPlannerBoard.tsx tests/proClubWeeklyPlannerBoardUi.unit.test.tsx
git commit -m "feat(pro-club): add interactive weekly planner preview"
```

---

### Task 4: Preserve saved-DRAFT wiring through `WeeklyPeriodizationBoard`

**Files:**
- Modify: `src/components/pro-club/operations/WeeklyPeriodizationBoard.tsx`
- Modify: `tests/proClubWeeklyPeriodizationBoardUi.unit.test.tsx`
- Test: `tests/proClubSavedDraftUiWiring.unit.test.tsx` if present on the execution baseline; otherwise run the existing saved-DRAFT wiring test discovered by `ls tests | Select-String -Pattern 'SavedDraft|savedDraft'` without creating a duplicate test file.

**Interfaces:**
- `WeeklyPeriodizationBoard({ board })` public signature remains unchanged.
- It delegates to `<WeeklyPlannerBoard board={board} />`.
- `WeeklyTrainingSavedDrafts` continues to call `<WeeklyPeriodizationBoard board={board} />`; do not change its read adapter or authority logic.

- [ ] **Step 1: Change existing periodization test first to require exactly seven days**

Replace the current assertion that Tuesday-Friday are absent with assertions that all seven weekday labels are present in order and that missing-session days show `Not set`.

Preserve assertions for:

- saved dates;
- LOW/MODERATE/HIGH load;
- start time/location/duration;
- phase/objective;
- block titles in input order;
- optional drill reference;
- coaching points;
- no private metadata;
- no Firestore/write imports.

- [ ] **Step 2: Run legacy periodization test RED**

```bash
node --import tsx --test tests/proClubWeeklyPeriodizationBoardUi.unit.test.tsx
```

Expected: FAIL because the old component still renders only supplied sessions.

- [ ] **Step 3: Replace internal card rendering with the compatibility wrapper**

`WeeklyPeriodizationBoard.tsx` should become small and keep only the public board type import plus the new board component import:

```tsx
import type { ProClubWeeklyPeriodizationBoard as ProClubWeeklyPeriodizationBoardModel } from "../../../lib/proClubWeeklyPeriodizationBoard";
import WeeklyPlannerBoard from "./WeeklyPlannerBoard";

export default function WeeklyPeriodizationBoard({ board }: { board: ProClubWeeklyPeriodizationBoardModel }) {
  return <WeeklyPlannerBoard board={board} />;
}
```

If accessibility title compatibility is needed by existing tests, pass a heading prop to `WeeklyPlannerBoard`; do not duplicate the old full renderer.

- [ ] **Step 4: Run periodization + saved-DRAFT wiring regressions**

Run:

```bash
node --import tsx --test tests/proClubWeeklyPeriodizationBoardUi.unit.test.tsx
```

Then discover the exact saved-DRAFT wiring regression file if needed and run it. Expected: PASS. Confirm `WeeklyTrainingSavedDrafts.tsx` still contains both `deriveProClubWeeklyPeriodizationBoard(detail.draft)` and `<WeeklyPeriodizationBoard board={board} />`.

- [ ] **Step 5: Run source boundary test for compatibility wrapper**

Assert `WeeklyPeriodizationBoard.tsx`, `WeeklyPlannerBoard.tsx`, `WeeklyPlannerDayCard.tsx`, and `WeeklyPlannerActivityCard.tsx` contain no direct Firestore write or callable Function use. Confirm PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/components/pro-club/operations/WeeklyPeriodizationBoard.tsx tests/proClubWeeklyPeriodizationBoardUi.unit.test.tsx
git commit -m "feat(pro-club): render seven-day weekly planner"
```

---

### Task 5: Training workspace visual integration and App Shell regression

**Files:**
- Modify: `src/components/pro-club/operations/ProClubHeadCoachWeeklyProductionWorkspace.tsx` only if needed for spacing/background/header hierarchy.
- Modify: `tests/proClubHeadCoachWeeklyProductionVisibilityV1.unit.test.tsx` only if the new approved visible copy requires it.
- Test: `tests/proClubTeamDashboardProductionV1.unit.test.tsx`
- Test: `tests/proClubMembershipDiscoveryPortal.unit.test.tsx`

**Interfaces:**
- No authority signature changes.
- No route changes.
- Existing `canRenderHeadCoachWeeklyProductionWorkspace(authority)` remains unchanged.
- Existing App Shell Training tab still renders exactly one `ProClubHeadCoachWeeklyProductionWorkspace`.

- [ ] **Step 1: Write/adjust failing visual contract assertion only if current workspace wrapper prevents approved dense planner layout**

The target Training page must preserve the dark weekly-planning visual language without creating a second nested app shell. Assert the weekly planner renders inside the existing App Shell and that the following are visible:

```text
Weekly Training Plan
UI PREVIEW
MON
TUE
WED
THU
FRI
SAT
SUN
```

Do not assert arbitrary pixel-perfect Tailwind classes except structural constraints needed to prevent a duplicate shell or global max-width.

- [ ] **Step 2: Run visibility and App Shell tests**

```bash
node --import tsx --test tests/proClubHeadCoachWeeklyProductionVisibilityV1.unit.test.tsx tests/proClubTeamDashboardProductionV1.unit.test.tsx tests/proClubMembershipDiscoveryPortal.unit.test.tsx
```

If all already pass, do not modify `ProClubHeadCoachWeeklyProductionWorkspace.tsx`; proceed directly to Step 4. If the visual contract fails because of a real wrapper conflict, continue to Step 3.

- [ ] **Step 3: Make the minimum workspace presentation adjustment**

Only adjust layout classes/copy necessary to let the approved planner surface fill the Training main content area. Keep:

```ts
canRenderHeadCoachWeeklyProductionWorkspace(authority)
```

unchanged. Do not alter saved-DRAFT read flags, authority checks, or composer persistence behavior.

- [ ] **Step 4: Re-run Training/App Shell regressions GREEN**

Run the same three-test command. Expected: PASS.

- [ ] **Step 5: Commit Task 5 only if source/test files changed**

```bash
git add src/components/pro-club/operations/ProClubHeadCoachWeeklyProductionWorkspace.tsx tests/proClubHeadCoachWeeklyProductionVisibilityV1.unit.test.tsx
git commit -m "style(pro-club): integrate weekly planner workspace"
```

If no change was required, record `TASK_5_SOURCE_CHANGE=NO` in the execution report and do not create an empty commit.

---

### Task 6: Full verification, independent review, preview, and user Visual Acceptance

**Files:**
- No feature additions.
- Test and verification only.

**Interfaces:**
- Exact feature branch HEAD becomes the review target.
- No merge or production deploy before user Visual Acceptance.

- [ ] **Step 1: Run focused planner tests**

```bash
node --import tsx --test tests/proClubWeeklyPlannerUiModel.unit.test.ts tests/proClubWeeklyPlannerBoardUi.unit.test.tsx tests/proClubWeeklyPeriodizationBoardUi.unit.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run existing Weekly saved-DRAFT and Training visibility regressions**

Run the exact existing test files discovered in the repo for:

- saved-DRAFT wiring/read path;
- Head Coach Weekly production visibility;
- Weekly card board regression;
- Tactic/drill reference regression if already part of the Weekly path.

Do not create duplicate tests just to satisfy this step.

Expected: PASS.

- [ ] **Step 3: Run App Shell regressions**

```bash
node --import tsx --test tests/proClubTeamDashboardProductionV1.unit.test.tsx tests/proClubMembershipDiscoveryPortal.unit.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run static validation and build**

```bash
npm run lint
npm run build
git diff --check
```

Expected: all PASS. Vite chunk-size warnings alone are not test failures.

- [ ] **Step 5: Run exact-scope audit before review**

Confirm changed feature files are limited to the planner UI/model/tests plus the minimal compatibility/workspace files explicitly listed in this plan. Explicitly verify there are no changes under:

```text
firestore.rules
firestore.indexes.json
functions/
src/lib/firestore/
src/lib/proClubWeeklyTraining.ts
```

and no new production write/callable invocation in the planner source.

- [ ] **Step 6: Independent exact-HEAD review**

Review exact feature HEAD against its exact base. Reviewer checks:

- seven-day contract;
- multi-session/multi-match behavior;
- Rest exclusivity;
- saved Training immutability;
- no inferred Rest for legacy gaps;
- local-only Recovery/Match/Rest/new Training;
- authority/App Shell regressions;
- no schema/Rules/Functions/write-boundary changes.

Do not merge until review is PASS.

- [ ] **Step 7: Open PR and use preview surface for visual review**

Open a PR only after exact-HEAD review passes. Let the existing preview provider build the branch. Do not deploy Firebase production for visual review.

The preview must show the approved structure:

- seven dense Mon-Sun columns;
- multiple activities per day;
- Training/Recovery/Match/Rest/Mixed visuals;
- Match-day top-up representation;
- multiple matches in one day;
- local-only `Save Plan` notice;
- existing Pro Club sidebar/top bar intact.

- [ ] **Step 8: Obtain explicit user Visual Acceptance**

Show the preview/screenshot to the user. If the user says it is not close enough to the approved mockup, revise only UI within this same slice and repeat focused tests/review as needed. Do not start persistence design until the user explicitly accepts the UI.

- [ ] **Step 9: Stop at Visual Acceptance gate**

After Visual Acceptance, report:

```text
WEEKLY_PLANNER_UI_VISUAL_ACCEPTANCE=PASS
PERSISTENCE_IMPLEMENTED=NO
RULES_CHANGED=NO
FUNCTIONS_CHANGED=NO
PRODUCTION_DATA_WRITTEN=NO
```

The next project step is a separate persistence-contract design/approval cycle; it is not part of this implementation plan.
