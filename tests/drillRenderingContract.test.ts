import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const librarySource = readFileSync(
  new URL("../src/components/DrillLibrary.tsx", import.meta.url),
  "utf8",
);

const detailSource = readFileSync(
  new URL("../src/components/DrillDetailModal.tsx", import.meta.url),
  "utf8",
);

test("1. DrillLibrary guards nullable canvas before reading fieldType", () => {
  assert.match(
    librarySource,
    /\{drill\.canvas_data\s*&&\s*\([\s\S]*?drill\.canvas_data\.fieldType\s*===\s*"full"/,
  );
});

test("2. DrillDetailModal guards nullable canvas before reading fieldType", () => {
  assert.match(
    detailSource,
    /\{drill\.canvas_data\s*&&\s*\([\s\S]*?drill\.canvas_data\.fieldType\s*===\s*"full"/,
  );

  assert.doesNotMatch(
    detailSource,
    /drill\.canvas_data\?\.fieldType/,
  );
});

test("3. DrillLibrary renders half pitch only for explicit half fieldType", () => {
  assert.match(
    librarySource,
    /drill\.canvas_data\.fieldType\s*===\s*"half"\s*\?/,
  );

  assert.match(
    librarySource,
    /drill\.canvas_data\.fieldType\s*===\s*"half"\s*\?[\s\S]*?:\s*null/,
  );
});

test("4. DrillDetailModal renders half pitch only for explicit half fieldType", () => {
  assert.match(
    detailSource,
    /drill\.canvas_data\.fieldType\s*===\s*"half"\s*\?/,
  );

  assert.match(
    detailSource,
    /drill\.canvas_data\.fieldType\s*===\s*"half"\s*\?[\s\S]*?:\s*null/,
  );
});

test("5. uploaded preview rendering remains available independently", () => {
  assert.match(librarySource, /\{drill\.previewImage\s*\?/);
  assert.match(detailSource, /\{drill\.previewImage\s*\?/);
});
