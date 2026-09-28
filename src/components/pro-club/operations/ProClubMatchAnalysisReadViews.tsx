import type { ReactNode } from "react";
import {
  PRO_CLUB_ANALYSIS_ATTACKING_PATTERNS,
  PRO_CLUB_ANALYSIS_SECTIONS,
  type ProClubAnalysisKeyMan,
  type ProClubAnalysisTopicSnapshot,
  type ProClubAnalysisTopicValue,
  type ProClubMatchAnalysis,
} from "../../../lib/proClubMatchAnalysis";
import { getProClubAnalysisRatingClass } from "./proClubTheme";

const sectionTitle = new Map(
  PRO_CLUB_ANALYSIS_SECTIONS.map(({ id, label }) => [id, label]),
);

function TeamBadge({
  name,
  logoUrl,
  label,
}: {
  name: string;
  logoUrl: string | null;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={label}
          className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1"
        />
      ) : (
        <span
          aria-label={label}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-xs font-black text-slate-500"
        >
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="truncate font-black">{name}</span>
    </div>
  );
}

function SectionCard({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      data-section={id}
      aria-labelledby={"analysis-overview-" + id}
      className="pro-club-analysis-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid"
    >
      <h3 id={"analysis-overview-" + id} className="text-lg font-black text-slate-900">
        {title}
      </h3>
      <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">{children}</div>
    </section>
  );
}

function TextFinding({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-slate-900">{value || "—"}</dd>
    </div>
  );
}

function topicValueLabel(
  topic: ProClubAnalysisTopicSnapshot,
  value: ProClubAnalysisTopicValue,
): string {
  if (topic.inputType === "CHECKBOX") return value === true ? "Yes" : "No";
  if (value === null || value === "") return "—";
  return String(value);
}

function TopicFindings({
  analysis,
  sectionId,
}: {
  analysis: ProClubMatchAnalysis;
  sectionId: "IN_POSSESSION_ATT" | "OUT_DEF";
}) {
  const section = analysis.sections[sectionId];
  const topics = analysis.topicSnapshot
    .filter((topic) => topic.section === sectionId && topic.includeInAnalysis)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <>
      {topics.length > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {topics.map((topic) => (
            <TopicFinding
              key={topic.id}
              topic={topic}
              value={section.topicValues[topic.id] ?? null}
            />
          ))}
        </dl>
      ) : (
        <p className="text-slate-500">No Game Model topics are included in Analysis.</p>
      )}
      <TextFinding label="Notes" value={section.notes} />
    </>
  );
}

function TopicFinding({
  topic,
  value,
}: {
  topic: ProClubAnalysisTopicSnapshot;
  value: ProClubAnalysisTopicValue;
}) {
  const label = topicValueLabel(topic, value);
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="font-bold text-slate-500">{topic.displayLabel || topic.name}</dt>
      <dd className="text-slate-900">
        {topic.inputType === "RATING" ? (
          <span data-rating={typeof value === "number" ? value : "neutral"} className={`${getProClubAnalysisRatingClass(typeof value === "number" ? value : null)} px-2 py-0.5`}>
            {label}{typeof value === "number" ? " / 5" : ""}
          </span>
        ) : label}
      </dd>
    </div>
  );
}

function RatingFinding({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <span data-rating={value ?? "neutral"} className={`${getProClubAnalysisRatingClass(value)} px-2 py-0.5`}>
        {value ?? "—"}
      </span>
    </span>
  );
}

