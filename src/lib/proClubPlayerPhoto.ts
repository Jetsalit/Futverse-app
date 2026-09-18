export const PRO_CLUB_PLAYER_PHOTO_SCHEMA_VERSION = 1 as const;
export const PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION = 256;
export const PRO_CLUB_PLAYER_PHOTO_MAX_BYTES = 60 * 1024;
export const PRO_CLUB_PLAYER_PHOTO_MAX_DATA_URL_CHARS = 90_000;
export const PRO_CLUB_PLAYER_PHOTO_MIME_TYPE = "image/webp" as const;

export interface ProClubPlayerPhotoInput {
  dataUrl: string;
  mimeType: typeof PRO_CLUB_PLAYER_PHOTO_MIME_TYPE;
  width: number;
  height: number;
  byteSize: number;
}

export function validateProClubPlayerPhotoInput(
  value: unknown,
): { ok: true; value: ProClubPlayerPhotoInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["Player photo payload is required."] };
  }

  const photo = value as Partial<ProClubPlayerPhotoInput>;
  if (photo.mimeType !== PRO_CLUB_PLAYER_PHOTO_MIME_TYPE) {
    errors.push("Player photo must be WebP.");
  }
  if (
    typeof photo.dataUrl !== "string" ||
    !photo.dataUrl.startsWith("data:image/webp;base64,") ||
    photo.dataUrl.length > PRO_CLUB_PLAYER_PHOTO_MAX_DATA_URL_CHARS
  ) {
    errors.push("Player photo Data URL is invalid or too large.");
  }
  if (
    !Number.isInteger(photo.width) ||
    !Number.isInteger(photo.height) ||
    (photo.width ?? 0) < 1 ||
    (photo.height ?? 0) < 1 ||
    (photo.width ?? 0) > PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION ||
    (photo.height ?? 0) > PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION
  ) {
    errors.push("Player photo dimensions exceed the V1 limit.");
  }
  if (
    !Number.isInteger(photo.byteSize) ||
    (photo.byteSize ?? 0) < 1 ||
    (photo.byteSize ?? 0) > PRO_CLUB_PLAYER_PHOTO_MAX_BYTES
  ) {
    errors.push("Player photo exceeds the V1 byte limit.");
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: photo as ProClubPlayerPhotoInput };
}
