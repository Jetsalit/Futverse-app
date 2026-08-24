import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  describe,
  it,
} from "node:test";

const repoRoot =
  process.cwd();

function read(
  relativePath: string,
): string {
  const filePath =
    path.join(
      repoRoot,
      relativePath,
    );

  assert.equal(
    fs.existsSync(filePath),
    true,
    `${relativePath} must exist`,
  );

  return fs
    .readFileSync(
      filePath,
      "utf8",
    )
    .replace(/\r\n/g, "\n");
}

describe(
  "SuperAdmin Review Queue UI wiring",
  () => {
    it(
      "derives Review Queue exactly once from existing operational signals",
      () => {
        const source =
          read(
            "src/components/SuperadminPortal.tsx",
          );

        assert.equal(
          (
            source.match(
              /deriveSuperAdminReviewQueue\(\s*operationalSignals,\s*\)/g,
            ) || []
          ).length,
          1,
        );

        assert.match(
          source,
          /reviewQueue=\{reviewQueue\}/,
        );
      },
    );

    it(
      "adds Review Queue without removing Operational Signals",
      () => {
        const source =
          read(
            "src/components/superadmin/SuperAdminOverview.tsx",
          );

        assert.match(
          source,
          /<SuperAdminReviewQueue/,
        );

        assert.match(
          source,
          /<PendingActions/,
        );
      },
    );

    it(
      "Review Queue consumes the pure model only",
      () => {
        const source =
          read(
            "src/components/superadmin/SuperAdminReviewQueue.tsx",
          );

        assert.match(
          source,
          /SuperAdminReviewQueueItem/,
        );

        assert.doesNotMatch(
          source,
          /firebase\//,
        );

        assert.doesNotMatch(
          source,
          /getDocs\(/,
        );

        assert.doesNotMatch(
          source,
          /getCountFromServer\(/,
        );
      },
    );

    it(
      "renders all five source states explicitly",
      () => {
        const source =
          read(
            "src/components/superadmin/SuperAdminReviewQueue.tsx",
          );

        for (
          const state of [
            "LOADING",
            "PENDING",
            "CLEAR",
            "UNAVAILABLE",
            "NOT_CONNECTED",
          ]
        ) {
          assert.match(
            source,
            new RegExp(state),
          );
        }
      },
    );

    it(
      "keeps source availability separate from module navigation",
      () => {
        const source =
          read(
            "src/components/superadmin/SuperAdminReviewQueue.tsx",
          );

        assert.match(
          source,
          /Dashboard source not connected/,
        );

        assert.match(
          source,
          /item\.destinationTab/,
        );

        assert.match(
          source,
          /onNavigate/,
        );

        assert.doesNotMatch(
          source,
          /item\.requiresReview\s*&&\s*moduleAvailable/,
        );
      },
    );

    it(
      "does not promote operational-only sources into Review Queue",
      () => {
        const source =
          read(
            "src/components/superadmin/SuperAdminReviewQueue.tsx",
          );

        assert.doesNotMatch(
          source,
          /payment-approvals/,
        );

        assert.doesNotMatch(
          source,
          /error-reports/,
        );
      },
    );
  },
);
