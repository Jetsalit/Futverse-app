import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FilePlus2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
} from "lucide-react";

import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import {
  approveProClubStaffSubmission,
  beginProClubStaffSubmissionReview,
  createProClubStaffSubmissionDraft,
  listMyProClubStaffSubmissions,
  listProClubStaffSubmissionsForReview,
  requestProClubStaffSubmissionRevision,
  submitProClubStaffSubmission,
  updateProClubStaffSubmissionDraftContent,
} from "../../../lib/firestore/proClubStaffSubmissionsRepository";
import {
  canAuthorProClubStaffSubmission,
  expectedProClubStaffSubmissionWorkType,
  type ProClubStaffSubmissionContentInput,
  type ProClubStaffSubmissionRecord,
  type ProClubStaffSubmissionWorkType,
} from "../../../lib/proClubStaffSubmissions";

type Mode = "AUTHOR" | "REVIEWER";

const STATUS_LABELS: Record<ProClubStaffSubmissionRecord["status"], string> = {
  DRAFT: "Draft",
  SUBMITTED: "ส่งแล้ว",
  IN_REVIEW: "กำลังตรวจ",
  NEEDS_REVISION: "ขอแก้ไข",
  APPROVED: "อนุมัติแล้ว",
  PUBLISHED: "Published",
};

const WORK_TYPE_LABELS: Record<ProClubStaffSubmissionWorkType, string> = {
  TRAINING_SUPPORT: "Training Support",
  GK_TRAINING: "GK Training",
  FITNESS: "Fitness",
  ANALYSIS: "Analysis",
  PHYSIO: "Physio",
};

export function canOpenProClubStaffSubmissions(
  authority: ProClubOrganizationAuthority,
): boolean {
  if (
    authority.organizationType !== "PRO_CLUB" ||
    authority.organizationStatus !== "ACTIVE" ||
    authority.membershipStatus !== "ACTIVE" ||
    authority.hasMembershipAuthority !== true
  ) {
    return false;
  }

  return (
    canAuthorProClubStaffSubmission(authority.staffRole) ||
    authority.staffRole === "HEAD_COACH" ||
    authority.staffRole === "TECHNICAL_DIRECTOR"
  );
}

function resolveMode(authority: ProClubOrganizationAuthority): Mode | null {
  if (canAuthorProClubStaffSubmission(authority.staffRole)) return "AUTHOR";
  if (
    authority.staffRole === "HEAD_COACH" ||
    authority.staffRole === "TECHNICAL_DIRECTOR"
  ) {
    return "REVIEWER";
  }
  return null;
}

function createSubmissionId(): string {
  if (
    typeof globalThis.crypto === "undefined" ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    throw new Error("Secure submission identity generation is unavailable.");
  }
  return `staff_submission_${globalThis.crypto.randomUUID()}`;
}

function emptyInput(
  workType: ProClubStaffSubmissionWorkType,
): ProClubStaffSubmissionContentInput {
  return {
    workType,
    title: "",
    summary: "",
    targetPlanId: null,
    targetSessionDate: null,
  };
}

function inputFromRecord(
  record: ProClubStaffSubmissionRecord,
): ProClubStaffSubmissionContentInput {
  return {
    workType: record.workType,
    title: record.title,
    summary: record.summary,
    targetPlanId: record.targetPlanId,
    targetSessionDate: record.targetSessionDate,
  };
}

function normalizeInput(
  input: ProClubStaffSubmissionContentInput,
): ProClubStaffSubmissionContentInput {
  const planId = input.targetPlanId?.trim() || null;
  return {
    ...input,
    title: input.title.trim(),
    summary: input.summary.trim(),
    targetPlanId: planId,
    targetSessionDate: planId
      ? input.targetSessionDate?.trim() || null
      : null,
  };
}

function statusClass(status: ProClubStaffSubmissionRecord["status"]): string {
  switch (status) {
    case "APPROVED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
    case "NEEDS_REVISION":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700";
    case "IN_REVIEW":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700";
    case "SUBMITTED":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700";
    default:
      return "border-slate-400/30 bg-slate-500/10 text-slate-600";
  }
}

