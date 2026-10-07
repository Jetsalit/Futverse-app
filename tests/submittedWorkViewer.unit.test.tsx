import assert from "node:assert/strict";
import test from "node:test";
import Konva from "konva";
import { renderToStaticMarkup } from "react-dom/server";
import type { DrillSubmittedSnapshot } from "../src/lib/drillSubmittedSnapshot";
import { makeCurvePoints } from "../src/lib/tacticBoardModel";

async function renderSnapshot(snapshot: DrillSubmittedSnapshot): Promise<string> {
  try {
    const { SubmittedWorkViewer } = await import(
      "../src/components/common/SubmittedWorkViewer"
    );
    return renderToStaticMarkup(<SubmittedWorkViewer snapshot={snapshot} />);
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ERR_MODULE_NOT_FOUND"
    ) {
      return "<div data-viewer-not-implemented=\"true\"></div>";
    }
    throw error;
  }
}

const boardCanvas = {
  fieldType: "half",
  pitchTheme: "dark-navy",
  teamColors: { teamA: "#da1122", teamB: "#1188ee" },
  elements: [
    { id: "red-a", type: "red", x: 100, y: 100 },
    { id: "blue-b", type: "blue", x: 170, y: 120 },
    { id: "ball-c", type: "ball", x: 210, y: 155 },
    { id: "cone-d", type: "cone", x: 260, y: 180 },
    { id: "goal-e", type: "mini_goal", x: 320, y: 190, orientation: 90 },
    { id: "hurdle-f", type: "hurdle", x: 380, y: 210, orientation: 180 },
    { id: "ladder-g", type: "ladder", x: 440, y: 240 },
  ],
  lines: [
    {
      id: "route-a",
      points: [70, 80, 190, 210],
      color: "#fa00aa",
      geometry: "straight",
      stroke: "dashed",
      arrowhead: "end",
    },
  ],
} as const;

async function renderLines(lines: readonly unknown[], fieldType = "half") {
  return renderSnapshot({
    details: { title: "Keeper transition", category: "Goalkeeping" },
    visualType: "TACTIC_BOARD",
    canvasData: { ...boardCanvas, fieldType, lines },
  });
}

function lineMarkup(html: string, id: string): string {
  const opening = [...html.matchAll(/<g\b[^>]*data-line-id="([^"]+)"[^>]*>/g)]
    .find((match) => match[1] === id);
  assert.ok(opening, `Expected rendered line ${id}.`);
  const childrenStart = opening.index! + opening[0].length;
  const closing = html.indexOf("</g>", childrenStart);
  assert.notEqual(closing, -1, `Expected closing group for line ${id}.`);
  return `${opening[0]}${html.slice(childrenStart, closing)}`;
}

function attribute(tag: string, name: string): string {
  const value = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
  assert.notEqual(value, undefined, `Expected ${name} in ${tag}.`);
  return value!;
}

function editorLinePath(points: readonly number[], tension: number): string {
  let path = `M ${points[0]} ${points[1]}`;
  if (tension !== 0 && points.length > 4) {
    const tensionPoints = new Konva.Line({
      points: [...points],
      tension,
    }).getTensionPoints() as number[];
    path += ` Q ${tensionPoints[0]} ${tensionPoints[1]} ${tensionPoints[2]} ${tensionPoints[3]}`;
    for (let index = 4; index < tensionPoints.length - 2;) {
      path += ` C ${tensionPoints[index++]} ${tensionPoints[index++]} ${tensionPoints[index++]} ${tensionPoints[index++]} ${tensionPoints[index++]} ${tensionPoints[index++]}`;
    }
    path += ` Q ${tensionPoints.at(-2)} ${tensionPoints.at(-1)} ${points.at(-2)} ${points.at(-1)}`;
    return path;
  }

  for (let index = 2; index < points.length; index += 2) {
    path += ` L ${points[index]} ${points[index + 1]}`;
  }
  return path;
}

