import {
  PRO_CLUB_PLAYER_PHOTO_MAX_BYTES,
  PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION,
  PRO_CLUB_PLAYER_PHOTO_MAX_DATA_URL_CHARS,
  PRO_CLUB_PLAYER_PHOTO_MIME_TYPE,
  validateProClubPlayerPhotoInput,
  type ProClubPlayerPhotoInput,
} from "./proClubPlayerPhoto";

export const PRO_CLUB_ANALYSIS_LOGO_MAX_BYTES =
  PRO_CLUB_PLAYER_PHOTO_MAX_BYTES;
export const PRO_CLUB_ANALYSIS_LOGO_MAX_DIMENSION =
  PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION;
export const PRO_CLUB_ANALYSIS_LOGO_SOURCE_MAX_BYTES = 8 * 1024 * 1024;

export type ProClubAnalysisLogoInput = ProClubPlayerPhotoInput;

export function validateProClubAnalysisLogoInput(
  value: unknown,
): { ok: true; value: ProClubAnalysisLogoInput } | { ok: false; errors: string[] } {
  const result = validateProClubPlayerPhotoInput(value);
  return result.ok === true
    ? { ok: true, value: result.value }
    : { ok: false, errors: result.errors.map((error) => error.replace("Player photo", "Team logo")) };
}

export function resolveProClubAnalysisTeamLogo(
  profileLogoUrl: string | null | undefined,
  uploadedLogoUrl: string | null | undefined,
): string | null {
  if (isLogoSource(uploadedLogoUrl)) return uploadedLogoUrl;
  if (isLogoSource(profileLogoUrl)) return profileLogoUrl;
  return null;
}

function isLogoSource(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 90_000) {
    return false;
  }
  if (value.startsWith("data:image/webp;base64,")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function dataUrlByteSize(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("The selected logo has no image dimensions.");
    }
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressProClubAnalysisLogo(
  file: File,
): Promise<ProClubAnalysisLogoInput> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP team logo.");
  }
  if (file.size < 1 || file.size > PRO_CLUB_ANALYSIS_LOGO_SOURCE_MAX_BYTES) {
    throw new Error("The selected team logo must be smaller than 8 MB.");
  }

  const image = await loadImage(file);
  const scale = Math.min(
    1,
    PRO_CLUB_ANALYSIS_LOGO_MAX_DIMENSION / image.naturalWidth,
    PRO_CLUB_ANALYSIS_LOGO_MAX_DIMENSION / image.naturalHeight,
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not prepare this team logo.");
  context.drawImage(image, 0, 0, width, height);

  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const dataUrl = canvas.toDataURL(PRO_CLUB_PLAYER_PHOTO_MIME_TYPE, quality);
    if (!dataUrl.startsWith("data:image/webp;base64,")) {
      throw new Error("This browser could not convert the team logo to WebP.");
    }
    const result = validateProClubAnalysisLogoInput({
      dataUrl,
      mimeType: PRO_CLUB_PLAYER_PHOTO_MIME_TYPE,
      width,
      height,
      byteSize: dataUrlByteSize(dataUrl),
    });
    if (result.ok) return result.value;
    if (dataUrl.length > PRO_CLUB_PLAYER_PHOTO_MAX_DATA_URL_CHARS) continue;
  }

  throw new Error("The compressed team logo must fit within 60 KB.");
}
