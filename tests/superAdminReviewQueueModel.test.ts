import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";

import type {
  DashboardOperationalSignal,
} from "../src/components/superadmin/dashboardModel.js";

import {
  confirmedReviewWorkCount,
  deriveSuperAdminReviewQueue,
  hasCompleteClearReviewCoverage,
  hasIncompleteReviewCoverage,
} from "../src/components/superadmin/reviewQueueModel.js";

function signal(
  overrides:
    Partial<DashboardOperationalSignal> &
    Pick<DashboardOperationalSignal, "id">,
): DashboardOperationalSignal {
  return {
    id: overrides.id,
    state: "CLEAR",
    count: 0,
    ...overrides,
  };
}

describe(
  "SuperAdmin Review Queue model",
  () => {
    it(
      "derives the five frozen review categories in stable order",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
              state: "PENDING",
              count: 2,
            }),
            signal({
              id: "profile-claims",
              state: "CLEAR",
              count: 0,
            }),
          ]);

        assert.deepEqual(
          queue.map((item) => item.id),
          [
            "user-approvals",
            "profile-claims",
            "membership-review",
            "parent-link-review",
            "integrity-review",
          ],
        );
      },
    );

    it(
      "consumes confirmed connected source states without recreating counts",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
              state: "PENDING",
              count: 3,
            }),
            signal({
              id: "profile-claims",
              state: "CLEAR",
              count: 0,
            }),
          ]);

        assert.deepEqual(
          queue.slice(0, 2).map(
            ({
              id,
              state,
              count,
              sourceConnected,
              requiresReview,
            }) => ({
              id,
              state,
              count,
              sourceConnected,
              requiresReview,
            }),
          ),
          [
            {
              id: "user-approvals",
              state: "PENDING",
              count: 3,
              sourceConnected: true,
              requiresReview: true,
            },
            {
              id: "profile-claims",
              state: "CLEAR",
              count: 0,
              sourceConnected: true,
              requiresReview: false,
            },
          ],
        );
      },
    );

    it(
      "keeps Membership Parent Link and Integrity review not connected",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
            }),
            signal({
              id: "profile-claims",
            }),
          ]);

        for (const item of queue.slice(2)) {
          assert.equal(
            item.state,
            "NOT_CONNECTED",
          );

          assert.equal(
            item.count,
            null,
          );

          assert.equal(
            item.sourceConnected,
            false,
          );

          assert.equal(
            item.requiresReview,
            false,
          );
        }
      },
    );

    it(
      "keeps navigation destination independent from source connection",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
            }),
            signal({
              id: "profile-claims",
            }),
          ]);

        assert.equal(
          queue.find(
            (item) =>
              item.id === "membership-review",
          )?.destinationTab,
          "relationships",
        );

        assert.equal(
          queue.find(
            (item) =>
              item.id === "parent-link-review",
          )?.destinationTab,
          "relationships",
        );

        assert.equal(
          queue.find(
            (item) =>
              item.id === "integrity-review",
          )?.destinationTab,
          "relationships",
        );
      },
    );

    it(
      "fails closed when a connected source is missing",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
            }),
          ]);

        const claims =
          queue.find(
            (item) =>
              item.id === "profile-claims",
          );

        assert.equal(
          claims?.state,
          "UNAVAILABLE",
        );

        assert.equal(
          claims?.count,
          null,
        );
      },
    );

    it(
      "fails closed when a connected source appears more than once",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
              state: "PENDING",
              count: 1,
            }),
            signal({
              id: "user-approvals",
              state: "PENDING",
              count: 2,
            }),
            signal({
              id: "profile-claims",
            }),
          ]);

        const approvals =
          queue.find(
            (item) =>
              item.id === "user-approvals",
          );

        assert.equal(
          approvals?.state,
          "UNAVAILABLE",
        );

        assert.equal(
          approvals?.count,
          null,
        );
      },
    );

    it(
      "fails closed for invalid pending and clear count semantics",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
              state: "PENDING",
              count: 0,
            }),
            signal({
              id: "profile-claims",
              state: "CLEAR",
              count: 5,
            }),
          ]);

        assert.equal(
          queue[0]?.state,
          "UNAVAILABLE",
        );

        assert.equal(
          queue[0]?.count,
          null,
        );

        assert.equal(
          queue[1]?.state,
          "UNAVAILABLE",
        );

        assert.equal(
          queue[1]?.count,
          null,
        );
      },
    );

    it(
      "fails closed if a contractually connected source arrives as not connected",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
              state: "NOT_CONNECTED",
              count: null,
            }),
            signal({
              id: "profile-claims",
            }),
          ]);

        assert.equal(
          queue[0]?.state,
          "UNAVAILABLE",
        );

        assert.equal(
          queue[0]?.count,
          null,
        );
      },
    );

    it(
      "preserves loading and unavailable without inventing zero",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
              state: "LOADING",
              count: 99,
            }),
            signal({
              id: "profile-claims",
              state: "UNAVAILABLE",
              count: 99,
            }),
          ]);

        assert.deepEqual(
          queue.slice(0, 2).map(
            (item) => ({
              state: item.state,
              count: item.count,
            }),
          ),
          [
            {
              state: "LOADING",
              count: null,
            },
            {
              state: "UNAVAILABLE",
              count: null,
            },
          ],
        );
      },
    );

    it(
      "ignores unrelated operational signals",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
              state: "CLEAR",
              count: 0,
            }),
            signal({
              id: "profile-claims",
              state: "CLEAR",
              count: 0,
            }),
            signal({
              id: "payment-approvals",
              state: "PENDING",
              count: 77,
            }),
            signal({
              id: "error-reports",
              state: "PENDING",
              count: 88,
            }),
          ]);

        assert.equal(
          confirmedReviewWorkCount(queue),
          0,
        );
      },
    );

    it(
      "sums only confirmed pending review work",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
              state: "PENDING",
              count: 2,
            }),
            signal({
              id: "profile-claims",
              state: "PENDING",
              count: 4,
            }),
          ]);

        assert.equal(
          confirmedReviewWorkCount(queue),
          6,
        );
      },
    );

    it(
      "never counts pending work from a disconnected review source",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
              state: "PENDING",
              count: 2,
            }),
            signal({
              id: "profile-claims",
              state: "CLEAR",
              count: 0,
            }),
          ]);

        const corruptedQueue =
          queue.map((item) =>
            item.id === "membership-review"
              ? {
                  ...item,
                  state: "PENDING" as const,
                  count: 99,
                  sourceConnected: false,
                }
              : item,
          );

        assert.equal(
          confirmedReviewWorkCount(
            corruptedQueue,
          ),
          2,
        );
      },
    );

    it(
      "never reports complete-clear coverage while frozen v1 sources are not connected",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
            }),
            signal({
              id: "profile-claims",
            }),
          ]);

        assert.equal(
          hasIncompleteReviewCoverage(queue),
          true,
        );

        assert.equal(
          hasCompleteClearReviewCoverage(queue),
          false,
        );
      },
    );

    it(
      "incomplete-coverage helper rejects missing or duplicate review categories",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
            }),
            signal({
              id: "profile-claims",
            }),
          ]);

        const fullyConnectedAndClear =
          queue.map((item) => ({
            ...item,
            sourceConnected: true,
            state: "CLEAR" as const,
            count: 0,
          }));

        assert.equal(
          hasIncompleteReviewCoverage(
            fullyConnectedAndClear,
          ),
          false,
        );

        assert.equal(
          hasIncompleteReviewCoverage(
            fullyConnectedAndClear.slice(0, 4),
          ),
          true,
        );

        assert.equal(
          hasIncompleteReviewCoverage([
            ...fullyConnectedAndClear.slice(0, 4),
            fullyConnectedAndClear[0],
          ]),
          true,
        );
      },
    );

    it(
      "complete-clear helper rejects missing or duplicate review categories",
      () => {
        const queue =
          deriveSuperAdminReviewQueue([
            signal({
              id: "user-approvals",
            }),
            signal({
              id: "profile-claims",
            }),
          ]);

        const allClearButNotFullyConnected =
          queue.map((item) => ({
            ...item,
            state: "CLEAR" as const,
            count: 0,
          }));

        assert.equal(
          hasCompleteClearReviewCoverage(
            allClearButNotFullyConnected,
          ),
          false,
        );

        const fullyConnectedAndClear =
          allClearButNotFullyConnected.map(
            (item) => ({
              ...item,
              sourceConnected: true,
            }),
          );

        assert.equal(
          hasCompleteClearReviewCoverage(
            fullyConnectedAndClear,
          ),
          true,
        );

        assert.equal(
          hasCompleteClearReviewCoverage(
            fullyConnectedAndClear.slice(0, 4),
          ),
          false,
        );

        assert.equal(
          hasCompleteClearReviewCoverage([
            ...fullyConnectedAndClear,
            fullyConnectedAndClear[0],
          ]),
          false,
        );
      },
    );
  },
);
