import { useState } from "react";
import { ArrowLeft, CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  buildProPlayerOnboardingV1FromDraft,
  createEmptyProPlayerCareerHistoryDraftV1,
  createInitialProPlayerOnboardingDraftV1,
  PRO_PLAYER_ACTIVE_LEAGUE_OPTIONS_V1,
  PRO_PLAYER_POSITION_OPTIONS_V1,
  type ProPlayerOnboardingDraftV1,
  type ProPlayerOnboardingFormErrorsV1,
} from "../lib/proPlayerOnboardingFormV1";
import type { ProPlayerOnboardingV1 } from "../lib/proPlayerOnboardingV1";

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const labelClass = "mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs font-semibold text-rose-600">{message}</p> : null;
}

export default function ProPlayerOnboardingV1Form({ onBack }: { onBack: () => void }) {
  const [draft, setDraft] = useState<ProPlayerOnboardingDraftV1>(() => createInitialProPlayerOnboardingDraftV1());
  const [errors, setErrors] = useState<ProPlayerOnboardingFormErrorsV1>({});
  const [reviewProfile, setReviewProfile] = useState<ProPlayerOnboardingV1 | null>(null);

  const update = <K extends keyof ProPlayerOnboardingDraftV1>(key: K, value: ProPlayerOnboardingDraftV1[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current) && !current._form) return current;
      const next = { ...current };
      delete next[String(key)];
      delete next._form;
      return next;
    });
  };

  const updateCareer = (index: number, key: string, value: string) => {
    setDraft((current) => ({
      ...current,
      careerHistory: current.careerHistory.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [key]: value } : entry,
      ),
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[`careerHistory.${index}.${key}`];
      delete next._form;
      return next;
    });
  };

  const submitForReview = (event: React.FormEvent) => {
    event.preventDefault();
    const result = buildProPlayerOnboardingV1FromDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      setReviewProfile(null);
      return;
    }
    setErrors({});
    setReviewProfile(result.profile);
  };

  if (reviewProfile) {
    return (
      <section className="mx-auto w-full max-w-4xl space-y-5 pb-24" aria-labelledby="pro-player-review-title">
        <button type="button" onClick={() => setReviewProfile(null)} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900">
          <ArrowLeft size={16} /> Edit draft
        </button>
        <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="mt-1 shrink-0 text-emerald-600" size={28} />
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Contract validated</p>
              <h1 id="pro-player-review-title" className="mt-1 text-2xl font-black text-slate-900">Review your professional player profile</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This draft satisfies Pro Player Onboarding V1. It is <strong>not saved yet</strong>; secure backend persistence is not configured in this slice.
              </p>
            </div>
          </div>
          <dl className="mt-7 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">
            <div><dt className="text-xs font-bold uppercase text-slate-500">Player</dt><dd className="mt-1 font-bold text-slate-900">{reviewProfile.firstName} {reviewProfile.lastName} ({reviewProfile.nickname})</dd></div>
            <div><dt className="text-xs font-bold uppercase text-slate-500">Position</dt><dd className="mt-1 font-bold text-slate-900">{reviewProfile.primaryPosition}{reviewProfile.secondaryPosition ? ` / ${reviewProfile.secondaryPosition}` : ""}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-slate-500">Current status</dt><dd className="mt-1 font-bold text-slate-900">{reviewProfile.leagueLevel === "FREE_AGENT" ? "Free agent" : `${reviewProfile.currentClubName} · ${reviewProfile.leagueLevel}`}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-slate-500">Expected salary</dt><dd className="mt-1 font-bold text-slate-900">{reviewProfile.expectedSalary.monthlyAmount.toLocaleString()} THB / month · {reviewProfile.expectedSalary.visibility}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-slate-500">Equipment</dt><dd className="mt-1 font-bold text-slate-900">{reviewProfile.currentEquipment.bootBrand} {reviewProfile.currentEquipment.bootModel} · {reviewProfile.currentEquipment.shoeSize} {reviewProfile.currentEquipment.shoeSizeSystem}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-slate-500">Career history</dt><dd className="mt-1 font-bold text-slate-900">{reviewProfile.careerHistory.length} entr{reviewProfile.careerHistory.length === 1 ? "y" : "ies"}</dd></div>
          </dl>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            No Firestore write, account linking, FUTID creation, or club claim is performed from this screen.
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => setReviewProfile(null)} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">Edit draft</button>
            <button type="button" onClick={onBack} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Back to dashboard</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={submitForReview} className="mx-auto w-full max-w-5xl space-y-6 pb-24" aria-labelledby="pro-player-onboarding-title" noValidate>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Professional Player · V1</p>
          <h1 id="pro-player-onboarding-title" className="mt-1 text-3xl font-black text-slate-900">Create your professional player profile</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Complete the canonical FutVerse profile. This stage validates a draft only and does not save to Firestore.</p>
        </div>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><ArrowLeft size={16} /> Back</button>
      </div>

      {errors._form && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{errors._form}</p>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-lg font-black text-slate-900">Identity</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className={labelClass}>First name</label><input className={inputClass} maxLength={80} value={draft.firstName} onChange={(e) => update("firstName", e.target.value)} /><FieldError message={errors.firstName} /></div>
          <div><label className={labelClass}>Last name</label><input className={inputClass} maxLength={80} value={draft.lastName} onChange={(e) => update("lastName", e.target.value)} /><FieldError message={errors.lastName} /></div>
          <div><label className={labelClass}>Nickname</label><input className={inputClass} maxLength={80} value={draft.nickname} onChange={(e) => update("nickname", e.target.value)} /><FieldError message={errors.nickname} /></div>
          <div><label className={labelClass}>Nationality</label><input className={inputClass} maxLength={80} value={draft.nationality} onChange={(e) => update("nationality", e.target.value)} /><FieldError message={errors.nationality} /></div>
          <div><label className={labelClass}>Date of birth</label><input type="date" className={inputClass} value={draft.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} /><FieldError message={errors.dateOfBirth} /></div>
          <div><label className={labelClass}>Profile image URL (optional)</label><input type="url" className={inputClass} maxLength={2048} value={draft.profileImageUrl} onChange={(e) => update("profileImageUrl", e.target.value)} /></div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-lg font-black text-slate-900">Football profile</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className={labelClass}>Primary position</label><select className={inputClass} value={draft.primaryPosition} onChange={(e) => update("primaryPosition", e.target.value)}><option value="">Select position</option>{PRO_PLAYER_POSITION_OPTIONS_V1.map((position) => <option key={position} value={position}>{position}</option>)}</select><FieldError message={errors.primaryPosition} /></div>
          <div><label className={labelClass}>Secondary position (optional)</label><select className={inputClass} value={draft.secondaryPosition} onChange={(e) => update("secondaryPosition", e.target.value)}><option value="">None</option>{PRO_PLAYER_POSITION_OPTIONS_V1.map((position) => <option key={position} value={position}>{position}</option>)}</select><FieldError message={errors.secondaryPosition} /></div>
          <div><label className={labelClass}>Preferred foot</label><select className={inputClass} value={draft.preferredFoot} onChange={(e) => update("preferredFoot", e.target.value as ProPlayerOnboardingDraftV1["preferredFoot"])}><option value="RIGHT">Right</option><option value="LEFT">Left</option><option value="BOTH">Both</option></select></div>
          <div><label className={labelClass}>Height (cm)</label><input inputMode="decimal" className={inputClass} value={draft.heightCm} onChange={(e) => update("heightCm", e.target.value)} /><FieldError message={errors.heightCm} /></div>
          <div><label className={labelClass}>Weight (kg)</label><input inputMode="decimal" className={inputClass} value={draft.weightKg} onChange={(e) => update("weightKg", e.target.value)} /><FieldError message={errors.weightKg} /></div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-lg font-black text-slate-900">Current equipment</h2>
        <p className="mt-1 text-sm text-slate-500">Equipment values are profile data; brand logos are not used.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className={labelClass}>Shoe size</label><input inputMode="decimal" className={inputClass} value={draft.shoeSize} onChange={(e) => update("shoeSize", e.target.value)} /><FieldError message={errors.shoeSize} /></div>
          <div><label className={labelClass}>Size system</label><select className={inputClass} value={draft.shoeSizeSystem} onChange={(e) => update("shoeSizeSystem", e.target.value as ProPlayerOnboardingDraftV1["shoeSizeSystem"])}><option value="EU">EU</option><option value="UK">UK</option><option value="US">US</option></select></div>
          <div><label className={labelClass}>Boot brand</label><input className={inputClass} maxLength={80} value={draft.bootBrand} onChange={(e) => update("bootBrand", e.target.value)} /><FieldError message={errors.bootBrand} /></div>
          <div><label className={labelClass}>Boot model</label><input className={inputClass} maxLength={120} value={draft.bootModel} onChange={(e) => update("bootModel", e.target.value)} /><FieldError message={errors.bootModel} /></div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-lg font-black text-slate-900">Current status & expected salary</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className={labelClass}>League level</label><select className={inputClass} value={draft.leagueLevel} onChange={(e) => update("leagueLevel", e.target.value as ProPlayerOnboardingDraftV1["leagueLevel"])}><option value="FREE_AGENT">Free agent</option>{PRO_PLAYER_ACTIVE_LEAGUE_OPTIONS_V1.map((league) => <option key={league} value={league}>{league}</option>)}</select></div>
          {draft.leagueLevel !== "FREE_AGENT" && <><div><label className={labelClass}>Current club</label><input className={inputClass} maxLength={120} value={draft.currentClubName} onChange={(e) => update("currentClubName", e.target.value)} /><FieldError message={errors.currentClubName} /></div><div><label className={labelClass}>Contract expiry (optional)</label><input type="date" className={inputClass} value={draft.contractExpiryDate} onChange={(e) => update("contractExpiryDate", e.target.value)} /></div></>}
          <div><label className={labelClass}>Expected monthly salary (THB)</label><input inputMode="numeric" className={inputClass} value={draft.expectedMonthlySalary} onChange={(e) => update("expectedMonthlySalary", e.target.value)} /><FieldError message={errors.expectedMonthlySalary} /></div>
          <div><label className={labelClass}>Salary visibility</label><select className={inputClass} value={draft.salaryVisibility} onChange={(e) => update("salaryVisibility", e.target.value as ProPlayerOnboardingDraftV1["salaryVisibility"])}><option value="PRIVATE">Private</option><option value="AUTHORIZED_CLUB_ONLY">Authorized club only</option></select></div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">Career history</h2><p className="mt-1 text-sm text-slate-500">Add previous professional or semi-professional club periods. No history entry is overwritten.</p></div><button type="button" onClick={() => update("careerHistory", [...draft.careerHistory, createEmptyProPlayerCareerHistoryDraftV1()])} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800"><Plus size={16} /> Add club history</button></div>
        <div className="mt-5 space-y-4">
          {draft.careerHistory.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No previous club history added.</p>}
          {draft.careerHistory.map((entry, index) => <article key={index} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><h3 className="font-black text-slate-800">Career entry {index + 1}</h3><button type="button" aria-label={`Remove career entry ${index + 1}`} onClick={() => update("careerHistory", draft.careerHistory.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><label className={labelClass}>Club</label><input className={inputClass} maxLength={120} value={entry.clubName} onChange={(e) => updateCareer(index, "clubName", e.target.value)} /><FieldError message={errors[`careerHistory.${index}.clubName`]} /></div>
            <div><label className={labelClass}>League</label><select className={inputClass} value={entry.leagueLevel} onChange={(e) => updateCareer(index, "leagueLevel", e.target.value)}>{PRO_PLAYER_ACTIVE_LEAGUE_OPTIONS_V1.map((league) => <option key={league} value={league}>{league}</option>)}</select></div>
            <div><label className={labelClass}>Position</label><select className={inputClass} value={entry.position} onChange={(e) => updateCareer(index, "position", e.target.value)}><option value="">Select</option>{PRO_PLAYER_POSITION_OPTIONS_V1.map((position) => <option key={position} value={position}>{position}</option>)}</select><FieldError message={errors[`careerHistory.${index}.position`]} /></div>
            <div><label className={labelClass}>From</label><input type="date" className={inputClass} value={entry.fromDate} onChange={(e) => updateCareer(index, "fromDate", e.target.value)} /><FieldError message={errors[`careerHistory.${index}.fromDate`]} /></div>
            <div><label className={labelClass}>To (optional)</label><input type="date" className={inputClass} value={entry.toDate} onChange={(e) => updateCareer(index, "toDate", e.target.value)} /><FieldError message={errors[`careerHistory.${index}.toDate`]} /></div>
            {(["appearances", "starts", "substituteAppearances", "minutesPlayed", "goals", "assists"] as const).map((field) => <div key={field}><label className={labelClass}>{field}</label><input inputMode="numeric" className={inputClass} value={entry[field]} onChange={(e) => updateCareer(index, field, e.target.value)} /><FieldError message={errors[`careerHistory.${index}.${field}`]} /></div>)}
          </div></article>)}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="max-w-xl text-sm leading-6 text-slate-600">Submitting here validates the draft only. Persistence and FUTID linkage require a separately reviewed secure backend contract.</p><button type="submit" className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-700">Validate & review profile</button></div>
    </form>
  );
}
