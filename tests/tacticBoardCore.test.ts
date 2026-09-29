import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as boardModel from "../src/lib/tacticBoardModel";

const boardSource = readFileSync(
  new URL("../src/components/TacticBoard.tsx", import.meta.url),
  "utf8",
);

const modelFunctions = boardModel as unknown as Record<
  string,
  (...args: any[]) => any
>;

function requireModelFunction(name: string) {
  const candidate = modelFunctions[name];
  assert.equal(typeof candidate, "function", `${name} should be exported`);
  return candidate;
}

function expectSource(pattern: RegExp, message: string) {
  assert.ok(pattern.test(boardSource), message);
}

test("six straight and curved solid/dashed arrow combinations are distinct", () => {
  const resolveStyle = requireModelFunction("resolveTacticLineStyle");
  const required = [
    { geometry: "straight", stroke: "solid", arrowhead: "none" },
    { geometry: "straight", stroke: "solid", arrowhead: "end" },
    { geometry: "straight", stroke: "dashed", arrowhead: "none" },
    { geometry: "straight", stroke: "dashed", arrowhead: "end" },
    { geometry: "curved", stroke: "solid", arrowhead: "none" },
    { geometry: "curved", stroke: "solid", arrowhead: "end" },
  ];

  for (const style of required) {
    assert.deepEqual(
      resolveStyle(style),
      { ...style, curveDirection: "left" },
    );
  }
});

test("legacy pass, dashed, and curve lines keep their old arrowheads", () => {
  const resolveStyle = requireModelFunction("resolveTacticLineStyle");

  assert.deepEqual(resolveStyle({ tool: "pass" }), {
    geometry: "straight",
    stroke: "solid",
    arrowhead: "end",
    curveDirection: "left",
  });
  assert.deepEqual(resolveStyle({ tool: "dashed" }), {
    geometry: "straight",
    stroke: "dashed",
    arrowhead: "end",
    curveDirection: "left",
  });
  assert.deepEqual(resolveStyle({ tool: "curve" }), {
    geometry: "curved",
    stroke: "solid",
    arrowhead: "end",
    curveDirection: "left",
  });
});

test("curves bend to either side for all endpoint directions", () => {
  const makeCurvePoints = requireModelFunction("makeCurvePoints");
  const directions = [
    [0, 0, 100, 0],
    [100, 0, 0, 0],
    [0, 0, 0, 100],
    [0, 100, 0, 0],
  ];

  for (const [x1, y1, x2, y2] of directions) {
    for (const side of ["left", "right"] as const) {
      const points = makeCurvePoints(x1, y1, x2, y2, side);
      assert.deepEqual(points.slice(0, 2), [x1, y1]);
      assert.deepEqual(points.slice(4, 6), [x2, y2]);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const cross =
        dx * (points[3] - (y1 + y2) / 2) -
        dy * (points[2] - (x1 + x2) / 2);
      assert.equal(Math.sign(cross), side === "left" ? 1 : -1);
    }
  }
});

test("line dragging changes its viewport offset without rewriting drawing points", () => {
  const moveLine = requireModelFunction("moveTacticLine");
  const line = { points: [10, 20, 40, 60], tool: "curve" };
  const moved = moveLine(line, 30, 45);

  assert.deepEqual(moved.points, line.points);
  assert.equal(moved.x, 30);
  assert.equal(moved.y, 45);
});

test("Mini Goal and Hurdle rotate through four persisted orientations", () => {
  const rotateEquipment = requireModelFunction("rotateTacticEquipment");

  for (const type of ["mini_goal", "hurdle"]) {
    let equipment = { id: type, type, x: 10, y: 20 };
    const orientations = [];
    for (let index = 0; index < 4; index += 1) {
      equipment = rotateEquipment(equipment);
      orientations.push(equipment.orientation);
    }
    assert.deepEqual(orientations, [90, 180, 270, 0]);
  }
});

