import {
  AlertTriangle,
  BadgeCheck,
  Link2,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import type {
  SuperAdminTab,
} from "./dashboardModel";

import type {
  SuperAdminReviewQueueId,
  SuperAdminReviewQueueItem,
} from "./reviewQueueModel";

interface SuperAdminReviewQueueProps {
  reviewQueue:
    readonly SuperAdminReviewQueueItem[];
  onNavigate:
    (tab: SuperAdminTab) => void;
  availableTabs?:
    readonly SuperAdminTab[];
}

interface ReviewQueuePresentation {
  displayCount: string;
  subtitle: string;
}

const UNAVAILABLE_COUNT = "\u2014";

const REVIEW_QUEUE_VISUALS:
  Record<
    SuperAdminReviewQueueId,
    {
      icon: typeof AlertTriangle;
      tone: string;
    }
  > = {
    "user-approvals": {
      icon: UserRoundCheck,
      tone: "bg-emerald-50 text-emerald-700",
    },
    "profile-claims": {
      icon: BadgeCheck,
      tone: "bg-indigo-50 text-indigo-700",
    },
    "membership-review": {
      icon: UsersRound,
      tone: "bg-blue-50 text-blue-700",
    },
    "parent-link-review": {
      icon: Link2,
      tone: "bg-violet-50 text-violet-700",
    },
    "integrity-review": {
      icon: ShieldCheck,
      tone: "bg-amber-50 text-amber-700",
    },
  };

function reviewQueuePresentation(
  item: SuperAdminReviewQueueItem,
): ReviewQueuePresentation {
  switch (item.state) {
    case "LOADING":
      return {
        displayCount: "...",
        subtitle: "Loading review state",
      };

    case "PENDING": {
      const validCount =
        typeof item.count === "number" &&
        Number.isFinite(item.count) &&
        Number.isInteger(item.count) &&
        item.count > 0;

      return {
        displayCount:
          validCount
            ? String(item.count)
            : UNAVAILABLE_COUNT,
        subtitle:
          validCount
            ? "Requires review"
            : "Review state unavailable",
      };
    }

    case "CLEAR":
      return {
        displayCount:
          item.count === 0
            ? "0"
            : UNAVAILABLE_COUNT,
        subtitle:
          item.count === 0
            ? "No pending items"
            : "Review state unavailable",
      };

    case "UNAVAILABLE":
      return {
        displayCount: UNAVAILABLE_COUNT,
        subtitle: "Review state unavailable",
      };

    case "NOT_CONNECTED":
      return {
        displayCount: UNAVAILABLE_COUNT,
        subtitle:
          "Dashboard source not connected",
      };
  }
}

export default function SuperAdminReviewQueue({
  reviewQueue,
  onNavigate,
  availableTabs,
}: SuperAdminReviewQueueProps) {
  const isModuleAvailable =
    (tab: SuperAdminTab) =>
      !availableTabs ||
      availableTabs.includes(tab);

  return (
    <section
      aria-labelledby="review-queue-title"
    >
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className="text-amber-500"
            size={18}
          />

          <h2
            id="review-queue-title"
            className="text-base font-black text-slate-900"
          >
            Review Queue
          </h2>
        </div>

        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Confirmed review work is counted only
          from connected authoritative sources.
          Coverage gaps remain explicit.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {reviewQueue.map((item) => {
          const {
            icon: Icon,
            tone,
          } =
            REVIEW_QUEUE_VISUALS[item.id];

          const presentation =
            reviewQueuePresentation(item);

          const moduleAvailable =
            isModuleAvailable(
              item.destinationTab,
            );

          return (
            <button
              key={item.id}
              type="button"
              disabled={!moduleAvailable}
              onClick={() => {
                if (moduleAvailable) {
                  onNavigate(
                    item.destinationTab,
                  );
                }
              }}
              aria-label={
                `${item.label}: ${presentation.subtitle}`
              }
              className={`group flex min-h-[116px] items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition ${
                moduleAvailable
                  ? "hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
                  : "cursor-not-allowed opacity-60"
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
                >
                  <Icon size={19} />
                </span>

                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-800">
                    {item.label}
                  </span>

                  <span className="block text-xs leading-relaxed text-slate-500">
                    {presentation.subtitle}
                  </span>

                  <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {moduleAvailable
                      ? "Review module available"
                      : "Review module unavailable"}
                  </span>
                </span>
              </span>

              <span className="ml-3 shrink-0 text-2xl font-black text-slate-900">
                {presentation.displayCount}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