function editorArrowPoints(points: readonly number[], tension: number): string {
  const lastX = points.at(-2)!;
  const lastY = points.at(-1)!;
  let dx: number;
  let dy: number;
  if (tension !== 0 && points.length > 4) {
    const tensionPoints = new Konva.Line({
      points: [...points],
      tension,
    }).getTensionPoints() as number[];
    const lastIndex = tensionPoints.length;
    const curve = [
      tensionPoints[lastIndex - 4],
      tensionPoints[lastIndex - 3],
      tensionPoints[lastIndex - 2],
      tensionPoints[lastIndex - 1],
      lastX,
      lastY,
    ];
    const length = Konva.Path.calcLength(
      tensionPoints[lastIndex - 4],
      tensionPoints[lastIndex - 3],
      "C",
      curve,
    );
    const previous = Konva.Path.getPointOnQuadraticBezier(
      Math.min(1, 1 - 10 / length),
      curve[0], curve[1], curve[2], curve[3], curve[4], curve[5],
    );
    dx = lastX - previous.x;
    dy = lastY - previous.y;
  } else {
    dx = lastX - points.at(-4)!;
    dy = lastY - points.at(-3)!;
  }

  const radians = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const length = 10;
  const width = 10;
  const firstBase = {
    x: lastX - length * cosine - (width / 2) * sine,
    y: lastY - length * sine + (width / 2) * cosine,
  };
  const secondBase = {
    x: lastX - length * cosine + (width / 2) * sine,
    y: lastY - length * sine - (width / 2) * cosine,
  };
  return `${lastX},${lastY} ${firstBase.x},${firstBase.y} ${secondBase.x},${secondBase.y}`;
}

test("rendersExactSubmittedImageDataUrl", async () => {
  const html = await renderSnapshot({
    details: { title: "Keeper save", category: "Goalkeeping" },
    visualType: "UPLOADED_IMAGE",
    previewImage: "data:image/png;base64,EXACT_SUBMITTED_IMAGE",
  });

  assert.match(html, /src="data:image\/png;base64,EXACT_SUBMITTED_IMAGE"/);
  assert.match(html, /alt="Submitted drill photo"/);
});

test("rendersSubmittedBoardElementsAndLinesReadOnly", async () => {
  const html = await renderSnapshot({
    details: { title: "Keeper transition", category: "Goalkeeping" },
    visualType: "TACTIC_BOARD",
    canvasData: boardCanvas,
  });

  assert.match(html, /aria-label="Submitted tactic board"/);
  assert.match(html, /data-field-type="half"/);
  assert.match(html, /data-pitch-theme="dark-navy"/);
  assert.match(html, /data-element-id="red-a"[^>]*fill="#da1122"/);
  assert.match(html, /data-element-id="blue-b"[^>]*fill="#1188ee"/);
  assert.match(html, /data-element-id="ball-c"/);
  assert.match(html, /data-element-id="cone-d"/);
  assert.match(html, /data-element-id="goal-e"/);
  assert.match(html, /data-element-id="hurdle-f"/);
  assert.match(html, /data-element-id="ladder-g"/);
  assert.match(html, /data-line-id="route-a"/);
  assert.match(html, /data-line-points="70,80 190,210"/);
  assert.match(html, /stroke="#fa00aa"/);
  assert.match(html, /stroke-dasharray="10 8"/);
});

