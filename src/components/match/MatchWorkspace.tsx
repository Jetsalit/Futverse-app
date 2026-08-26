import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock3,
  Edit3,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trophy,
  X,
} from "lucide-react";

import { EmptyState } from "../common/EmptyState";
import { useAcademy } from "../../contexts/AcademyContext";
import { useLanguage } from "../../contexts/LanguageContext";

import {
  createAcademyMatch,
  listAcademyMatches,
  transitionAcademyMatchStatus,
  updateAcademyMatch,
  type AcademyMatchRecord,
} from "../../lib/firestore/matchRepository";

import type {
  MatchStatus,
  MatchVenueType,
} from "../../lib/matchFoundation";

import {
  MATCH_STATUS_FILTERS,
  MATCH_WORKSPACE_TIME_ZONE,
  buildMatchCoreData,
  buildMatchCoreDataFromRecord,
  createEmptyMatchForm,
  filterMatches,
  getLifecycleActions,
  isMatchReadOnly,
  matchRecordToForm,
  sortMatchesForWorkspace,
  type MatchFormState,
  type MatchLifecycleAction,
  type MatchStatusFilter,
} from "./matchWorkspaceModel";

type WorkspaceMode =
  | "view"
  | "create"
  | "edit";

type ReadFailure =
  | "NO_ACADEMY"
  | "READ_FAILED"
  | null;

function statusTranslationKey(
  status: MatchStatus,
): string {
  return `match_status_${status.toLowerCase()}`;
}

function venueTranslationKey(
  venue: MatchVenueType,
): string {
  return `match_venue_${venue.toLowerCase()}`;
}

const MATCH_VALIDATION_TRANSLATION_KEYS:
  Readonly<Record<string, string>> = {
    "Invalid squad label.":
      "match_validation_squad",
    "Invalid competition name.":
      "match_validation_competition",
    "Invalid opponent name.":
      "match_validation_opponent",
    "Invalid kickoff time.":
      "match_validation_kickoff",
    "Invalid venue type.":
      "match_validation_venue",
    "Scheduled or active Match requires an opponent.":
      "match_validation_opponent_required",
    "Scheduled or active Match requires a kickoff time.":
      "match_validation_kickoff_required",
    "Scheduled or active Match requires a venue type.":
      "match_validation_venue_required",
  };

function translateMatchValidationError(
  error: string,
  t: (key: string) => string,
): string {
  const translationKey =
    MATCH_VALIDATION_TRANSLATION_KEYS[
      error
    ];

  return translationKey
    ? t(translationKey)
    : t("match_validation_generic");
}

function statusTone(
  status: MatchStatus,
): string {
  if (status === "IN_PROGRESS") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "SCHEDULED") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "DRAFT") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "COMPLETED") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function formatMatchDate(
  value: Date | null,
  language: "th" | "en",
  emptyLabel: string,
): string {
  if (!value) return emptyLabel;

  return new Intl.DateTimeFormat(
    language === "th"
      ? "th-TH"
      : "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone:
        MATCH_WORKSPACE_TIME_ZONE,
    },
  ).format(value);
}

