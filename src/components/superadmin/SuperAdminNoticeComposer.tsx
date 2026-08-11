import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Megaphone, Send, Users, X } from "lucide-react";
import type { User, UserRole } from "../../contexts/AuthContext";
import type { AcademyDirectoryItem } from "./dashboardModel";
import {
  NOTICE_MESSAGE_MAX_LENGTH,
  NOTICE_TITLE_MAX_LENGTH,
  listActiveNoticeRecipients,
  resolveNoticeRecipients,
  type NoticeAudienceKind,
  type NoticeAudienceSelection,
  type NoticeSendRequest,
  type NoticeSendSummary,
} from "./noticeAudience";

interface SuperAdminNoticeComposerProps {
  isOpen: boolean;
  users: readonly User[];
  academies: readonly AcademyDirectoryItem[];
  academyByUid: ReadonlyMap<string, string>;
  academyTargetingAvailable: boolean;
  onClose: () => void;
  onSend: (request: NoticeSendRequest) => Promise<NoticeSendSummary>;
}

const AUDIENCE_LABELS: Readonly<Record<NoticeAudienceKind, string>> = {
  individual: "Individual User",
  role: "Authoritative Account Role",
  academy: "Academy",
  academy_role: "Academy + Authoritative Account Role",
  all_active: "All Active Users",
};

