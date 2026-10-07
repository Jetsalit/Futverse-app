import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { createProClubDrillSubmission } from "../../../lib/firestore/proClubDrillSubmissionsRepository";

function createSubmissionId(): string {
  if (
    typeof globalThis.crypto === "undefined" ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    throw new Error("Secure drill submission identity generation is unavailable.");
  }
  return `drill_submission_${globalThis.crypto.randomUUID()}`;
}

export default function ProClubDrillSubmissionSendButton({
  organizationId,
  sourceDrillId,
}: {
  organizationId: string;
  sourceDrillId: string;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function sendSelectedDrill() {
    if (sending) return;
    setSending(true);
    setError("");
    setSent(false);
    try {
      const submissionId = createSubmissionId();
      await createProClubDrillSubmission(
        organizationId,
        submissionId,
        sourceDrillId,
      );
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to send this drill.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void sendSelectedDrill()}
        disabled={sending}
        className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white transition hover:bg-cyan-500 disabled:cursor-wait disabled:opacity-60"
      >
        {sending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
        {sending ? "Sending…" : "Send Work"}
      </button>
      {sent ? <span role="status" className="text-xs font-bold text-emerald-500">Submitted</span> : null}
      {error ? <span role="alert" className="text-xs font-semibold text-rose-500">{error}</span> : null}
    </span>
  );
}
