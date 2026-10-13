import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { FileText, LayoutList, PencilLine, Printer, Save, ShieldAlert } from "lucide-react";

import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import { getProClub } from "../../../lib/firestore/proClubReadAdapter";
import {
  getProClubAnalysisGameModel,
  saveProClubAnalysisGameModel,
  type ProClubAnalysisGameModelRecord,
} from "../../../lib/firestore/proClubAnalysisGameModelRepository";
import {
  completeProClubMatchAnalysisRecord,
  getProClubMatchAnalysis,
  saveProClubMatchAnalysisDraft,
  canAccessProClubMatchAnalysis,
} from "../../../lib/firestore/proClubMatchAnalysisRepository";
import {
  getProClubAnalysisTeamLogo,
  listProClubAnalysisOpponentTeams,
  saveProClubAnalysisOpponentTeam,
  saveProClubAnalysisTeamLogo,
  type ProClubAnalysisOpponentTeamRecord,
  type ProClubAnalysisTeamLogoRecord,
} from "../../../lib/firestore/proClubAnalysisLogoRepository";
import {
  listProClubMatches,
  type ProClubMatchRecord,
} from "../../../lib/firestore/proClubMatchStartingXIRepository";
import {
  createEmptyProClubMatchAnalysis,
  createProClubAnalysisTopicSnapshot,
  type ProClubAnalysisTopicSnapshot,
  type ProClubAnalysisTopic,
  type ProClubMatchAnalysis,
} from "../../../lib/proClubMatchAnalysis";
import {
  compressProClubAnalysisLogo,
  resolveProClubAnalysisTeamLogo,
} from "../../../lib/proClubAnalysisLogo";
import ProClubAnalysisTopicManager from "./ProClubAnalysisTopicManager";
import {
  ProClubMatchAnalysisOverview,
  ProClubMatchAnalysisReport,
} from "./ProClubMatchAnalysisReadViews";
import ProClubMatchAnalysisSectionEditor from "./ProClubMatchAnalysisSectionEditor";

type AnalysisView = "SECTION" | "OVERVIEW" | "REPORT";

export interface ProClubMatchAnalysisWorkspaceServices {
  listMatches(clubId: string): Promise<ProClubMatchRecord[]>;
  getGameModel(clubId: string): Promise<ProClubAnalysisGameModelRecord>;
  saveGameModel(clubId: string, topics: readonly ProClubAnalysisTopic[], revision: number): Promise<ProClubAnalysisGameModelRecord>;
  getAnalysis(clubId: string, matchId: string): Promise<ProClubMatchAnalysis | null>;
  saveDraft(clubId: string, matchId: string, analysis: ProClubMatchAnalysis, revision: number): Promise<ProClubMatchAnalysis>;
  completeAnalysis(clubId: string, matchId: string, analysis: ProClubMatchAnalysis, revision: number): Promise<ProClubMatchAnalysis>;
  getTeamLogo(clubId: string): Promise<ProClubAnalysisTeamLogoRecord | null>;
  getProfileLogo(clubId: string): Promise<string | null>;
  saveTeamLogo(clubId: string, value: unknown): Promise<ProClubAnalysisTeamLogoRecord | null>;
  listOpponentTeams(clubId: string): Promise<ProClubAnalysisOpponentTeamRecord[]>;
  saveOpponentTeam(clubId: string, opponentId: string, name: string, value: unknown): Promise<ProClubAnalysisOpponentTeamRecord>;
}

