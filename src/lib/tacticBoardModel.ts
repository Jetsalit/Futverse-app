export type TeamColors = {
  teamA: string;
  teamB: string;
};

export const DEFAULT_TEAM_COLORS: TeamColors = {
  teamA: "#ef4444",
  teamB: "#3b82f6",
};

export const PITCH_THEME_IDS = [
  "white",
  "grass-green",
  "dark-green",
  "light-grey",
  "dark-navy",
] as const;

export type PitchThemeId = (typeof PITCH_THEME_IDS)[number];

export const PITCH_THEME_PRESETS: Record<
  PitchThemeId,
  { label: string; background: string; markings: string }
> = {
  white: { label: "White / Current", background: "#ffffff", markings: "#1e293b" },
  "grass-green": {
    label: "Grass Green",
    background: "#438d59",
    markings: "#f8fafc",
  },
  "dark-green": {
    label: "Dark Green",
    background: "#174c38",
    markings: "#f8fafc",
  },
  "light-grey": {
    label: "Light Grey",
    background: "#e5e7eb",
    markings: "#334155",
  },
  "dark-navy": {
    label: "Dark / Navy",
    background: "#111827",
    markings: "#f8fafc",
  },
};

export function normalizeTeamColors(value: unknown): TeamColors {
  const raw =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    teamA: normalizeHexColor(raw.teamA, DEFAULT_TEAM_COLORS.teamA),
    teamB: normalizeHexColor(raw.teamB, DEFAULT_TEAM_COLORS.teamB),
  };
}

function normalizeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value)
    ? value
    : fallback;
}

export function normalizePitchTheme(value: unknown): PitchThemeId {
  return PITCH_THEME_IDS.includes(value as PitchThemeId)
    ? (value as PitchThemeId)
    : "white";
}

export interface TacticBoardRenderBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PitchBounds {
  pitchX: number;
  pitchY: number;
  pitchWidth: number;
  pitchHeight: number;
}

const PITCH_BOUNDS_EPSILON = 1e-6;

