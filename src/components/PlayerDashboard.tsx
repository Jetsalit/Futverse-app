import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  Star,
  Shield,
  Zap,
  Award,
  Activity,
  Heart,
  Thermometer,
  ChevronRight,
} from "lucide-react";
import PeerVotingModal from "./PeerVotingModal";

const MOCK_RADAR_DATA = [
  { subject: "Pace", A: 85, fullMark: 100 },
  { subject: "Shooting", A: 78, fullMark: 100 },
  { subject: "Passing", A: 82, fullMark: 100 },
  { subject: "Dribbling", A: 88, fullMark: 100 },
  { subject: "Defending", A: 45, fullMark: 100 },
  { subject: "Physical", A: 70, fullMark: 100 },
];

const mockBadges = [
  {
    id: 1,
    name: "Coach's MVP",
    icon: Star,
    color: "text-yellow-500",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    tag: "Gold",
    date: "Last Match",
  },
  {
    id: 2,
    name: "Tactical Master",
    icon: Shield,
    color: "text-indigo-500",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    tag: "Silver",
    date: "2 Weeks Ago",
  },
  {
    id: 3,
    name: "Game Changer",
    icon: Zap,
    color: "text-rose-500",
    bg: "bg-rose-50",
    border: "border-rose-200",
    tag: "Gold",
    date: "1 Month Ago",
  },
];

// Mock teammates for voting
const teammates = [
  {
    id: "t1",
    name: "Supachai Jaided",
    position: "ST",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Supachai",
  },
  {
    id: "t2",
    name: "Chanathip Songkrasin",
    position: "AM",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Chanathip",
  },
  {
    id: "t3",
    name: "Theerathon Bunmathan",
    position: "LB",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Theerathon",
  },
  {
    id: "t4",
    name: "Kritsada Kaman",
    position: "CB",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Kritsada",
  },
];

export default function PlayerDashboard({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { currentUser } = useAuth();
  const [wellnessValues, setWellnessValues] = useState({
    fitness: 3,
    fatigue: 3,
    pain: 1,
  });
  const [isWellnessSaved, setIsWellnessSaved] = useState(false);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  const handleSaveWellness = () => {
    setIsWellnessSaved(true);
    setTimeout(() => setIsWellnessSaved(false), 3000);
  };

  const handleVotingClose = () => {
    setShowVotingModal(false);
    // Simulating vote completion if opened and closed (in a real app, track submit)
    setHasVoted(true);
  };

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
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-slate-800 border-4 border-[#E1FF01] overflow-hidden shadow-[0_0_20px_rgba(225,255,1,0.3)] shrink-0">
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.name || "Player"}`}
                alt="Player Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-[#E1FF01] text-slate-900 text-xs font-black px-2 py-1 rounded-lg shadow-sm border border-[#C5DF00]">
              POS
            </div>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {currentUser?.name || "Player"}
            </h1>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-sm font-bold text-slate-300 uppercase tracking-widest bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700 backdrop-blur-sm">
                U15 Squad
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#E1FF01] uppercase tracking-widest">
                <Activity size={12} /> Starter
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Widget 2: Teammate Voting Banner */}
      {!hasVoted && (
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
              <span>สดชื่น</span>
              <span>หมดแรง</span>
            </div>
          </div>

          {/* Injury/Pain Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-slate-700">
                อาการบาดเจ็บ/ปวดกล้ามเนื้อ (Pain)
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
              <span>เจ็บหนัก</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveWellness}
          className={`w-full mt-6 py-4 rounded-xl font-black text-sm transition-all shadow-sm flex items-center justify-center gap-2 ${
            isWellnessSaved
              ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
              : "bg-slate-900 text-[#E1FF01] hover:bg-slate-800"
          }`}
        >
          {isWellnessSaved ? "✅ บันทึกแล้วพร้อมลุย!" : "บันทึกความพร้อม"}
        </button>
      </div>

      {/* Widget 3: Skill Radar & Badges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-2">
            <Thermometer className="text-indigo-500" size={20} /> My Skill Radar
          </h2>
          <p className="text-xs text-slate-500 font-medium mb-4">
            Current performance attributes
          </p>

          <div className="flex-1 w-full min-h-[250px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                cx="50%"
                cy="50%"
                outerRadius="70%"
                data={MOCK_RADAR_DATA}
              >
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }}
                />
                <Radar
                  name="Skills"
                  dataKey="A"
                  stroke="#4f46e5"
                  fill="#4f46e5"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Badges */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-2">
            <Award className="text-emerald-500" size={20} /> Badges Showcase
          </h2>
          <p className="text-xs text-slate-500 font-medium mb-5">
            Recently unlocked achievements
          </p>

          <div className="space-y-3">
            {mockBadges.map((badge) => (
              <div
                key={badge.id}
                className={`flex items-center gap-4 p-3 rounded-2xl border ${badge.border} ${badge.bg} transition-colors`}
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-white flex items-center justify-center shrink-0 ${badge.color} shadow-sm`}
                >
                  <badge.icon size={24} />
                </div>
                <div className="flex-1">
                  <h4 className={`font-bold text-sm ${badge.color}`}>
                    {badge.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      {badge.tag}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      {badge.date}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
