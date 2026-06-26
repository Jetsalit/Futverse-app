import React, { useState } from "react";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Shield,
  Zap,
  Target,
  Medal,
  Award,
  Quote,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface GrowthStats {
  current: number;
  previous: number;
  unit: string;
}

const mockPerformanceData = [
  { subject: "Technical", A: 8, fullMark: 10 },
  { subject: "Tactical", A: 7, fullMark: 10 },
  { subject: "Physical", A: 9, fullMark: 10 },
  { subject: "Mentality", A: 8, fullMark: 10 },
  { subject: "Teamwork", A: 9, fullMark: 10 },
  { subject: "Discipline", A: 10, fullMark: 10 },
];

const mockGrowthData = {
  height: { current: 165, previous: 163, unit: "cm" },
  weight: { current: 55, previous: 54, unit: "kg" },
};

const mockBadges = [
  {
    id: 1,
    name: "Team Player",
    icon: Shield,
    color: "text-yellow-500",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    tag: "Gold",
    source: "Peer Vote",
  },
  {
    id: 2,
    name: "Sharp Shooter",
    icon: Target,
    color: "text-slate-400",
    bg: "bg-slate-50",
    border: "border-slate-200",
    tag: "Silver",
    source: "Coach Award",
  },
  {
    id: 3,
    name: "Hard Worker",
    icon: Zap,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    tag: "Bronze",
    source: "Peer Vote",
  },
];

