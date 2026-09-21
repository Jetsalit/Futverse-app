import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = readFileSync(
  "docs/PRO_CLUB_LIBRARY_LOGBOOK_V1_CONTRACT.md",
  "utf8",
);

test("contract reuses canonical drill, submission and Weekly Training references", () => {
  assert.match(contract, /useDrillDatabase\(\)/);
  assert.match(contract, /Staff Submissions/);
  assert.match(contract, /drillReference/);
  assert.match(contract, /No new Firestore collection/);
  assert.match(contract, /Weekly Training schema/);
});

test("contract freezes the seven requested football roles and five views", () => {
  for (const label of [
    "Technical Director",
    "Head Coach",
    "Assistant Coach",
    "GK Coach",
    "Fitness Coach",
    "Analyst",
    "Physio",
    "My Logbook",
    "Team Shared",
    "Club Library",
    "Favourites",
    "Recent",
  ]) {
    assert.ok(contract.includes(label), label);
  }
});

test("contract keeps Technical Director development lenses separate from review authority", () => {
  for (const label of [
    "Club Development",
    "Game Model",
    "Player Development",
    "Pathway",
  ]) {
    assert.ok(contract.includes(label), label);
  }
  assert.match(contract, /do not grant, infer, or replace Technical Governance review\/approval authority/);
  assert.match(contract, /session-only UI favourites/);
});

test("contract explicitly excludes duplicate persistence and production activation", () => {
  for (const forbiddenScope of [
    "build a new Tactic Board",
    "change Weekly Training schema or persistence",
    "add a new Firestore collection",
    "deploy or write Production data",
    "delete, rewrite, or migrate Academy training data",
  ]) {
    assert.ok(contract.includes(forbiddenScope), forbiddenScope);
  }
});