export default function SuperAdminNoticeComposer({
  isOpen,
  users,
  academies,
  academyByUid,
  academyTargetingAvailable,
  onClose,
  onSend,
}: SuperAdminNoticeComposerProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audienceKind, setAudienceKind] = useState<NoticeAudienceKind>("individual");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole | "">("");
  const [selectedAcademyId, setSelectedAcademyId] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sendSummary, setSendSummary] = useState<NoticeSendSummary | null>(null);

  const activeRecipients = useMemo(
    () => listActiveNoticeRecipients(users, academyByUid),
    [academyByUid, users],
  );
  const roleOptions = useMemo(
    () => Array.from(new Set(activeRecipients.map((recipient) => recipient.role))).sort(),
    [activeRecipients],
  );

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setMessage("");
    setAudienceKind("individual");
    setSelectedUserId(activeRecipients[0]?.uid || "");
    setSelectedRole(roleOptions[0] || "");
    setSelectedAcademyId(academies[0]?.id || "");
    setIsConfirming(false);
    setIsSending(false);
    setErrorMessage("");
    setSendSummary(null);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !selectedUserId && activeRecipients[0]) {
      setSelectedUserId(activeRecipients[0].uid);
    }
    if (isOpen && !selectedRole && roleOptions[0]) {
      setSelectedRole(roleOptions[0]);
    }
    if (isOpen && !selectedAcademyId && academies[0]) {
      setSelectedAcademyId(academies[0].id);
    }
  }, [academies, activeRecipients, isOpen, roleOptions, selectedAcademyId, selectedRole, selectedUserId]);

  const selection = useMemo<NoticeAudienceSelection>(() => ({
    kind: audienceKind,
    userId: selectedUserId || undefined,
    role: selectedRole || undefined,
    academyId: selectedAcademyId || undefined,
  }), [audienceKind, selectedAcademyId, selectedRole, selectedUserId]);

  const academyAudienceSelected = audienceKind === "academy" || audienceKind === "academy_role";
  const recipients = useMemo(
    () => academyAudienceSelected && !academyTargetingAvailable
      ? []
      : resolveNoticeRecipients(users, selection, academyByUid),
    [academyAudienceSelected, academyByUid, academyTargetingAvailable, selection, users],
  );
  const recipientSignature = useMemo(
    () => recipients.map((recipient) => recipient.uid).join("\u0000"),
    [recipients],
  );

  useEffect(() => {
    setIsConfirming(false);
    setSendSummary(null);
  }, [recipientSignature]);

  if (!isOpen) return null;

  const resetReview = () => {
    setIsConfirming(false);
    setErrorMessage("");
    setSendSummary(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSending) return;

    const trimmedTitle = title.trim();
    const trimmedMessage = message.trim();
    if (!trimmedTitle) {
      setErrorMessage("Title is required.");
      return;
    }
    if (!trimmedMessage) {
      setErrorMessage("Message is required.");
      return;
    }
    if (recipients.length === 0) {
      setErrorMessage("No active recipients match this audience.");
      return;
    }
    if (!isConfirming) {
      setErrorMessage("");
      setIsConfirming(true);
      return;
    }

    setIsSending(true);
    setErrorMessage("");
    setSendSummary(null);
    try {
      const summary = await onSend({
        title: trimmedTitle,
        message: trimmedMessage,
        recipientUids: recipients.map((recipient) => recipient.uid),
        academyId: audienceKind === "academy" || audienceKind === "academy_role"
          ? selectedAcademyId
          : undefined,
      });
      setSendSummary(summary);
      setIsConfirming(false);
    } catch (error) {
      console.error("Unable to create SuperAdmin notifications", error);
      setErrorMessage("Notification creation failed. No delivery or read status is available.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="superadmin-notice-title"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <Megaphone size={20} />
            </span>
            <div>
              <h2 id="superadmin-notice-title" className="text-lg font-black text-slate-900">Send Notice</h2>
              <p className="mt-1 text-xs text-slate-500">Creates one notification document for each selected active user.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            aria-label="Close notice composer"
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={19} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">Title</span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                resetReview();
              }}
              maxLength={NOTICE_TITLE_MAX_LENGTH}
              disabled={isSending}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50"
              placeholder="Notice title"
            />
            <span className="mt-1 block text-right text-[11px] text-slate-400">{title.length}/{NOTICE_TITLE_MAX_LENGTH}</span>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">Message</span>
            <textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                resetReview();
              }}
              maxLength={NOTICE_MESSAGE_MAX_LENGTH}
              rows={5}
              disabled={isSending}
              className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50"
              placeholder="Write the notice message"
            />
            <span className="mt-1 block text-right text-[11px] text-slate-400">{message.length}/{NOTICE_MESSAGE_MAX_LENGTH}</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">Audience</span>
              <select
                value={audienceKind}
                onChange={(event) => {
                  setAudienceKind(event.target.value as NoticeAudienceKind);
                  resetReview();
                }}
                disabled={isSending}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none focus:border-emerald-400"
              >
                {(Object.keys(AUDIENCE_LABELS) as NoticeAudienceKind[]).map((kind) => (
                  <option
                    key={kind}
                    value={kind}
                    disabled={!academyTargetingAvailable && (kind === "academy" || kind === "academy_role")}
                  >
                    {AUDIENCE_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>

            {audienceKind === "individual" && (
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">User</span>
                <select
                  value={selectedUserId}
                  onChange={(event) => {
                    setSelectedUserId(event.target.value);
                    resetReview();
                  }}
                  disabled={isSending}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none focus:border-emerald-400"
                >
                  {activeRecipients.map((recipient) => (
                    <option key={recipient.uid} value={recipient.uid}>
                      {recipient.name}{recipient.email ? ` — ${recipient.email}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {(audienceKind === "role" || audienceKind === "academy_role") && (
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">Effective Role</span>
                <select
                  value={selectedRole}
                  onChange={(event) => {
                    setSelectedRole(event.target.value as UserRole);
                    resetReview();
                  }}
                  disabled={isSending}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none focus:border-emerald-400"
                >
                  {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
            )}

            {(audienceKind === "academy" || audienceKind === "academy_role") && (
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">Academy</span>
                <select
                  value={selectedAcademyId}
                  onChange={(event) => {
                    setSelectedAcademyId(event.target.value);
                    resetReview();
                  }}
                  disabled={isSending || !academyTargetingAvailable}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none focus:border-emerald-400 disabled:bg-slate-50"
                >
                  {academies.map((academy) => <option key={academy.id} value={academy.id}>{academy.name}</option>)}
                </select>
              </label>
            )}
          </div>

          {!academyTargetingAvailable && (
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              Academy targeting is unavailable until the existing academy resolution has loaded. No additional query will be made.
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-black text-slate-800"><Users size={17} /> Recipients</span>
              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">{recipients.length}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">Only active accounts with a valid Firebase UID are included.</p>
            {recipients.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                {recipients.slice(0, 5).map((recipient) => (
                  <li key={recipient.uid} className="truncate">• {recipient.name}{recipient.email ? ` (${recipient.email})` : ""} — {recipient.role}</li>
                ))}
                {recipients.length > 5 && <li className="font-bold text-slate-500">+ {recipients.length - 5} more</li>}
              </ul>
            )}
          </div>

          {isConfirming && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-black">Confirm notification creation</p>
              <p className="mt-1 text-xs leading-relaxed">Create notifications for {recipients.length} recipient{recipients.length === 1 ? "" : "s"}? This confirms document creation only, not delivery, receipt, or reading.</p>
            </div>
          )}

          {sendSummary && (
            <div className={`rounded-2xl border p-4 text-sm ${sendSummary.failed > 0 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
              <p className="font-black">{sendSummary.failed > 0 ? "Partial success" : "Notification creation complete"}</p>
              <p className="mt-1">Notifications created: {sendSummary.created}</p>
              <p>Failed: {sendSummary.failed}</p>
              <p className="mt-1 text-xs">Processed in {sendSummary.batches.length} batch{sendSummary.batches.length === 1 ? "" : "es"}.</p>
              {sendSummary.batches.length > 1 && (
                <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs">
                  {sendSummary.batches.map((batch) => (
                    <li key={batch.batchNumber}>
                      Batch {batch.batchNumber}: {batch.created} created, {batch.failed} failed
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {errorMessage && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{errorMessage}</p>}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendSummary ? "Close" : "Cancel"}
            </button>
            {!sendSummary && (
              <button
                type="submit"
                disabled={isSending || recipients.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSending ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
                {isSending ? "Creating notifications..." : isConfirming ? "Confirm & Send" : "Send"}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