const DEFAULT_SERVICES: ProClubMatchAnalysisWorkspaceServices = {
  listMatches: (clubId) => listProClubMatches(clubId),
  getGameModel: (clubId) => getProClubAnalysisGameModel(clubId),
  saveGameModel: (clubId, topics, revision) =>
    saveProClubAnalysisGameModel(clubId, topics, revision),
  getAnalysis: (clubId, matchId) => getProClubMatchAnalysis(clubId, matchId),
  saveDraft: (clubId, matchId, analysis, revision) =>
    saveProClubMatchAnalysisDraft(clubId, matchId, analysis, revision),
  completeAnalysis: (clubId, matchId, analysis, revision) =>
    completeProClubMatchAnalysisRecord(clubId, matchId, analysis, revision),
  getTeamLogo: (clubId) => getProClubAnalysisTeamLogo(clubId),
  async getProfileLogo(clubId) {
    const result = await getProClub(clubId);
    return result.state === "FOUND" && typeof result.value.data.logoUrl === "string"
      ? result.value.data.logoUrl
      : null;
  },
  saveTeamLogo: (clubId, value) => saveProClubAnalysisTeamLogo(clubId, value),
  listOpponentTeams: (clubId) => listProClubAnalysisOpponentTeams(clubId),
  saveOpponentTeam: (clubId, opponentId, name, value) =>
    saveProClubAnalysisOpponentTeam(clubId, opponentId, name, value),
};

function matchDate(match: ProClubMatchRecord): string | null {
  return match.kickoffAt instanceof Date && Number.isFinite(match.kickoffAt.getTime())
    ? match.kickoffAt.toISOString()
    : null;
}

function sortedMatches(matches: readonly ProClubMatchRecord[]): ProClubMatchRecord[] {
  return [...matches].sort((left, right) => {
    const leftDate = left.kickoffAt?.getTime() ?? 0;
    const rightDate = right.kickoffAt?.getTime() ?? 0;
    return rightDate - leftDate || right.matchId.localeCompare(left.matchId);
  });
}

function normalizeOpponentName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function createOpponentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return "opponent-" + crypto.randomUUID();
  }
  return "opponent-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

function defaultTopicValue(topic: ProClubAnalysisTopicSnapshot): boolean | number | string | null {
  if (topic.inputType === "CHECKBOX") return false;
  if (topic.inputType === "NOTES") return "";
  return null;
}

function applyTemplateToUnpersistedAnalysis(
  analysis: ProClubMatchAnalysis,
  topics: readonly ProClubAnalysisTopic[],
): ProClubMatchAnalysis {
  const snapshot = createProClubAnalysisTopicSnapshot(topics);
  const mapValues = (
    sectionId: "IN_POSSESSION_ATT" | "OUT_DEF",
  ) => Object.fromEntries(
    snapshot
      .filter((topic) => topic.section === sectionId)
      .map((topic) => [
        topic.id,
        analysis.sections[sectionId].topicValues[topic.id] ?? defaultTopicValue(topic),
      ]),
  );
  return {
    ...analysis,
    topicSnapshot: snapshot,
    sections: {
      ...analysis.sections,
      IN_POSSESSION_ATT: {
        ...analysis.sections.IN_POSSESSION_ATT,
        topicValues: mapValues("IN_POSSESSION_ATT"),
      },
      OUT_DEF: {
        ...analysis.sections.OUT_DEF,
        topicValues: mapValues("OUT_DEF"),
      },
    },
  };
}

