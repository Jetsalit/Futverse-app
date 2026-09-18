import {
  PRO_CLUB_PLAYER_PHOTO_MAX_BYTES,
  PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION,
  PRO_CLUB_PLAYER_PHOTO_MIME_TYPE,
  type ProClubPlayerPhotoInput,
} from "./proClubPlayerPhoto";

function dataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Selected image could not be decoded."));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressProClubPlayerPhoto(
  file: File,
): Promise<ProClubPlayerPhotoInput> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("Selected image has invalid dimensions.");
  }

  const scale = Math.min(
    1,
    PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION / sourceWidth,
    PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION / sourceHeight,
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Browser image processing is unavailable.");
  }

  context.drawImage(image, 0, 0, width, height);

  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42, 0.32]) {
    const dataUrl = canvas.toDataURL(PRO_CLUB_PLAYER_PHOTO_MIME_TYPE, quality);
    if (!dataUrl.startsWith("data:image/webp;base64,")) {
      throw new Error("This browser cannot encode WebP player photos.");
    }

    const byteSize = dataUrlByteSize(dataUrl);
    if (byteSize <= PRO_CLUB_PLAYER_PHOTO_MAX_BYTES) {
      return {
        dataUrl,
        mimeType: PRO_CLUB_PLAYER_PHOTO_MIME_TYPE,
        width,
        height,
        byteSize,
      };
    }
  }

  throw new Error("Player photo is still too large after compression. Choose a smaller image.");
}