test("halfPitchViewerMatchesEditorGoalDirection", async () => {
  const html = await renderLines([], "half");
  assert.match(html, /data-goal-side="bottom"/);

  const tags = [...html.matchAll(/<(?:path|line|circle)\b[^>]*>/g)].map((match) => match[0]);
  const centerLine = tags.find((tag) => tag.includes('data-pitch-feature="center-line"'));
  const centerMark = tags.find((tag) => tag.includes('data-pitch-feature="center-mark"'));
  const penaltyArea = tags.find((tag) => tag.includes('data-pitch-feature="penalty-area"'));
  assert.ok(centerLine, "Expected editor-matching half-field center line.");
  assert.ok(centerMark, "Expected editor-matching half-field center mark.");
  assert.ok(penaltyArea, "Expected editor-matching goal-end penalty area.");
  assert.equal(attribute(centerLine, "y1"), "24");
  assert.equal(attribute(centerMark, "cy"), "24");
  assert.match(attribute(penaltyArea, "d"), /^M [\d.]+ 591 v -/);
});

test("arrowheadUsesPersistedOffsetExactlyOnce", async () => {
  const html = await renderLines([{
    id: "straight-arrow",
    points: [0, 0, 100, 0],
    x: 20,
    y: 30,
    color: "#123456",
    geometry: "straight",
    arrowhead: "end",
  }]);
  const line = lineMarkup(html, "straight-arrow");
  assert.equal(attribute(line, "transform"), "translate(20 30)");
  assert.equal(attribute(line.match(/<polygon\b[^>]*>/)?.[0] ?? "", "points").split(" ")[0], "100,0");
});

test("arrowheadRemainsAttachedToLineEnd", async () => {
  const html = await renderLines([{
    id: "dashed-arrow",
    points: [15, 25, 100, 75],
    x: 20,
    y: 30,
    color: "#123456",
    geometry: "straight",
    stroke: "dashed",
    arrowhead: "end",
  }]);
  const line = lineMarkup(html, "dashed-arrow");
  const polygon = line.match(/<polygon\b[^>]*>/)?.[0] ?? "";
  const localTip = attribute(polygon, "points").split(" ")[0].split(",").map(Number);
  const [, offsetX, offsetY] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(attribute(line, "transform")) ?? [];
  assert.ok(offsetX && offsetY);
  assert.deepEqual([localTip[0] + Number(offsetX), localTip[1] + Number(offsetY)], [120, 105]);
  assert.match(line, /stroke-dasharray="10 8"/);
});

test("rendersCurvedLineUsingEditorCurveSemantics", async () => {
  const points = makeCurvePoints(10, 20, 120, 45, "left");
  const line = lineMarkup(await renderLines([{
    id: "curved-line",
    points,
    curveDirection: "left",
    color: "#123456",
    geometry: "curved",
    arrowhead: "none",
  }]), "curved-line");
  const path = line.match(/<path\b[^>]*data-line-path="true"[^>]*>/)?.[0] ?? "";
  assert.notEqual(path, "", "Expected a smooth SVG path instead of a polyline.");
  assert.equal(attribute(path, "d"), editorLinePath(points, 0.5));
  assert.doesNotMatch(line, /<polyline\b/);
});

test("rendersCurvedArrowUsingEditorCurveSemantics", async () => {
  const points = makeCurvePoints(10, 20, 120, 45, "right");
  const line = lineMarkup(await renderLines([{
    id: "curved-arrow",
    points,
    curveDirection: "right",
    color: "#123456",
    geometry: "curved",
    arrowhead: "end",
  }]), "curved-arrow");
  const path = line.match(/<path\b[^>]*data-line-path="true"[^>]*>/)?.[0] ?? "";
  const polygon = line.match(/<polygon\b[^>]*>/)?.[0] ?? "";
  assert.equal(attribute(path, "d"), editorLinePath(points, 0.5));
  assert.equal(attribute(polygon, "points"), editorArrowPoints(points, 0.5));
});

