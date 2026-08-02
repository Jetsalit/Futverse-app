import React, { useState, useEffect } from "react";
import { X, Shield, Sword, Activity, Plus } from "lucide-react";
import { PlayerInstruction } from "./types";

interface PlayerRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  positionLabel: string;
  initialInstruction?: PlayerInstruction;
  onSave: (instruction: PlayerInstruction) => void;
}

const ROLES_BY_POS: Record<string, string[]> = {
  GK: ["Sweeper Keeper", "Goalkeeper"],
  CB: ["Ball Playing Defender", "Central Defender", "No-Nonsense CB"],
  LB: ["Full Back", "Wing Back", "Inverted Wing Back"],
  RB: ["Full Back", "Wing Back", "Inverted Wing Back"],
  LWB: ["Wing Back", "Complete Wing Back"],
  RWB: ["Wing Back", "Complete Wing Back"],
  CDM: ["Defensive Midfielder", "Deep Lying Playmaker", "Anchor Man", "Half Back"],
  CM: ["Box-to-Box Midfielder", "Advanced Playmaker", "Central Midfielder", "Mezzala"],
  CAM: ["Attacking Midfielder", "Advanced Playmaker", "Shadow Striker"],
  LM: ["Winger", "Wide Midfielder", "Inverted Winger"],
  RM: ["Winger", "Wide Midfielder", "Inverted Winger"],
  LW: ["Inside Forward", "Winger", "Advanced Playmaker"],
  RW: ["Inside Forward", "Winger", "Advanced Playmaker"],
  ST: ["Advanced Forward", "Target Man", "Deep Lying Forward", "Poacher", "False Nine"],
};

export default function PlayerRoleModal({
  isOpen,
  onClose,
  playerName,
  positionLabel,
  initialInstruction,
  onSave,
}: PlayerRoleModalProps) {
  const defaultRoles = ROLES_BY_POS[positionLabel] || ["Standard"];
  
  const [role, setRole] = useState(initialInstruction?.role || defaultRoles[0]);
  const [duty, setDuty] = useState<"Defend" | "Support" | "Attack">(
    initialInstruction?.duty || "Support"
  );
  
  // Specific instructions toggles
  const [instructions, setInstructions] = useState<string[]>(
    initialInstruction?.instructions || []
  );
  
  const [newInstruction, setNewInstruction] = useState("");

  useEffect(() => {
    if (isOpen) {
      setRole(initialInstruction?.role || ROLES_BY_POS[positionLabel]?.[0] || "Standard");
      setDuty(initialInstruction?.duty || "Support");
      setInstructions(initialInstruction?.instructions || []);
      setNewInstruction("");
    }
  }, [isOpen, initialInstruction, positionLabel]);

  if (!isOpen) return null;

  const handleAddInstruction = () => {
    if (!newInstruction.trim()) return;
    setInstructions(prev => [...prev, newInstruction.trim()]);
    setNewInstruction("");
  };

  const handleRemoveInstruction = (instToRemove: string) => {
    setInstructions(prev => prev.filter(i => i !== instToRemove));
  };

  const handleSave = () => {
    onSave({ role, duty, instructions });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-800">{playerName}</h2>
            <p className="text-sm font-bold text-slate-500">
              Role & Instructions ({positionLabel})
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
        <div className="p-5 overflow-y-auto space-y-6">
          {/* Role Selection */}
          <div>
            <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">
              Player Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              {defaultRoles.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Duty Selection */}
          <div>
            <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">
              Duty
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setDuty("Defend")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                  duty === "Defend" 
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700" 
                    : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                }`}
              >
                <Shield size={20} className="mb-1" />
                <span className="text-xs font-bold">Defend</span>
              </button>
              <button
                onClick={() => setDuty("Support")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                  duty === "Support" 
                    ? "border-amber-500 bg-amber-50 text-amber-700" 
                    : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                }`}
              >
                <Activity size={20} className="mb-1" />
                <span className="text-xs font-bold">Support</span>
              </button>
              <button
                onClick={() => setDuty("Attack")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                  duty === "Attack" 
                    ? "border-rose-500 bg-rose-50 text-rose-700" 
                    : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                }`}
              >
                <Sword size={20} className="mb-1" />
                <span className="text-xs font-bold">Attack</span>
              </button>
            </div>
          </div>

          {/* Specific Instructions */}
          <div>
            <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">
              Specific Instructions
            </label>
            <div className="space-y-2 mb-3">
              {instructions.map(inst => (
                <div key={inst} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50 group">
                  <span className="text-sm font-bold text-slate-700">{inst}</span>
                  <button
                    onClick={() => handleRemoveInstruction(inst)}
                    className="text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              {instructions.length === 0 && (
                <div className="text-sm text-slate-400 italic p-2 text-center">No specific instructions</div>
              )}
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={newInstruction}
                onChange={(e) => setNewInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddInstruction()}
                placeholder="e.g. Roam From Position..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleAddInstruction}
                disabled={!newInstruction.trim()}
                className="bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50">
          <button
            onClick={handleSave}
            className="w-full bg-indigo-600 text-white font-black py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Save Instructions
          </button>
        </div>
      </div>
    </div>
  );
}
