import {
  DEFAULT_TEAM_COLORS,
  normalizePitchTheme,
  normalizeTeamColors,
  type PitchThemeId,
  type TeamColors,
} from "./tacticBoardModel";

export type DrillFieldType = "full" | "half" | "small";

export interface DrillCanvasData {
  elements: unknown[];
  lines: unknown[];
  fieldType: DrillFieldType;
  teamColors?: TeamColors;
  pitchTheme?: PitchThemeId;
}

export interface Drill {
  id: string;
  title: string;
  category: string;
  canvas_data: DrillCanvasData | null;
  created_by: string;
  is_shared: boolean;
  duration?: string;
  description?: string;
  previewImage?: string;
  ageGroup?: string;
  phase?: string;
  trainingMethod?: string;
  coachingPoints?: string;
  date?: string;
  recorded_by?: string;
  entry_mode?: "SELF" | "ASSISTED";
  last_updated_by?: string;
}

export function normalizeDrillFieldType(value: unknown): DrillFieldType {
  return value === "full" || value === "half" || value === "small"
    ? value
    : "full";
}

export function normalizeDrillCanvasData(
  value: unknown,
): DrillCanvasData | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;

  return {
    elements: Array.isArray(raw.elements) ? raw.elements : [],
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    fieldType: normalizeDrillFieldType(raw.fieldType),
    teamColors: normalizeTeamColors(raw.teamColors ?? DEFAULT_TEAM_COLORS),
    pitchTheme: normalizePitchTheme(raw.pitchTheme),
  };
}

export function normalizeDrillRecord(
  id: string,
  value: unknown,
): Drill {
  const raw =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const title =
    typeof raw.title === "string" && raw.title.trim().length > 0
      ? raw.title
      : "Untitled Drill";

  const category =
    typeof raw.category === "string" && raw.category.trim().length > 0
      ? raw.category
      : "Uncategorized";

  return {
    ...raw,
    id,
    title,
    category,
    canvas_data: normalizeDrillCanvasData(raw.canvas_data),
    created_by: typeof raw.created_by === "string" ? raw.created_by : "",
    is_shared: raw.is_shared === true,
  } as Drill;
}
