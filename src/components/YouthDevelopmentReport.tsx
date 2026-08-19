import { useEffect, useState } from "react";
import {
  ArrowLeft,
  FileWarning,
  LoaderCircle,
} from "lucide-react";

import { useAcademy } from "../contexts/AcademyContext";
import {
  readAcademyPlayerEvaluations,
} from "../services/playerEvaluationReadAdapter";
import type {
  LegacyPlayerEvaluationRecord,
} from "../services/playerEvaluationCompatibility";
import { EmptyState } from "./common/EmptyState";

interface YouthDevelopmentReportProps {
  onBack: () => void;
  player?: {
    id?: string;
    firstName?: string;
    lastName?: string;
  } | null;
}

function evaluationSortKey(
  evaluation: LegacyPlayerEvaluationRecord,
): string {
  return String(
    evaluation.evaluation_date ||
      evaluation.timestamp ||
      "",
  );
}

function evaluationDateLabel(
  evaluation: LegacyPlayerEvaluationRecord,
): string {
  const value =
    evaluation.evaluation_date ||
    evaluation.timestamp;

  if (typeof value !== "string" || !value.trim()) {
    return "Date unavailable";
  }

  return value.slice(0, 10);
}

function numericScoreEntries(
  scores: unknown,
): Array<[string, number]> {
  if (
    !scores ||
    typeof scores !== "object" ||
    Array.isArray(scores)
  ) {
    return [];
  }

  return Object.entries(scores).flatMap(
    ([criteriaName, score]) =>
      typeof score === "number" &&
      Number.isFinite(score)
        ? [[criteriaName, score] as [string, number]]
        : [],
  );
}

export default function YouthDevelopmentReport({
  onBack,
  player,
}: YouthDevelopmentReportProps) {
  const {
    academyId,
    getAcademyCollection,
  } = useAcademy();

  const [evaluations, setEvaluations] = useState<
    LegacyPlayerEvaluationRecord[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] =
    useState<string | null>(null);

  const playerName = [
    player?.firstName,
    player?.lastName,
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    let cancelled = false;

    if (!player?.id) {
      setEvaluations([]);
      setReadError(null);
      setLoading(false);

      return () => {
        cancelled = true;
      };
    }

    if (!academyId) {
      setEvaluations([]);
      setReadError(
        "Authoritative Academy access is unavailable.",
      );
      setLoading(false);

      return () => {
        cancelled = true;
      };
    }

    setEvaluations([]);
    setReadError(null);
    setLoading(true);

    const loadEvaluations = async () => {
      try {
        const records =
          await readAcademyPlayerEvaluations(
            academyId,
            getAcademyCollection("player_evaluations"),
          );

        if (cancelled) {
          return;
        }

        const playerRecords = records
          .filter(
            (evaluation) =>
              evaluation.player_id === player.id,
          )
          .sort((left, right) =>
            evaluationSortKey(right).localeCompare(
              evaluationSortKey(left),
            ),
          );

        setEvaluations(playerRecords);
        setReadError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(
          "YouthDevelopmentReport: failed to read player evaluations:",
          error,
        );

        setEvaluations([]);
        setReadError(
          "Player Evaluation records could not be loaded.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadEvaluations();

    return () => {
      cancelled = true;
    };
  }, [academyId, player?.id]);

  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-100"
        >
          <ArrowLeft size={20} />
        </button>

        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">
            Youth Development Report
          </h1>

          {playerName && (
            <p className="text-sm text-slate-500">
              {playerName}
            </p>
          )}
        </div>
      </div>

      {!player?.id ? (
        <EmptyState
          icon={FileWarning}
          title="Player selection required"
          description="Open this report from a Youth Player record to view its stored Academy Evaluation history."
          primaryActionLabel="Go Back"
          onPrimaryAction={onBack}
        />
      ) : loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <LoaderCircle
            className="mx-auto animate-spin text-indigo-600"
            size={36}
          />
          <p className="mt-4 text-sm font-bold text-slate-600">
            Loading development records...
          </p>
        </div>
      ) : readError ? (
        <EmptyState
          icon={FileWarning}
          title="Development records unavailable"
          description={readError}
          primaryActionLabel="Go Back"
          onPrimaryAction={onBack}
        />
      ) : evaluations.length === 0 ? (
        <EmptyState
          icon={FileWarning}
          title="No Evaluation records found"
          description="No Academy Evaluation is currently linked to this Player record."
          primaryActionLabel="Go Back"
          onPrimaryAction={onBack}
        />
      ) : (
        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">
              Evaluation History
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {evaluations.length} stored Evaluation
              {evaluations.length === 1 ? "" : "s"}
            </p>
          </div>

          {evaluations.map((evaluation) => {
            const scoreEntries = numericScoreEntries(
              evaluation.scores,
            );

            return (
              <article
                key={evaluation.id}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                      Evaluation Date
                    </p>
                    <p className="mt-1 font-black text-slate-800">
                      {evaluationDateLabel(evaluation)}
                    </p>
                  </div>

                  {evaluation.coach_id && (
                    <p className="text-xs text-slate-400">
                      Coach ID: {evaluation.coach_id}
                    </p>
                  )}
                </div>

                {scoreEntries.length > 0 ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {scoreEntries.map(
                      ([criteriaName, score]) => (
                        <div
                          key={criteriaName}
                          className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3"
                        >
                          <span className="text-sm font-bold text-slate-700">
                            {criteriaName}
                          </span>
                          <span className="shrink-0 text-lg font-black text-indigo-600">
                            {score}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-slate-500">
                    This Evaluation record has no numeric scores
                    available for display.
                  </p>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
