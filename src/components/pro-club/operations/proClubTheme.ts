export const PRO_CLUB_THEME_STORAGE_KEY = "futverse:pro-club-theme";

export type ProClubTheme = "light" | "neon";

export function resolveProClubTheme(value: string | null | undefined): ProClubTheme {
  return value?.trim().toLowerCase() === "neon" ? "neon" : "light";
}
