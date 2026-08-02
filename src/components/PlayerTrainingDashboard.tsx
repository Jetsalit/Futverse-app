import React, { useState, useMemo } from "react";
import { Activity, Clock, Target, UserCheck, Calendar, Moon, Sun, Flame, Zap } from "lucide-react";
import { useTrainingLog, TimeRange, NormalizedSession } from "../hooks/useTrainingLog";
import TrainingTimeline from "./TrainingTimeline";
import { useTheme } from "../contexts/ThemeContext";

interface PlayerTrainingDashboardProps {
  playerId: string;
}

export default function PlayerTrainingDashboard({ playerId }: PlayerTrainingDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("Season");
  const { isDarkMode } = useTheme();
  const { sessions, isLoading, error } = useTrainingLog(playerId, timeRange);

  const stats = useMemo(() => {
    let totalMinutes = 0;
    let totalRPE_Minutes = 0;
    let idpMinutes = 0;
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let injuredCount = 0;
    let sickCount = 0;
    
    const themeCounts: Record<string, number> = {};

    sessions.forEach(session => {
      if (session.attendanceStatus === "Present") presentCount++;
      else if (session.attendanceStatus === "Late") lateCount++;
      else if (session.attendanceStatus === "Absent") absentCount++;
      else if (session.attendanceStatus === "Injured") injuredCount++;
      else if (session.attendanceStatus === "Sick") sickCount++;

      if (session.log) {
        totalMinutes += session.log.minutes || 0;
        totalRPE_Minutes += (session.log.minutes || 0) * (session.log.rpe || 0);
        
        if (session.log.idpTraining) {
          idpMinutes += session.log.idpTraining.minutes || 0;
        }
      }

      if (session.theme && (session.attendanceStatus === "Present" || session.attendanceStatus === "Late")) {
        themeCounts[session.theme] = (themeCounts[session.theme] || 0) + 1;
      }
    });

    const expectedSessions = sessions.length;
    const attendedSessions = presentCount + lateCount;
    const attendanceRate = expectedSessions > 0 ? Math.round((attendedSessions / expectedSessions) * 100) : 0;
    
    const sortedThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);
    const topTheme = sortedThemes.length > 0 ? sortedThemes[0] : null;

    return {
      totalMinutes,
      totalHours: Math.round(totalMinutes / 60 * 10) / 10,
      totalLoad: totalRPE_Minutes,
      idpMinutes,
      attendanceRate,
      presentCount,
      lateCount,
      absentCount,
      injuredCount,
      sickCount,
      topTheme,
      expectedSessions
    };
  }, [sessions]);

  const bgClass = isDarkMode ? "bg-[#0B1120]" : "bg-slate-50";
  const cardClass = isDarkMode ? "bg-slate-800/60 border-slate-700/50 shadow-xl shadow-black/20 backdrop-blur-xl" : "bg-white border-slate-200/60 shadow-lg shadow-indigo-100/40 backdrop-blur-xl";
  const textPrimary = isDarkMode ? "text-white" : "text-slate-800";
  const textSecondary = isDarkMode ? "text-slate-400" : "text-slate-500";
  
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (stats.attendanceRate / 100) * circumference;

  return (
    <div className={`p-4 md:p-8 rounded-[2rem] transition-colors duration-500 border ${isDarkMode ? "border-slate-800" : "border-transparent"} ${bgClass}`}>
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        
        <div className={`p-1.5 rounded-2xl border flex items-center overflow-x-auto min-w-max transition-colors ${isDarkMode ? "bg-slate-900/80 border-slate-700/50 backdrop-blur-md" : "bg-white/80 border-slate-200 backdrop-blur-md"}`}>
          {(["Week", "Month", "Season", "Career"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                timeRange === range
                  ? (isDarkMode ? "bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]" : "bg-indigo-600 text-white shadow-md")
                  : (isDarkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:bg-slate-100")
              }`}
            >
              {range}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-indigo-500 font-bold px-4">
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></span>
              Loading
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 text-rose-500 p-4 rounded-xl border border-rose-500/20 text-sm font-bold mb-6">
          Error: {error}
        </div>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-8">
        
        {/* Attendance Ring */}
        <div className={`p-6 rounded-3xl border flex flex-col justify-between group hover:-translate-y-1.5 transition-all duration-300 ${cardClass}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${textSecondary}`}>Attendance</span>
            <UserCheck size={16} className={`shrink-0 ${isDarkMode ? "text-emerald-400" : "text-emerald-500"}`} />
          </div>
          <div className="flex items-center justify-center relative py-4">
            <svg className="w-32 h-32 transform -rotate-90 overflow-visible" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r={radius} stroke="currentColor" strokeWidth="12" fill="transparent"
                className={isDarkMode ? "text-slate-700/50" : "text-slate-100"} />
              <circle cx="64" cy="64" r={radius} stroke="currentColor" strokeWidth="12" fill="transparent"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={`transition-all duration-1000 ease-out ${isDarkMode ? "text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]" : "text-emerald-500 drop-shadow-sm"}`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-black ${textPrimary}`}>{stats.attendanceRate}%</span>
            </div>
          </div>
          <div className={`text-center text-xs font-bold ${textSecondary}`}>
            {stats.presentCount + stats.lateCount} / {stats.expectedSessions} Sessions
          </div>
        </div>

        {/* Training Load */}
        <div className={`p-6 rounded-3xl border flex flex-col justify-between group hover:-translate-y-1.5 transition-all duration-300 ${cardClass}`}>
          <div className="flex items-center justify-between mb-4">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${textSecondary}`}>Total Load</span>
            <Activity size={16} className={`shrink-0 ${isDarkMode ? "text-rose-400" : "text-rose-500"}`} />
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <div className={`text-4xl md:text-5xl font-black ${textPrimary} tracking-tight`}>{stats.totalLoad}</div>
            
            {/* Fake Activity Bar */}
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full mt-4 overflow-hidden flex">
              <div className="h-full bg-indigo-500 w-1/4"></div>
              <div className="h-full bg-rose-500 w-2/4"></div>
              <div className="h-full bg-amber-500 w-1/4"></div>
            </div>
          </div>
          <div className={`text-xs font-bold mt-4 ${textSecondary}`}>
            RPExM Index
          </div>
        </div>

        {/* Training Hours */}
        <div className={`p-6 rounded-3xl border flex flex-col justify-between group hover:-translate-y-1.5 transition-all duration-300 ${cardClass}`}>
          <div className="flex items-center justify-between mb-4">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${textSecondary}`}>Duration</span>
            <Clock size={16} className={`shrink-0 ${isDarkMode ? "text-sky-400" : "text-sky-500"}`} />
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <div className={`text-4xl md:text-5xl font-black ${textPrimary} tracking-tight`}>
              {stats.totalHours}<span className={`text-2xl ${textSecondary} ml-1`}>h</span>
            </div>
          </div>
          <div className={`text-xs font-bold mt-4 ${textSecondary}`}>
            {stats.totalMinutes} Total Minutes
          </div>
        </div>

        {/* Top Theme */}
        <div className={`p-6 rounded-3xl border flex flex-col justify-between group hover:-translate-y-1.5 transition-all duration-300 ${cardClass}`}>
          <div className="flex items-center justify-between mb-4">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${textSecondary}`}>Top Theme</span>
            <Target size={16} className={`shrink-0 ${isDarkMode ? "text-amber-400" : "text-amber-500"}`} />
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <div className={`text-xl xl:text-2xl font-black leading-tight break-words ${isDarkMode ? "text-transparent bg-clip-text bg-gradient-to-br from-amber-200 to-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]" : "text-slate-800"}`}>
              {stats.topTheme ? stats.topTheme[0] : "None"}
            </div>
          </div>
          <div className={`text-xs font-bold mt-4 ${textSecondary}`}>
            {stats.topTheme ? `${stats.topTheme[1]} Sessions` : "No Data"}
          </div>
        </div>
      </div>

      {/* IDP Neon Banner */}
      {stats.idpMinutes > 0 && (
        <div className="mb-8 relative rounded-3xl overflow-hidden group hover:-translate-y-1 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 opacity-90"></div>
          {/* Animated glow underlay */}
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 opacity-30 blur-xl animate-pulse"></div>
          
          <div className="relative p-6 md:p-8 flex items-center justify-between z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
                <Zap size={24} className="drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]" />
              </div>
              <div>
                <h3 className="font-black text-xl md:text-2xl text-white drop-shadow-md">IDP Training Activity</h3>
                <p className="text-emerald-50 text-sm font-medium mt-1">Extra dedication towards Individual Development Plan.</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
                {stats.idpMinutes}
              </div>
              <div className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-1">Minutes Logged</div>
            </div>
          </div>
        </div>
      )}

      {/* Status Breakdown Mini-Bar */}
      <div className={`rounded-2xl border p-3 flex flex-wrap gap-2 mb-8 ${isDarkMode ? "bg-slate-800/40 border-slate-700/50" : "bg-white/60 border-slate-200/60"}`}>
        {[
          { label: "Present", count: stats.presentCount, color: "emerald" },
          { label: "Late", count: stats.lateCount, color: "amber" },
          { label: "Absent", count: stats.absentCount, color: "rose" },
          { label: "Injured", count: stats.injuredCount, color: "orange" },
          { label: "Sick", count: stats.sickCount, color: "blue" },
        ].map(status => (
          <div key={status.label} className={`flex-1 min-w-[80px] text-center p-2 rounded-xl border ${isDarkMode ? `bg-slate-800 border-slate-700 text-${status.color}-400` : `bg-${status.color}-50 border-${status.color}-100 text-${status.color}-700`}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wider ${isDarkMode ? "text-slate-400" : `text-${status.color}-600/70`}`}>{status.label}</div>
            <div className="text-lg font-black mt-0.5">{status.count}</div>
          </div>
        ))}
      </div>

      {/* Timeline Section */}
      <div>
        <h2 className={`text-xl font-black mb-6 flex items-center gap-2 ${textPrimary}`}>
          <Calendar size={20} className={isDarkMode ? "text-indigo-400" : "text-indigo-600"} /> 
          Session History
        </h2>
        <TrainingTimeline sessions={[...sessions].reverse()} isDarkMode={isDarkMode} />
      </div>
    </div>
  );
}
