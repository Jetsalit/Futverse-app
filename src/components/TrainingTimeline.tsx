import React, { useState } from "react";
import { Clock, BookOpen, AlertCircle, FileText, CheckCircle2, Target, Calendar } from "lucide-react";
import { NormalizedSession, AttendanceStatus } from "../hooks/useTrainingLog";

interface TrainingTimelineProps {
  sessions: NormalizedSession[];
  isDarkMode?: boolean;
}

export default function TrainingTimeline({ sessions, isDarkMode = false }: TrainingTimelineProps) {
  const [displayLimit, setDisplayLimit] = useState(5);

  if (sessions.length === 0) {
    return (
      <div className={`border rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[200px] transition-colors ${isDarkMode ? "bg-slate-800/40 border-slate-700/50" : "bg-slate-50/80 border-slate-200 border-dashed"}`}>
        <Clock size={48} className={isDarkMode ? "text-slate-600 mb-4" : "text-slate-300 mb-4"} />
        <h3 className={`font-black text-lg ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>ไม่มีประวัติการฝึกซ้อม</h3>
        <p className={`text-sm mt-1 font-medium ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>เลือกช่วงเวลาอื่นหรือรอให้โค้ชบันทึกข้อมูลการซ้อม</p>
      </div>
    );
  }

  const getStatusColor = (status: AttendanceStatus | null) => {
    switch (status) {
      case "Present": return isDarkMode ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "Late": return isDarkMode ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-amber-100 text-amber-700 border-amber-200";
      case "Absent": return isDarkMode ? "bg-rose-500/20 text-rose-400 border-rose-500/30" : "bg-rose-100 text-rose-700 border-rose-200";
      case "Sick": return isDarkMode ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : "bg-blue-100 text-blue-700 border-blue-200";
      case "Injured": return isDarkMode ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-orange-100 text-orange-700 border-orange-200";
      default: return isDarkMode ? "bg-slate-700/50 text-slate-400 border-slate-600" : "bg-slate-100 text-slate-500 border-slate-200";
    }
  };

  const getStatusLabel = (status: AttendanceStatus | null) => {
    if (!status) return "ไม่ถูกบันทึก (No Data)";
    return status;
  };

  const getIntensityColor = (load: number) => {
    if (load === 0) return "bg-slate-200 dark:bg-slate-700";
    if (load < 30) return "bg-emerald-400";
    if (load < 60) return "bg-amber-400";
    return "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]";
  };

  const lineClass = isDarkMode ? "before:via-slate-700" : "before:via-slate-200";

  const displayedSessions = sessions.slice(0, displayLimit);
  const hasMore = displayLimit < sessions.length;

  return (
    <div className={`space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent ${lineClass} before:to-transparent pt-4`}>
      {displayedSessions.map((session, index) => {
        const load = (session.log?.minutes || 0) * (session.log?.rpe || 0);
        const cardBg = isDarkMode ? "bg-slate-800/80 border-slate-700/50 hover:border-slate-600" : "bg-white border-slate-200/60 hover:border-indigo-300/50";
        const textPrimary = isDarkMode ? "text-slate-100" : "text-slate-800";
        const textSecondary = isDarkMode ? "text-slate-400" : "text-slate-500";
        const textMuted = isDarkMode ? "text-slate-500" : "text-slate-400";
        const divider = isDarkMode ? "border-slate-700/50" : "border-slate-100";
        const badgeBg = isDarkMode ? "bg-slate-900/80" : "bg-slate-100";
        
        return (
          <div key={`${session.id}-${index}`} className="relative flex flex-col md:flex-row items-start md:items-center justify-between md:justify-normal md:odd:flex-row-reverse group transition-all duration-300">
            {/* Timeline dot */}
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-[3px] shrink-0 z-10 mb-4 md:mb-0 transition-transform duration-300 group-hover:scale-110 shadow-md md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 ${
              isDarkMode ? "border-[#0B1120] bg-indigo-500 text-white shadow-black/50" : "border-slate-50 bg-indigo-100 text-indigo-600 shadow-indigo-100/50"
            }`}>
              <Calendar size={16} strokeWidth={2.5} />
            </div>
            
            {/* Content Card */}
            <div className={`w-full md:w-[calc(50%-2.5rem)] p-5 rounded-3xl border shadow-sm group-hover:shadow-lg hover:-translate-y-1 transition-all duration-300 backdrop-blur-sm ${cardBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className={`font-black flex items-center gap-2 ${textPrimary}`}>
                  {session.date} 
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider uppercase ${badgeBg} ${textSecondary}`}>
                    {session.dayOfWeek}
                  </span>
                </div>
                <div className={`px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold rounded-lg border ${getStatusColor(session.attendanceStatus)}`}>
                  {getStatusLabel(session.attendanceStatus)}
                </div>
              </div>
              
              <div className="space-y-4">
                {/* Theme & Objective */}
                <div>
                  <div className={`text-sm font-black ${isDarkMode ? "text-indigo-400" : "text-indigo-600"}`}>{session.theme}</div>
                  {session.objective && <p className={`text-xs mt-1.5 leading-relaxed ${textSecondary}`}>{session.objective}</p>}
                </div>
                
                {/* Stats */}
                <div className={`grid grid-cols-3 gap-2 py-3 border-y ${divider}`}>
                  <div className="text-center">
                    <div className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${textMuted}`}>Minutes</div>
                    <div className={`font-black ${textPrimary}`}>{session.log?.minutes || 0}</div>
                  </div>
                  <div className={`text-center border-x ${divider}`}>
                    <div className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${textMuted}`}>Intensity</div>
                    <div className={`font-black ${textPrimary}`}>{session.intensity || "-"}</div>
                  </div>
                  <div className="text-center relative">
                    <div className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${textMuted}`}>Load</div>
                    <div className={`font-black ${isDarkMode ? "text-rose-400" : "text-indigo-700"}`}>{load > 0 ? load : "-"}</div>
                    
                    {/* Visual Intensity Indicator */}
                    {load > 0 && (
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div className={`h-full rounded-full ${getIntensityColor(load)}`} style={{ width: `${Math.min((load/100)*100, 100)}%` }}></div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Drills */}
                {session.drills.length > 0 && (
                  <div>
                    <div className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2 ${textMuted}`}>
                      <Target size={12} /> Drills Completed
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {session.drills.map((drill, idx) => (
                        <span key={idx} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${isDarkMode ? "bg-slate-900/50 border-slate-700 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                          {drill.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* IDP Training */}
                {session.log?.idpTraining && (
                  <div className={`rounded-2xl p-4 border relative overflow-hidden group/idp ${isDarkMode ? "bg-emerald-900/20 border-emerald-500/20" : "bg-emerald-50 border-emerald-100"}`}>
                    {/* Animated shine effect */}
                    <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-10 group-hover/idp:animate-[shine_1.5s_ease-in-out]"></div>
                    
                    <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-1.5 ${isDarkMode ? "text-emerald-400" : "text-emerald-600"}`}>
                      <BookOpen size={12} /> IDP Extra Training
                      {session.log.idpTraining.coachVerified && (
                        <CheckCircle2 size={12} className={`ml-auto ${isDarkMode ? "text-emerald-500" : "text-emerald-500"}`} />
                      )}
                    </div>
                    <div className={`text-sm font-black ${isDarkMode ? "text-emerald-300" : "text-emerald-900"}`}>{session.log.idpTraining.activity}</div>
                    <div className={`text-xs font-bold mt-1 ${isDarkMode ? "text-emerald-500/80" : "text-emerald-700"}`}>
                      {session.log.idpTraining.minutes} Mins • {session.log.idpTraining.repetitions} Reps
                    </div>
                  </div>
                )}
                
                {/* Coach Notes */}
                {session.log?.notes && (
                  <div className={`flex items-start gap-2.5 p-3 rounded-2xl border ${isDarkMode ? "bg-slate-900/40 border-slate-700/50 text-slate-400" : "bg-slate-50 border-slate-100 text-slate-600"} text-xs leading-relaxed`}>
                    <FileText size={14} className={`shrink-0 mt-0.5 ${isDarkMode ? "text-slate-600" : "text-slate-400"}`} />
                    <span className="italic font-medium">{session.log.notes}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      
      {hasMore && (
        <div className="flex justify-center mt-8 pb-4 hide-on-export relative z-10">
          <button 
            onClick={() => setDisplayLimit(prev => prev + 5)}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 shadow-sm hover:shadow-md ${isDarkMode ? "bg-slate-800 text-indigo-400 border border-slate-700 hover:bg-slate-700 hover:text-indigo-300" : "bg-white text-indigo-600 border border-slate-200 hover:bg-indigo-50"}`}
          >
            โหลดเพิ่มเติม (Load More)
          </button>
        </div>
      )}
    </div>
  );
}
