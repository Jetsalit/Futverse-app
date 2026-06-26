import { useState } from 'react';
import { Target, TrendingUp, ShieldAlert, Award, FileText, CheckSquare, MessageSquare, PlayCircle, Plus, Activity, HeartPulse, X } from 'lucide-react';

const MOCK_DRILL_LIBRARY = [
  { id: 'd1', title: '1v1 Attacking Repetition', category: 'Technical' },
  { id: 'd2', title: 'High Press Activation', category: 'Tactical' },
  { id: 'd3', title: 'Sprint Repeatability (30m)', category: 'Physical' },
  { id: 'd4', title: 'Finishing Under Pressure', category: 'Technical' },
];

export default function IDPProfile() {
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks'>('overview');
  const [isAssignDrillModalOpen, setIsAssignDrillModalOpen] = useState(false);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Fitness & Medical Overview Widget */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex items-center gap-4 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4">
          <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 shrink-0">
            <HeartPulse size={24} />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Medical Status</div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">Available to Play</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wider">Fit</span>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-4">
          <div className="w-12 h-12 bg-sky-50 rounded-full flex items-center justify-center text-sky-500 shrink-0">
            <Activity size={24} />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Latest Fitness Score</div>
            <div className="flex items-end justify-between">
              <span className="text-sm font-bold text-slate-800">VO2 Max: 52.4</span>
              <span className="text-xs font-bold text-sky-600">Level: Excellent</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-sky-500 rounded-full" style={{ width: '85%' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Pillars Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: "Technical", score: "8.5/10", color: "text-blue-600", bg: "bg-blue-50" },
          { title: "Tactical", score: "7.0/10", color: "text-indigo-600", bg: "bg-indigo-50" },
          { title: "Physical", score: "9.0/10", color: "text-emerald-600", bg: "bg-emerald-50" },
          { title: "Mental", score: "7.5/10", color: "text-purple-600", bg: "bg-purple-50" },
        ].map((pillar) => (
          <div key={pillar.title} className={`${pillar.bg} rounded-xl p-4 border border-white/50 shadow-sm`}>
             <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{pillar.title}</div>
             <div className={`text-2xl font-black ${pillar.color}`}>{pillar.score}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
         <button 
           onClick={() => setActiveTab('overview')}
           className={`px-4 py-2 font-bold text-sm border-b-2 transition-colors ${activeTab === 'overview' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
         >
           Goals & Evaluation
         </button>
         <button 
           onClick={() => setActiveTab('tasks')}
           className={`px-4 py-2 font-bold text-sm border-b-2 transition-colors ${activeTab === 'tasks' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
         >
           Action Plan & Assignments
         </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Goals Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Target size={16} className="text-indigo-500" /> Development Goals
              </h3>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
               <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <TrendingUp size={14} className="text-emerald-500" /> Short-term (3 Months)
                  </h4>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2 text-sm text-slate-700">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      Improve weak foot (left foot) finishing consistency inside the penalty box.
                    </li>
                    <li className="flex items-start gap-2 text-sm text-slate-700">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      Increase high-intensity sprint volume during matches by 10%.
                    </li>
                  </ul>
               </div>
               <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Award size={14} className="text-amber-500" /> Long-term (Season)
                  </h4>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2 text-sm text-slate-700">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                      Establish status as a starting XI player by improving tactical awareness in high press.
                    </li>
                    <li className="flex items-start gap-2 text-sm text-slate-700">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                      Achieve 15+ goals/assists combined contribution for the season.
                    </li>
                  </ul>
               </div>
            </div>
          </div>

          {/* Evaluation Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <FileText size={16} className="text-indigo-500" /> Strengths & Areas of Improvement
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
               {/* Technical */}
               <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="font-bold text-sm text-slate-700">Technical</div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Strengths</p>
                    <p className="text-sm text-slate-600">Excellent 1v1 dribbling, tight ball control, and strong right-foot finishing.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-amber-600 uppercase">To Improve</p>
                    <p className="text-sm text-slate-600">Weak foot crossing accuracy, aerial heading technique.</p>
                  </div>
               </div>
               {/* Tactical */}
               <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="font-bold text-sm text-slate-700">Tactical</div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Strengths</p>
                    <p className="text-sm text-slate-600">Off-the-ball movement in the final third, attacking transition awareness.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-amber-600 uppercase">To Improve</p>
                    <p className="text-sm text-slate-600">Defensive positioning during high press, tracking back opposition fullbacks.</p>
                  </div>
               </div>
               {/* Physical */}
               <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="font-bold text-sm text-slate-700">Physical</div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Strengths</p>
                    <p className="text-sm text-slate-600">Top acceleration, high agility, strong core balance.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-amber-600 uppercase">To Improve</p>
                    <p className="text-sm text-slate-600">Upper body strength for hold-up play, stamina for 90-min high intensity.</p>
                  </div>
               </div>
               {/* Mental */}
               <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="font-bold text-sm text-slate-700">Mental</div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Strengths</p>
                    <p className="text-sm text-slate-600">High confidence in 1v1 situations, aggressive attacking mindset.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-amber-600 uppercase">To Improve</p>
                    <p className="text-sm text-slate-600">Body language after losing the ball, emotional control under pressure.</p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                   <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                     <CheckSquare size={16} className="text-emerald-500" /> Assingments & Drills
                   </h3>
                   <p className="text-xs text-slate-500 mt-1">Individual training program</p>
                </div>
                <button onClick={() => setIsAssignDrillModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors">
                  <Plus size={14} /> Assign Drill
                </button>
             </div>
             
             <div className="divide-y divide-slate-100 p-4 space-y-4">
                
                {/* Task Item 1 */}
                <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-4 group">
                  <div className="flex justify-between items-start">
                     <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex flex-col items-center justify-center text-emerald-600 shrink-0">
                           <PlayCircle size={20} />
                        </div>
                        <div>
                           <h4 className="font-bold text-slate-800 text-sm">Left-foot Finishing Drill</h4>
                           <p className="text-xs text-slate-500 mt-1 max-w-lg">Practice finishing from various angles using the weaker foot. Complete 50 reps after every team training session.</p>
                           <div className="flex items-center gap-2 mt-2">
                             <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Technical</span>
                             <span className="text-xs text-indigo-600 font-medium hover:underline cursor-pointer flex items-center gap-1">
                               View in Drill Library
                             </span>
                           </div>
                        </div>
                     </div>
                     <select defaultValue="achieved" className="text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-emerald-500 text-emerald-700 bg-emerald-50 outline-none">
                        <option value="todo">To Do</option>
                        <option value="inprogress">In Progress</option>
                        <option value="achieved">Achieved</option>
                     </select>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                     <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-600 uppercase">
                        <MessageSquare size={14} /> Coach Notes
                     </div>
                     <p className="text-sm text-slate-700">Great progress so far. Power is improving, now focus on placing the ball into the corners rather than just hitting it hard.</p>
                  </div>
                </div>

                {/* Task Item 2 */}
                <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-4 group">
                  <div className="flex justify-between items-start">
                     <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-50 flex flex-col items-center justify-center text-amber-600 shrink-0">
                           <ShieldAlert size={20} />
                        </div>
                        <div>
                           <h4 className="font-bold text-slate-800 text-sm">Defensive Positioning Video Analysis</h4>
                           <p className="text-xs text-slate-500 mt-1 max-w-lg">Watch the assigned pressing clips from last match. Identify moments where you lost track of the fullback.</p>
                           <div className="flex items-center gap-2 mt-2">
                             <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Tactical</span>
                             <button type="button" onClick={(e) => e.preventDefault()} className="text-xs text-indigo-600 font-medium hover:underline flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer">
                               Link to Video Clips
                             </button>
                           </div>
                        </div>
                     </div>
                     <select defaultValue="inprogress" className="text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-amber-500 text-amber-700 bg-amber-50 outline-none">
                        <option value="todo">To Do</option>
                        <option value="inprogress">In Progress</option>
                        <option value="achieved">Achieved</option>
                     </select>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                     <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-600 uppercase">
                        <MessageSquare size={14} /> Coach Notes
                     </div>
                     <textarea 
                       className="w-full text-sm bg-white border border-slate-200 rounded-md p-2 focus:outline-none focus:border-indigo-500" 
                       placeholder="Add feedback..."
                       defaultValue="We will review this together in the analysis room on Thursday."
                     />
                     <div className="flex justify-end mt-2">
                        <button className="text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded">Save Note</button>
                     </div>
                  </div>
                </div>

             </div>
          </div>
        </div>
      )}
      
      {/* Assign Drill Modal */}
      {isAssignDrillModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Assign Training Drill</h3>
              <button onClick={() => setIsAssignDrillModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-500 mb-4">Select a drill from the Drill Library to add to this player's action plan.</p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                 {MOCK_DRILL_LIBRARY.map(drill => (
                   <label key={drill.id} className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                      <input type="radio" name="drill_selection" className="mt-1" />
                      <div>
                         <div className="font-bold text-sm text-slate-800">{drill.title}</div>
                         <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mt-1">{drill.category}</div>
                      </div>
                   </label>
                 ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
               <button onClick={() => setIsAssignDrillModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
               <button onClick={() => { setIsAssignDrillModalOpen(false); alert("Drill specific ID linked and saved to action plan."); }} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Add to Action Plan</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
