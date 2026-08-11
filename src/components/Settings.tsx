import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useAcademy } from "../contexts/AcademyContext";

interface SettingsProps {
  onBack: () => void;
  setLanguage: (lang: "en" | "th") => void;
  currentLanguage: "en" | "th";
}

export default function Settings({
  onBack,
  setLanguage,
  currentLanguage,
}: SettingsProps) {
  const { settings, updateSettings, accessState } = useAcademy();
  const [academyName, setAcademyName] = useState(settings.name);
  const [squads, setSquads] = useState<string[]>(settings.squads);
  const [newSquad, setNewSquad] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    setAcademyName(settings.name);
    setSquads(settings.squads);
    setSaveState("idle");
  }, [settings]);

  const addSquad = () => {
    const nextSquad = newSquad.trim().toUpperCase();
    if (!nextSquad || squads.includes(nextSquad)) return;
    setSquads((current) => [...current, nextSquad]);
    setNewSquad("");
    setSaveState("idle");
  };

  const saveProfile = async () => {
    if (accessState !== "ACTIVE_MEMBERSHIP" || !academyName.trim()) return;
    setSaving(true);
    setSaveState("idle");
    try {
      await updateSettings({
        name: academyName.trim(),
        shortName: academyName.trim(),
        squads,
      });
      setSaveState("saved");
    } catch (error) {
      console.error("Unable to save academy settings", error);
      setSaveState("error");
    } finally {
      setSaving(false);
    }
  };

  const unavailable = accessState !== "ACTIVE_MEMBERSHIP";

  return (
    <div className="mx-auto w-full max-w-4xl pb-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">
            Academy settings
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Values shown here come from the authorized academy record.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600"
        >
          Back
        </button>
      </div>

      {unavailable && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} />
          <p className="text-sm font-semibold">
            Academy settings are unavailable because an active Membership could not be verified.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
            <Building size={21} />
          </div>
          <div>
            <h2 className="font-black text-slate-800">Academy profile</h2>
            <p className="text-xs font-medium text-slate-500">
              Name and squad changes are written to the academy document.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
              Academy name
            </span>
            <input
              type="text"
              value={academyName}
              disabled={unavailable || saving}
              onChange={(event) => {
                setAcademyName(event.target.value);
                setSaveState("idle");
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <div>
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
              Active squads
            </span>
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={newSquad}
                disabled={unavailable || saving}
                onChange={(event) => setNewSquad(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSquad();
                  }
                }}
                placeholder="Enter a squad name"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                disabled={unavailable || saving || !newSquad.trim()}
                onClick={addSquad}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={16} /> Add
              </button>
            </div>
            {squads.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
                No squads are configured for this academy.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {squads.map((squad) => (
                  <span
                    key={squad}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700"
                  >
                    {squad}
                    <button
                      type="button"
                      disabled={unavailable || saving}
                      aria-label={`Remove ${squad}`}
                      onClick={() => {
                        setSquads((current) => current.filter((item) => item !== squad));
                        setSaveState("idle");
                      }}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-5">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
              Interface language
            </span>
            <div className="flex gap-2">
              {(["en", "th"] as const).map((language) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => setLanguage(language)}
                  className={`rounded-lg px-4 py-2 text-sm font-bold ${
                    currentLanguage === language
                      ? "bg-indigo-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {language === "en" ? "English" : "ไทย"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <div className="text-sm font-semibold">
            {saveState === "saved" && (
              <span className="inline-flex items-center gap-2 text-emerald-700">
                <CheckCircle2 size={17} /> Saved to the academy record.
              </span>
            )}
            {saveState === "error" && (
              <span className="inline-flex items-center gap-2 text-rose-700">
                <AlertTriangle size={17} /> The academy record was not updated.
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={unavailable || saving || !academyName.trim()}
            onClick={saveProfile}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
            {saving ? "Saving" : "Save academy profile"}
          </button>
        </div>
      </section>
    </div>
  );
}