test("pitch presets use readable markings and a contrasting equipment outline", () => {
  const getContrast = requireModelFunction("getContrastColor");
  const presets = boardModel.PITCH_THEME_PRESETS;

  assert.deepEqual(Object.keys(presets), [
    "white",
    "grass-green",
    "dark-green",
    "light-grey",
    "dark-navy",
  ]);
  assert.equal(presets.white.markings, "#1e293b");
  assert.equal(presets["light-grey"].markings, "#334155");
  assert.equal(presets["dark-navy"].markings, "#f8fafc");
  assert.equal(getContrast(presets.white.background), "#0f172a");
  assert.equal(getContrast(presets["dark-navy"].background), "#f8fafc");
});

test("Pan moves the Stage while Select enables line and object movement", () => {
  expectSource(/x=\{viewport\.x\}/, "Stage must render its viewport offset");
  expectSource(/y=\{viewport\.y\}/, "Stage must render its viewport offset");
  expectSource(/onPointerDown=\{handlePanPointerDown\}/, "Pan must capture the full canvas surface");
  expectSource(/onPointerMove=\{handlePanPointerMove\}/, "Pan must update only the viewport offset");
  expectSource(/onPointerUp=\{handlePanPointerEnd\}/, "Pan must release pointer capture");
  expectSource(/draggable:\s*activeTool === "select"/, "Select must enable draggable lines");
  expectSource(/onDragEnd:\s*\(e:\s*any\)\s*=>\s*handleLineDragEnd\(line\.id, e\)/, "lines must retain their own move handler");
  expectSource(/getRelativePointerPosition\(\)/, "drawing must honor a panned viewport");
});

test("players and equipment stay selectable and movable", () => {
  for (const type of ["red", "blue", "ball", "mini_goal", "hurdle", "cone"]) {
    assert.ok(boardSource.includes(`type === "${type}"`), `${type} renderer must remain`);
  }
  expectSource(/\sdraggable\s*(?:\n|\r)/, "players and equipment must remain draggable");
  expectSource(/handleDragEnd\(el\.id, e\)/, "object coordinates must be saved after dragging");
});

test("new line controls expose arrowhead and both curved bend directions", () => {
  expectSource(/aria-label="Arrowhead/, "arrowhead control must expose None and End");
  expectSource(/aria-label="Curve bend direction/, "curve control must expose either side");
  expectSource(/"Draw a solid straight line"/, "no-arrow straight line must be explicit");
  expectSource(/resolveTacticLineStyle\(line\)/, "saved legacy and normalized line styles must share one renderer");
});

test("team colors and pitch theme are editable and included in scene saves", () => {
  expectSource(/aria-label="Team A color"/, "Team A color control is required");
  expectSource(/aria-label="Team B color"/, "Team B color control is required");
  expectSource(/aria-label="Pitch theme"/, "pitch theme control is required");
  expectSource(
    /finalCanvasData\s*=\s*\{\s*elements,\s*lines,\s*fieldType,\s*teamColors,\s*pitchTheme\s*\}/,
    "scene saves must keep team colors and pitch independent",
  );
});

test("selected Mini Goal and Hurdle can be rotated in the existing object model", () => {
  expectSource(/rotateTacticEquipment/, "orientation updates must reuse equipment elements");
  expectSource(/rotation=\{normalizeOrientation\(el\.orientation\)\}/, "saved orientation must reach renderers");
  expectSource(/aria-label="Rotate selected equipment/, "selected equipment must expose rotation");
  expectSource(/stroke="#0f172a"/, "Mini Goal must have a strong outline on light pitches");
  expectSource(/shadowColor=\{getContrastColor\(pitchColors\.background\)\}/, "equipment contrast must adapt to the pitch");
});

test("equipment rotation is reversible through the existing Undo control", () => {
  expectSource(/undoStackRef\.current\.push\(\{\s*type: "orientation"/, "rotation must save its previous orientation");
  expectSource(/action\??\.type === "orientation"/, "Undo must restore a rotation before older edits");
});
