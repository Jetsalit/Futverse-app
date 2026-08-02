import React, { useState, useEffect } from "react";
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
  Award,
  Calendar,
  Users,
  Sliders
} from "lucide-react";
import ObservationProfileManager from "../modules/parent-observation/components/ObservationProfileManager";
import { useLanguage } from "../contexts/LanguageContext";
import { useAcademy } from "../contexts/AcademyContext";

type TabId = "academy" | "season" | "roles" | "age_groups" | "system" | "observation-profile";

interface SettingsProps {
  onBack: () => void;
  setLanguage: (lang: "en" | "th") => void;
  currentLanguage: "en" | "th";
  pendingSyncs: number;
  initialTab?: TabId;
}

export default function Settings({
  onBack,
  setLanguage: _setLanguageProp,
  currentLanguage,
  pendingSyncs,
  initialTab
}: SettingsProps) {
  const { t, language, setLanguage } = useLanguage();
  const { settings, updateSettings, academyId } = useAcademy();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab || "academy");

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Profile State
  const [academyName, setAcademyName] = useState(settings.name);
  const [squads, setSquads] = useState<string[]>(
    settings.squads || ["U11", "U13", "U15", "PRO"],
  );
  const [inviteCode, setInviteCode] = useState<string>(settings.inviteCode || "");
  const [newSquadInput, setNewSquadInput] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(settings.logoUrl);
  const [licenseLevel, setLicenseLevel] = useState<"Gold" | "Silver" | "Bronze" | "None">(
    settings.licenseLevel || "None"
  );

  // Update local state if settings load from Firestore
  React.useEffect(() => {
    setAcademyName(settings.name);
    setSquads(settings.squads || ["U11", "U13", "U15", "PRO"]);
    if (settings.inviteCode) {
      setInviteCode(settings.inviteCode);
    } else {
      // Auto-generate invite code if not exists
      const newCode = `FUT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      setInviteCode(newCode);
      // We will save it when they click Save
    }
    setLogoUrl(settings.logoUrl);
    setLicenseLevel(settings.licenseLevel || "None");
  }, [settings]);

  // Privacy State
  const [medicalPrivacy, setMedicalPrivacy] = useState(true);
  const [staffRole, setStaffRole] = useState("head_coach");

  // Fitness Benchmarks State
  const [benchmarks, setBenchmarks] = useState([
    { id: "8-9", group: "8-9", sprint: "5.8", beep: "5.5", vo2max: "31.4" },
    { id: "10-11", group: "10-11", sprint: "5.4", beep: "6.5", vo2max: "34.3" },
    { id: "12-13", group: "12-13", sprint: "5.1", beep: "8.5", vo2max: "40.2" },
    { id: "14-15", group: "14-15", sprint: "4.7", beep: "10.5", vo2max: "47.4" },
    { id: "16-17", group: "16-17", sprint: "4.4", beep: "12.5", vo2max: "53.7" },
    { id: "18-25", group: "18-25", sprint: "4.1", beep: "14.1", vo2max: "58.2" },
    { id: "26-35", group: "26-35", sprint: "4.3", beep: "13.1", vo2max: "55.5" },
  ]);

  const handleBenchmarkChange = (
    id: string,
    field: "sprint" | "beep" | "vo2max",
    value: string,
  ) => {
    setBenchmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    );
  };

  const handleSave = async () => {
    try {
      if (activeTab === "academy") {
        await updateSettings({
          name: academyName,
          shortName: academyName,
          logoUrl: logoUrl,
          squads: squads,
          inviteCode: inviteCode,
          licenseLevel: licenseLevel,
        });
      }
      alert(`Settings saved successfully for ${activeTab}!`);
    } catch (e) {
      alert("Error saving settings.");
      console.error(e);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 256;
          const MAX_HEIGHT = 256;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/webp", 0.8);
          setLogoUrl(dataUrl);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
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
    { id: "academy" as TabId, label: "Academy Settings", icon: Building },
    { id: "observation-profile" as TabId, label: "Observation Profile", icon: Sliders },
    { id: "season" as TabId, label: "Season Management", icon: Calendar },
    { id: "roles" as TabId, label: "Roles & Permissions", icon: ShieldCheck },
    { id: "age_groups" as TabId, label: "Age Groups", icon: Users },
    { id: "system" as TabId, label: "System Settings", icon: HardDrive },
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
          {/* === Academy Settings === */}
          {activeTab === "academy" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-black text-slate-800">
                  Academy Settings
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  General information and academy branding
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

                {/* Academy Licensing */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Academy Licensing
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => setLicenseLevel("Gold")}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                        licenseLevel === "Gold"
                          ? "border-amber-400 bg-amber-50 shadow-md shadow-amber-400/20"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <Award size={32} className={licenseLevel === "Gold" ? "text-amber-500" : "text-slate-400"} />
                      <span className={`mt-2 font-bold text-sm ${licenseLevel === "Gold" ? "text-amber-600" : "text-slate-500"}`}>Gold</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setLicenseLevel("Silver")}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                        licenseLevel === "Silver"
                          ? "border-slate-400 bg-slate-50 shadow-md shadow-slate-400/20"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <Award size={32} className={licenseLevel === "Silver" ? "text-slate-500" : "text-slate-400"} />
                      <span className={`mt-2 font-bold text-sm ${licenseLevel === "Silver" ? "text-slate-600" : "text-slate-500"}`}>Silver</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setLicenseLevel("Bronze")}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                        licenseLevel === "Bronze"
                          ? "border-orange-400 bg-orange-50 shadow-md shadow-orange-400/20"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <Award size={32} className={licenseLevel === "Bronze" ? "text-orange-500" : "text-slate-400"} />
                      <span className={`mt-2 font-bold text-sm ${licenseLevel === "Bronze" ? "text-orange-600" : "text-slate-500"}`}>Bronze</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setLicenseLevel("None")}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                        licenseLevel === "None"
                          ? "border-indigo-400 bg-indigo-50 shadow-md shadow-indigo-400/20"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <X size={32} className={licenseLevel === "None" ? "text-indigo-500" : "text-slate-400"} />
                      <span className={`mt-2 font-bold text-sm ${licenseLevel === "None" ? "text-indigo-600" : "text-slate-500"}`}>None</span>
                    </button>
                  </div>
                </div>

                {/* Invite Code */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex justify-between">
                    <span>Academy Join Code (For Coaches)</span>
                    <span className="text-emerald-600">Give this to your assistant coaches</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteCode}
                      readOnly
                      className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-lg font-black text-slate-800 font-mono tracking-widest outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteCode);
                        alert("Copied to clipboard!");
                      }}
                      className="px-6 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === Age Groups === */}
          {activeTab === "age_groups" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-black text-slate-800">
                  Age Groups
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  Manage active squads and age categories for your academy
                </p>
              </div>

              <div className="space-y-6 flex-1">
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

          {/* === Season Management === */}
          {activeTab === "season" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-black text-slate-800">
                  Season Management
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  Configure training blocks, seasons, and academic years
                </p>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                <div className="w-16 h-16 bg-white shadow-sm rounded-full flex items-center justify-center text-indigo-500 mb-4">
                  <Calendar size={32} />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1">Coming Soon</h3>
                <p className="text-sm text-slate-500 max-w-sm">
                  Advanced season management is currently in development. You will soon be able to manage periods, macrocycles, and active seasons here.
                </p>
              </div>
            </div>
          )}

          {/* === Privacy & Roles === */}
          {activeTab === "roles" && (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-black text-slate-800">
                  Roles & Permissions
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  Manage visibility of sensitive data and configure system access
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

          {/* === Observation Profile Settings === */}
          {activeTab === "observation-profile" && academyId && (
            <div className="h-full animate-in fade-in duration-300">
              <ObservationProfileManager academyId={academyId} />
            </div>
          )}

          {/* Action Footer (Save Button) */}
          {activeTab !== "observation-profile" && (
            <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-900/20"
              >
                <Save size={18} /> Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