function KeyManList({ players }: { players: readonly ProClubAnalysisKeyMan[] }) {
  if (players.length === 0) return <p className="text-slate-500">No key men recorded.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {players.map((player) => (
        <article key={player.id} className="rounded-xl bg-slate-50 p-3">
          <p className="font-black text-slate-900">
            {player.name}
            {player.jerseyNumber === null ? "" : " · #" + player.jerseyNumber}
            {player.position ? " · " + player.position : ""}
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <RatingFinding label="Danger" value={player.dangerLevel} />
            <RatingFinding label="Pace" value={player.pace} />
            <RatingFinding label="Aerial" value={player.aerialThreat} />
            <RatingFinding label="1v1" value={player.oneVsOne} />
            <RatingFinding label="Work rate" value={player.workRate} />
          </p>
          <p><strong>Strengths:</strong> {player.strengths || "—"}</p>
          <p><strong>Weaknesses:</strong> {player.weaknesses || "—"}</p>
          <p className="whitespace-pre-wrap">{player.notes || "—"}</p>
        </article>
      ))}
    </div>
  );
}

function OpponentPitch({ analysis }: { analysis: ProClubMatchAnalysis }) {
  const lineup = analysis.sections.FORMATION_LINEUP;
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-xl overflow-hidden rounded-2xl border-2 border-emerald-900 bg-emerald-700 text-white">
      <div className="absolute inset-3 rounded-xl border border-white/55" />
      <div className="absolute left-1/2 top-1/2 h-px w-[calc(100%-24px)] -translate-x-1/2 bg-white/50" />
      <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
      {lineup.slots.map((slot) => (
        <div
          key={slot.slotIndex}
          className="absolute z-10 flex max-w-[24%] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
          style={{ left: slot.x + "%", top: slot.y + "%" }}
        >
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-slate-900 px-1 text-[10px] font-black">
            {slot.jerseyNumber === null ? slot.position : `#${slot.jerseyNumber} · ${slot.position}`}
          </span>
          {slot.playerName && <span className="max-w-full truncate rounded bg-slate-950/80 px-1 text-[9px] font-bold">{slot.playerName}</span>}
        </div>
      ))}
    </div>
  );
}