export default function YouthDevelopmentReport({
  onBack,
  player,
}: {
  onBack: () => void;
  player?: any;
}) {
  const { hasPermission, currentUser } = useAuth();
  const isParentOrUser = currentUser?.role === "USER";
  const [cheers, setCheers] = useState(12);
  const [hasCheered, setHasCheered] = useState(false);

  const handleCheer = () => {
    if (!hasCheered) {
      setCheers((prev) => prev + 1);
      setHasCheered(true);
    }
  };

  const displayPlayer = player || {
    firstName: "Supachai",
    lastName: "Jaided",
    position: "ST",
    ageGroup: "U17",
    age: 17,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Supachai",
  };

  const GrowthStat = ({
    label,
    data,
  }: {
    label: string;
    data: GrowthStats;
  }) => {
    const diff = data.current - data.previous;
    const isPositive = diff > 0;
    const isNegative = diff < 0;

    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-col">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          {label}
        </span>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-2xl font-black text-slate-800">
            {data.current}
          </span>
          <span className="text-sm font-bold text-slate-500">{data.unit}</span>
        </div>
        <div className="flex items-center gap-1 mt-auto">
          {isPositive ? (
            <div className="flex items-center text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-xs font-bold">
              <ArrowUp size={12} className="mr-0.5" />
              {Math.abs(diff)}
              {data.unit}
            </div>
          ) : isNegative ? (
            <div className="flex items-center text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded text-xs font-bold">
              <ArrowDown size={12} className="mr-0.5" />
              {Math.abs(diff)}
              {data.unit}
            </div>
          ) : (
            <div className="text-slate-400 text-xs font-bold">No change</div>
          )}
          <span className="text-[10px] text-slate-400 font-medium">
            vs last month
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 relative">
        <button
          onClick={onBack}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors absolute sm:relative -left-2 sm:left-0 z-10"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 text-center sm:text-left pl-8 sm:pl-0">
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
            Youth Development Report
          </h1>
          <p className="text-sm font-medium text-slate-500">
            Monthly Progress & Evaluation
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Section 1: Player Profile & Growth */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-3xl p-6 text-white shadow-md relative overflow-hidden md:col-span-1 flex flex-col items-center text-center">
              {/* Background decorative pattern */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 rounded-full bg-white opacity-10"></div>
              <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-24 h-24 rounded-full bg-white opacity-10"></div>

              <div className="w-20 h-20 rounded-full bg-white/20 p-1 mb-4 backdrop-blur-sm relative z-10">
                <img
                  src={
                    displayPlayer.avatar ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${displayPlayer.firstName}`
                  }
                  alt="Avatar"
                  className="w-full h-full object-cover rounded-full bg-white"
                />
              </div>
              <div className="relative z-10">
                <h2 className="text-lg font-black tracking-tight">
                  {displayPlayer.firstName} {displayPlayer.lastName}
                </h2>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className="bg-white/20 px-2 py-0.5 rounded-md text-xs font-bold uppercase backdrop-blur-sm">
                    {displayPlayer.position}
                  </span>
                  <span className="bg-white/20 px-2 py-0.5 rounded-md text-xs font-bold uppercase backdrop-blur-sm">
                    {displayPlayer.ageGroup} ({displayPlayer.age}y)
                  </span>
                </div>
              </div>
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              <GrowthStat label="Height" data={mockGrowthData.height} />
              <GrowthStat label="Weight" data={mockGrowthData.weight} />
            </div>
          </div>
        </section>

        {/* Section 2: Radar Chart */}
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Target size={20} className="text-indigo-600" />
                Skill Radar Assessment
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                4-Corner Model Evaluation (Max 10)
              </p>
            </div>
          </div>

          <div className="h-[300px] sm:h-[400px] w-full bg-slate-50/50 rounded-2xl p-4">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                cx="50%"
                cy="50%"
                outerRadius="70%"
                data={mockPerformanceData}
              >
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "#64748b", fontSize: 12, fontWeight: 700 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 10]}
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                />
                <Radar
                  name="Player"
                  dataKey="A"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fill="#6366f1"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Section 3: Coach's Note & Badges */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Coach's Note */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col">
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-4">
              <Quote size={20} className="text-indigo-600" />
              Coach's Note
            </h3>
            <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-100 relative">
              <p className="text-sm text-slate-600 leading-relaxed relative z-10 italic">
                "He has shown tremendous improvement in his tactical awareness
                and positioning over the last month. Needs to continue building
                physical strength, but his teamwork and discipline are
                outstanding."
              </p>
              <Quote className="absolute top-4 left-4 w-12 h-12 text-slate-200/50 -translate-x-2 -translate-y-2 z-0" />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <img
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Coach"
                alt="Coach"
                className="w-8 h-8 rounded-full bg-slate-200"
              />
              <div>
                <div className="text-xs font-bold text-slate-800">
                  Coach Alex
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  Head Coach U17
                </div>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col">
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-1">
              <Award size={20} className="text-indigo-600" />
              Badge History
            </h3>
            <p className="text-xs text-slate-500 font-medium mb-5">
              Awards earned this month from Coaches and Peers
            </p>

            <div className="space-y-3 mb-6 flex-1">
              {mockBadges.map((badge) => (
                <div
                  key={badge.id}
                  className={`flex items-center gap-4 p-3 rounded-2xl border ${badge.border} ${badge.bg}`}
                >
                  <div
                    className={`w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0 ${badge.color}`}
                  >
                    <badge.icon size={24} />
                  </div>
                  <div>
                    <h4 className={`font-bold text-sm ${badge.color}`}>
                      {badge.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {badge.source}
                      </span>
                      <span className="text-xs text-slate-600 font-medium">
                        {badge.tag}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {isParentOrUser && (
              <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-sm font-medium text-slate-500">
                  <span className="font-black text-rose-500">{cheers}</span>{" "}
                  cheers received
                </div>
                <button
                  onClick={handleCheer}
                  disabled={hasCheered}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
                    hasCheered
                      ? "bg-rose-50 text-rose-500 border border-rose-200"
                      : "bg-slate-900 text-white hover:bg-rose-500 hover:shadow-lg hover:shadow-rose-500/20"
                  }`}
                >
                  {hasCheered ? "👏 Cheered!" : "👏 Send Cheer"}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