test("preservesCurveDirectionAndControlData", async () => {
  const leftPoints = makeCurvePoints(10, 20, 120, 45, "left");
  const rightPoints = makeCurvePoints(10, 20, 120, 45, "right");
  const left = lineMarkup(await renderLines([{
    id: "left-curve",
    points: leftPoints,
    curveDirection: "left",
    color: "#123456",
    geometry: "curved",
    arrowhead: "none",
  }]), "left-curve");
  const right = lineMarkup(await renderLines([{
    id: "right-curve",
    points: rightPoints,
    curveDirection: "right",
    color: "#123456",
    geometry: "curved",
    arrowhead: "none",
  }]), "right-curve");
  const leftPath = left.match(/<path\b[^>]*data-line-path="true"[^>]*>/)?.[0] ?? "";
  const rightPath = right.match(/<path\b[^>]*data-line-path="true"[^>]*>/)?.[0] ?? "";
  assert.equal(attribute(leftPath, "d"), editorLinePath(leftPoints, 0.5));
  assert.equal(attribute(rightPath, "d"), editorLinePath(rightPoints, 0.5));
  assert.notEqual(attribute(leftPath, "d"), attribute(rightPath, "d"));
  assert.ok(attribute(leftPath, "d").endsWith("120 45"));
  assert.ok(attribute(rightPath, "d").endsWith("120 45"));
});

test("rendersFreehandUsingEditorTensionSemantics", async () => {
  const points = [10, 20, 35, 70, 80, 25, 120, 90];
  const line = lineMarkup(await renderLines([{
    id: "freehand-line",
    points,
    color: "#123456",
    geometry: "freehand",
    arrowhead: "none",
  }]), "freehand-line");
  const path = line.match(/<path\b[^>]*data-line-path="true"[^>]*>/)?.[0] ?? "";
  assert.notEqual(path, "", "Expected a smooth SVG path for editor freehand geometry.");
  assert.equal(attribute(path, "d"), editorLinePath(points, 0.5));
});

test("rendersBothSubmittedVisuals", async () => {
  const html = await renderSnapshot({
    details: { title: "Keeper transition", category: "Goalkeeping" },
    visualType: "BOTH",
    previewImage: "data:image/webp;base64,SUBMITTED_PHOTO",
    canvasData: boardCanvas,
  });

  assert.match(html, /src="data:image\/webp;base64,SUBMITTED_PHOTO"/);
  assert.match(html, /aria-label="Submitted tactic board"/);
  assert.match(html, /Photo and tactic board/);
});

test("rendersOnlySubmittedDetails", async () => {
  const html = await renderSnapshot({
    details: {
      title: "  Recovery drill  ",
      category: "Goalkeeping",
      duration: "45 minutes",
      ageGroup: "U17",
      phase: "Second phase",
      trainingMethod: "Circuit",
      coachingPoints: "Set feet before contact.",
      description: "Submitted description",
      date: "2026-10-06",
    },
    visualType: "UPLOADED_IMAGE",
    previewImage: "data:image/png;base64,IMAGE",
  });

  for (const detail of [
    "  Recovery drill  ",
    "Goalkeeping",
    "45 minutes",
    "U17",
    "Second phase",
    "Circuit",
    "Set feet before contact.",
    "Submitted description",
    "2026-10-06",
  ]) {
    assert.ok(html.includes(detail), `Expected submitted detail ${JSON.stringify(detail)}.`);
  }

  const withoutOptionalDetails = await renderSnapshot({
    details: { title: "Only required fields", category: "Goalkeeping" },
    visualType: "UPLOADED_IMAGE",
    previewImage: "data:image/png;base64,IMAGE",
  });
  assert.doesNotMatch(withoutOptionalDetails, /Duration|Age group|Training method|Coaching points|Description|Date/);
});

test("doesNotReadSourceOrExposeEditingControls", async () => {
  const html = await renderSnapshot({
    details: { title: "Immutable evidence", category: "Goalkeeping" },
    visualType: "TACTIC_BOARD",
    canvasData: boardCanvas,
  });

  assert.doesNotMatch(html, /<button\b|<input\b|<textarea\b|\bdraggable=/i);
  assert.doesNotMatch(html, /Save|Delete|Edit drill|sourceDrillId/i);
  assert.doesNotMatch(html, /data-viewer-not-implemented/);
});
