import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDrillCanvasData,
  normalizeDrillFieldType,
  normalizeDrillRecord,
} from "../src/lib/drillDataModel";

test("1. upload drill preserves intentional null canvas", () => {
  assert.equal(normalizeDrillCanvasData(null), null);
});

test("2. all supported field types remain canonical", () => {
  assert.equal(normalizeDrillFieldType("full"), "full");
  assert.equal(normalizeDrillFieldType("half"), "half");
  assert.equal(normalizeDrillFieldType("small"), "small");
});

test("3. invalid field type fails safely to full", () => {
  assert.equal(normalizeDrillFieldType("invalid"), "full");
  assert.equal(normalizeDrillFieldType(""), "full");
  assert.equal(normalizeDrillFieldType(null), "full");
});

test("4. malformed canvas arrays are normalized without crashing", () => {
  assert.deepEqual(
    normalizeDrillCanvasData({
      elements: null,
      lines: "bad",
      fieldType: "half",
    }),
    {
      elements: [],
      lines: [],
      fieldType: "half",
    },
  );
});

test("5. valid canvas content is preserved", () => {
  const elements = [{ id: "player-1", type: "red" }];
  const lines = [{ id: "line-1", points: [1, 2, 3, 4] }];

  assert.deepEqual(
    normalizeDrillCanvasData({
      elements,
      lines,
      fieldType: "small",
    }),
    {
      elements,
      lines,
      fieldType: "small",
    },
  );
});

test("6. malformed legacy metadata receives render-safe fallbacks", () => {
  const drill = normalizeDrillRecord("legacy-1", {
    title: null,
    category: undefined,
    canvas_data: null,
    created_by: null,
    is_shared: "yes",
  });

  assert.equal(drill.id, "legacy-1");
  assert.equal(drill.title, "Untitled Drill");
  assert.equal(drill.category, "Uncategorized");
  assert.equal(drill.canvas_data, null);
  assert.equal(drill.created_by, "");
  assert.equal(drill.is_shared, false);
});

test("7. normalization does not rewrite the source object", () => {
  const raw = {
    title: "Original",
    category: "Tactical",
    canvas_data: {
      elements: [],
      lines: [],
      fieldType: "unexpected",
    },
    created_by: "coach-1",
    is_shared: true,
  };

  const before = JSON.stringify(raw);
  normalizeDrillRecord("drill-1", raw);

  assert.equal(JSON.stringify(raw), before);
});
