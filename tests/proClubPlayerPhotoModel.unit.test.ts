import test from "node:test";
import assert from "node:assert/strict";

import {
  PRO_CLUB_PLAYER_PHOTO_MAX_BYTES,
  PRO_CLUB_PLAYER_PHOTO_MAX_DATA_URL_CHARS,
  PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION,
  validateProClubPlayerPhotoInput,
} from "../src/lib/proClubPlayerPhoto";

function validPhoto() {
  return {
    dataUrl: "data:image/webp;base64,AAAA",
    mimeType: "image/webp",
    width: 256,
    height: 192,
    byteSize: 4,
  } as const;
}

test("accepts compact WebP player photo within V1 bounds", () => {
  const result = validateProClubPlayerPhotoInput(validPhoto());
  assert.equal(result.ok, true);
});

test("rejects non-WebP, oversize dimensions, byte size and data URL length", () => {
  assert.equal(
    validateProClubPlayerPhotoInput({
      ...validPhoto(),
      mimeType: "image/jpeg",
    }).ok,
    false,
  );

  assert.equal(
    validateProClubPlayerPhotoInput({
      ...validPhoto(),
      width: PRO_CLUB_PLAYER_PHOTO_MAX_DIMENSION + 1,
    }).ok,
    false,
  );

  assert.equal(
    validateProClubPlayerPhotoInput({
      ...validPhoto(),
      byteSize: PRO_CLUB_PLAYER_PHOTO_MAX_BYTES + 1,
    }).ok,
    false,
  );

  assert.equal(
    validateProClubPlayerPhotoInput({
      ...validPhoto(),
      dataUrl: "data:image/webp;base64," + "A".repeat(PRO_CLUB_PLAYER_PHOTO_MAX_DATA_URL_CHARS),
    }).ok,
    false,
  );
});
