import React, { useMemo } from "react";
import { UserCircle, Target, BookOpen, Heart, Activity, Trophy, Calendar, MapPin, Flag, MessageSquare } from "lucide-react";
import RecentActivities from "./RecentActivities";

interface PlayerPortalHomeProps {
  playerProfile: any;
  careerStats?: any;
  events?: any[];
  onNavigateTab: (tabId: string) => void;
  onOpenMessageCoach?: () => void;
}

export default function PlayerPortalHome({ playerProfile, careerStats, events, onNavigateTab, onOpenMessageCoach }: PlayerPortalHomeProps) {
  
  const upcomingTraining = useMemo(() => {
    return events?.find(e => e.type === "TRAINING") || null;
  }, [events]);

  const upcomingMatch = useMemo(() => {
    return events?.find(e => e.type === "MATCH") || null;
  }, [events]);

  if (!playerProfile) return null;

  return (
    <div className="space-y-6">
      {/* 1. Header Profile Card */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Trophy size={160} />
        </div>
        
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-white/20 bg-slate-800 shrink-0">
            {playerProfile.photoUrl ? (
              <img src={playerProfile.photoUrl} alt={playerProfile.firstName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <UserCircle size={64} />
              </div>
            )}
          </div>
          
          <div className="text-center sm:text-left flex-1">
            <h1 className="text-3xl sm:text-4xl font-black mb-2">
              {playerProfile.firstName} {playerProfile.lastName}
            </h1>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-indigo-100 font-medium">
              <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full">
                <MapPin size={16} /> {playerProfile.position || "ระบุตำแหน่ง"}
              </span>
              <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full">
                <Flag size={16} /> {playerProfile.squad || "ระบุทีม"}
              </span>
              <span className="bg-indigo-500/50 px-3 py-1 rounded-full text-white font-bold">
                U-{playerProfile.ageGroup || "?"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button onClick={() => onNavigateTab("goals")} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors group">
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Target size={20} />
          </div>
          <span className="text-sm font-bold text-slate-700">เป้าหมาย (Goals)</span>
        </button>
        <button onClick={() => onNavigateTab("reflection")} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors group">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <BookOpen size={20} />
          </div>
          <span className="text-sm font-bold text-slate-700">บันทึกประจำวัน</span>
        </button>
        <button onClick={() => onNavigateTab("wellness")} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors group">
          <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Heart size={20} />
          </div>
          <span className="text-sm font-bold text-slate-700">เช็คสภาพร่างกาย</span>
        </button>
        <button onClick={onOpenMessageCoach} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors group">
          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <MessageSquare size={20} />
          </div>
          <span className="text-sm font-bold text-slate-700">ส่งข้อความหาโค้ช</span>
        </button>
        <button onClick={() => onNavigateTab("profile")} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors group col-span-2 sm:col-span-1">
          <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <UserCircle size={20} />
          </div>
          <span className="text-sm font-bold text-slate-700">โปรไฟล์ส่วนตัว</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* 3. Upcoming Events (Training & Match) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {upcomingTraining ? (
              <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-200">
                <div className="flex items-center gap-2 text-emerald-700 mb-2 font-bold">
                  <Activity size={18} /> ซ้อมครั้งต่อไป
                </div>
                <h4 className="font-bold text-slate-800 text-lg">{upcomingTraining.title || "ฝึกซ้อมประจำสัปดาห์"}</h4>
                <p className="text-sm text-slate-600 mt-1 flex items-center gap-1">
                  <Calendar size={14} /> {new Date(upcomingTraining.date).toLocaleDateString('th-TH', { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex items-center justify-center text-slate-400">
                ไม่มีกำหนดการซ้อม
              </div>
            )}
            
            {upcomingMatch ? (
              <div className="bg-orange-50 rounded-2xl p-5 border border-orange-200">
                <div className="flex items-center gap-2 text-orange-700 mb-2 font-bold">
                  <Trophy size={18} /> แมตช์ต่อไป
                </div>
                <h4 className="font-bold text-slate-800 text-lg">{upcomingMatch.title || "การแข่งขันนัดถัดไป"}</h4>
                <p className="text-sm text-slate-600 mt-1 flex items-center gap-1">
                  <Calendar size={14} /> {new Date(upcomingMatch.date).toLocaleDateString('th-TH', { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex items-center justify-center text-slate-400">
                ไม่มีแมตช์การแข่งขัน
              </div>
            )}
          </div>

          {/* Quick Summary Cards (Phase 1) */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">ภาพรวม (Overview)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-slate-50 rounded-xl">
                <div className="text-2xl font-black text-indigo-600">--</div>
                <div className="text-xs text-slate-500 font-medium mt-1">นัดที่ลงเล่น</div>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-xl">
                <div className="text-2xl font-black text-indigo-600">--</div>
                <div className="text-xs text-slate-500 font-medium mt-1">ประตู</div>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-xl">
                <div className="text-2xl font-black text-indigo-600">--</div>
                <div className="text-xs text-slate-500 font-medium mt-1">แอสซิสต์</div>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-xl">
                <div className="text-2xl font-black text-indigo-600">--%</div>
                <div className="text-xs text-slate-500 font-medium mt-1">เข้าซ้อม</div>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-4 text-center">สถิติ Career Stats จะถูกประมวลผลเต็มรูปแบบใน Phase 4</p>
          </div>
        </div>

        {/* 4. Recent Activities */}
        <div>
          <RecentActivities academyId={playerProfile.academyId} playerId={playerProfile.id} />
        </div>
      </div>
    </div>
  );
}
