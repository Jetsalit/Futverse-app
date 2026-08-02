import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Activity, Calendar, Target, Trophy, Dumbbell, Edit2, X } from "lucide-react";

type MesocycleWeek = {
  id: string;
  name: string;
  dateRange: string;
  theme: string;
  intensity: "High" | "Medium" | "Low";
  focus: string;
};

const getThemeColor = (theme: string) => {
  if (theme.includes("Physical")) return "text-rose-600 bg-rose-50 border-rose-200";
  if (theme.includes("Technique") || theme.includes("Technical")) return "text-purple-600 bg-purple-50 border-purple-200";
  if (theme.includes("Tactical")) return "text-sky-600 bg-sky-50 border-sky-200";
  if (theme.includes("Match")) return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (theme.includes("Competition")) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-indigo-600 bg-indigo-50 border-indigo-200";
};

const getIntensityColor = (intensity: string) => {
  if (intensity === "High") return "bg-rose-500";
  if (intensity === "Medium") return "bg-amber-500";
  return "bg-emerald-500";
};

export default function MonthlyPeriodization() {
  const [weeks, setWeeks] = useState<MesocycleWeek[]>([
    {
      id: "w1",
      name: "Week 1",
      dateRange: "Oct 1 - Oct 7",
      theme: "Physical Base",
      intensity: "High",
      focus: "Building aerobic capacity and strength",
    },
    {
      id: "w2",
      name: "Week 2",
      dateRange: "Oct 8 - Oct 14",
      theme: "Tactical Introduction",
      intensity: "Medium",
      focus: "Introducing new team shape and pressing triggers",
    },
    {
      id: "w3",
      name: "Week 3",
      dateRange: "Oct 15 - Oct 21",
      theme: "Match Preparation",
      intensity: "Low",
      focus: "Tapering volume, high intensity short sprints",
    },
    {
      id: "w4",
      name: "Week 4",
      dateRange: "Oct 22 - Oct 28",
      theme: "Competition",
      intensity: "High",
      focus: "Tournament phase, focus on recovery and execution",
    }
  ]);

  const [editingWeek, setEditingWeek] = useState<MesocycleWeek | null>(null);

  const handleSave = () => {
    if (editingWeek) {
      setWeeks(weeks.map(w => w.id === editingWeek.id ? editingWeek : w));
      setEditingWeek(null);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col h-full bg-slate-50 relative">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {weeks.map((week) => {
            const themeColor = getThemeColor(week.theme);
            const intensityColor = getIntensityColor(week.intensity);
            
            return (
              <div key={week.id} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col shadow-sm hover:shadow-md transition-shadow relative group">
                <button 
                  onClick={() => setEditingWeek(week)}
                  className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Edit2 size={16} />
                </button>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-black text-slate-800 text-lg">{week.name}</h3>
                    <p className="text-xs font-bold text-slate-500">{week.dateRange}</p>
                  </div>
                  <div className={`p-2 rounded-xl mr-8 ${themeColor.split(' ')[1]}`}>
                    <Calendar size={20} className={themeColor.split(' ')[0]} />
                  </div>
                </div>

                <div className="space-y-4 flex-1 mt-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Focus Theme</div>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-bold border ${themeColor}`}>
                      {week.theme}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Overall Intensity</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${intensityColor} rounded-full`} style={{ width: week.intensity === 'High' ? '100%' : week.intensity === 'Medium' ? '66%' : '33%' }}></div>
                      </div>
                      <span className="text-xs font-bold text-slate-700 w-12 text-right">{week.intensity}</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Objective</div>
                    <p className="text-sm font-medium text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {week.focus}
                    </p>
                  </div>
                </div>
                
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <button className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-indigo-600 text-sm font-bold rounded-xl transition-colors border border-slate-200 flex items-center justify-center gap-2">
                    <Activity size={16} /> Edit Microcycle
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Modal */}
      {editingWeek && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-black text-slate-800">Edit {editingWeek.name} Phase</h2>
              <button onClick={() => setEditingWeek(null)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-500">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Focus Theme</label>
                <select 
                  value={editingWeek.theme}
                  onChange={(e) => setEditingWeek({...editingWeek, theme: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-800"
                >
                  <option value="Physical Base">Physical Base</option>
                  <option value="Tactical Introduction">Tactical Introduction</option>
                  <option value="Match Preparation">Match Preparation</option>
                  <option value="Competition">Competition</option>
                  <option value="Recovery Phase">Recovery Phase</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Overall Intensity</label>
                <select 
                  value={editingWeek.intensity}
                  onChange={(e) => setEditingWeek({...editingWeek, intensity: e.target.value as "High" | "Medium" | "Low"})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-800"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Objective</label>
                <textarea 
                  value={editingWeek.focus}
                  onChange={(e) => setEditingWeek({...editingWeek, focus: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-800 h-24 resize-none"
                  placeholder="Enter objective for this week..."
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setEditingWeek(null)}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
