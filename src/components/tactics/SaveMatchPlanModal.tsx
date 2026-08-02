import React, { useState } from "react";
import { X, Save, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useAcademy } from "../../contexts/AcademyContext";
import { getDocs, query, where, addDoc } from "firebase/firestore";

interface SaveMatchPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  squads: string[];
  initialSquad: string;
  onSaveSuccess: () => void;
  planData: any;
}

export default function SaveMatchPlanModal({
  isOpen,
  onClose,
  squads,
  initialSquad,
  onSaveSuccess,
  planData,
}: SaveMatchPlanModalProps) {
  const { currentUser } = useAuth();
  const { getAcademyCollection } = useAcademy();
  
  const [planName, setPlanName] = useState("");
  const [selectedSquad, setSelectedSquad] = useState(initialSquad !== "All" ? initialSquad : (squads[0] || ""));
  const [coachName, setCoachName] = useState(() => {
    if (currentUser?.name) return currentUser.name;
    const first = (currentUser as any)?.firstName || "";
    const last = (currentUser as any)?.lastName || "";
    const combined = `${first} ${last}`.trim();
    return combined || "Unknown Coach";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!planName.trim()) {
      setError("Please enter a plan name.");
      return;
    }
    if (!selectedSquad) {
      setError("Please select a squad.");
      return;
    }
    if (!currentUser) {
      setError("User authentication error.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const matchPlansRef = getAcademyCollection("match_plans");

      // Check for duplicates
      const duplicateQuery = query(
        matchPlansRef,
        where("squad", "==", selectedSquad),
        where("coachId", "==", (currentUser as any).uid || (currentUser as any).id),
        where("name", "==", planName.trim())
      );
      
      const duplicateSnapshot = await getDocs(duplicateQuery);
      if (!duplicateSnapshot.empty) {
        setError(`A plan named "${planName.trim()}" already exists for ${selectedSquad}. Please choose a different name.`);
        setSaving(false);
        return;
      }

      // Save if no duplicates
      const finalCoachName = coachName.trim() || "Unknown Coach";
      
      await addDoc(matchPlansRef, {
        ...planData,
        name: planName.trim(),
        squad: selectedSquad,
        coachId: (currentUser as any).uid || (currentUser as any).id,
        coachName: finalCoachName,
        createdAt: new Date(),
      });

      onSaveSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save match plan. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-800">Save Match Plan</h2>
            <p className="text-sm font-bold text-slate-500">
              Save your current tactic and lineup
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-rose-50 text-rose-700 p-3 rounded-lg text-sm font-bold border border-rose-100">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block uppercase tracking-wider">
              Plan Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => {
                setPlanName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Final vs Buriram"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:border-indigo-500 font-bold"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block uppercase tracking-wider">
              Age Group / Squad <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedSquad}
              onChange={(e) => {
                setSelectedSquad(e.target.value);
                setError(null);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              {squads.map(sq => (
                <option key={sq} value={sq}>{sq}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block uppercase tracking-wider">
              Coach Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={coachName}
              onChange={(e) => {
                setCoachName(e.target.value);
                setError(null);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:border-indigo-500 font-bold"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !planName.trim()}
            className="flex items-center gap-2 bg-indigo-600 text-white font-black px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Save Plan
          </button>
        </div>
      </div>
    </div>
  );
}
