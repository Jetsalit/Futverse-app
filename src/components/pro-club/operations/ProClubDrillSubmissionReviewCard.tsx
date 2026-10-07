import { useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import type { ProClubDrillSubmissionInboxRecord } from "../../../lib/firestore/proClubDrillSubmissionsRepository";
import SubmittedWorkViewer from "../../common/SubmittedWorkViewer";

export type ProClubDrillSubmissionReviewDecision = "NEEDS_REVISION" | "APPROVED";

const STATUS_LABELS: Record<ProClubDrillSubmissionInboxRecord["effectiveStatus"], string> = {
  SUBMITTED: "Submitted",
  IN_REVIEW: "In Review",
  NEEDS_REVISION: "Changes Requested",
  APPROVED: "Approved",
};

const STATUS_STYLES: Record<ProClubDrillSubmissionInboxRecord["effectiveStatus"], string> = {
  SUBMITTED: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  IN_REVIEW: "border-cyan-500/30 bg-cyan-500/10 text-cyan-500",
  NEEDS_REVISION: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  APPROVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
};

export default function ProClubDrillSubmissionReviewCard({
  record,
  mode,
  currentUid,
  busy = false,
  onBeginReview,
  onDecision,
}: {
  record: ProClubDrillSubmissionInboxRecord;
  mode: "AUTHOR" | "REVIEWER";
  currentUid: string;
  busy?: boolean;
  onBeginReview?: (record: ProClubDrillSubmissionInboxRecord) => void;
  onDecision?: (
    record: ProClubDrillSubmissionInboxRecord,
    decision: ProClubDrillSubmissionReviewDecision,
    note: string,
  ) => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const mayReview = mode === "REVIEWER" && record.submittedBy !== currentUid;
  const inReview = record.effectiveStatus === "IN_REVIEW";
  const note = reviewNote.trim();

  return (
    <article
      className={mode === "REVIEWER"
        ? "rounded-2xl border border-[color:var(--pc-border)] border-l-4 border-l-cyan-500 bg-[var(--pc-surface)] p-5 shadow-[var(--pc-glow)]"
        : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"}
      data-testid="pro-club-drill-submission-card"
      data-submission-id={record.id}
      data-submission-status={record.effectiveStatus}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-lg font-black text-[color:var(--pc-text)]">
            {record.snapshot.details.title}
          </h4>
          <p className="mt-1 text-xs text-[color:var(--pc-muted)]">
            Sender: <span className="font-semibold text-emerald-500">{record.submittedBy}</span>
          </p>
          <p className="mt-1 text-xs text-[color:var(--pc-muted)]">
            Role: <span className="font-semibold text-emerald-500">{record.sourceCreatorRoleAtSubmission.split("_").join(" ")}</span>
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${STATUS_STYLES[record.effectiveStatus]}`}>
          {STATUS_LABELS[record.effectiveStatus]}
        </span>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setViewerOpen((open) => !open)}
          aria-expanded={viewerOpen}
          className="rounded-xl border border-cyan-500/40 px-3 py-2 text-sm font-bold text-cyan-600 transition hover:bg-cyan-500/10"
        >
          {viewerOpen ? "Close submitted drill" : "Open submitted drill"}
        </button>
        {mayReview && record.effectiveStatus === "SUBMITTED" && viewerOpen ? (
          <button
            type="button"
            onClick={() => onBeginReview?.(record)}
            disabled={busy || !onBeginReview}
            className="rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            Begin review
          </button>
        ) : null}
      </div>

      {viewerOpen ? (
        <div className="mt-4 rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface-soft)] p-4">
          <SubmittedWorkViewer snapshot={record.snapshot} />
        </div>
      ) : null}

      {record.review?.reviewNote ? (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700">Review note</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{record.review.reviewNote}</p>
        </div>
      ) : null}

      {mayReview && inReview && viewerOpen ? (
        <div className="mt-4 space-y-3 rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface-soft)] p-4">
          <label
            htmlFor={`drill-review-note-${record.id}`}
            className="text-sm font-black text-[color:var(--pc-text)]"
          >
            Review note
          </label>
          <textarea
            id={`drill-review-note-${record.id}`}
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full rounded-xl border border-[color:var(--pc-border)] bg-[var(--pc-surface)] px-3 py-2 text-sm text-[color:var(--pc-text)] outline-none focus:border-cyan-400/70"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onDecision?.(record, "NEEDS_REVISION", note)}
              disabled={busy || note.length === 0 || !onDecision}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-400 px-3 py-2 text-sm font-black text-amber-700 disabled:opacity-50"
            >
              <RotateCcw size={15} /> Request changes
            </button>
            <button
              type="button"
              onClick={() => onDecision?.(record, "APPROVED", note)}
              disabled={busy || note.length === 0 || !onDecision}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              <CheckCircle2 size={15} /> Approve
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