function AnalysisContent({ analysis }: { analysis: ProClubMatchAnalysis }) {
  const lineup = analysis.sections.FORMATION_LINEUP;
  const summary = analysis.sections.ANALYSIS;
  const setPieces = analysis.sections.SET_PIECES;
  const patterns = analysis.sections.ATTACKING_PATTERNS;
  const summaryTopics = analysis.topicSnapshot
    .filter((topic) => topic.includeInSummary)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const matchDate = analysis.matchSnapshot.kickoffAt
    ? new Date(analysis.matchSnapshot.kickoffAt).toLocaleString()
    : "Date not set";

  return (
    <>
      <header className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <TeamBadge
            name={analysis.teamSnapshot.name}
            logoUrl={analysis.teamSnapshot.logoUrl}
            label={analysis.teamSnapshot.name + " logo"}
          />
          <span className="text-center text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            Match Analysis
          </span>
          <TeamBadge
            name={analysis.opponentSnapshot.name}
            logoUrl={analysis.opponentSnapshot.logoUrl}
            label={analysis.opponentSnapshot.name + " logo"}
          />
        </div>
        <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
          <TextFinding label="Competition" value={analysis.matchSnapshot.competitionName} />
          <TextFinding label="Match date" value={matchDate} />
          <TextFinding label="Analysis status" value={analysis.status} />
        </dl>
      </header>

      <SectionCard id="FORMATION_LINEUP" title={sectionTitle.get("FORMATION_LINEUP")!}>
        <p><strong>Opponent formation:</strong> {lineup.formation === "CUSTOM" ? "Custom" : lineup.formation}</p>
        <OpponentPitch analysis={analysis} />
        <div className="grid gap-2 sm:grid-cols-2">
          {lineup.slots.map((slot) => (
            <p key={slot.slotIndex}>
              <strong>{slot.label}:</strong> {slot.playerName || "—"}
              {slot.jerseyNumber === null ? "" : " · #" + slot.jerseyNumber}
              {slot.notes ? " · " + slot.notes : ""}
            </p>
          ))}
        </div>
        <TextFinding label="Lineup notes" value={lineup.notes} />
      </SectionCard>

      <SectionCard id="IN_POSSESSION_ATT" title={sectionTitle.get("IN_POSSESSION_ATT")!}>
        <TopicFindings analysis={analysis} sectionId="IN_POSSESSION_ATT" />
      </SectionCard>
      <SectionCard id="OUT_DEF" title={sectionTitle.get("OUT_DEF")!}>
        <TopicFindings analysis={analysis} sectionId="OUT_DEF" />
      </SectionCard>
      <SectionCard id="KEY_MAN" title={sectionTitle.get("KEY_MAN")!}>
        <KeyManList players={analysis.sections.KEY_MAN.players} />
      </SectionCard>
      <SectionCard id="ANALYSIS" title={sectionTitle.get("ANALYSIS")!}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <TextFinding label="Strengths" value={summary.strengths} />
          <TextFinding label="Weaknesses" value={summary.weaknesses} />
          <TextFinding label="Key observations" value={summary.keyObservations} />
          <TextFinding label="Key threats" value={summary.keyThreats} />
          <TextFinding label="Areas to exploit" value={summary.areasToExploit} />
          <TextFinding label="Tactical notes" value={summary.tacticalNotes} />
        </dl>
        {summaryTopics.length > 0 && (
          <div>
            <h4 className="font-black text-slate-800">Game Model summary</h4>
            <dl className="mt-2 grid gap-3 sm:grid-cols-2">
              {summaryTopics.map((topic) => (
                <TopicFinding
                  key={topic.id}
                  topic={topic}
                  value={analysis.sections[topic.section].topicValues[topic.id] ?? null}
                />
              ))}
            </dl>
          </div>
        )}
      </SectionCard>
      <SectionCard id="SET_PIECES" title={sectionTitle.get("SET_PIECES")!}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <TextFinding label="Attacking corners" value={setPieces.attackingCorners} />
          <TextFinding label="Defending corners" value={setPieces.defendingCorners} />
          <TextFinding label="Free kicks" value={setPieces.freeKicks} />
          <TextFinding label="Throw-ins" value={setPieces.throwIns} />
          <TextFinding label="Penalties" value={setPieces.penalties} />
        </dl>
      </SectionCard>
      <SectionCard id="ATTACKING_PATTERNS" title={sectionTitle.get("ATTACKING_PATTERNS")!}>
        <p>
          <strong>Patterns:</strong>{" "}
          {patterns.selected.length
            ? patterns.selected.map((id) =>
                PRO_CLUB_ANALYSIS_ATTACKING_PATTERNS.find((item) => item.id === id)?.label ?? id,
              ).join(", ")
            : "—"}
        </p>
        <TextFinding label="Notes" value={patterns.notes} />
      </SectionCard>
    </>
  );
}

export function ProClubMatchAnalysisOverview({
  analysis,
  onEdit,
}: {
  analysis: ProClubMatchAnalysis;
  onEdit?: () => void;
}) {
  return (
    <div aria-label="Analysis Overview" className="pro-club-analysis-workspace space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-slate-900">Overview</h2>
        {onEdit && (
          <button type="button" onClick={onEdit} className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white">
            Edit Analysis
          </button>
        )}
      </div>
      <AnalysisContent analysis={analysis} />
    </div>
  );
}

export function ProClubMatchAnalysisReport({
  analysis,
  onPrint,
}: {
  analysis: ProClubMatchAnalysis;
  onPrint?: () => void;
}) {
  function printReport() {
    if (onPrint) onPrint();
    else if (typeof window !== "undefined") window.print();
  }

  return (
    <article className="pro-club-analysis-workspace pro-club-analysis-report mx-auto max-w-5xl space-y-4 p-2">
      <div className="pro-club-analysis-no-print flex items-center justify-between gap-3">
        <h2 className="text-2xl font-black">Report</h2>
        <button
          type="button"
          onClick={printReport}
          className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white"
        >
          Print or Save as PDF
        </button>
      </div>
      <AnalysisContent analysis={analysis} />
    </article>
  );
}
