import { useEffect, useState } from "react";
import {
  ArrowLeft,
  FileWarning,
  LoaderCircle,
  UserCircle,
} from "lucide-react";

import { useAcademy } from "../contexts/AcademyContext";
import {
  readAcademyPlayerEvaluations,
} from "../services/playerEvaluationReadAdapter";
import type {
  LegacyPlayerEvaluationRecord,
} from "../services/playerEvaluationCompatibility";

interface YouthPlayerCVProps {
  player: {
    id: string;
    firstName?: string;
    lastName?: string;
    position?: string;
    age?: number;
    ageGroup?: string;
    avatar?: string;
  };
  onBack: () => void;
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

export default function YouthPlayerCV({
  player,
  onBack,
}: YouthPlayerCVProps) {
  const {
    academyId,
    getAcademyCollection,
  } = useAcademy();

  const [evaluations, setEvaluations] = useState<
    LegacyPlayerEvaluationRecord[]
  >([]);
  const [loadingEvaluations, setLoadingEvaluations] =
    useState(true);
  const [evaluationReadError, setEvaluationReadError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!academyId || !player.id) {
      setEvaluations([]);
      setEvaluationReadError(
        "Authoritative Academy or Player identity is unavailable.",
      );
      setLoadingEvaluations(false);

      return () => {
        cancelled = true;
      };
    }

    setEvaluations([]);
    setEvaluationReadError(null);
    setLoadingEvaluations(true);

    const loadEvaluations = async () => {
      try {
        const records =
          await readAcademyPlayerEvaluations(
            academyId,
            getAcademyCollection("player_evaluations"),
            player.id,
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
        setEvaluationReadError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(
          "YouthPlayerCV: failed to read player evaluations:",
          error,
        );
        setEvaluations([]);
        setEvaluationReadError(
          "Player Evaluation records could not be loaded.",
        );
      } finally {
        if (!cancelled) {
          setLoadingEvaluations(false);
        }
      }
    };

    void loadEvaluations();

    return () => {
      cancelled = true;
    };
  }, [academyId, player.id]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600"
      >
        <ArrowLeft size={16} /> Back to Roster
      </button>

      <div className="flex flex-col items-center gap-6 rounded-3xl bg-slate-900 p-8 text-center text-white sm:flex-row sm:text-left">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-slate-700 bg-slate-800">
          {player.avatar ? (
            <img
              src={player.avatar}
              alt={`${player.firstName || ""} ${player.lastName || ""}`.trim()}
              className="h-full w-full object-cover"
            />
          ) : (
            <UserCircle
              className="text-slate-400"
              size={58}
            />
          )}
        </div>

        <div>
          <h1 className="text-3xl font-black">
            {[player.firstName, player.lastName]
              .filter(Boolean)
              .join(" ") || "Player"}
          </h1>

          <p className="mt-2 text-sm font-bold uppercase tracking-widest text-slate-300">
            {[player.position, player.ageGroup]
              .filter(Boolean)
              .join(" · ") ||
              "Profile details unavailable"}
          </p>

          {typeof player.age === "number" && (
            <p className="mt-1 text-sm text-slate-400">
              Age {player.age}
            </p>
          )}
        </div>
      </div>

      {loadingEvaluations ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <LoaderCircle
            className="mx-auto animate-spin text-indigo-600"
            size={36}
          />
          <p className="mt-4 text-sm font-bold text-slate-600">
            Loading Evaluation records...
          </p>
        </div>
      ) : evaluationReadError ? (
        <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <FileWarning
            className="mx-auto text-rose-500"
            size={36}
          />
          <h2 className="mt-4 text-xl font-black text-slate-800">
            Evaluation records unavailable
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            {evaluationReadError}
          </p>
        </div>
      ) : evaluations.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <FileWarning
            className="mx-auto text-amber-500"
            size={36}
          />
          <h2 className="mt-4 text-xl font-black text-slate-800">
            No Evaluation records found
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            No Academy Evaluation is currently linked to this
            Player record.
          </p>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900">
                Performance Evaluations
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {evaluations.length} stored Evaluation
                {evaluations.length === 1 ? "" : "s"}
              </p>
            </div>
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
