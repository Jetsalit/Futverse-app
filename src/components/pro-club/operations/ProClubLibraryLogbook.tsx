import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Clock3,
  Heart,
  Library,
  Loader2,
  Search,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";

import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import {
  listMyProClubStaffSubmissions,
  listProClubStaffSubmissionsForReview,
} from "../../../lib/firestore/proClubStaffSubmissionsRepository";
import { useDrillDatabase } from "../../../hooks/useDrillDatabase";
import {
  PRO_CLUB_LIBRARY_LOGBOOK_ROLE_LABELS,
  PRO_CLUB_LIBRARY_LOGBOOK_ROLES,
  PRO_CLUB_LIBRARY_LOGBOOK_VIEW_LABELS,
  PRO_CLUB_LIBRARY_LOGBOOK_VIEWS,
  composeProClubLibraryLogbookEntries,
  isProClubLibraryLogbookRole,
  type ProClubLibraryLogbookRoleFilter,
  type ProClubLibraryLogbookView,
} from "../../../lib/proClubLibraryLogbook";
import type { ProClubStaffSubmissionRecord } from "../../../lib/proClubStaffSubmissions";
import { formatThaiDateLong } from "../../../lib/thaiDateTimePresentation";

const VIEW_ICONS: Record<ProClubLibraryLogbookView, typeof BookOpen> = {
  MY_LOGBOOK: BookOpen,
  TEAM_SHARED: Users,
  CLUB_LIBRARY: Library,
  FAVOURITES: Heart,
  RECENT: Clock3,
};

const TECHNICAL_DIRECTOR_DEVELOPMENT_LENSES = [
  "Club Development",
  "Game Model",
  "Player Development",
  "Pathway",
] as const;

export function canOpenProClubLibraryLogbook(
  authority: ProClubOrganizationAuthority,
): boolean {
  return (
    authority.organizationType === "PRO_CLUB" &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority === true &&
    isProClubLibraryLogbookRole(authority.staffRole)
  );
}

