import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_WEEKLY_TRAINING_BLOCKS_PER_SESSION,
  MAX_WEEKLY_TRAINING_SESSIONS,
  addTrainingBlock,
  addTrainingSession,
  createEmptyTrainingSession,
  expectedWeeklyTrainingDocumentCount,
  removeTrainingBlock,
  removeTrainingSession,
} from "../src/components/pro-club/operations/weeklyTrainingDraftComposerModel.ts";

test("session controls preserve the full 1 to 14 product envelope", () => {
  let sessions = [createEmptyTrainingSession()] as readonly ReturnType<typeof createEmptyTrainingSession>[];
  for (let index = 1; index < MAX_WEEKLY_TRAINING_SESSIONS; index += 1) {
    sessions = addTrainingSession(sessions);
  }
  assert.equal(sessions.length, 14);
  assert.equal(addTrainingSession(sessions), sessions);

  while (sessions.length > 1) sessions = removeTrainingSession(sessions, sessions.length - 1);
  assert.equal(sessions.length, 1);
  assert.equal(removeTrainingSession(sessions, 0), sessions);
});

test("block controls preserve the full 1 to 12 product envelope", () => {
  let session = createEmptyTrainingSession();
  for (let index = 1; index < MAX_WEEKLY_TRAINING_BLOCKS_PER_SESSION; index += 1) {
    session = addTrainingBlock(session);
  }
  assert.equal(session.blocks.length, 12);
  assert.equal(addTrainingBlock(session), session);

  while (session.blocks.length > 1) session = removeTrainingBlock(session, session.blocks.length - 1);
  assert.equal(session.blocks.length, 1);
  assert.equal(removeTrainingBlock(session, 0), session);
});

test("document-count preview reaches the accepted 183-document maximum", () => {
  let sessions = [createEmptyTrainingSession()] as readonly ReturnType<typeof createEmptyTrainingSession>[];
  sessions = sessions.map((current) => {
    let expanded = current;
    for (let index = 1; index < MAX_WEEKLY_TRAINING_BLOCKS_PER_SESSION; index += 1) {
      expanded = addTrainingBlock(expanded);
    }
    return expanded;
  });

  while (sessions.length < MAX_WEEKLY_TRAINING_SESSIONS) {
    const next = addTrainingSession(sessions);
    const last = next[next.length - 1];
    let expanded = last;
    for (let index = 1; index < MAX_WEEKLY_TRAINING_BLOCKS_PER_SESSION; index += 1) {
      expanded = addTrainingBlock(expanded);
    }
    sessions = [...next.slice(0, -1), expanded];
  }

  assert.equal(expectedWeeklyTrainingDocumentCount(sessions), 183);
});
