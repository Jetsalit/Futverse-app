export const PRO_CLUB_THEME_STORAGE_KEY = "futverse:pro-club-theme";

export type ProClubTheme = "light" | "neon";

export function resolveProClubTheme(value: string | null | undefined): ProClubTheme {
  return value?.trim().toLowerCase() === "neon" ? "neon" : "light";
}

export const PRO_CLUB_ANALYSIS_RATING_CLASSES = {
  1: "pro-club-analysis-rating pro-club-analysis-rating--1",
  2: "pro-club-analysis-rating pro-club-analysis-rating--2",
  3: "pro-club-analysis-rating pro-club-analysis-rating--3",
  4: "pro-club-analysis-rating pro-club-analysis-rating--4",
  5: "pro-club-analysis-rating pro-club-analysis-rating--5",
  neutral: "pro-club-analysis-rating pro-club-analysis-rating--neutral",
} as const;

export function getProClubAnalysisRatingClass(
  value: number | null | undefined,
): string {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return PRO_CLUB_ANALYSIS_RATING_CLASSES[value];
  }
  return PRO_CLUB_ANALYSIS_RATING_CLASSES.neutral;
}
