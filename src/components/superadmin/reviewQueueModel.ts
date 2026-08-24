import type {
  DashboardOperationalSignal,
  DashboardOperationalSignalId,
  DashboardOperationalSignalState,
  SuperAdminTab,
} from "./dashboardModel";

export type SuperAdminReviewQueueId =
  | "user-approvals"
  | "profile-claims"
  | "membership-review"
  | "parent-link-review"
  | "integrity-review";

export interface SuperAdminReviewQueueItem {
  id: SuperAdminReviewQueueId;
  label: string;
  state: DashboardOperationalSignalState;
  count: number | null;
  destinationTab: SuperAdminTab;
  sourceConnected: boolean;
  requiresReview: boolean;
}

interface ReviewQueueDefinition {
  id: SuperAdminReviewQueueId;
  label: string;
  destinationTab: SuperAdminTab;
}

const REVIEW_QUEUE_DEFINITIONS:
  readonly ReviewQueueDefinition[] = [
    {
      id: "user-approvals",
      label: "User Approvals",
      destinationTab: "approvals",
    },
    {
      id: "profile-claims",
      label: "Profile Claims",
      destinationTab: "profile_claims",
    },
    {
      id: "membership-review",
      label: "Membership Review",
      destinationTab: "relationships",
    },
    {
      id: "parent-link-review",
      label: "Parent Link Review",
      destinationTab: "relationships",
    },
    {
      id: "integrity-review",
      label: "Integrity / Legacy Review",
      destinationTab: "relationships",
    },
  ];

const CONNECTED_OPERATIONAL_SIGNAL_IDS:
  ReadonlySet<DashboardOperationalSignalId> =
    new Set([
      "user-approvals",
      "profile-claims",
    ]);

function isValidPositiveInteger(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

function normalizeConnectedSignal(
  signals: readonly DashboardOperationalSignal[],
  id: DashboardOperationalSignalId,
): {
  state: DashboardOperationalSignalState;
  count: number | null;
} {
  const matching =
    signals.filter(
      (signal) => signal.id === id,
    );

  if (matching.length !== 1) {
    return {
      state: "UNAVAILABLE",
      count: null,
    };
  }

  const signal = matching[0];

  if (signal.state === "LOADING") {
    return {
      state: "LOADING",
      count: null,
    };
  }

  if (signal.state === "UNAVAILABLE") {
    return {
      state: "UNAVAILABLE",
      count: null,
    };
  }

  if (signal.state === "PENDING") {
    if (!isValidPositiveInteger(signal.count)) {
      return {
        state: "UNAVAILABLE",
        count: null,
      };
    }

    return {
      state: "PENDING",
      count: signal.count,
    };
  }

  if (signal.state === "CLEAR") {
    if (signal.count !== 0) {
      return {
        state: "UNAVAILABLE",
        count: null,
      };
    }

    return {
      state: "CLEAR",
      count: 0,
    };
  }

  // These sources are contractually CONNECTED.
  // An upstream NOT_CONNECTED state is contradictory,
  // so fail closed rather than silently changing authority.
  return {
    state: "UNAVAILABLE",
    count: null,
  };
}

function connectedReviewItem(
  definition: ReviewQueueDefinition,
  signals: readonly DashboardOperationalSignal[],
): SuperAdminReviewQueueItem {
  const normalized =
    normalizeConnectedSignal(
      signals,
      definition.id as DashboardOperationalSignalId,
    );

  return {
    ...definition,
    state: normalized.state,
    count: normalized.count,
    sourceConnected: true,
    requiresReview:
      normalized.state === "PENDING",
  };
}

function notConnectedReviewItem(
  definition: ReviewQueueDefinition,
): SuperAdminReviewQueueItem {
  return {
    ...definition,
    state: "NOT_CONNECTED",
    count: null,
    sourceConnected: false,
    requiresReview: false,
  };
}

export function deriveSuperAdminReviewQueue(
  operationalSignals:
    readonly DashboardOperationalSignal[],
): SuperAdminReviewQueueItem[] {
  return REVIEW_QUEUE_DEFINITIONS.map(
    (definition) => {
      if (
        CONNECTED_OPERATIONAL_SIGNAL_IDS.has(
          definition.id as DashboardOperationalSignalId,
        )
      ) {
        return connectedReviewItem(
          definition,
          operationalSignals,
        );
      }

      return notConnectedReviewItem(
        definition,
      );
    },
  );
}

export function confirmedReviewWorkCount(
  items:
    readonly SuperAdminReviewQueueItem[],
): number {
  return items.reduce(
    (total, item) =>
      item.sourceConnected &&
      item.state === "PENDING" &&
      isValidPositiveInteger(item.count)
        ? total + item.count
        : total,
    0,
  );
}

export function hasIncompleteReviewCoverage(
  items:
    readonly SuperAdminReviewQueueItem[],
): boolean {
  if (
    items.length !==
    REVIEW_QUEUE_DEFINITIONS.length
  ) {
    return true;
  }

  return REVIEW_QUEUE_DEFINITIONS.some(
    (definition) => {
      const matches =
        items.filter(
          (item) =>
            item.id === definition.id,
        );

      if (matches.length !== 1) {
        return true;
      }

      const item = matches[0];

      return (
        !item.sourceConnected ||
        item.state === "LOADING" ||
        item.state === "UNAVAILABLE" ||
        item.state === "NOT_CONNECTED"
      );
    },
  );
}

export function hasCompleteClearReviewCoverage(
  items:
    readonly SuperAdminReviewQueueItem[],
): boolean {
  return (
    items.length ===
      REVIEW_QUEUE_DEFINITIONS.length &&
    REVIEW_QUEUE_DEFINITIONS.every(
      (definition) => {
        const matches =
          items.filter(
            (item) =>
              item.id === definition.id,
          );

        return (
          matches.length === 1 &&
          matches[0].sourceConnected === true &&
          matches[0].state === "CLEAR" &&
          matches[0].count === 0
        );
      },
    )
  );
}
