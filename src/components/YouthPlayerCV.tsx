import { useState } from 'react';
import { ArrowLeft, Download, Share2, Award, Activity, Target, MessageSquare, MapPin, Star, Shield, Zap, Video } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

interface YouthPlayerCVProps {
  player: any;
  onBack: () => void;
}

export default function YouthPlayerCV({ player, onBack }: YouthPlayerCVProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'development'>('overview');

  const radarData = [
    { subject: 'Technical', A: 78, fullMark: 100 },
    { subject: 'Tactical', A: 75, fullMark: 100 },
    { subject: 'Physical', A: 82, fullMark: 100 },
    { subject: 'Mental', A: 72, fullMark: 100 },
  ];

  return (
    <div className="w-full flex-1 flex flex-col md:flex-row bg-slate-50 min-h-screen">
      {/* Left Sidebar (Hero Section) */}
      <div className="w-full md:w-80 lg:w-96 bg-slate-900 text-white flex flex-col shadow-2xl relative overflow-hidden z-10">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Award size={160} />
        </div>
        
        <div className="p-6 md:p-8 flex-1 flex flex-col relative z-20">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold w-fit mb-8"
          >
            <ArrowLeft size={16} /> Back to Roster
          </button>
          
          <div className="flex flex-col items-center text-center mt-4">
            <div className="relative mb-6">
              <div className="w-40 h-40 rounded-full border-4 border-slate-700 overflow-hidden shadow-2xl bg-slate-800">
                <img src={player.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.firstName}`} alt={`${player.firstName} ${player.lastName}`} className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full border-2 border-slate-900 whitespace-nowrap shadow-lg">
                Academy
              </div>
            </div>
            
            <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
              {player.firstName} <br/> <span className="text-indigo-400">{player.lastName}</span>
            </h1>
            
            <div className="flex items-center justify-center gap-3 mt-4 w-full">
              <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-xs font-bold uppercase tracking-widest border border-slate-700">{player.position || 'CM'}</span>
              <span className="w-1 h-1 rounded-full bg-slate-600"></span>
              <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-xs font-bold uppercase tracking-widest border border-slate-700">{player.fitness_status || 'Fit'}</span>
            </div>
          </div>
          
          <div className="mt-10 pt-8 border-t border-slate-800 grid grid-cols-2 gap-4 gap-y-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Age</div>
              <div className="text-lg font-bold text-slate-200">{player.age || 15} <span className="text-xs text-slate-500 font-normal">yo</span></div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Age Group</div>
              <div className="text-lg font-bold text-slate-200">{player.ageGroup || 'U15'}</div>
            </div>
            <div>
               <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Height</div>
               <div className="text-lg font-bold text-slate-200">{player.height || 170} <span className="text-xs text-slate-500 font-normal">cm</span></div>
            </div>
            <div>
               <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Weight</div>
               <div className="text-lg font-bold text-slate-200">{player.weight || 62} <span className="text-xs text-slate-500 font-normal">kg</span></div>
            </div>
            <div className="col-span-2">
               <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Preferred Foot</div>
               <div className="text-lg font-bold text-slate-200">Right</div>
            </div>
          </div>
          
        </div>
        
        <div className="p-6 border-t border-slate-800 bg-slate-950 flex gap-3 relative z-20">
          <button className="flex-1 flex justify-center items-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-sm transition-colors border border-slate-700">
            <Share2 size={16} /> Share Link
          </button>
          <button className="flex-1 flex justify-center items-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-900/50">
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>
      
      {/* Right Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden max-h-screen">
        <div className="border-b border-slate-200 bg-white px-6 md:px-10 py-5 flex items-center justify-between z-10 shadow-sm shrink-0">
          <div className="flex gap-8">
            <button 
              className={`pb-5 -mb-5 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              onClick={() => setActiveTab('overview')}
            >
              Development Report
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 md:p-10 hide-scrollbar bg-slate-50/50">
          <div className="max-w-5xl mx-auto space-y-6">
            
            {/* Top Row: Chart & IDP target */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
               
               {/* Radar Chart */}
               <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                     <Target className="text-indigo-600" size={24} />
                     <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Potential Assessment</h3>
                  </div>
                  <div className="h-[280px] w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                           <PolarGrid stroke="#e2e8f0" />
                           <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }} />
                           <Radar name="Player" dataKey="A" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.4} />
                        </RadarChart>
                     </ResponsiveContainer>
                  </div>
               </div>

               <div className="space-y-6 flex flex-col">
                  {/* IDP Progress */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex-1 relative overflow-hidden flex flex-col justify-center">
                     <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-50 rounded-bl-full -mr-10 -mt-10 z-0"></div>
                     <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                           <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">IDP Achievement</h3>
                           <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg uppercase tracking-wider border border-emerald-200">On Target</span>
                        </div>
                        <div className="flex items-end gap-3 mb-2">
                           <span className="text-5xl font-black text-slate-800 tracking-tight">85<span className="text-3xl text-slate-400">%</span></span>
                        </div>
                        <p className="text-sm text-slate-500 font-medium mb-5">Target goals successfully completed this season.</p>
                        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                           <div className="h-full bg-emerald-500 rounded-full" style={{ width: '85%' }}></div>
                        </div>
                     </div>
                  </div>

                  {/* Coach's Endorsement */}
                  <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl p-6 shadow-md text-white relative overflow-hidden flex-1">
                     <div className="absolute right-4 top-4 opacity-20">
                        <MessageSquare size={48} />
                     </div>
                     <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-200 mb-3">Coach's Endorsement</h3>
                     <p className="text-sm md:text-base leading-relaxed font-medium text-indigo-50 italic relative z-10">
                        "Displays excellent technical groundwork and spatial awareness. The current priority is to build core strength and explosive speed. A natural leader in the center of the pitch with high tactical maturity for his age."
                     </p>
                     <div className="mt-4 flex items-center justify-between relative z-10">
                        <div className="text-xs font-bold text-indigo-200">Head of Youth Development</div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Physical Growth Section */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
               <div className="flex items-center gap-2 mb-6">
                  <Activity className="text-emerald-600" size={24} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Physical Growth</h3>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Metric 1 */}
                  <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                     <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">VO2 Max</div>
                     <div className="flex items-end justify-between mb-3">
                        <div className="text-2xl font-black text-slate-800">54.2</div>
                        <div className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-md">+2.1 from last test</div>
                     </div>
                     <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: '75%' }}></div>
                     </div>
                  </div>

                  {/* Metric 2 */}
                  <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                     <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">30m Sprint</div>
                     <div className="flex items-end justify-between mb-3">
                        <div className="text-2xl font-black text-slate-800">4.12 <span className="text-sm text-slate-400 font-medium">sec</span></div>
                        <div className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-md">-0.05 from last test</div>
                     </div>
                     <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: '80%' }}></div>
                     </div>
                  </div>

                  {/* Metric 3 */}
                  <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                     <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Vertical Jump</div>
                     <div className="flex items-end justify-between mb-3">
                        <div className="text-2xl font-black text-slate-800">58 <span className="text-sm text-slate-400 font-medium">cm</span></div>
                        <div className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-md">Stable</div>
                     </div>
                     <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-500" style={{ width: '60%' }}></div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Gamified Teammate Endorsements & Video Highlights */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
               {/* Teammate Endorsements */}
               <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm xl:col-span-1">
                  <div className="flex items-center gap-2 mb-6">
                     <Star className="text-yellow-500" size={24} />
                     <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Teammate Endorsements</h3>
                  </div>
                  
                  <div className="space-y-4">
                     <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full flex items-center justify-center bg-yellow-50 text-yellow-500 border border-yellow-200">
                              <Star size={20} />
                           </div>
                           <div className="font-bold text-slate-800 text-sm">MVP</div>
                        </div>
                        <div className="flex items-center gap-1 font-black text-lg text-slate-800">
                           12 <span className="text-xs text-slate-400 font-medium ml-1">times</span>
                        </div>
                     </div>

                     <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-50 text-blue-500 border border-blue-200">
                              <Shield size={20} />
                           </div>
                           <div className="font-bold text-slate-800 text-sm">Best Defender</div>
                        </div>
                        <div className="flex items-center gap-1 font-black text-lg text-slate-800">
                           8 <span className="text-xs text-slate-400 font-medium ml-1">times</span>
                        </div>
                     </div>

                     <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-50 text-amber-600 border border-amber-200">
                              <Zap size={20} />
                           </div>
                           <div className="font-bold text-slate-800 text-sm">Hard Worker</div>
                        </div>
                        <div className="flex items-center gap-1 font-black text-lg text-slate-800">
                           15 <span className="text-xs text-slate-400 font-medium ml-1">times</span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Video Highlights */}
               <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm xl:col-span-2">
                  <div className="flex items-center gap-2 mb-6">
                     <Video className="text-rose-500" size={24} />
                     <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Video Highlights</h3>
                  </div>
                  
                  <div className="w-full aspect-video rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-sm relative">
                     <iframe 
                        width="100%" 
                        height="100%" 
                        src="https://www.youtube.com/embed/dQw4w9WgXcQ?controls=0" 
                        title="YouTube video player" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                        className="absolute inset-0 w-full h-full"
                     ></iframe>
                  </div>
               </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