export default function ProClubLibraryLogbook({
  authority,
  onOpenGameModel,
}: {
  authority: ProClubOrganizationAuthority;
  onOpenGameModel?: () => void;
}) {
  const { myDrills, academyDrills: sharedDrills } = useDrillDatabase();
  const [view, setView] = useState<ProClubLibraryLogbookView>("MY_LOGBOOK");
  const [roleFilter, setRoleFilter] =
    useState<ProClubLibraryLogbookRoleFilter>("ALL");
  const [query, setQuery] = useState("");
  const [submissions, setSubmissions] = useState<
    ProClubStaffSubmissionRecord[]
  >([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [favouriteKeys, setFavouriteKeys] = useState<readonly string[]>([]);

  const allowed = canOpenProClubLibraryLogbook(authority);

  const loadSubmissions = useCallback(async () => {
    if (!allowed) {
      setSubmissions([]);
      setSubmissionError(null);
      return;
    }

    setLoadingSubmissions(true);
    setSubmissionError(null);

    try {
      const next =
        authority.staffRole === "TECHNICAL_DIRECTOR" ||
        authority.staffRole === "HEAD_COACH"
          ? await listProClubStaffSubmissionsForReview(authority.organizationId)
          : await listMyProClubStaffSubmissions(authority.organizationId);
      setSubmissions(next);
    } catch (error) {
      setSubmissions([]);
      setSubmissionError(
        error instanceof Error
          ? error.message
          : "Staff Submissions could not be loaded.",
      );
    } finally {
      setLoadingSubmissions(false);
    }
  }, [allowed, authority.organizationId, authority.staffRole]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  const visibleDrills = useMemo(() => {
    const byId = new Map(
      [...myDrills, ...sharedDrills].map((drill) => [drill.id, drill] as const),
    );
    return [...byId.values()];
  }, [myDrills, sharedDrills]);

  const entries = useMemo(
    () =>
      allowed
        ? composeProClubLibraryLogbookEntries({
            drills: visibleDrills,
            submissions,
            actorUid: authority.userId,
            view,
            roleFilter,
            favouriteKeys,
            query,
          })
        : [],
    [
      allowed,
      authority.userId,
      visibleDrills,
      favouriteKeys,
      query,
      roleFilter,
      submissions,
      view,
    ],
  );

  function toggleFavourite(key: string) {
    setFavouriteKeys((current) =>
      current.includes(key)
        ? current.filter((candidate) => candidate !== key)
        : [...current, key],
    );
  }

  if (!allowed) {
    return (
      <section
        aria-label="Pro Club Library and Logbook unavailable"
        className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6"
      >
        <h3 className="font-black text-amber-300">Library & Logbook unavailable</h3>
        <p className="mt-2 text-sm text-slate-400">
          This surface is limited to active reviewed Pro Club football roles.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="pro-club-library-logbook-title"
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="pro-club-accent text-xs font-bold uppercase tracking-[0.18em]">
            Knowledge & Development
          </p>
          <h3
            id="pro-club-library-logbook-title"
            className="pro-club-heading mt-2 text-2xl font-black"
          >
            Library & Logbook
          </h3>
          <p className="pro-club-muted mt-2 max-w-3xl text-sm leading-6">
            Reuse existing drills, shared football work and Staff Submissions
            without creating another training or approval system.
          </p>
        </div>

        <div className="rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface-soft)] px-3 py-2 text-xs">
          <span className="pro-club-muted">Active role</span>
          <strong className="ml-2 text-emerald-500">
            {PRO_CLUB_LIBRARY_LOGBOOK_ROLE_LABELS[
              authority.staffRole as keyof typeof PRO_CLUB_LIBRARY_LOGBOOK_ROLE_LABELS
            ]}
          </strong>
        </div>
      </div>

      {authority.staffRole === "TECHNICAL_DIRECTOR" && (
        <section
          aria-label="Technical Director development lenses"
          className="rounded-2xl border border-[color:var(--pc-border)] bg-[var(--pc-surface)] p-4"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-cyan-400" />
            <h4 className="pro-club-heading font-black">Technical Director development</h4>
          </div>
          <p className="pro-club-muted mt-2 text-xs">
            Development lenses only. Review and approval authority remains with
            the existing Technical Governance contract.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {TECHNICAL_DIRECTOR_DEVELOPMENT_LENSES.map((lens) => {
              const gameModel = lens === "Game Model";
              return (
                <button
                  key={lens}
                  type="button"
                  onClick={gameModel ? onOpenGameModel : undefined}
                  disabled={gameModel ? !onOpenGameModel : true}
                  className="rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface-soft)] px-3 py-3 text-left text-sm font-bold text-[color:var(--pc-text)] disabled:cursor-default disabled:opacity-80"
                >
                  {lens}
                  <span className="pro-club-muted mt-1 block text-[10px] font-medium">
                    {gameModel ? "Open existing module" : "Library lens · V1"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          <div
            aria-label="Library and Logbook views"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {PRO_CLUB_LIBRARY_LOGBOOK_VIEWS.map((candidate) => {
              const Icon = VIEW_ICONS[candidate];
              const active = candidate === view;
              return (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(candidate)}
                  className={[
                    "inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-black transition",
                    active
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                      : "border-[color:var(--pc-border)] bg-[var(--pc-surface)] text-[color:var(--pc-muted)]",
                  ].join(" ")}
                >
                  <Icon size={15} />
                  {PRO_CLUB_LIBRARY_LOGBOOK_VIEW_LABELS[candidate]}
                </button>
              );
            })}
          </div>

          <label className="relative block">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <span className="sr-only">Search Library and Logbook</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search drills, submissions, categories or references"
              className="w-full rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface)] py-2.5 pl-9 pr-3 text-sm text-[color:var(--pc-text)] outline-none focus:border-cyan-400"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-[color:var(--pc-border)] bg-[var(--pc-surface)] p-4">
          <p className="pro-club-muted text-[10px] font-black uppercase tracking-[0.16em]">
            Role filter
          </p>
          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(
                event.target.value as ProClubLibraryLogbookRoleFilter,
              )
            }
            className="mt-2 w-full rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface-soft)] px-3 py-2.5 text-sm font-bold text-[color:var(--pc-text)]"
          >
            <option value="ALL">All football roles</option>
            {PRO_CLUB_LIBRARY_LOGBOOK_ROLES.map((role) => (
              <option key={role} value={role}>
                {PRO_CLUB_LIBRARY_LOGBOOK_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <p className="pro-club-muted mt-2 text-[10px] leading-4">
            Legacy drills remain role-neutral because their canonical schema has
            no Pro Club staff-role field.
          </p>
        </div>
      </div>

      {submissionError && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-300">
          Staff Submissions unavailable: {submissionError}
          <button
            type="button"
            onClick={() => void loadSubmissions()}
            className="ml-2 font-black underline"
          >
            Retry
          </button>
        </div>
      )}

      {loadingSubmissions && (
        <div className="pro-club-muted flex items-center gap-2 text-xs">
          <Loader2 size={14} className="animate-spin" />
          Loading Staff Submissions…
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--pc-border)] p-8 text-center">
          <Library size={28} className="mx-auto text-slate-500" />
          <p className="pro-club-heading mt-3 font-black">No matching entries</p>
          <p className="pro-club-muted mt-1 text-sm">
            This view only shows assets already visible through existing FutVerse contracts.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {entries.map((entry) => (
            <article
              key={entry.key}
              data-entry-source={entry.source}
              className="rounded-2xl border border-[color:var(--pc-border)] bg-[var(--pc-surface)] p-4 shadow-[var(--pc-glow)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-400">
                    {entry.source === "DRILL" ? "Drill" : "Staff Submission"}
                  </p>
                  <h4 className="pro-club-heading mt-1 truncate font-black">
                    {entry.title}
                  </h4>
                </div>
                <button
                  type="button"
                  aria-label={
                    entry.isFavourite
                      ? `Remove ${entry.title} from favourites`
                      : `Add ${entry.title} to favourites`
                  }
                  aria-pressed={entry.isFavourite}
                  onClick={() => toggleFavourite(entry.key)}
                  className="rounded-lg border border-[color:var(--pc-border)] p-2 text-amber-400"
                >
                  {entry.isFavourite ? <Star size={15} fill="currentColor" /> : <Star size={15} />}
                </button>
              </div>

              <p className="pro-club-muted mt-3 line-clamp-3 text-sm leading-6">
                {entry.summary}
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.08em]">
                <span className="rounded-lg bg-cyan-400/10 px-2 py-1 text-cyan-400">
                  {entry.category}
                </span>
                {entry.staffRole && (
                  <span className="rounded-lg bg-emerald-400/10 px-2 py-1 text-emerald-500">
                    {PRO_CLUB_LIBRARY_LOGBOOK_ROLE_LABELS[entry.staffRole]}
                  </span>
                )}
                {entry.status && (
                  <span className="rounded-lg bg-white/5 px-2 py-1 text-[color:var(--pc-muted)]">
                    {entry.status}
                  </span>
                )}
              </div>

              <div className="pro-club-muted mt-4 space-y-1 border-t border-[color:var(--pc-border)] pt-3 text-[10px]">
                <p>Reference: {entry.referenceId}</p>
                {entry.targetPlanId && <p>Plan: {entry.targetPlanId}</p>}
                {entry.targetSessionDate && <p>Session: {formatThaiDateLong(entry.targetSessionDate)}</p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