export default function ProClubMatchAnalysisWorkspace({
  authority,
  onOpenMatches,
  services = DEFAULT_SERVICES,
}: {
  authority: ProClubOrganizationAuthority;
  onOpenMatches?: () => void;
  services?: ProClubMatchAnalysisWorkspaceServices;
}) {
  const clubId = authority.organizationId;
  const authorized = canAccessProClubMatchAnalysis(authority);
  const [matches, setMatches] = useState<ProClubMatchRecord[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [model, setModel] = useState<ProClubAnalysisGameModelRecord | null>(null);
  const [analysis, setAnalysis] = useState<ProClubMatchAnalysis | null>(null);
  const [teamLogo, setTeamLogo] = useState<ProClubAnalysisTeamLogoRecord | null>(null);
  const [profileLogoUrl, setProfileLogoUrl] = useState<string | null>(null);
  const [opponentTeams, setOpponentTeams] = useState<ProClubAnalysisOpponentTeamRecord[]>([]);
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"FORMATION_LINEUP" | "IN_POSSESSION_ATT" | "OUT_DEF" | "KEY_MAN" | "ANALYSIS" | "SET_PIECES" | "ATTACKING_PATTERNS">("FORMATION_LINEUP");
  const [view, setView] = useState<AnalysisView>("SECTION");
  const [showTopicManager, setShowTopicManager] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const match = useMemo(
    () => matches.find((item) => item.matchId === selectedMatchId) ?? null,
    [matches, selectedMatchId],
  );
  const canEdit = authorized && analysis?.status !== "COMPLETED";
  const effectiveTeamLogo = resolveProClubAnalysisTeamLogo(
    profileLogoUrl,
    teamLogo?.logoUrl,
  );
  const activeTopics = useMemo(
    () => model?.topics.filter((topic) => topic.enabled && !topic.archived) ?? [],
    [model],
  );
  const analysisTopics = useMemo(
    () => analysis && analysis.revision > 0
      ? analysis.topicSnapshot.map((topic) => ({ ...topic, enabled: true, archived: false }))
      : activeTopics,
    [activeTopics, analysis],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadIndex() {
      setLoadingIndex(true);
      setError(null);
      try {
        const [nextMatches, nextModel, nextTeamLogo, nextProfileLogo, nextOpponents] =
          await Promise.all([
            services.listMatches(clubId),
            services.getGameModel(clubId),
            services.getTeamLogo(clubId),
            services.getProfileLogo(clubId).catch(() => null),
            services.listOpponentTeams(clubId),
          ]);
        if (cancelled) return;
        const orderedMatches = sortedMatches(nextMatches);
        setMatches(orderedMatches);
        setModel(nextModel);
        setTeamLogo(nextTeamLogo);
        setProfileLogoUrl(nextProfileLogo);
        setOpponentTeams(nextOpponents);
        setSelectedMatchId((current) =>
          current && orderedMatches.some((item) => item.matchId === current)
            ? current
            : orderedMatches[0]?.matchId ?? "",
        );
      } catch (caught) {
        if (cancelled) return;
        setMatches([]);
        setModel(null);
        setError(caught instanceof Error ? caught.message : "Analysis workspace could not be loaded.");
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    }
    void loadIndex();
    return () => { cancelled = true; };
  }, [clubId, reloadToken, services]);

  // Only match/index changes may rehydrate a Draft; template and logo updates must retain local edits.
  useEffect(() => {
    if (!selectedMatchId || !match || !model || loadingIndex) {
      setAnalysis(null);
      setSelectedOpponentId(null);
      return;
    }
    let cancelled = false;
    async function loadSelectedAnalysis() {
      setLoadingAnalysis(true);
      setError(null);
      setMessage(null);
      try {
        const saved = await services.getAnalysis(clubId, selectedMatchId);
        if (cancelled) return;
        if (saved) {
          setAnalysis(saved);
          const savedOpponent = opponentTeams.find((item) => item.opponentId === saved.opponentSnapshot.teamId)
            ?? opponentTeams.find((item) => normalizeOpponentName(item.name) === normalizeOpponentName(saved.opponentSnapshot.name));
          setSelectedOpponentId(savedOpponent?.opponentId ?? saved.opponentSnapshot.teamId);
          dirtyRef.current = Boolean(saved.recoverySaveRequired);
          setDirty(dirtyRef.current);
        } else {
          const name = match.opponentName?.trim() || "Opponent";
          const savedOpponent = opponentTeams.find(
            (item) => normalizeOpponentName(item.name) === normalizeOpponentName(name),
          );
          const created = createEmptyProClubMatchAnalysis({
            matchId: match.matchId,
            clubName: authority.organizationName,
            clubLogoUrl: effectiveTeamLogo,
            competitionName: match.competitionName,
            opponentName: name,
            kickoffAt: matchDate(match),
            topicSnapshot: createProClubAnalysisTopicSnapshot(model.topics),
          });
          const hydrated = savedOpponent
            ? {
                ...created,
                opponentSnapshot: {
                  teamId: savedOpponent.opponentId,
                  name: savedOpponent.name,
                  logoUrl: savedOpponent.logoUrl,
                },
              }
            : created;
          setAnalysis(hydrated);
          setSelectedOpponentId(savedOpponent?.opponentId ?? null);
          dirtyRef.current = false;
          setDirty(false);
        }
      } catch (caught) {
        if (cancelled) return;
        setAnalysis(null);
        setError(caught instanceof Error ? caught.message : "Match Analysis could not be loaded.");
      } finally {
        if (!cancelled) setLoadingAnalysis(false);
      }
    }
    void loadSelectedAnalysis();
    return () => { cancelled = true; };
  }, [authority.organizationName, clubId, loadingIndex, match, selectedMatchId, services]);

  function updateDraft(action: SetStateAction<ProClubMatchAnalysis | null>) {
    setAnalysis((current) => typeof action === "function" ? action(current) : action);
    dirtyRef.current = true;
    setDirty(true);
    setMessage(null);
  }

  function setOpponentName(name: string) {
    const savedOpponent = opponentTeams.find(
      (item) => normalizeOpponentName(item.name) === normalizeOpponentName(name),
    );
    updateDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        matchSnapshot: { ...current.matchSnapshot, opponentName: name.trim() || "Opponent" },
        opponentSnapshot: {
          teamId: savedOpponent?.opponentId ?? null,
          name: savedOpponent?.name ?? (name.trim() || "Opponent"),
          logoUrl: savedOpponent?.logoUrl ?? null,
        },
      };
    });
    setSelectedOpponentId(savedOpponent?.opponentId ?? null);
  }

  function makeOpponentSnapshot(
    current: ProClubMatchAnalysis,
    record: ProClubAnalysisOpponentTeamRecord | null,
  ): ProClubMatchAnalysis {
    const name = record?.name ?? current.opponentSnapshot.name;
    return {
      ...current,
      matchSnapshot: { ...current.matchSnapshot, opponentName: name },
      opponentSnapshot: {
        teamId: record?.opponentId ?? null,
        name,
        logoUrl: record?.logoUrl ?? null,
      },
    };
  }

  async function uploadTeamLogo(file: File) {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const compressed = await compressProClubAnalysisLogo(file);
      const saved = await services.saveTeamLogo(clubId, compressed);
      setTeamLogo(saved);
      updateDraft((current) => current
        ? { ...current, teamSnapshot: { ...current.teamSnapshot, logoUrl: resolveProClubAnalysisTeamLogo(profileLogoUrl, saved?.logoUrl) } }
        : current);
      setMessage("Team logo saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Team logo could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTeamLogo() {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await services.saveTeamLogo(clubId, null);
      setTeamLogo(saved);
      updateDraft((current) => current
        ? { ...current, teamSnapshot: { ...current.teamSnapshot, logoUrl: resolveProClubAnalysisTeamLogo(profileLogoUrl, saved?.logoUrl) } }
        : current);
      setMessage(profileLogoUrl ? "Uploaded logo removed; club profile logo is shown." : "Team logo removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Team logo could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadOpponentLogo(file: File) {
    if (!canEdit || !analysis) return;
    setSaving(true);
    setError(null);
    try {
      const compressed = await compressProClubAnalysisLogo(file);
      const opponentId = selectedOpponentId ?? createOpponentId();
      const record = await services.saveOpponentTeam(
        clubId,
        opponentId,
        analysis.opponentSnapshot.name.trim() || "Opponent",
        compressed,
      );
      setOpponentTeams((current) => [
        ...current.filter((item) => item.opponentId !== record.opponentId),
        record,
      ]);
      setSelectedOpponentId(record.opponentId);
      updateDraft((current) => current ? makeOpponentSnapshot(current, record) : current);
      setMessage("Opponent logo saved for reuse.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Opponent logo could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeOpponentLogo() {
    if (!canEdit || !analysis) return;
    setSaving(true);
    setError(null);
    try {
      const existing = opponentTeams.find((item) => item.opponentId === selectedOpponentId);
      if (existing) {
        const record = await services.saveOpponentTeam(
          clubId,
          existing.opponentId,
          analysis.opponentSnapshot.name,
          null,
        );
        setOpponentTeams((current) => current.map((item) => item.opponentId === record.opponentId ? record : item));
        updateDraft((current) => current ? makeOpponentSnapshot(current, record) : current);
      } else {
        updateDraft((current) => current
          ? { ...current, opponentSnapshot: { ...current.opponentSnapshot, logoUrl: null } }
          : current);
      }
      setMessage("Opponent logo removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Opponent logo could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!analysis || !match || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await services.saveDraft(clubId, match.matchId, analysis, analysis.revision);
      setAnalysis(saved);
      dirtyRef.current = Boolean(saved.recoverySaveRequired);
      setDirty(dirtyRef.current);
      setMessage(saved.recoveryWarning
        ? "Draft saved · revision " + saved.revision + ". Invalid saved topic entries remain skipped."
        : "Draft saved · revision " + saved.revision + ".");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Draft could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function completeAnalysis() {
    if (!analysis || !match || !canEdit || saving || analysis.recoverySaveRequired) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const draft = analysis.revision === 0
        ? await services.saveDraft(clubId, match.matchId, analysis, 0)
        : analysis;
      const completed = await services.completeAnalysis(
        clubId,
        match.matchId,
        draft,
        draft.revision,
      );
      setAnalysis(completed);
      dirtyRef.current = false;
      setDirty(false);
      setMessage("Analysis saved as completed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTopics(topics: readonly ProClubAnalysisTopic[]) {
    if (!model || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await services.saveGameModel(clubId, topics, model.revision);
      setModel(saved);
      setAnalysis((current) => current?.revision === 0
        ? applyTemplateToUnpersistedAnalysis(current, saved.topics)
        : current);
      dirtyRef.current = analysis?.revision === 0 || dirtyRef.current;
      setDirty(dirtyRef.current);
      setShowTopicManager(false);
      setMessage("Analysis Game Model topics saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis topics could not be saved.");
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  const logoAccept = "image/png,image/jpeg,image/webp";
  const savedReportAvailable = Boolean(analysis && analysis.revision > 0 && !dirty);

  if (!authorized) {
    return (
      <section className="pro-club-analysis-workspace rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">
        <ShieldAlert className="mb-2" size={22} />
        Active Analyst, Head Coach, Assistant Coach, or Technical Director authority is required to open Analysis.
      </section>
    );
  }

  return (
    <section aria-label="Pro Club Match Analysis workspace" className="pro-club-analysis-workspace space-y-5">
      <header className="pro-club-analysis-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Opposition Analysis</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Match Analysis</h1>
            <p className="mt-1 text-sm text-slate-500">Paper-simple football analysis, saved to this match.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 text-xs font-bold text-slate-600">
              Match
              <select
                aria-label="Analysis match"
                value={selectedMatchId}
                disabled={loadingIndex || saving || matches.length === 0}
                onChange={(event) => {
                  if (saving) {
                    event.currentTarget.value = selectedMatchId;
                    return;
                  }
                  const nextMatchId = event.currentTarget.value;
                  if (
                    dirtyRef.current
                    && nextMatchId !== selectedMatchId
                    && !window.confirm("Discard unsaved Analysis changes and open another match?")
                  ) {
                    event.currentTarget.value = selectedMatchId;
                    return;
                  }
                  setSelectedMatchId(nextMatchId);
                  setView("SECTION");
                  dirtyRef.current = false;
                  setDirty(false);
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {matches.map((item) => (
                  <option key={item.matchId} value={item.matchId}>
                    {item.competitionName} · {item.opponentName || "Opponent to be confirmed"}
                  </option>
                ))}
              </select>
            </label>
            {onOpenMatches && (
              <button type="button" onClick={onOpenMatches} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">
                Matches & Starting XI
              </button>
            )}
          </div>
        </div>

        {(model?.invalidTopicCount ?? 0) > 0 && (
          <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
            {model!.invalidTopicCount} invalid saved Game Model topic(s) were skipped. Saving the topic template will remove them.
          </p>
        )}

        {match && (
          <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
            <LogoEditor
              label="Your team"
              name={authority.organizationName}
              logoUrl={effectiveTeamLogo}
              disabled={!canEdit || saving}
              accept={logoAccept}
              onUpload={uploadTeamLogo}
              onRemove={teamLogo?.logoUrl ? removeTeamLogo : undefined}
              status={teamLogo?.logoUrl ? "Saved Analysis logo" : profileLogoUrl ? "Club profile logo" : "No team logo saved"}
            />
            {analysis && (
              <LogoEditor
                label="Opponent"
                name={analysis.opponentSnapshot.name}
                logoUrl={analysis.opponentSnapshot.logoUrl}
                disabled={!canEdit || saving}
                accept={logoAccept}
                onUpload={uploadOpponentLogo}
                onRemove={analysis.opponentSnapshot.logoUrl ? removeOpponentLogo : undefined}
                status={selectedOpponentId ? "Saved for reuse" : "No opponent logo saved"}
              />
            )}
            {match.kickoffAt && (
              <div className="text-sm text-slate-600">
                <p className="font-black text-slate-900">{match.competitionName}</p>
                <p>{match.kickoffAt.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}
      </header>

      {loadingIndex && <p role="status" className="rounded-xl bg-white p-4 text-sm text-slate-600">Loading matches and Analysis template…</p>}
      {!loadingIndex && matches.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black text-slate-900">No matches yet</h2>
          <p className="mt-1 text-sm text-slate-600">Create a match first, then record its opposition analysis.</p>
          {onOpenMatches && <button type="button" onClick={onOpenMatches} className="mt-3 rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white">Open Matches</button>}
        </div>
      )}
      {loadingAnalysis && <p role="status" className="rounded-xl bg-white p-4 text-sm text-slate-600">Loading saved Analysis…</p>}

      {analysis?.recoveryWarning && !loadingAnalysis && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          {analysis.recoverySaveRequired
            ? "Some saved Analysis values were malformed and have been reset. Review the recovered sections and save the draft before completing it."
            : "Invalid frozen Game Model topic entries were skipped in this view. The saved topic snapshot remains unchanged."}
        </p>
      )}

      {analysis && !loadingAnalysis && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[
                { id: "OVERVIEW", label: "Overview", Icon: LayoutList },
                { id: "REPORT", label: "Report", Icon: FileText },
              ].map(({ id, label, Icon }) => {
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!savedReportAvailable}
                    aria-pressed={view === id}
                    onClick={() => setView(id as "OVERVIEW" | "REPORT")}
                    className="pro-club-analysis-tab inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon size={16} /> {label}
                  </button>
                );
              })}
              {dirty && <span className="self-center text-xs font-bold text-amber-700">Save draft to refresh Overview and Report.</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {view !== "SECTION" && (
                <button type="button" onClick={() => setView("SECTION")} className="pro-club-analysis-tab inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                  <PencilLine size={16} /> Back to edit
                </button>
              )}
              <button type="button" disabled={!canEdit || saving} onClick={() => void saveDraft()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                <Save size={16} /> {saving ? "Saving…" : "Save Draft"}
              </button>
              <button type="button" disabled={!canEdit || saving || Boolean(analysis.recoverySaveRequired)} onClick={() => void completeAnalysis()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                <Printer size={16} /> Save Analysis
              </button>
            </div>
          </div>

          {view === "SECTION" && (
            <>
              <nav role="tablist" aria-label="Analysis sections" className="flex gap-2 overflow-x-auto pb-1">
                {[
                  ["FORMATION_LINEUP", "Formation / Lineup"],
                  ["IN_POSSESSION_ATT", "In Possession ATT"],
                  ["OUT_DEF", "Out DEF"],
                  ["KEY_MAN", "Key Man"],
                  ["ANALYSIS", "Analysis"],
                  ["SET_PIECES", "Set Pieces"],
                  ["ATTACKING_PATTERNS", "การเข้าทำ"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeSection === id}
                    onClick={() => setActiveSection(id as typeof activeSection)}
                    className={`pro-club-analysis-tab shrink-0 rounded-xl px-3 py-2 text-sm ${activeSection === id ? "font-black text-white" : "font-bold"}`}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <section className="pro-club-analysis-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{analysis.opponentSnapshot.name}</h2>
                    <p className="text-xs text-slate-500">{analysis.matchSnapshot.competitionName} · {match?.kickoffAt?.toLocaleString() ?? "Date not set"} · {analysis.status}</p>
                  </div>
                  <button type="button" disabled={!canEdit || saving} onClick={() => setShowTopicManager(true)} className="rounded-xl border border-cyan-700 px-3 py-2 text-sm font-bold text-cyan-800 disabled:opacity-50">
                    Manage Game Model topics
                  </button>
                </div>
                <ProClubMatchAnalysisSectionEditor
                  sectionId={activeSection}
                  analysis={analysis}
                  setAnalysis={updateDraft as Dispatch<SetStateAction<ProClubMatchAnalysis | null>>}
                  disabled={!canEdit || saving}
                  topics={analysisTopics}
                  onOpponentNameChange={setOpponentName}
                />
              </section>
            </>
          )}

          {view === "OVERVIEW" && savedReportAvailable && (
            <ProClubMatchAnalysisOverview analysis={analysis} onEdit={() => setView("SECTION")} />
          )}
          {view === "REPORT" && savedReportAvailable && (
            <ProClubMatchAnalysisReport analysis={analysis} />
          )}
          {view === "OVERVIEW" && !savedReportAvailable && (
            <p className="rounded-xl bg-white p-4 text-sm text-slate-600">Save this draft to create its Overview.</p>
          )}
          {view === "REPORT" && !savedReportAvailable && (
            <p className="rounded-xl bg-white p-4 text-sm text-slate-600">Save this draft to create its printable Report.</p>
          )}
        </>
      )}

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}

      {showTopicManager && model && (
        <ProClubAnalysisTopicManager
          topics={model.topics}
          saving={saving}
          onSave={saveTopics}
          onClose={() => setShowTopicManager(false)}
        />
      )}
    </section>
  );
}

function LogoEditor({
  label,
  name,
  logoUrl,
  disabled,
  accept,
  onUpload,
  onRemove,
  status,
}: {
  label: string;
  name: string;
  logoUrl: string | null;
  disabled: boolean;
  accept: string;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => Promise<void>;
  status: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        <img src={logoUrl} alt={name + " logo"} className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1" />
      ) : (
        <span aria-label={name + " logo placeholder"} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-xs font-black text-slate-500">{name.slice(0, 2).toUpperCase()}</span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-900">{label} · {name}</p>
        <p className="text-[11px] text-slate-500">{status}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer text-xs font-bold text-cyan-800">
            Upload / replace
            <input
              type="file"
              accept={accept}
              aria-label={"Upload " + label + " logo"}
              disabled={disabled}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void onUpload(file);
              }}
              className="sr-only"
            />
          </label>
          {onRemove && (
            <button type="button" disabled={disabled} onClick={() => void onRemove()} className="text-xs font-bold text-rose-700 disabled:opacity-50">
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
