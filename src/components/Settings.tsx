import React, { useState } from "react";
import {
  Building,
  Activity,
  ShieldCheck,
  HardDrive,
  Save,
  Upload,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  X,
  Plus,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

type TabId = "profile" | "fitness" | "privacy" | "system";

interface SettingsProps {
  onBack: () => void;
  setLanguage: (lang: "en" | "th") => void;
  currentLanguage: "en" | "th";
  pendingSyncs: number;
}

export default function Settings({
  onBack,
  setLanguage: _setLanguageProp,
  currentLanguage,
  pendingSyncs,
}: SettingsProps) {
  const { t, language, setLanguage } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  // Profile State
  const [academyName, setAcademyName] = useState("Buriram United Academy");
  const [squads, setSquads] = useState<string[]>(["U11", "U13", "U15", "PRO"]);
  const [newSquadInput, setNewSquadInput] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Privacy State
  const [medicalPrivacy, setMedicalPrivacy] = useState(true);
  const [staffRole, setStaffRole] = useState("head_coach");

  // Fitness Benchmarks State
  const [benchmarks, setBenchmarks] = useState([
    { id: "u11", group: "U11", sprint: "5.2", yoyo: "14.1" },
    { id: "u13", group: "U13", sprint: "4.8", yoyo: "15.2" },
    { id: "u15", group: "U15", sprint: "4.5", yoyo: "16.5" },
    { id: "pro", group: "Pro", sprint: "4.1", yoyo: "19.1" },
  ]);

  const handleBenchmarkChange = (
    id: string,
    field: "sprint" | "yoyo",
    value: string,
  ) => {
    setBenchmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    );
  };

  const handleSave = () => {
    alert(`Settings saved successfully for ${activeTab}!`);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setLogoUrl(url);
    }
  };

  const handleAddSquad = () => {
    const trimmed = newSquadInput.trim().toUpperCase();
    if (trimmed && !squads.includes(trimmed)) {
      setSquads((prev) => [...prev, trimmed]);
      setNewSquadInput("");
    }
  };

  const handleRemoveSquad = (squadToRemove: string) => {
    setSquads((prev) => prev.filter((s) => s !== squadToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSquad();
    }
  };

  const tabs = [
    { id: "profile" as TabId, label: "Academy Profile", icon: Building },
    { id: "fitness" as TabId, label: "Fitness Benchmarks", icon: Activity },
    { id: "privacy" as TabId, label: "Privacy & Roles", icon: ShieldCheck },
    { id: "system" as TabId, label: "System & Sync", icon: HardDrive },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto pb-10">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">
          Settings Workspace
        </h1>
        <p className="text-sm font-medium text-slate-500 mt-1">
          Manage academy configurations, roles, and system preferences
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Vertical Tabs (Left) */}
        <div className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 md:w-64 shrink-0 hide-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap md:whitespace-normal font-bold text-sm ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <tab.icon size={18} strokeWidth={2.5} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Area (Right) */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-6 md:p-8 flex flex-col min-h-[500px]">
          {/* === Academy Profile === */}
          {activeTab === "profile" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-black text-slate-800">
                  Academy Profile
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  General information and age group management
                </p>
              </div>

              <div className="space-y-6 flex-1">
                {/* Logo Upload */}
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Academy Logo"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Building className="text-slate-400" size={32} />
                    )}
                  </div>
                  <div>
                    <input
                      type="file"
                      id="logo-upload"
                      accept="image/png, image/jpeg"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <label
                      htmlFor="logo-upload"
                      className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm transition-colors mb-2 cursor-pointer"
                    >
                      <Upload size={16} /> Upload Club Logo
                    </label>
                    <p className="text-xs text-slate-400 font-medium">
                      PNG or JPG, preferably 500x500px
                    </p>
                  </div>
                </div>

                {/* Academy Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Academy Name
                  </label>
                  <input
                    type="text"
                    value={academyName}
                    onChange={(e) => setAcademyName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                  />
                </div>

                {/* Age Groups Active */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                    Active Squads & Age Groups
                  </label>
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="text"
                      value={newSquadInput}
                      onChange={(e) => setNewSquadInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="e.g. U12"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                    />
                    <button
                      onClick={handleAddSquad}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors flex items-center gap-2 shrink-0"
                    >
                      <Plus size={16} /> Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {squads.map((squad) => (
                      <div
                        key={squad}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm transition-colors"
                      >
                        <span>{squad}</span>
                        <button
                          onClick={() => handleRemoveSquad(squad)}
                          className="text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 rounded-full p-0.5 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === Fitness Benchmarks === */}
          {activeTab === "fitness" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-black text-slate-800">
                  Fitness Benchmarks
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  Set target passing scores for physical tests across age groups
                </p>
              </div>

              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                        Age Group
                      </th>
                      <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                        30m Sprint Target (sec)
                      </th>
                      <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                        Yo-Yo Test Target (level)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarks.map((b) => (
                      <tr
                        key={b.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-4 text-sm font-black text-slate-800">
                          {b.group}
                        </td>
                        <td className="py-4 pr-4">
                          <input
                            type="number"
                            step="0.1"
                            value={b.sprint}
                            onChange={(e) =>
                              handleBenchmarkChange(
                                b.id,
                                "sprint",
                                e.target.value,
                              )
                            }
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 w-full max-w-[120px] text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                          />
                        </td>
                        <td className="py-4">
                          <input
                            type="number"
                            step="0.1"
                            value={b.yoyo}
                            onChange={(e) =>
                              handleBenchmarkChange(
                                b.id,
                                "yoyo",
                                e.target.value,
                              )
                            }
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 w-full max-w-[120px] text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* === Privacy & Roles === */}
          {activeTab === "privacy" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-black text-slate-800">
                  Privacy & Roles
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  Manage visibility of sensitive data and configure system
                  access
                </p>
              </div>

              <div className="space-y-8 flex-1">
                {/* Medical Privacy Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      Global Medical Privacy
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Restrict injury and recovery data to medical staff only
                    </p>
                  </div>
                  <button
                    onClick={() => setMedicalPrivacy(!medicalPrivacy)}
                    className={`transition-colors focus:outline-none ${medicalPrivacy ? "text-emerald-500" : "text-slate-300"}`}
                  >
                    {medicalPrivacy ? (
                      <ToggleRight size={40} />
                    ) : (
                      <ToggleLeft size={40} />
                    )}
                  </button>
                </div>

                {/* Staff Role Management */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Default Staff Role Access
                  </label>
                  <p className="text-[11px] text-slate-400 font-medium mb-3">
                    Define the base level of access for newly added coaching
                    staff.
                  </p>
                  <select
                    value={staffRole}
                    onChange={(e) => setStaffRole(e.target.value)}
                    className="w-full md:max-w-md bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="head_coach">Head Coach (Full Access)</option>
                    <option value="assistant">
                      Assistant Coach (View & Log Training)
                    </option>
                    <option value="scout">Scout (Scouting portal only)</option>
                    <option value="medical">
                      Medical Staff (Fitness & Recovery only)
                    </option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* === System & Sync === */}
          {activeTab === "system" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-black text-slate-800">
                  System & Sync
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  Configure language preferences and monitor offline data sync
                </p>
              </div>

              <div className="space-y-8 flex-1">
                {/* Language Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                    Default Display Language
                  </label>
                  <div className="flex gap-4">
                    <label
                      className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all flex-1 md:flex-none md:w-48 ${language === "en" ? "bg-indigo-50 border-indigo-500" : "bg-white border-slate-200"}`}
                    >
                      <input
                        type="radio"
                        className="hidden"
                        checked={language === "en"}
                        onChange={() => setLanguage("en")}
                      />
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${language === "en" ? "border-indigo-600" : "border-slate-300"}`}
                      >
                        {language === "en" && (
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                        )}
                      </div>
                      <span
                        className={`text-sm font-bold ${language === "en" ? "text-indigo-800" : "text-slate-600"}`}
                      >
                        🇬🇧 English
                      </span>
                    </label>
                    <label
                      className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all flex-1 md:flex-none md:w-48 ${language === "th" ? "bg-indigo-50 border-indigo-500" : "bg-white border-slate-200"}`}
                    >
                      <input
                        type="radio"
                        className="hidden"
                        checked={language === "th"}
                        onChange={() => setLanguage("th")}
                      />
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${language === "th" ? "border-indigo-600" : "border-slate-300"}`}
                      >
                        {language === "th" && (
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                        )}
                      </div>
                      <span
                        className={`text-sm font-bold ${language === "th" ? "text-indigo-800" : "text-slate-600"}`}
                      >
                        🇹🇭 ภาษาไทย
                      </span>
                    </label>
                  </div>
                </div>

                {/* Sync Status */}
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-slate-800">
                      Offline Sync Queue
                    </h3>
                    {pendingSyncs === 0 ? (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200">
                        <CheckCircle size={14} /> Complete
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg border border-amber-200">
                        Pending: {pendingSyncs}
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${pendingSyncs === 0 ? "bg-emerald-500 w-full" : "bg-amber-500 w-2/3 animate-pulse"}`}
                    ></div>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">
                    {pendingSyncs === 0
                      ? "All local changes have been synchronized with the cloud server."
                      : `Waiting for stable connection to upload ${pendingSyncs} task(s).`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Footer (Save Button) */}
          <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end shrink-0">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-900/20"
            >
              <Save size={18} /> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