export function validatePitchBounds(
  stageWidth: unknown,
  stageHeight: unknown,
  value: unknown,
): PitchBounds | undefined {
  if (
    typeof stageWidth !== "number" ||
    !Number.isFinite(stageWidth) ||
    stageWidth <= 0 ||
    typeof stageHeight !== "number" ||
    !Number.isFinite(stageHeight) ||
    stageHeight <= 0 ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const { pitchX, pitchY, pitchWidth, pitchHeight } = raw;
  if (
    typeof pitchX !== "number" ||
    !Number.isFinite(pitchX) ||
    pitchX < 0 ||
    pitchX >= stageWidth ||
    typeof pitchY !== "number" ||
    !Number.isFinite(pitchY) ||
    pitchY < 0 ||
    pitchY >= stageHeight ||
    typeof pitchWidth !== "number" ||
    !Number.isFinite(pitchWidth) ||
    pitchWidth <= PITCH_BOUNDS_EPSILON ||
    typeof pitchHeight !== "number" ||
    !Number.isFinite(pitchHeight) ||
    pitchHeight <= PITCH_BOUNDS_EPSILON ||
    pitchX + pitchWidth > stageWidth + PITCH_BOUNDS_EPSILON ||
    pitchY + pitchHeight > stageHeight + PITCH_BOUNDS_EPSILON
  ) {
    return undefined;
  }

  return { pitchX, pitchY, pitchWidth, pitchHeight };
}

export function resolvePitchBoundsFromRenderedGeometry(
  stageWidth: number,
  stageHeight: number,
  containerBounds: TacticBoardRenderBounds | null | undefined,
  pitchMarkingsBounds: TacticBoardRenderBounds | null | undefined,
): PitchBounds | undefined {
  if (
    !containerBounds ||
    !pitchMarkingsBounds ||
    !Number.isFinite(stageWidth) ||
    !Number.isFinite(stageHeight) ||
    stageWidth <= 0 ||
    stageHeight <= 0 ||
    !Number.isFinite(containerBounds.left) ||
    !Number.isFinite(containerBounds.top) ||
    !Number.isFinite(containerBounds.width) ||
    !Number.isFinite(containerBounds.height) ||
    containerBounds.width <= 0 ||
    containerBounds.height <= 0 ||
    !Number.isFinite(pitchMarkingsBounds.left) ||
    !Number.isFinite(pitchMarkingsBounds.top) ||
    !Number.isFinite(pitchMarkingsBounds.width) ||
    !Number.isFinite(pitchMarkingsBounds.height) ||
    pitchMarkingsBounds.width <= 0 ||
    pitchMarkingsBounds.height <= 0
  ) {
    return undefined;
  }

  const scaleX = stageWidth / containerBounds.width;
  const scaleY = stageHeight / containerBounds.height;
  const leftCss = pitchMarkingsBounds.left - containerBounds.left;
  const topCss = pitchMarkingsBounds.top - containerBounds.top;
  const rightCss =
    containerBounds.left + containerBounds.width -
    pitchMarkingsBounds.left - pitchMarkingsBounds.width;
  const bottomCss =
    containerBounds.top + containerBounds.height -
    pitchMarkingsBounds.top - pitchMarkingsBounds.height;
  const pitchX = leftCss * scaleX;
  const pitchY = topCss * scaleY;
  const pitchRight = rightCss * scaleX;
  const pitchBottom = bottomCss * scaleY;

  return validatePitchBounds(stageWidth, stageHeight, {
    pitchX,
    pitchY,
    pitchWidth: stageWidth - pitchX - pitchRight,
    pitchHeight: stageHeight - pitchY - pitchBottom,
  });
}

export function getContrastColor(color: string): "#0f172a" | "#f8fafc" {
  const match = /^#([\da-f]{6})$/i.exec(color);
  if (!match) return "#0f172a";

  const hex = match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 150 ? "#0f172a" : "#f8fafc";
}

export type TacticLineGeometry =
  | "straight"
  | "curved"
  | "freehand"
  | "dribble";
export type TacticLineStroke = "solid" | "dashed";
export type TacticArrowhead = "none" | "end";
export type CurveDirection = "left" | "right";

export const HALF_PITCH_GOAL_SIDE = "bottom" as const;

export interface TacticLineStyle {
  geometry: TacticLineGeometry;
  stroke: TacticLineStroke;
  arrowhead: TacticArrowhead;
  curveDirection: CurveDirection;
}

export function resolveTacticLineStyle(value: unknown): TacticLineStyle {
  const raw =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const legacyTool = raw.tool;
  const geometry: TacticLineGeometry =
    raw.geometry === "straight" ||
    raw.geometry === "curved" ||
    raw.geometry === "freehand" ||
    raw.geometry === "dribble"
      ? raw.geometry
      : legacyTool === "curve"
        ? "curved"
        : legacyTool === "freehand"
          ? "freehand"
          : legacyTool === "dribble"
            ? "dribble"
            : "straight";
  const stroke: TacticLineStroke =
    raw.stroke === "dashed" ||
    (raw.stroke !== "solid" && legacyTool === "dashed")
      ? "dashed"
      : "solid";
  const arrowhead: TacticArrowhead =
    raw.arrowhead === "none" || raw.arrowhead === "end"
      ? raw.arrowhead
      : "end";

  return {
    geometry,
    stroke,
    arrowhead,
    curveDirection: raw.curveDirection === "right" ? "right" : "left",
  };
}

export function makeCurvePoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  direction: CurveDirection,
): number[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return [x1, y1, x1, y1, x2, y2];

  const side = direction === "left" ? 1 : -1;
  const offset = distance * 0.25 * side;
  const midpointX = x1 + dx / 2;
  const midpointY = y1 + dy / 2;
  const normalX = -dy / distance;
  const normalY = dx / distance;
  return [
    x1,
    y1,
    midpointX + normalX * offset,
    midpointY + normalY * offset,
    x2,
    y2,
  ];
}

export type EquipmentOrientation = 0 | 90 | 180 | 270;
const ORIENTATIONS: EquipmentOrientation[] = [0, 90, 180, 270];

export function normalizeOrientation(value: unknown): EquipmentOrientation {
  const numericValue = typeof value === "string" ? Number(value) : value;
  return ORIENTATIONS.includes(numericValue as EquipmentOrientation)
    ? (numericValue as EquipmentOrientation)
    : 0;
}

export function rotateOrientation(value: unknown): EquipmentOrientation {
  const index = ORIENTATIONS.indexOf(normalizeOrientation(value));
  return ORIENTATIONS[(index + 1) % ORIENTATIONS.length];
}

export function rotateTacticEquipment<
  T extends { type?: unknown; orientation?: unknown },
>(element: T): T {
  if (element.type !== "mini_goal" && element.type !== "hurdle") return element;
  return {
    ...element,
    orientation: rotateOrientation(element.orientation),
  } as T;
}

export function moveTacticLine<T extends { points?: number[] }>(
  line: T,
  x: number,
  y: number,
): T & { x: number; y: number } {
  return { ...line, x, y };
}
