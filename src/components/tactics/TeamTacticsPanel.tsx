import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { TeamTactics } from "./types";

interface TeamTacticsPanelProps {
  tactics: TeamTactics;
  onChange: (newTactics: TeamTactics) => void;
}

export default function TeamTacticsPanel({ tactics, onChange }: TeamTacticsPanelProps) {
  const handleChange = (phase: keyof TeamTactics, key: string, value: string) => {
    if (phase === "notes") return;
    onChange({
      ...tactics,
      [phase]: {
        ...tactics[phase],
        [key]: value,
      },
    });
  };

  const [newNote, setNewNote] = useState("");

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    onChange({
      ...tactics,
      notes: [...(tactics.notes || []), { id: Date.now().toString(), text: newNote.trim() }],
    });
    setNewNote("");
  };

  const handleRemoveNote = (id: string) => {
    onChange({
      ...tactics,
      notes: (tactics.notes || []).filter(note => note.id !== id),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      
      {/* In Possession */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
          In Possession
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Build-up Play</label>
            <select
              value={tactics.inPossession.buildUp}
              onChange={(e) => handleChange("inPossession", "buildUp", e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="Play Out of Defense">Play Out of Defense</option>
              <option value="Standard">Standard</option>
              <option value="Direct Passing">Direct Passing</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Attacking Width</label>
            <select
              value={tactics.inPossession.attackingWidth}
              onChange={(e) => handleChange("inPossession", "attackingWidth", e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="Narrow">Narrow</option>
              <option value="Standard">Standard</option>
              <option value="Wide">Wide</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Tempo</label>
            <select
              value={tactics.inPossession.tempo}
              onChange={(e) => handleChange("inPossession", "tempo", e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="Slow">Slow / Patient</option>
              <option value="Standard">Standard</option>
              <option value="High">High / Fast Paced</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transition */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
          Transition
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">When Possession is Lost</label>
            <select
              value={tactics.transition.whenPossessionLost}
              onChange={(e) => handleChange("transition", "whenPossessionLost", e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="Counter-Press">Counter-Press</option>
              <option value="Regroup">Regroup</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">When Possession is Won</label>
            <select
              value={tactics.transition.whenPossessionWon}
              onChange={(e) => handleChange("transition", "whenPossessionWon", e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="Counter">Counter-Attack</option>
              <option value="Hold Shape">Hold Shape</option>
            </select>
          </div>
        </div>
      </div>

      {/* Out of Possession */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
          Out of Possession
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Defensive Line</label>
            <select
              value={tactics.outOfPossession.defensiveLine}
              onChange={(e) => handleChange("outOfPossession", "defensiveLine", e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="High">High Line</option>
              <option value="Standard">Standard</option>
              <option value="Deep">Deep / Low Block</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Pressing Intensity</label>
            <select
              value={tactics.outOfPossession.pressingIntensity}
              onChange={(e) => handleChange("outOfPossession", "pressingIntensity", e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="High">High / Gegenpress</option>
              <option value="Standard">Standard</option>
              <option value="Low">Low / Stand Off</option>
            </select>
          </div>
        </div>
      </div>

      {/* Situational Tactics / Notes */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
          Situational Tactics / Notes
        </h3>
        
        <div className="space-y-3">
          {(tactics.notes || []).map((note) => (
            <div key={note.id} className="flex items-start justify-between bg-slate-50 border border-slate-200 rounded-lg p-3 group">
              <span className="text-sm font-medium text-slate-700">{note.text}</span>
              <button
                onClick={() => handleRemoveNote(note.id)}
                className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          
          <div className="flex gap-2">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
              placeholder="e.g. If leading 1-0 in 80', drop deep..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleAddNote}
              disabled={!newNote.trim()}
              className="bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
