import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isProClubOperationsPreviewAvailable } from "../src/config/proClubOperationsCapabilities.js";

describe("Pro Club Operations Preview capability", () => {
  it("is available only when Vite DEV mode is explicitly true", () => {
    assert.equal(isProClubOperationsPreviewAvailable({ dev: true }), true);
    assert.equal(isProClubOperationsPreviewAvailable({ dev: false }), false);
    assert.equal(isProClubOperationsPreviewAvailable({}), false);
  });

  it("fails closed for non-boolean truthy values at runtime", () => {
    assert.equal(
      isProClubOperationsPreviewAvailable({ dev: "true" as unknown as boolean }),
      false,
    );
    assert.equal(
      isProClubOperationsPreviewAvailable({ dev: 1 as unknown as boolean }),
      false,
    );
  });
});