function MatchStatusBadge({
  status,
  label,
}: {
  status: MatchStatus;
  label: string;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1",
        "text-[11px] font-black uppercase tracking-wide",
        statusTone(status),
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function MatchFormFields({
  form,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
  errors,
  t,
}: {
  form: MatchFormState;
  onChange: (next: MatchFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  submitLabel: string;
  busy: boolean;
  errors: readonly string[];
  t: (key: string) => string;
}) {
  const setField = <K extends keyof MatchFormState>(
    key: K,
    value: MatchFormState[K],
  ) => {
    onChange({
      ...form,
      [key]: value,
    });
  };

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="space-y-5"
    >
      {errors.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-rose-700">
            <AlertTriangle size={17} />
            {t("match_validation_title")}
          </div>

          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-medium text-rose-700">
            {errors.map((error) => (
              <li key={error}>
                {translateMatchValidationError(
                  error,
                  t,
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500">
            {t("match_field_squad")}
          </span>

          <input
            value={form.squadLabel}
            onChange={(event) =>
              setField(
                "squadLabel",
                event.target.value,
              )
            }
            maxLength={80}
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500">
            {t("match_field_competition")}
          </span>

          <input
            value={form.competitionName}
            onChange={(event) =>
              setField(
                "competitionName",
                event.target.value,
              )
            }
            maxLength={120}
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500">
            {t("match_field_opponent")}
          </span>

          <input
            value={form.opponentName}
            onChange={(event) =>
              setField(
                "opponentName",
                event.target.value,
              )
            }
            maxLength={120}
            placeholder={t("match_optional")}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500">
            {t("match_field_kickoff")}
          </span>

          <input
            type="datetime-local"
            value={form.kickoffAt}
            onChange={(event) =>
              setField(
                "kickoffAt",
                event.target.value,
              )
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />

          <p className="text-[11px] font-semibold leading-5 text-slate-400">
            {t(
              "match_kickoff_timezone_hint",
            )}
          </p>
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500">
            {t("match_field_venue")}
          </span>

          <select
            value={form.venueType}
            onChange={(event) =>
              setField(
                "venueType",
                event.target.value as "" | MatchVenueType,
              )
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">
              {t("match_optional")}
            </option>
            <option value="HOME">
              {t("match_venue_home")}
            </option>
            <option value="AWAY">
              {t("match_venue_away")}
            </option>
            <option value="NEUTRAL">
              {t("match_venue_neutral")}
            </option>
          </select>
        </label>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={16} />
          {t("match_discard")}
        </button>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2
              size={16}
              className="animate-spin"
            />
          ) : (
            <Save size={16} />
          )}

          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function MatchWorkspace({
  onBack,
}: {
  onBack: () => void;
}) {
  const { academyId } = useAcademy();
  const { language, t } = useLanguage();

  const [matches, setMatches] =
    useState<AcademyMatchRecord[]>([]);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [filter, setFilter] =
    useState<MatchStatusFilter>("ALL");

  const [mode, setMode] =
    useState<WorkspaceMode>("view");

  const [form, setForm] =
    useState<MatchFormState>(
      createEmptyMatchForm(),
    );

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [readFailure, setReadFailure] =
    useState<ReadFailure>(null);

  const [mutationFailed, setMutationFailed] =
    useState(false);

  const [formErrors, setFormErrors] =
    useState<string[]>([]);

  const [reloadVersion, setReloadVersion] =
    useState(0);

  const workspaceNavigationLocked =
    busy || mode !== "view";

  const preferredSelectionRef =
    useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setReadFailure(null);

    if (!academyId) {
      setMatches([]);
      setSelectedId(null);
      setReadFailure("NO_ACADEMY");
      setLoading(false);

      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const loaded =
          sortMatchesForWorkspace(
            await listAcademyMatches(
              academyId,
            ),
          );

        if (cancelled) return;

        setMatches(loaded);

        const preferredId =
          preferredSelectionRef.current;

        preferredSelectionRef.current = null;

        const selected =
          (
            preferredId
              ? loaded.find(
                  (match) =>
                    match.id === preferredId,
                )
              : null
          )
          ?? loaded[0]
          ?? null;

        setSelectedId(
          selected?.id ?? null,
        );

        if (selected) {
          setForm(
            matchRecordToForm(selected),
          );
        } else {
          setForm(
            createEmptyMatchForm(),
          );
        }

        setMode("view");
        setFormErrors([]);
        setMutationFailed(false);
      } catch (error) {
        if (cancelled) return;

        console.error(
          "Match Workspace read failed:",
          error,
        );

        setMatches([]);
        setSelectedId(null);
        setReadFailure("READ_FAILED");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    academyId,
    reloadVersion,
  ]);

  const selectedMatch =
    useMemo(
      () =>
        matches.find(
          (match) =>
            match.id === selectedId,
        ) ?? null,
      [
        matches,
        selectedId,
      ],
    );

  const visibleMatches =
    useMemo(
      () =>
        sortMatchesForWorkspace(
          filterMatches(
            matches,
            filter,
          ),
        ),
      [
        matches,
        filter,
      ],
    );

  const requestReload = (
    preferredId: string | null,
  ) => {
    setLoading(true);

    preferredSelectionRef.current =
      preferredId;

    setReloadVersion(
      (value) => value + 1,
    );
  };

  const selectMatch = (
    match: AcademyMatchRecord,
  ) => {
    setSelectedId(match.id);
    setForm(matchRecordToForm(match));
    setMode("view");
    setFormErrors([]);
    setMutationFailed(false);
  };

  const openCreate = () => {
    if (
      loading ||
      !academyId ||
      workspaceNavigationLocked
    ) {
      return;
    }

    setMode("create");
    setForm(createEmptyMatchForm());
    setFormErrors([]);
    setMutationFailed(false);
  };

  const openEdit = () => {
    if (
      !selectedMatch ||
      isMatchReadOnly(
        selectedMatch.status,
      )
    ) {
      return;
    }

    setForm(
      matchRecordToForm(
        selectedMatch,
      ),
    );

    setMode("edit");
    setFormErrors([]);
    setMutationFailed(false);
  };

  const discardForm = () => {
    if (selectedMatch) {
      setForm(
        matchRecordToForm(
          selectedMatch,
        ),
      );
    } else {
      setForm(
        createEmptyMatchForm(),
      );
    }

    setMode("view");
    setFormErrors([]);
    setMutationFailed(false);
  };

  const handleCreate = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!academyId || busy) return;

    const built =
      buildMatchCoreData(
        form,
        "DRAFT",
      );

    if (!built.valid) {
      setFormErrors(built.errors);
      return;
    }

    setBusy(true);
    setFormErrors([]);
    setMutationFailed(false);

    try {
      const matchId =
        await createAcademyMatch({
          academyId,
          data: built.data,
        });

      setMode("view");
      requestReload(matchId);
    } catch (error) {
      console.error(
        "Match Workspace create failed:",
        error,
      );

      setMutationFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      !academyId ||
      !selectedMatch ||
      busy ||
      isMatchReadOnly(
        selectedMatch.status,
      )
    ) {
      return;
    }

    const built =
      buildMatchCoreData(
        form,
        selectedMatch.status,
      );

    if (!built.valid) {
      setFormErrors(built.errors);
      return;
    }

    setBusy(true);
    setFormErrors([]);
    setMutationFailed(false);

    try {
      await updateAcademyMatch({
        academyId,
        matchId: selectedMatch.id,
        expectedData:
          buildMatchCoreDataFromRecord(
            selectedMatch,
          ).data,
        data: built.data,
      });

      setMode("view");

      requestReload(
        selectedMatch.id,
      );
    } catch (error) {
      console.error(
        "Match Workspace correction failed:",
        error,
      );

      setMutationFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const handleLifecycle =
    async (
      action: MatchLifecycleAction,
    ) => {
      if (
        !academyId ||
        !selectedMatch ||
        busy ||
        isMatchReadOnly(
          selectedMatch.status,
        )
      ) {
        return;
      }

      const confirmationKey =
        action.targetStatus ===
        "CANCELLED"
          ? "match_cancel_confirm"
          : action.targetStatus ===
              "COMPLETED"
            ? "match_complete_confirm"
            : null;

      if (confirmationKey) {
        const confirmed =
          window.confirm(
            t(confirmationKey),
          );

        if (!confirmed) return;
      }

      const built =
        buildMatchCoreDataFromRecord(
          selectedMatch,
          action.targetStatus,
        );

      if (!built.valid) {
        setForm(
          matchRecordToForm(
            selectedMatch,
          ),
        );

        setFormErrors(
          built.errors,
        );

        setMutationFailed(false);

        if (
          action.targetStatus !==
          "CANCELLED"
        ) {
          setMode("edit");
        }

        return;
      }

      setBusy(true);
      setFormErrors([]);
      setMutationFailed(false);

      try {
        await transitionAcademyMatchStatus({
          academyId,
          matchId: selectedMatch.id,
          expectedData:
            buildMatchCoreDataFromRecord(
              selectedMatch,
            ).data,
          targetStatus:
            action.targetStatus,
        });

        requestReload(
          selectedMatch.id,
        );
      } catch (error) {
        console.error(
          "Match Workspace lifecycle update failed:",
          error,
        );

        setMutationFailed(true);
      } finally {
        setBusy(false);
      }
    };

  const renderReadFailure = () => {
    if (
      readFailure ===
      "NO_ACADEMY"
    ) {
      return (
        <EmptyState
          icon={ShieldAlert}
          title={t(
            "match_no_academy_title",
          )}
          description={t(
            "match_no_academy_desc",
          )}
          primaryActionLabel={t(
            "match_back",
          )}
          onPrimaryAction={onBack}
        />
      );
    }

    return (
      <EmptyState
        icon={AlertTriangle}
        title={t(
          "match_read_error_title",
        )}
        description={t(
          "match_read_error_desc",
        )}
        primaryActionLabel={t(
          "match_retry",
        )}
        onPrimaryAction={() =>
          requestReload(selectedId)
        }
        secondaryActionLabel={t(
          "match_back",
        )}
        onSecondaryAction={onBack}
      />
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl pb-10">
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            type="button"
            disabled={workspaceNavigationLocked}
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 transition hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeft size={16} />
            {t("match_back_dashboard")}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
              <CalendarDays size={22} />
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {t(
                  "match_workspace_title",
                )}
              </h1>

              <p className="mt-1 text-sm font-medium text-slate-500">
                {t(
                  "match_workspace_desc",
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={
              loading ||
              !academyId ||
              workspaceNavigationLocked
            }
            onClick={() =>
              requestReload(
                selectedId,
              )
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={
                loading
                  ? "animate-spin"
                  : ""
              }
            />
            <span className="hidden sm:inline">
              {t("match_refresh")}
            </span>
          </button>

          <button
            type="button"
            disabled={
              loading ||
              !academyId ||
              workspaceNavigationLocked
            }
            onClick={openCreate}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            <Plus size={17} />
            {t("match_create")}
          </button>
        </div>
      </div>

      {mutationFailed && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0"
          />
          {t(
            "match_mutation_failed",
          )}
        </div>
      )}

      {loading && (
        <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <div className="text-center">
            <Loader2
              size={32}
              className="mx-auto animate-spin text-indigo-600"
            />

            <p className="mt-3 text-sm font-bold text-slate-500">
              {t("match_loading")}
            </p>
          </div>
        </div>
      )}

      {!loading &&
        readFailure &&
        renderReadFailure()}

      {!loading &&
        !readFailure && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.5fr)]">
            <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black text-slate-900">
                      {t(
                        "match_fixture_list",
                      )}
                    </h2>

                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {matches.length}{" "}
                      {t(
                        "match_records",
                      )}
                    </p>
                  </div>

                  <select
                    value={filter}
                    onChange={(
                      event,
                    ) =>
                      setFilter(
                        event.target
                          .value as MatchStatusFilter,
                      )
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 outline-none"
                  >
                    {MATCH_STATUS_FILTERS.map(
                      (status) => (
                        <option
                          key={status}
                          value={status}
                        >
                          {status === "ALL"
                            ? t(
                                "match_filter_all",
                              )
                            : t(
                                statusTranslationKey(
                                  status,
                                ),
                              )}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </div>

              <div className="max-h-[620px] space-y-2 overflow-y-auto p-3">
                {visibleMatches.length ===
                  0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                    <CalendarDays
                      size={28}
                      className="mx-auto text-slate-300"
                    />

                    <h3 className="mt-3 text-sm font-black text-slate-700">
                      {matches.length ===
                      0
                        ? t(
                            "match_empty_title",
                          )
                        : t(
                            "match_filter_empty_title",
                          )}
                    </h3>

                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                      {matches.length ===
                      0
                        ? t(
                            "match_empty_desc",
                          )
                        : t(
                            "match_filter_empty_desc",
                          )}
                    </p>
                  </div>
                )}

                {visibleMatches.map(
                  (match) => {
                    const active =
                      match.id ===
                      selectedId;

                    return (
                      <button
                        key={match.id}
                        type="button"
                        disabled={workspaceNavigationLocked}
                        onClick={() =>
                          selectMatch(
                            match,
                          )
                        }
                        className={[
                          "w-full rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                          active
                            ? "border-indigo-300 bg-indigo-50/70 shadow-sm"
                            : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-slate-900">
                              {match.opponentName ??
                                t(
                                  "match_no_opponent",
                                )}
                            </div>

                            <div className="mt-1 truncate text-xs font-semibold text-slate-500">
                              {
                                match.competitionName
                              }
                            </div>
                          </div>

                          <MatchStatusBadge
                            status={
                              match.status
                            }
                            label={t(
                              statusTranslationKey(
                                match.status,
                              ),
                            )}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
                          <span>
                            {
                              match.squadLabel
                            }
                          </span>

                          <span>
                            {formatMatchDate(
                              match.kickoffAt,
                              language,
                              t(
                                "match_no_kickoff",
                              ),
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </section>

            <section className="min-w-0 rounded-3xl border border-slate-200 bg-white shadow-sm">
              {mode === "create" && (
                <div className="p-5 sm:p-7">
                  <div className="mb-6">
                    <div className="text-xs font-black uppercase tracking-widest text-indigo-600">
                      {t(
                        "match_status_draft",
                      )}
                    </div>

                    <h2 className="mt-1 text-xl font-black text-slate-900">
                      {t(
                        "match_create_title",
                      )}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      {t(
                        "match_create_desc",
                      )}
                    </p>
                  </div>

                  <MatchFormFields
                    form={form}
                    onChange={setForm}
                    onSubmit={
                      handleCreate
                    }
                    onCancel={
                      discardForm
                    }
                    submitLabel={t(
                      "match_create_draft",
                    )}
                    busy={busy}
                    errors={formErrors}
                    t={t}
                  />
                </div>
              )}

              {mode !== "create" &&
                !selectedMatch && (
                  <EmptyState
                    icon={CalendarDays}
                    title={t(
                      "match_empty_title",
                    )}
                    description={t(
                      "match_empty_desc",
                    )}
                    primaryActionLabel={t(
                      "match_create",
                    )}
                    onPrimaryAction={
                      openCreate
                    }
                  />
                )}

              {mode !== "create" &&
                selectedMatch && (
                  <div>
                    <div className="border-b border-slate-100 p-5 sm:p-7">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <MatchStatusBadge
                              status={
                                selectedMatch.status
                              }
                              label={t(
                                statusTranslationKey(
                                  selectedMatch.status,
                                ),
                              )}
                            />

                            <span className="text-xs font-bold text-slate-400">
                              {
                                selectedMatch.squadLabel
                              }
                            </span>
                          </div>

                          <h2 className="mt-3 truncate text-2xl font-black text-slate-900">
                            {selectedMatch.opponentName ??
                              t(
                                "match_no_opponent",
                              )}
                          </h2>

                          <p className="mt-1 text-sm font-semibold text-slate-500">
                            {
                              selectedMatch.competitionName
                            }
                          </p>
                        </div>

                        {mode ===
                          "view" &&
                          !isMatchReadOnly(
                            selectedMatch.status,
                          ) && (
                            <button
                              type="button"
                              onClick={
                                openEdit
                              }
                              disabled={
                                busy
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Edit3
                                size={
                                  16
                                }
                              />
                              {t(
                                "match_edit",
                              )}
                            </button>
                          )}
                      </div>
                    </div>

                    {mode ===
                      "edit" && (
                      <div className="p-5 sm:p-7">
                        <h3 className="mb-5 text-sm font-black text-slate-900">
                          {t(
                            "match_edit_title",
                          )}
                        </h3>

                        <MatchFormFields
                          form={form}
                          onChange={
                            setForm
                          }
                          onSubmit={
                            handleSaveEdit
                          }
                          onCancel={
                            discardForm
                          }
                          submitLabel={t(
                            "match_save",
                          )}
                          busy={busy}
                          errors={
                            formErrors
                          }
                          t={t}
                        />
                      </div>
                    )}

                    {mode ===
                      "view" && (
                      <div className="space-y-6 p-5 sm:p-7">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-slate-50 p-4">
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                              <Clock3
                                size={
                                  15
                                }
                              />
                              {t(
                                "match_field_kickoff",
                              )}
                            </div>

                            <div className="mt-2 text-sm font-black text-slate-800">
                              {formatMatchDate(
                                selectedMatch.kickoffAt,
                                language,
                                t(
                                  "match_no_kickoff",
                                ),
                              )}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-4">
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                              <MapPin
                                size={
                                  15
                                }
                              />
                              {t(
                                "match_field_venue",
                              )}
                            </div>

                            <div className="mt-2 text-sm font-black text-slate-800">
                              {selectedMatch.venueType
                                ? t(
                                    venueTranslationKey(
                                      selectedMatch.venueType,
                                    ),
                                  )
                                : t(
                                    "match_not_set",
                                  )}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-4">
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                              <Trophy
                                size={
                                  15
                                }
                              />
                              {t(
                                "match_field_competition",
                              )}
                            </div>

                            <div className="mt-2 text-sm font-black text-slate-800">
                              {
                                selectedMatch.competitionName
                              }
                            </div>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-4">
                            <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                              {t(
                                "match_field_squad",
                              )}
                            </div>

                            <div className="mt-2 text-sm font-black text-slate-800">
                              {
                                selectedMatch.squadLabel
                              }
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-5 text-xs text-slate-500 sm:grid-cols-2">
                          <div>
                            <span className="font-bold">
                              {t(
                                "match_created",
                              )}
                              :
                            </span>{" "}
                            {formatMatchDate(
                              selectedMatch.createdAt,
                              language,
                              t(
                                "match_not_set",
                              ),
                            )}
                          </div>

                          <div>
                            <span className="font-bold">
                              {t(
                                "match_updated",
                              )}
                              :
                            </span>{" "}
                            {formatMatchDate(
                              selectedMatch.updatedAt,
                              language,
                              t(
                                "match_not_set",
                              ),
                            )}
                          </div>

                          <div className="truncate">
                            <span className="font-bold">
                              {t(
                                "match_created_by",
                              )}
                              :
                            </span>{" "}
                            {
                              selectedMatch.createdBy
                            }
                          </div>

                          <div className="truncate">
                            <span className="font-bold">
                              {t(
                                "match_updated_by",
                              )}
                              :
                            </span>{" "}
                            {
                              selectedMatch.updatedBy
                            }
                          </div>
                        </div>

                        {isMatchReadOnly(
                          selectedMatch.status,
                        ) && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
                            {t(
                              "match_terminal_note",
                            )}
                          </div>
                        )}

                        {!isMatchReadOnly(
                          selectedMatch.status,
                        ) && (
                          <div className="border-t border-slate-100 pt-5">
                            <div className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
                              {t(
                                "match_lifecycle_actions",
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {getLifecycleActions(
                                selectedMatch.status,
                              ).map(
                                (
                                  action,
                                ) => (
                                  <button
                                    key={
                                      action.id
                                    }
                                    type="button"
                                    disabled={
                                      busy
                                    }
                                    onClick={() =>
                                      void handleLifecycle(
                                        action,
                                      )
                                    }
                                    className={
                                      action.destructive
                                        ? "rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-black text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                                        : "rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
                                    }
                                  >
                                    {t(
                                      action.translationKey,
                                    )}
                                  </button>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
            </section>
          </div>
        )}
    </div>
  );
}