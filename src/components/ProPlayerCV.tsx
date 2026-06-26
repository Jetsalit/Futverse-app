import React, { useState } from "react";
import {
  ArrowLeft,
  Download,
  Share2,
  Play,
  Calendar,
  MapPin,
  Award,
} from "lucide-react";
import { ProPlayer } from "../types/ProPlayer";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import IDPProfile from "./IDPProfile";

export default function ProPlayerCV({
  player,
  onBack,
}: {
  player: ProPlayer;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"profile" | "idp">("profile");

  const radarData = [
    {
      subject: "Technical",
      A: player?.attributes?.technical || 0,
      fullMark: 100,
    },
    {
      subject: "Tactical",
      A: player?.attributes?.tactical || 0,
      fullMark: 100,
    },
    {
      subject: "Physical",
      A: player?.attributes?.physical || 0,
      fullMark: 100,
    },
    { subject: "Mental", A: player?.attributes?.mental || 0, fullMark: 100 },
    {
      subject: "Attacking",
      A: player?.attributes?.attacking || 0,
      fullMark: 100,
    },
    {
      subject: "Defending",
      A: player?.attributes?.defending || 0,
      fullMark: 100,
    },
  ];

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 relative bg-slate-50 overflow-y-auto">
      {/* Top Navigation */}
      <div className="flex items-center justify-between p-4 sm:px-8 absolute top-0 left-0 w-full z-10 bg-gradient-to-b from-slate-900/80 to-transparent">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white/20 bg-white/10 backdrop-blur-md rounded-xl transition-colors text-white"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 hover:bg-white/20 bg-white/10 backdrop-blur-md text-white rounded-lg text-sm font-bold transition-colors">
            <Share2 size={16} />{" "}
            <span className="hidden sm:inline">Share Link</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-colors shadow-sm">
            <Download size={16} />{" "}
            <span className="hidden sm:inline">Export PDF</span>
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative h-[60vh] min-h-[400px] w-full bg-slate-900 overflow-hidden shrink-0">
        {/* Background elements */}
        <div className="absolute inset-0 opacity-40 mix-blend-overlay">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full text-slate-800"
            fill="currentColor"
          >
            <polygon points="0,0 100,0 100,100 0,100" />
            <polygon points="0,0 100,0 50,100" fill="#1e293b" />
          </svg>
        </div>
        <div className="absolute right-0 bottom-0 w-2/3 h-full bg-gradient-to-l from-indigo-900/50 to-transparent"></div>

        {/* Content container */}
        <div className="absolute inset-0 flex flex-col md:flex-row items-end md:items-center justify-center pt-16 px-4 md:px-12 max-w-7xl mx-auto w-full">
          {/* Player Info */}
          <div className="flex-1 text-left z-10 pb-8 md:pb-0 w-full">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-white text-xs font-bold uppercase tracking-widest mb-4">
              <span>{player.nationality}</span>
              <span className="w-1 h-1 bg-white/50 rounded-full"></span>
              <span className="text-indigo-300">{player.league}</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter uppercase leading-none drop-shadow-lg mb-2">
              {player.name.split(" ")[0]} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">
                {player.name.split(" ").slice(1).join(" ")}
              </span>
            </h1>

            <div className="flex flex-wrap items-center gap-6 mt-6">
              <div className="text-white/80">
                <div className="text-[10px] uppercase tracking-widest font-bold opacity-60">
                  Position
                </div>
                <div className="text-xl font-bold">{player.position}</div>
              </div>
              <div className="text-white/80 border-l border-white/20 pl-6">
                <div className="text-[10px] uppercase tracking-widest font-bold opacity-60">
                  Current Club
                </div>
                <div className="text-xl font-bold flex items-center gap-2">
                  {player.currentClub}
                </div>
              </div>
              {player.marketValue && (
                <div className="text-white/80 border-l border-white/20 pl-6 hidden sm:block">
                  <div className="text-[10px] uppercase tracking-widest font-bold opacity-60">
                    Market Value
                  </div>
                  <div className="text-xl font-bold text-emerald-400">
                    {player.marketValue}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Shot Image */}
          <div className="w-full md:w-1/2 h-[70%] md:h-full relative z-0 flex items-end justify-center md:justify-end">
            {player.actionShotUrl && (
              <img
                src={player.actionShotUrl}
                alt={player.name}
                className="h-full object-contain object-bottom drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                style={{
                  maskImage:
                    "linear-gradient(to top, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to top, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)",
                }}
              />
            )}
            <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-slate-900 to-transparent"></div>
          </div>
        </div>
      </div>

      {/* Main Content Info */}
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-6">
        {/* Tabs */}
        <div className="flex gap-4 border-b border-slate-200 mb-8">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-3 font-bold text-sm tracking-wide border-b-2 transition-colors ${activeTab === "profile" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            General Profile
          </button>
          <button
            onClick={() => setActiveTab("idp")}
            className={`px-4 py-3 font-bold text-sm tracking-wide border-b-2 transition-colors flex items-center gap-2 ${activeTab === "idp" ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            IDP Tracking
            <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full">
              Pro
            </span>
          </button>
        </div>

        {activeTab === "profile" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Attributes & Bio */}
            <div className="lg:col-span-1 space-y-8">
              {/* Bio Card */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-4">
                  Player Profile
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Age / Born
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {new Date().getFullYear() -
                        new Date(player.dob).getFullYear()}{" "}
                      yrs ({player.dob})
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Height / Weight
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {player.height} cm / {player.weight} kg
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Preferred Foot
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {player.preferredFoot}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Contract Expiry
                    </span>
                    <span className="text-sm font-bold text-indigo-600">
                      {player.contractExpiry}
                    </span>
                  </div>
                </div>
              </div>

              {/* IDP Completion Rate */}
              <div className="bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-800 text-white relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-10">
                  <Award size={100} className="-mr-4 -mt-4 text-emerald-400" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-1">
                  IDP Target Status
                </h3>
                <div className="flex items-end gap-3 mb-3">
                  <span className="text-4xl font-black text-emerald-400 leading-none">
                    85%
                  </span>
                  <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider bg-emerald-500/10 px-2 py-1 rounded mb-1">
                    Completion Rate
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-indigo-500 h-full rounded-full"
                    style={{ width: "85%" }}
                  ></div>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 font-medium uppercase tracking-wider">
                  <span className="text-slate-300 font-bold">17/20</span>{" "}
                  development goals achieved for this season.
                </p>
              </div>

              {/* Contact Card */}
              {(player.phoneNumber || player.lineId || player.facebook) && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-4">
                    Contact Info
                  </h3>
                  <div className="space-y-4">
                    {player.phoneNumber && (
                      <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Phone
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {player.phoneNumber}
                        </span>
                      </div>
                    )}
                    {player.lineId && (
                      <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Line ID
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {player.lineId}
                        </span>
                      </div>
                    )}
                    {player.facebook && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Facebook
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {player.facebook}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Radar Chart Attributes */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">
                  Performance Attributes
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Scout assessment data mapping.
                </p>
                <div className="h-[250px] w-full -ml-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart
                      cx="50%"
                      cy="50%"
                      outerRadius="70%"
                      data={radarData}
                    >
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{
                          fill: "#64748b",
                          fontSize: 10,
                          fontWeight: "bold",
                        }}
                      />
                      <Radar
                        name="Attributes"
                        dataKey="A"
                        stroke="#4f46e5"
                        fill="#4f46e5"
                        fillOpacity={0.4}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Right Column: Career & Videos */}
            <div className="lg:col-span-2 space-y-8">
              {/* Career Timeline */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-6 flex items-center gap-2">
                  <Award size={20} className="text-indigo-600" />
                  Career History
                </h3>

                <div className="relative border-l-2 border-slate-100 ml-3 space-y-6">
                  {player.careerHistory?.map((history, idx) => (
                    <div key={idx} className="relative pl-6">
                      <div className="absolute w-3 h-3 bg-indigo-600 rounded-full -left-[7.5px] top-1.5 ring-4 ring-indigo-50"></div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                        <div className="font-black text-slate-800 text-lg">
                          {history.club}
                        </div>
                        <div className="inline-block px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg uppercase tracking-wider w-max">
                          {history.year}
                        </div>
                      </div>
                      <div className="flex gap-4 mt-3">
                        <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Appearances
                          </div>
                          <div className="font-black text-slate-700">
                            {history.apps}
                          </div>
                        </div>
                        <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Goals
                          </div>
                          <div className="font-black text-emerald-600">
                            {history.goals}
                          </div>
                        </div>
                        <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Assists
                          </div>
                          <div className="font-black text-indigo-600">
                            {history.assists}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Video Highlight */}
              {player.highlightVideoUrl && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-6 flex items-center gap-2">
                    <Play size={20} className="text-rose-500" />
                    Video Highlights
                  </h3>
                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-900 shadow-inner">
                    <iframe
                      src={player.highlightVideoUrl}
                      className="w-full h-full"
                      title="Highlight Video"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <IDPProfile />
        )}
      </div>
    </div>
  );
}
