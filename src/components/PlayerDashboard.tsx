import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, query, onSnapshot, doc, getDoc } from "firebase/firestore";
import { Award, Activity, Heart, ChevronRight, UserCircle } from "lucide-react";
import PeerVotingModal from "./PeerVotingModal";
import { EmptyState } from "./common/EmptyState";

interface Teammate {
  id: string;
  name: string;
  position: string;
  avatar: string;
}

const MOCK_PROFILE = {
  id: "mock_id",
  firstName: "Suphanat",
  lastName: "Mueanta",
  position: "Striker",
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Suphanat",
};

const MOCK_TEAMMATES: Teammate[] = [
  {
    id: "t2",
    name: "Supachai Jaided",
    position: "Attacking Midfielder",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Supachai",
  },
];

export default function PlayerDashboard({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { currentUser } = useAuth();

  const [playerProfile, setPlayerProfile] = useState<any>(MOCK_PROFILE);
  const [teammates, setTeammates] = useState<Teammate[]>(MOCK_TEAMMATES);
  const [loading, setLoading] = useState(false);

  const [wellnessValues, setWellnessValues] = useState({
    fitness: 3,
    fatigue: 3,
    pain: 1,
  });
  const [isWellnessSaved, setIsWellnessSaved] = useState(false);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    // Mock data
  }, [currentUser]);

  const handleSaveWellness = () => {
    setIsWellnessSaved(true);
    setTimeout(() => setIsWellnessSaved(false), 3000);
  };

  const handleVotingClose = () => {
    setShowVotingModal(false);
    setHasVoted(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!playerProfile) {
    return (
      <div className="w-full h-[calc(100vh-6rem)]">
        <EmptyState
          icon={UserCircle}
          title="Player Profile Not Found"
          description="We couldn't find a player profile associated with your account. Please contact your coach or administrator."
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto pb-24 space-y-6">
      <PeerVotingModal
        isOpen={showVotingModal}
        onClose={handleVotingClose}
        teammates={teammates}
      />

      {/* Header Profile Section */}
      <div className="bg-slate-900 rounded-3xl p-6 shadow-xl relative overflow-hidden flex items-center justify-between">
        {/* Background Accents */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#E1FF01]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pattern-grid-lg"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4"></div>

        <div className="flex items-center gap-5 relative z-10">
          <div className="relative">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-slate-800 border-4 border-[#E1FF01] overflow-hidden shadow-[0_0_20px_rgba(225,255,1,0.3)] shrink-0 flex items-center justify-center text-[#E1FF01]">
              {playerProfile.avatar ? (
                <img
                  src={playerProfile.avatar}
                  alt="Player Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserCircle size={40} />
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 bg-[#E1FF01] text-slate-900 text-xs font-black px-2 py-1 rounded-lg shadow-sm border border-[#C5DF00]">
              {playerProfile.position || "POS"}
            </div>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {playerProfile.firstName} {playerProfile.lastName}
            </h1>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-sm font-bold text-slate-300 uppercase tracking-widest bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700 backdrop-blur-sm">
                Squad Player
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#E1FF01] uppercase tracking-widest">
                <Activity size={12} /> Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Widget 2: Teammate Voting Banner */}
      {!hasVoted && teammates.length > 0 && (
        <button
          onClick={() => setShowVotingModal(true)}
          className="w-full bg-gradient-to-r from-indigo-600 to-indigo-900 rounded-2xl p-5 shadow-lg border border-indigo-400/30 flex items-center justify-between group hover:shadow-indigo-500/20 transition-all text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/40 rounded-xl flex items-center justify-center shrink-0 border border-indigo-400/50 group-hover:scale-110 transition-transform">
              <Award className="text-[#E1FF01]" size={24} />
            </div>
            <div>
              <h3 className="text-[#E1FF01] font-black text-lg tracking-tight mb-0.5">
                📢 โหวตแมตช์เดย์!
              </h3>
              <p className="text-indigo-100 text-sm font-medium">
                ใครคือ MVP ของทีมในนัดล่าสุด? โหวตให้เพื่อนเลย
              </p>
            </div>
          </div>
          <ChevronRight
            className="text-indigo-300 group-hover:text-[#E1FF01] group-hover:translate-x-1 transition-all"
            size={24}
          />
        </button>
      )}

      {/* Widget 1: Daily Wellness Tracker */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-5">
          <Heart className="text-rose-500" size={20} /> เช็กสภาพร่างกายเตรียมลุย
          (Daily Wellness)
        </h2>

        <div className="space-y-6">
          {/* Fitness Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-slate-700">
                ระดับความฟิต (Fitness)
              </label>
              <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                {wellnessValues.fitness}/5
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={wellnessValues.fitness}
              onChange={(e) =>
                setWellnessValues((prev) => ({
                  ...prev,
                  fitness: parseInt(e.target.value),
                }))
              }
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mt-1">
              <span>ล้ามาก</span>
              <span>ฟิตเต็มร้อย</span>
            </div>
          </div>

          {/* Fatigue Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-slate-700">
                ระดับความเหนื่อยล้า (Fatigue)
              </label>
              <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                {wellnessValues.fatigue}/5
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={wellnessValues.fatigue}
              onChange={(e) =>
                setWellnessValues((prev) => ({
                  ...prev,
                  fatigue: parseInt(e.target.value),
                }))
              }
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mt-1">
              <span>หมดแรง</span>
              <span>สดชื่นมาก</span>
            </div>
          </div>

          {/* Muscle Soreness / Pain Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-slate-700">
                ระดับอาการปวดตึงกล้ามเนื้อ (Soreness/Pain)
              </label>
              <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                {wellnessValues.pain}/5
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={wellnessValues.pain}
              onChange={(e) =>
                setWellnessValues((prev) => ({
                  ...prev,
                  pain: parseInt(e.target.value),
                }))
              }
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mt-1">
              <span>ไม่มีอาการ</span>
              <span>ปวดมาก/บาดเจ็บ</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveWellness}
          className="mt-6 w-full bg-slate-900 text-white font-bold py-3 px-4 rounded-xl shadow-sm hover:bg-slate-800 transition-colors flex justify-center items-center gap-2"
        >
          {isWellnessSaved ? (
            <>
              บันทึกเรียบร้อย! <span className="text-emerald-400">✓</span>
            </>
          ) : (
            "บันทึกข้อมูลวันนี้ (Save Wellness)"
          )}
        </button>
      </div>
    </div>
  );
}
