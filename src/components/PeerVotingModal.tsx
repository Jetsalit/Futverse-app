import React, { useState } from "react";
import { X, Star, Shield, Zap, ChevronDown, CheckCircle2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface PeerVotingModalProps {
  isOpen: boolean;
  onClose: () => void;
  teammates: { id: string; name: string; avatar: string; position: string }[];
}

const BADGES = [
  {
    id: "mvp",
    name: "MVP (นักเตะยอดเยี่ยม)",
    icon: Star,
    color: "text-yellow-500",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
  },
  {
    id: "defender",
    name: "เกมรับยอดเยี่ยม",
    icon: Shield,
    color: "text-blue-500",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    id: "hardworker",
    name: "จอมขยัน",
    icon: Zap,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
];

export default function PeerVotingModal({
  isOpen,
  onClose,
  teammates,
}: PeerVotingModalProps) {
  const { currentUser } = useAuth();
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [selectedBadge, setSelectedBadge] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasVoted, setHasVoted] = useState(false); // Simulate voting 1 time per match

  if (!isOpen) return null;

  // Filter out the current user (using name matching as mock)
  const availableTeammates = teammates.filter(
    (t) => t.name !== currentUser?.name,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer || !selectedBadge || hasVoted) return;
    setIsSubmitted(true);
    setHasVoted(true);
    setTimeout(() => {
      onClose();
      setIsSubmitted(false);
      setSelectedPlayer("");
      setSelectedBadge("");
    }, 2000);
  };

  const selectedPlayerData = availableTeammates.find(
    (t) => t.id === selectedPlayer,
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="relative h-32 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 p-2 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
          <div className="text-center text-white p-6">
            <h2 className="text-xl font-black tracking-tight drop-shadow-md">
              โหวตนักเตะยอดเยี่ยมประจำแมตช์
            </h2>
            <p className="text-sm font-medium text-white/80 mt-1">
              Teammate Endorsement
            </p>
          </div>
        </div>

        {isSubmitted ? (
          <div className="p-8 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">
              โหวตสำเร็จ!
            </h3>
            <p className="text-slate-500 font-medium">
              ขอบคุณที่ร่วมโหวตให้เพื่อนร่วมทีมของคุณ
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  1. เลือกเพื่อนร่วมทีมที่โดดเด่น
                </label>
                <div className="relative">
                  <div
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-indigo-400 transition-colors"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  >
                    {selectedPlayerData ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={selectedPlayerData.avatar}
                          alt={selectedPlayerData.name}
                          className="w-8 h-8 rounded-full bg-slate-200"
                        />
                        <div>
                          <div className="font-bold text-slate-800 leading-none">
                            {selectedPlayerData.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {selectedPlayerData.position}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-medium">
                        -- เลือกผู้เล่นรายบุคคล --
                      </span>
                    )}
                    <ChevronDown
                      size={20}
                      className={`text-slate-400 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                    />
                  </div>

                  {isDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden z-10 max-h-60 overflow-y-auto">
                      {availableTeammates.map((player) => (
                        <div
                          key={player.id}
                          className={`p-3 flex items-center gap-3 hover:bg-indigo-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0 ${selectedPlayer === player.id ? "bg-indigo-50" : ""}`}
                          onClick={() => {
                            setSelectedPlayer(player.id);
                            setIsDropdownOpen(false);
                          }}
                        >
                          <img
                            src={player.avatar}
                            alt={player.name}
                            className="w-8 h-8 rounded-full bg-slate-200"
                          />
                          <div>
                            <div className="font-bold text-slate-800 text-sm leading-none">
                              {player.name}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold mt-1 tracking-wider">
                              {player.position}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`transition-all duration-300 ${selectedPlayer ? "opacity-100 translate-y-0" : "opacity-50 pointer-events-none translate-y-2"}`}
              >
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  2. เลือกเหรียญตราที่เมหาะสม
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {BADGES.map((badge) => (
                    <label
                      key={badge.id}
                      className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        selectedBadge === badge.id
                          ? `border-indigo-600 bg-indigo-50 shadow-sm`
                          : "border-slate-100 hover:border-indigo-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="badge"
                        value={badge.id}
                        checked={selectedBadge === badge.id}
                        onChange={() => setSelectedBadge(badge.id)}
                        className="sr-only"
                      />
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${badge.bg} ${badge.color}`}
                      >
                        <badge.icon size={24} />
                      </div>
                      <div className="flex-1 font-bold text-slate-800">
                        {badge.name}
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedBadge === badge.id ? "border-indigo-600" : "border-slate-300"}`}
                      >
                        {selectedBadge === badge.id && (
                          <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full"></div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!selectedPlayer || !selectedBadge}
              className="w-full py-4 bg-slate-900 border-2 border-slate-900 text-white rounded-2xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-600 hover:border-indigo-600 transition-colors shadow-xl shadow-slate-900/10"
            >
              ส่งผลโหวต
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
