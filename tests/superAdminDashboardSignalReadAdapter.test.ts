import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  loadPendingProfileClaimCount,
  type SuperAdminDashboardSignalReadOps,
} from "../src/lib/firestore/superAdminDashboardSignalReadAdapter.js";

function makeOps(
  implementation: () => Promise<number>,
): SuperAdminDashboardSignalReadOps {
  return {
    countPendingProfileClaims: implementation,
  };
}

describe("SuperAdmin Dashboard signal read adapter", () => {
  it("returns an exact non-negative pending Profile Claim count", async () => {
    const result = await loadPendingProfileClaimCount(
      makeOps(async () => 7),
    );

    assert.deepEqual(result, {
      state: "READY",
      count: 7,
    });
  });

  it("fails closed for malformed aggregate counts", async () => {
    for (const invalidCount of [-1, 1.5, Number.NaN]) {
      const result = await loadPendingProfileClaimCount(
        makeOps(async () => invalidCount),
      );

      assert.equal(result.state, "UNAVAILABLE");

      if (result.state === "UNAVAILABLE") {
        assert.match(
          result.error.message,
          /invalid pending profile claim count/i,
        );
      }
    }
  });

  it("fails closed when the authoritative aggregate read fails", async () => {
    const result = await loadPendingProfileClaimCount(
      makeOps(async () => {
        throw new Error("permission-denied");
      }),
    );

    assert.equal(result.state, "UNAVAILABLE");

    if (result.state === "UNAVAILABLE") {
      assert.match(
        result.error.message,
        /permission-denied/i,
      );
    }
  });
  it("locks the production aggregate query to pending Profile Claims", () => {
    const source = fs
      .readFileSync(
        new URL(
          "../src/lib/firestore/superAdminDashboardSignalReadAdapter.ts",
          import.meta.url,
        ),
        "utf8",
      )
      .replace(/\r\n/g, "\n");

    assert.match(
      source,
      /collection\s*\(\s*db\s*,\s*"profile_claims"\s*\)/s,
    );

    assert.match(
      source,
      /where\s*\(\s*"status"\s*,\s*"=="\s*,\s*"PENDING"\s*\)/s,
    );

    assert.match(
      source,
      /getCountFromServer\s*\(\s*pendingClaimsQuery\s*,?\s*\)/s,
    );

    assert.doesNotMatch(
      source,
      /\b(?:setDoc|updateDoc|deleteDoc|addDoc|writeBatch|runTransaction)\b/,
    );
  });
});
