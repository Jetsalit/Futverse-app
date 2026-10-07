import assert from "node:assert/strict";
import test from "node:test";

const snapshotModule = await import("../src/lib/drillSubmittedSnapshot").catch(
  () => undefined,
) as
  | {
      buildDrillSubmittedSnapshot?: (
        source: Readonly<Record<string, unknown>>,
      ) => Record<string, unknown>;
    }
  | undefined;

function buildSnapshot(source: Readonly<Record<string, unknown>>) {
  assert.equal(
    typeof snapshotModule?.buildDrillSubmittedSnapshot,
    "function",
    "the immutable drill snapshot builder must exist",
  );
  return snapshotModule.buildDrillSubmittedSnapshot!(source);
}

test("buildsUploadedImageSnapshot", () => {
  const previewImage = "data:image/png;base64,exact-source-image";
  const snapshot = buildSnapshot({
    title: "Paper drill",
    category: "GK Training",
    previewImage,
    canvas_data: null,
  });

  assert.deepEqual(snapshot, {
    details: { title: "Paper drill", category: "GK Training" },
    visualType: "UPLOADED_IMAGE",
    previewImage,
  });
});

test("buildsBoardSnapshotPreservingRawCanvasMap", () => {
  const canvasData = {
    elements: [{ id: "player-1", type: "future-player-shape", x: 17, y: 29 }],
    lines: [{ id: "run-1", tool: "future-arrow", points: [1, 2, 3, 4] }],
    fieldType: "future-field-type",
    teamColors: { teamA: "#01abef" },
    pitchTheme: "future-pitch-theme",
    unknownPersistedKey: { exact: true },
  };
  const snapshot = buildSnapshot({
    title: "Board drill",
    category: "GK Training",
    canvas_data: canvasData,
    previewImage: null,
  });

  assert.equal(snapshot.visualType, "TACTIC_BOARD");
  assert.deepEqual(snapshot.canvasData, canvasData);
});

test("snapshotPreservesStageDimensionsExactly", () => {
  const canvasData = {
    elements: [{ id: "edge-player", type: "red", x: 550, y: 231 }],
    lines: [{ id: "pass", points: [64, 208, 576, 208] }],
    fieldType: "full",
    stageWidth: 640,
    stageHeight: 416,
  };
  const snapshot = buildSnapshot({
    title: "Responsive board",
    category: "Goalkeeping",
    canvas_data: canvasData,
  });

  assert.deepEqual(snapshot.canvasData, canvasData);
});

test("snapshotPreservesExactPitchBounds", () => {
  const canvasData = {
    elements: [{ id: "edge-player", type: "red", x: 550, y: 400 }],
    lines: [{ id: "pass", points: [64, 208, 576, 208] }],
    fieldType: "half",
    stageWidth: 600,
    stageHeight: 462,
    pitchX: 16,
    pitchY: 16.016,
    pitchWidth: 568,
    pitchHeight: 429.968,
  };
  const snapshot = buildSnapshot({
    title: "Measured inset board",
    category: "Goalkeeping",
    canvas_data: canvasData,
  });

  assert.deepEqual(snapshot.canvasData, canvasData);
});

test("buildsBothSnapshotWithoutDroppingEitherVisual", () => {
  const canvasData = { elements: [{ id: "player-2" }], lines: [], fieldType: "small" };
  const previewImage = "data:image/jpeg;base64,paired-source-image";
  const snapshot = buildSnapshot({
    title: "Combined drill",
    category: "GK Training",
    canvas_data: canvasData,
    previewImage,
  });

  assert.equal(snapshot.visualType, "BOTH");
  assert.deepEqual(snapshot.canvasData, canvasData);
  assert.equal(snapshot.previewImage, previewImage);
});

test("copiesOnlyPresentDrillDetails", () => {
  const snapshot = buildSnapshot({
    title: "Details test",
    category: "GK Training",
    phase: "Preparatory",
    coachingPoints: "Stay balanced",
    unrelatedField: "must not enter the snapshot",
    canvas_data: { elements: [], lines: [], fieldType: "full" },
  });

  assert.deepEqual(snapshot.details, {
    title: "Details test",
    category: "GK Training",
    phase: "Preparatory",
    coachingPoints: "Stay balanced",
  });
});

test("doesNotChangeAfterSourceMutation", () => {
  const source = {
    title: "Before",
    category: "GK Training",
    canvas_data: {
      elements: [{ id: "player-1", x: 10 }],
      lines: [],
      fieldType: "half",
    },
    previewImage: "data:image/png;base64,before",
  };
  const snapshot = buildSnapshot(source);

  source.title = "After";
  source.canvas_data.elements[0].x = 99;
  source.previewImage = "data:image/png;base64,after";

  assert.equal((snapshot.details as Record<string, unknown>).title, "Before");
  assert.equal(
    ((snapshot.canvasData as { elements: Array<{ x: number }> }).elements[0]).x,
    10,
  );
  assert.equal(snapshot.previewImage, "data:image/png;base64,before");
});
