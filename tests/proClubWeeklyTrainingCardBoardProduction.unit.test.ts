import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  "src/components/pro-club/operations/ProClubHeadCoachWeeklyProductionWorkspace.tsx",
  "utf8",
);
const savedDrafts = readFileSync(
  "src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx",
  "utf8",
);

test("Weekly Training production presents the saved weekly card board before the fresh-DRAFT composer", () => {
  const savedDraftIndex = workspace.indexOf(
    "<WeeklyTrainingSavedDrafts authority={authority} />",
  );
  const composerIndex = workspace.indexOf(
    "<WeeklyTrainingDraftComposer authority={authority} />",
  );

  assert.ok(savedDraftIndex >= 0, "saved weekly training surface must remain wired");
  assert.ok(composerIndex >= 0, "fresh-DRAFT composer must remain available");
  assert.ok(
    savedDraftIndex < composerIndex,
    "weekly card/history surface must be the primary Training surface",
  );
});

test("Weekly Training automatically opens the newest validated saved DRAFT as the current card board", () => {
  assert.match(
    savedDrafts,
    /if\s*\(\s*!selectedPlanId\s*&&\s*drafts\.length\s*>\s*0\s*&&\s*!loadingList\s*\)\s*\{[\s\S]*openDetail\(drafts\[0\]\.planId\)/,
  );
});

test("current weekly periodization board renders before the saved-week chooser", () => {
  const detailIndex = savedDrafts.indexOf(
    "{detail && !editing && !revisingAsNew && (",
  );
  const chooserIndex = savedDrafts.indexOf(
    "{drafts.length > 0 && !editing && !revisingAsNew &&",
  );

  assert.ok(detailIndex >= 0, "validated DRAFT detail board must remain available");
  assert.ok(chooserIndex >= 0, "saved-week chooser must remain available");
  assert.ok(
    detailIndex < chooserIndex,
    "current weekly board must render before the saved-week chooser",
  );
});
