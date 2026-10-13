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
      teamColors: { teamA: "#ef4444", teamB: "#3b82f6" },
      pitchTheme: "white",
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
      teamColors: { teamA: "#ef4444", teamB: "#3b82f6" },
      pitchTheme: "white",
    },
  );
});

test("preservesResponsiveAuthoringStageDimensions", () => {
  const stageWidth = 600;
  const stageHeight = Math.round(stageWidth / 1.3);
  const canvas = normalizeDrillCanvasData({
    elements: [],
    lines: [],
    fieldType: "half",
    stageWidth,
    stageHeight,
  });

  assert.equal(canvas?.stageWidth, 600);
  assert.equal(canvas?.stageHeight, 462);
});

test("normalizesOnlyPositiveFiniteStageDimensions", () => {
  const invalidWidth = normalizeDrillCanvasData({
    elements: [],
    lines: [],
    fieldType: "half",
    stageWidth: 0,
    stageHeight: 462,
  });
  assert.equal(invalidWidth?.stageWidth, undefined);
  assert.equal(invalidWidth?.stageHeight, 462);

  for (const stageWidth of [-1, Number.NaN, Number.POSITIVE_INFINITY, "600"]) {
    const canvas = normalizeDrillCanvasData({
      elements: [],
      lines: [],
      fieldType: "full",
      stageWidth,
      stageHeight: 416,
    });
    assert.equal(canvas?.stageWidth, undefined);
    assert.equal(canvas?.stageHeight, 416);
  }

  for (const stageHeight of [0, -1, Number.NaN, Number.NEGATIVE_INFINITY, "462"]) {
    const canvas = normalizeDrillCanvasData({
      elements: [],
      lines: [],
      fieldType: "half",
      stageWidth: 600,
      stageHeight,
    });
    assert.equal(canvas?.stageWidth, 600);
    assert.equal(canvas?.stageHeight, undefined);
  }
});

test("normalizeCanvasPreservesCompleteValidPitchBounds", () => {
  const pitchBounds = {
    pitchX: 16,
    pitchY: 16.016,
    pitchWidth: 568,
    pitchHeight: 429.968,
  };
  const canvas = normalizeDrillCanvasData({
    elements: [],
    lines: [],
    fieldType: "half",
    stageWidth: 600,
    stageHeight: 462,
    ...pitchBounds,
  });

  assert.deepEqual(
    {
      pitchX: canvas?.pitchX,
      pitchY: canvas?.pitchY,
      pitchWidth: canvas?.pitchWidth,
      pitchHeight: canvas?.pitchHeight,
    },
    pitchBounds,
  );
});

test("normalizationRejectsIncompletePitchBounds", () => {
  const canvas = normalizeDrillCanvasData({
    elements: [],
    lines: [],
    fieldType: "half",
    stageWidth: 600,
    stageHeight: 462,
    pitchX: 16,
    pitchY: 16,
    pitchWidth: 568,
  });

  assert.equal(canvas?.pitchX, undefined);
  assert.equal(canvas?.pitchY, undefined);
  assert.equal(canvas?.pitchWidth, undefined);
  assert.equal(canvas?.pitchHeight, undefined);
});

test("normalizationRejectsNonFinitePitchBounds", () => {
  for (const invalid of [
    { pitchX: Number.NaN },
    { pitchY: Number.POSITIVE_INFINITY },
    { pitchWidth: Number.NEGATIVE_INFINITY },
    { pitchHeight: "414" },
    { pitchX: -1 },
    { pitchY: -1 },
    { pitchWidth: 0 },
    { pitchHeight: 0 },
  ]) {
    const canvas = normalizeDrillCanvasData({
      elements: [],
      lines: [],
      fieldType: "half",
      stageWidth: 600,
      stageHeight: 462,
      pitchX: 24,
      pitchY: 24,
      pitchWidth: 552,
      pitchHeight: 414,
      ...invalid,
    });

    assert.equal(canvas?.pitchX, undefined);
    assert.equal(canvas?.pitchY, undefined);
    assert.equal(canvas?.pitchWidth, undefined);
    assert.equal(canvas?.pitchHeight, undefined);
  }
});

test("pitchBoundsCannotExtendBeyondStage", () => {
  for (const invalid of [
    { pitchX: 600, pitchY: 24, pitchWidth: 1, pitchHeight: 414 },
    { pitchX: 24, pitchY: 462, pitchWidth: 552, pitchHeight: 1 },
    { pitchX: 500, pitchY: 24, pitchWidth: 101, pitchHeight: 414 },
    { pitchX: 24, pitchY: 400, pitchWidth: 552, pitchHeight: 63 },
  ]) {
    const canvas = normalizeDrillCanvasData({
      elements: [],
      lines: [],
      fieldType: "half",
      stageWidth: 600,
      stageHeight: 462,
      ...invalid,
    });

    assert.equal(canvas?.pitchX, undefined);
    assert.equal(canvas?.pitchY, undefined);
    assert.equal(canvas?.pitchWidth, undefined);
    assert.equal(canvas?.pitchHeight, undefined);
  }
});

test("8. team colors and pitch theme survive canvas normalization", () => {
  const canvas = normalizeDrillCanvasData({
    elements: [],
    lines: [],
    fieldType: "full",
    teamColors: { teamA: "#00aa88", teamB: "#7722cc" },
    pitchTheme: "dark-navy",
  });

  assert.deepEqual(canvas?.teamColors, {
    teamA: "#00aa88",
    teamB: "#7722cc",
  });
  assert.equal(canvas?.pitchTheme, "dark-navy");
});

test("9. legacy canvas receives red-blue and white-pitch defaults", () => {
  const canvas = normalizeDrillCanvasData({
    elements: [{ id: "legacy-player", type: "red", x: 10, y: 20 }],
    lines: [{ id: "legacy-line", tool: "pass", points: [1, 2, 3, 4] }],
    fieldType: "full",
  });

  assert.deepEqual(canvas?.teamColors, {
    teamA: "#ef4444",
    teamB: "#3b82f6",
  });
  assert.equal(canvas?.pitchTheme, "white");
  assert.equal((canvas?.lines[0] as { tool: string }).tool, "pass");
  assert.equal((canvas?.elements[0] as { type: string }).type, "red");
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

test("10. Pro Club provenance survives drill reads while legacy drills stay unprovenanced", () => {
  const proClub = normalizeDrillRecord("club-drill", {
    title: "Club Drill",
    category: "GK Training",
    created_by: "coach-1",
    organizationType: "PRO_CLUB",
    organizationId: "club-lampang",
    is_shared: false,
  });
  const legacy = normalizeDrillRecord("legacy-drill", {
    title: "Legacy Drill",
    category: "GK Training",
    created_by: "coach-1",
    is_shared: false,
  });

  assert.equal(proClub.organizationType, "PRO_CLUB");
  assert.equal(proClub.organizationId, "club-lampang");
  assert.equal(legacy.title, "Legacy Drill");
  assert.equal(legacy.organizationType, undefined);
  assert.equal(legacy.organizationId, undefined);
});