function sortByStatus(records: readonly ProClubStaffSubmissionRecord[]) {
  const weight: Record<ProClubStaffSubmissionRecord["status"], number> = {
    SUBMITTED: 0,
    IN_REVIEW: 1,
    NEEDS_REVISION: 2,
    DRAFT: 3,
    APPROVED: 4,
    PUBLISHED: 5,
  };
  return [...records].sort(
    (a, b) => weight[a.status] - weight[b.status],
  );
}

export default function ProClubStaffSubmissions({
  authority,
  onOpenTraining,
}: {
  authority: ProClubOrganizationAuthority;
  onOpenTraining?: () => void;
}) {
  const mode = resolveMode(authority);
  const authorWorkType = expectedProClubStaffSubmissionWorkType(
    authority.staffRole,
  );

  const [records, setRecords] = useState<ProClubStaffSubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState<ProClubStaffSubmissionContentInput | null>(
    authorWorkType ? emptyInput(authorWorkType) : null,
  );
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!mode) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const next =
        mode === "AUTHOR"
          ? await listMyProClubStaffSubmissions(authority.organizationId)
          : await listProClubStaffSubmissionsForReview(
              authority.organizationId,
            );
      setRecords(sortByStatus(next));
    } catch (cause) {
      setRecords([]);
      setError(
        mode === "REVIEWER"
          ? "Review inbox ใช้งานได้เฉพาะ Technical Authority ปัจจุบันของทีม"
          : cause instanceof Error
            ? cause.message
            : "ไม่สามารถโหลดงานที่ส่งได้",
      );
    } finally {
      setLoading(false);
    }
  }, [authority.organizationId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRecords = useMemo(
    () =>
      mode === "REVIEWER"
        ? records.filter((record) => record.status !== "DRAFT")
        : records,
    [mode, records],
  );

  if (!mode || !canOpenProClubStaffSubmissions(authority)) {
    return (
      <section
        aria-label="Staff Submissions unavailable"
        className="rounded-2xl border border-slate-200 bg-white p-6"
      >
        <p className="text-sm text-slate-600">
          Staff Submissions ยังไม่เปิดสำหรับตำแหน่งนี้
        </p>
      </section>
    );
  }

  async function createDraft() {
    if (!form || !authorWorkType) return;
    setBusyId("CREATE");
    setError("");
    try {
      await createProClubStaffSubmissionDraft(
        authority.organizationId,
        createSubmissionId(),
        normalizeInput({ ...form, workType: authorWorkType }),
      );
      setForm(emptyInput(authorWorkType));
      setComposerOpen(false);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "ไม่สามารถสร้าง Draft ได้",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(record: ProClubStaffSubmissionRecord) {
    if (!form) return;
    setBusyId(record.submissionId);
    setError("");
    try {
      await updateProClubStaffSubmissionDraftContent(
        authority.organizationId,
        record.submissionId,
        normalizeInput({ ...form, workType: record.workType }),
      );
      setEditingId(null);
      setForm(authorWorkType ? emptyInput(authorWorkType) : null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "ไม่สามารถบันทึกงานได้",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function submit(record: ProClubStaffSubmissionRecord) {
    setBusyId(record.submissionId);
    setError("");
    try {
      await submitProClubStaffSubmission(
        authority.organizationId,
        record.submissionId,
      );
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "ไม่สามารถส่งงานได้",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function beginReview(record: ProClubStaffSubmissionRecord) {
    setBusyId(record.submissionId);
    setError("");
    try {
      await beginProClubStaffSubmissionReview(
        authority.organizationId,
        record.submissionId,
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "ไม่สามารถเริ่มตรวจงานได้",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function finishReview(
    record: ProClubStaffSubmissionRecord,
    action: "REVISION" | "APPROVE",
  ) {
    const note = (reviewNotes[record.submissionId] ?? "").trim();
    if (!note) {
      setError("กรุณาใส่ Review note ก่อนดำเนินการ");
      return;
    }

    setBusyId(record.submissionId);
    setError("");
    try {
      if (action === "APPROVE") {
        await approveProClubStaffSubmission(
          authority.organizationId,
          record.submissionId,
          note,
        );
      } else {
        await requestProClubStaffSubmissionRevision(
          authority.organizationId,
          record.submissionId,
          note,
        );
      }
      setReviewNotes((current) => {
        const next = { ...current };
        delete next[record.submissionId];
        return next;
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "ไม่สามารถบันทึกผลตรวจได้",
      );
    } finally {
      setBusyId(null);
    }
  }

  function edit(record: ProClubStaffSubmissionRecord) {
    setEditingId(record.submissionId);
    setForm(inputFromRecord(record));
    setComposerOpen(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(authorWorkType ? emptyInput(authorWorkType) : null);
  }

  return (
    <section
      aria-labelledby="pro-club-staff-submissions"
      className="space-y-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="pro-club-accent text-xs font-bold uppercase tracking-[0.18em]">
            Football Operations
          </p>
          <h3
            id="pro-club-staff-submissions"
            className="pro-club-heading mt-2 text-2xl font-black"
          >
            {mode === "AUTHOR" ? "My Work / ส่งงาน" : "งานที่ส่งมา / Submissions"}
          </h3>
          <p className="pro-club-muted mt-2 max-w-3xl text-sm leading-6">
            {mode === "AUTHOR"
              ? "สร้างงานตามตำแหน่ง ส่งให้ Technical Authority ตรวจ และติดตามสถานะจากจุดเดียว"
              : "ตรวจงานที่ Staff ส่งมา ขอแก้ไข หรืออนุมัติตาม Technical Governance ของทีม"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          {mode === "AUTHOR" && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(
                  authorWorkType ? emptyInput(authorWorkType) : null,
                );
                setComposerOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white"
            >
              <FilePlus2 size={16} />
              สร้างงานใหม่
            </button>
          )}
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"
        >
          {error}
        </p>
      )}

      {mode === "AUTHOR" && composerOpen && form && authorWorkType && (
        <SubmissionEditor
          heading="สร้าง Draft ใหม่"
          form={form}
          workType={authorWorkType}
          busy={busyId === "CREATE"}
          onChange={setForm}
          onCancel={() => {
            setComposerOpen(false);
            setForm(emptyInput(authorWorkType));
          }}
          onSave={() => void createDraft()}
          saveLabel="บันทึก Draft"
        />
      )}

      {loading ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600"
        >
          <Loader2 className="animate-spin" size={18} />
          กำลังโหลด Staff Submissions…
        </div>
      ) : visibleRecords.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <ClipboardList className="mx-auto text-slate-400" size={28} />
          <p className="mt-3 font-bold text-slate-700">
            {mode === "AUTHOR"
              ? "ยังไม่มีงานใน My Work"
              : "ยังไม่มีงานที่ส่งเข้ามา"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleRecords.map((record) => {
            const editing = editingId === record.submissionId;
            const busy = busyId === record.submissionId;

            if (mode === "AUTHOR" && editing && form) {
              return (
                <SubmissionEditor
                  key={record.submissionId}
                  heading={`แก้ไข · ${record.title}`}
                  form={form}
                  workType={record.workType}
                  busy={busy}
                  reviewNote={record.reviewNote}
                  onChange={setForm}
                  onCancel={cancelEdit}
                  onSave={() => void saveEdit(record)}
                  saveLabel="บันทึกการแก้ไข"
                />
              );
            }

            return (
              <article
                key={record.submissionId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClass(record.status)}`}
                      >
                        {STATUS_LABELS[record.status]}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        {WORK_TYPE_LABELS[record.workType]}
                      </span>
                    </div>
                    <h4 className="mt-3 text-lg font-black text-slate-900">
                      {record.title}
                    </h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {record.summary}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                  {mode === "REVIEWER" && (
                    <span>
                      Staff: <strong>{record.authorRole}</strong>
                    </span>
                  )}
                  <span>
                    Training plan:{" "}
                    <strong>{record.targetPlanId ?? "Not linked"}</strong>
                  </span>
                  <span>
                    Session date:{" "}
                    <strong>{record.targetSessionDate ?? "Not linked"}</strong>
                  </span>
                </div>

                {record.reviewNote && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-black uppercase tracking-wide text-amber-800">
                      Review note
                    </p>
                    <p className="mt-1 text-sm text-amber-900">
                      {record.reviewNote}
                    </p>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {record.targetPlanId && onOpenTraining && (
                    <button
                      type="button"
                      onClick={onOpenTraining}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700"
                    >
                      <ExternalLink size={15} />
                      เปิด Training
                    </button>
                  )}

                  {mode === "AUTHOR" &&
                    (record.status === "DRAFT" ||
                      record.status === "NEEDS_REVISION") && (
                      <>
                        <button
                          type="button"
                          onClick={() => edit(record)}
                          disabled={busy}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => void submit(record)}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="animate-spin" size={15} />
                          ) : (
                            <Send size={15} />
                          )}
                          ส่งงาน
                        </button>
                      </>
                    )}

                  {mode === "REVIEWER" && record.status === "SUBMITTED" && (
                    <button
                      type="button"
                      onClick={() => void beginReview(record)}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="animate-spin" size={15} />
                      ) : (
                        <ShieldCheck size={15} />
                      )}
                      เริ่มตรวจ
                    </button>
                  )}
                </div>

                {mode === "REVIEWER" && record.status === "IN_REVIEW" && (
                  <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <label
                      htmlFor={`review-note-${record.submissionId}`}
                      className="text-sm font-black text-slate-700"
                    >
                      Review note
                    </label>
                    <textarea
                      id={`review-note-${record.submissionId}`}
                      value={reviewNotes[record.submissionId] ?? ""}
                      onChange={(event) =>
                        setReviewNotes((current) => ({
                          ...current,
                          [record.submissionId]: event.target.value,
                        }))
                      }
                      maxLength={2000}
                      rows={3}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void finishReview(record, "REVISION")
                        }
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-400 px-3 py-2 text-sm font-black text-amber-800 disabled:opacity-50"
                      >
                        <RotateCcw size={15} />
                        ขอแก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void finishReview(record, "APPROVE")
                        }
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
                      >
                        <CheckCircle2 size={15} />
                        อนุมัติ
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SubmissionEditor({
  heading,
  form,
  workType,
  busy,
  reviewNote,
  onChange,
  onCancel,
  onSave,
  saveLabel,
}: {
  heading: string;
  form: ProClubStaffSubmissionContentInput;
  workType: ProClubStaffSubmissionWorkType;
  busy: boolean;
  reviewNote?: string | null;
  onChange: (next: ProClubStaffSubmissionContentInput) => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <article className="rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm">
      <h4 className="text-lg font-black text-slate-900">{heading}</h4>
      <p className="mt-1 text-xs font-bold text-cyan-700">
        {WORK_TYPE_LABELS[workType]}
      </p>

      {reviewNote && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Review note:</strong> {reviewNote}
        </div>
      )}

      <div className="mt-4 grid gap-4">
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">
          ชื่องาน
          <input
            value={form.title}
            onChange={(event) =>
              onChange({ ...form, title: event.target.value })
            }
            maxLength={160}
            className="rounded-xl border border-slate-300 px-3 py-2 font-normal text-slate-900"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-slate-700">
          รายละเอียด
          <textarea
            value={form.summary}
            onChange={(event) =>
              onChange({ ...form, summary: event.target.value })
            }
            maxLength={5000}
            rows={5}
            className="rounded-xl border border-slate-300 px-3 py-2 font-normal text-slate-900"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Training Plan ID (ถ้ามี)
            <input
              value={form.targetPlanId ?? ""}
              onChange={(event) =>
                onChange({
                  ...form,
                  targetPlanId: event.target.value || null,
                  targetSessionDate: event.target.value
                    ? form.targetSessionDate
                    : null,
                })
              }
              className="rounded-xl border border-slate-300 px-3 py-2 font-normal text-slate-900"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Session date (ถ้ามี)
            <input
              type="date"
              disabled={!form.targetPlanId}
              value={form.targetSessionDate ?? ""}
              onChange={(event) =>
                onChange({
                  ...form,
                  targetSessionDate: event.target.value || null,
                })
              }
              className="rounded-xl border border-slate-300 px-3 py-2 font-normal text-slate-900 disabled:bg-slate-100"
            />
          </label>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
        >
          {busy && <Loader2 className="animate-spin" size={15} />}
          {saveLabel}
        </button>
      </div>
    </article>
  );
}
