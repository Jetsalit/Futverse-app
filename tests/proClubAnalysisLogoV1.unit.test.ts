import assert from "node:assert/strict";
import test from "node:test";

import {
  PRO_CLUB_ANALYSIS_LOGO_MAX_BYTES,
  PRO_CLUB_ANALYSIS_LOGO_MAX_DIMENSION,
  resolveProClubAnalysisTeamLogo,
  validateProClubAnalysisLogoInput,
} from "../src/lib/proClubAnalysisLogo";

const VALID = {
  dataUrl: "data:image/webp;base64,AAAA",
  mimeType: "image/webp",
  width: 256,
  height: 128,
  byteSize: 3,
};

test("logo validation uses the existing bounded WebP profile-image limits", () => {
  assert.equal(validateProClubAnalysisLogoInput(VALID).ok, true);
  assert.equal(
    validateProClubAnalysisLogoInput({
      ...VALID,
      width: PRO_CLUB_ANALYSIS_LOGO_MAX_DIMENSION + 1,
    }).ok,
    false,
  );
  assert.equal(
    validateProClubAnalysisLogoInput({
      ...VALID,
      byteSize: PRO_CLUB_ANALYSIS_LOGO_MAX_BYTES + 1,
    }).ok,
    false,
  );
  assert.equal(
    validateProClubAnalysisLogoInput({
      ...VALID,
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,AAAA",
    }).ok,
    false,
  );
});

test("own-team logo prefers the saved upload and falls back to the profile logo", () => {
  const profileLogo = "https://assets.example.test/club.png";
  const uploadedLogo = "data:image/webp;base64,AAAA";
  assert.equal(resolveProClubAnalysisTeamLogo(profileLogo, uploadedLogo), uploadedLogo);
  assert.equal(resolveProClubAnalysisTeamLogo(profileLogo, null), profileLogo);
  assert.equal(resolveProClubAnalysisTeamLogo(null, null), null);
  assert.equal(resolveProClubAnalysisTeamLogo("javascript:alert(1)", null), null);
});
