import assert from "node:assert/strict";
import test from "node:test";

type Bounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PitchBounds = {
  pitchX: number;
  pitchY: number;
  pitchWidth: number;
  pitchHeight: number;
};

const tacticBoardModel = await import("../src/lib/tacticBoardModel") as {
  resolvePitchBoundsFromRenderedGeometry?: (
    stageWidth: number,
    stageHeight: number,
    containerBounds: Bounds,
    pitchMarkingsBounds: Bounds,
  ) => PitchBounds | undefined;
};

function measurePitchBounds(
  inset: number,
  containerHeight = 462,
): PitchBounds | undefined {
  assert.equal(
    typeof tacticBoardModel.resolvePitchBoundsFromRenderedGeometry,
    "function",
    "pitch bounds must be captured from actual rendered geometry",
  );

  const containerBounds = {
    left: 100,
    top: 200,
    width: 600,
    height: containerHeight,
  };
  const pitchMarkingsBounds = {
    left: containerBounds.left + inset,
    top: containerBounds.top + inset,
    width: containerBounds.width - inset * 2,
    height: containerBounds.height - inset * 2,
  };

  return tacticBoardModel.resolvePitchBoundsFromRenderedGeometry!(
    600,
    462,
    containerBounds,
    pitchMarkingsBounds,
  );
}

test("fractionalDomHeightConvertsPitchBoundsIntoStageCoordinates", () => {
  const domHeight = 600 / 1.3;
  const pitch = measurePitchBounds(16, domHeight);

  assert.ok(pitch);
  assert.equal(pitch.pitchX, 16);
  assert.equal(pitch.pitchWidth, 568);
  assert.ok(Math.abs(pitch.pitchY - 16 * (462 / domHeight)) < 1e-9);
  assert.ok(Math.abs(pitch.pitchHeight - (462 - 2 * pitch.pitchY)) < 1e-9);
  assert.notEqual(pitch.pitchY, 16);
});

test("desktopHalfPitchPreserves24pxPitchBounds", () => {
  const pitch = measurePitchBounds(24);

  assert.deepEqual(pitch, {
    pitchX: 24,
    pitchY: 24,
    pitchWidth: 552,
    pitchHeight: 414,
  });
});

test("sameWidthCanRepresentDifferentPitchGeometry", () => {
  const mobilePitch = measurePitchBounds(16);
  const desktopPitch = measurePitchBounds(24);

  assert.equal(mobilePitch?.pitchWidth, 568);
  assert.equal(desktopPitch?.pitchWidth, 552);
  assert.notDeepEqual(mobilePitch, desktopPitch);
});

test("invalidRenderedPitchGeometryDoesNotInventPitchBounds", () => {
  assert.equal(
    typeof tacticBoardModel.resolvePitchBoundsFromRenderedGeometry,
    "function",
    "pitch bounds capture must use rendered authoring geometry",
  );
  assert.equal(
    tacticBoardModel.resolvePitchBoundsFromRenderedGeometry?.(
      600,
      462,
      { left: 100, top: 200, width: 0, height: 462 },
      { left: 116, top: 216, width: 568, height: 430 },
    ),
    undefined,
  );
});
