import React, { useState, useEffect } from "react";
import { X, Star, Shield, Zap, CheckCircle2, Target, Users, Sparkles, ChevronRight, Trophy } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "motion/react";

interface PeerVotingModalProps {
  isOpen: boolean;
  onClose: () => void;
  teammates: { id: string; name: string; avatar: string; position: string }[];
  onSubmitVote: (votes: { playerId: string; badgeId: string }[]) => Promise<void>;
}

const BADGES = [
  {
    id: "mvp",
    name: "Match MVP",
    desc: "โดดเด่นที่สุดในเกม",
    icon: Star,
    color: "text-yellow-500",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    glow: "shadow-[0_0_15px_rgba(234,179,8,0.5)]",
  },
  {
    id: "defender",
    name: "The Wall",
    desc: "เกมรับดั่งกำแพงเหล็ก",
    icon: Shield,
    color: "text-blue-500",
    bg: "bg-blue-50",
    border: "border-blue-200",
    glow: "shadow-[0_0_15px_rgba(59,130,246,0.5)]",
  },
  {
    id: "playmaker",
    name: "Playmaker",
    desc: "จอมสร้างโอกาส",
    icon: Sparkles,
    color: "text-purple-500",
    bg: "bg-purple-50",
    border: "border-purple-200",
    glow: "shadow-[0_0_15px_rgba(168,85,247,0.5)]",
  },
  {
    id: "flash",
    name: "The Flash",
    desc: "สปีดไม่มีตก",
    icon: Zap,
    color: "text-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    glow: "shadow-[0_0_15px_rgba(245,158,11,0.5)]",
  },
  {
    id: "spirit",
    name: "Team Spirit",
    desc: "ทัศนคติยอดเยี่ยม",
    icon: Users,
    color: "text-emerald-500",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    glow: "shadow-[0_0_15px_rgba(16,185,129,0.5)]",
  },
  {
    id: "sniper",
    name: "The Sniper",
    desc: "ยิงคมดั่งจับวาง",
    icon: Target,
    color: "text-rose-500",
    bg: "bg-rose-50",
    border: "border-rose-200",
    glow: "shadow-[0_0_15px_rgba(244,63,94,0.5)]",
  },
];

export default function PeerVotingModal({
  isOpen,
  onClose,
  teammates,
  onSubmitVote,
}: PeerVotingModalProps) {
  const { currentUser } = useAuth();
  
  // Voting state
  const [votes, setVotes] = useState<{ playerId: string; badgeId: string }[]>([]);
  const [step, setStep] = useState<"SELECT_BADGE" | "SELECT_PLAYER" | "ANIMATING" | "SUBMITTED">("SELECT_BADGE");
  const [currentBadge, setCurrentBadge] = useState<string | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter out the current user and players who already received a vote
  const availableTeammates = teammates.filter(
    (t) => t.name !== currentUser?.name && !votes.some(v => v.playerId === t.id)
  );

  // Available badges to pick from (can't pick the same badge twice)
  const availableBadges = BADGES.filter(b => !votes.some(v => v.badgeId === b.id));

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setVotes([]);
      setStep("SELECT_BADGE");
      setCurrentBadge(null);
      setCurrentPlayer(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectBadge = (badgeId: string) => {
    setCurrentBadge(badgeId);
    setStep("SELECT_PLAYER");
  };

  const handleSelectPlayer = (playerId: string) => {
    if (!currentBadge) return;
    setCurrentPlayer(playerId);
    setStep("ANIMATING");
    
    // Simulate animation delay before finalizing the vote
    setTimeout(() => {
      setVotes(prev => [...prev, { playerId, badgeId: currentBadge }]);
      setCurrentBadge(null);
      setCurrentPlayer(null);
      if (votes.length >= 2 || availableTeammates.length <= 1) {
        // Max 3 votes or ran out of players
        submitAllVotes([...votes, { playerId, badgeId: currentBadge }]);
      } else {
        setStep("SELECT_BADGE");
      }
    }, 1500);
  };

  const submitAllVotes = async (finalVotes = votes) => {
    if (finalVotes.length === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmitVote(finalVotes);
      setStep("SUBMITTED");
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (error) {
      console.error("Voting error", error);
      alert("เกิดข้อผิดพลาดในการส่งผลโหวต");
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-50 flex flex-col"
        >
          {/* Header */}
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                <Trophy className="text-indigo-400" size={24} />
              </div>
              <div>
                <h2 className="text-white font-black text-xl leading-none">Matchday Awards</h2>
                <p className="text-slate-400 text-sm mt-1">โหวตให้เพื่อนร่วมทีม ({votes.length}/3)</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full overflow-y-auto">
            
            {step === "SELECT_BADGE" && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full text-center py-8"
              >
                <h3 className="text-3xl font-black text-white mb-2">เลือกรางวัลที่จะมอบให้</h3>
                <p className="text-slate-400 mb-8">คุณสามารถมอบรางวัลให้เพื่อนได้อีก {3 - votes.length} รางวัล</p>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {availableBadges.map(badge => (
                    <motion.button
                      key={badge.id}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSelectBadge(badge.id)}
                      className={`relative p-6 rounded-3xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 flex flex-col items-center gap-4 transition-all group`}
                    >
                      <div className={`w-20 h-20 rounded-full flex items-center justify-center ${badge.bg} ${badge.color} group-hover:${badge.glow} transition-shadow duration-300`}>
                        <badge.icon size={40} />
                      </div>
                      <div>
                        <div className="font-bold text-white text-lg">{badge.name}</div>
                        <div className="text-sm text-slate-400">{badge.desc}</div>
                      </div>
                    </motion.button>
                  ))}
                </div>
                
                {votes.length > 0 && (
                  <div className="mt-12">
                    <button 
                      onClick={() => submitAllVotes()}
                      className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-bold text-lg shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 mx-auto"
                    >
                      พอแค่นี้ ยืนยันผลโหวตเลย <ChevronRight size={20} />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {step === "SELECT_PLAYER" && currentBadge && (
              <motion.div 
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="w-full text-center py-8"
              >
                {/* Selected Badge Preview */}
                <div className="flex flex-col items-center mb-8">
                  <span className="text-slate-400 font-medium mb-3">คุณกำลังมอบรางวัล</span>
                  {BADGES.filter(b => b.id === currentBadge).map(badge => (
                    <div key={badge.id} className="flex items-center gap-3">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${badge.bg} ${badge.color} ${badge.glow}`}>
                        <badge.icon size={32} />
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-white text-2xl">{badge.name}</div>
                        <div className={`text-md ${badge.color}`}>{badge.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <h3 className="text-2xl font-black text-white mb-6">เลือกเพื่อนร่วมทีม</h3>
                
                <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
                  {availableTeammates.map(player => (
                    <motion.button
                      key={player.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSelectPlayer(player.id)}
                      className="w-32 flex flex-col items-center p-4 bg-slate-800/80 border border-slate-700 rounded-3xl hover:border-indigo-500 hover:bg-slate-800 transition-all"
                    >
                      <img src={player.avatar} alt={player.name} className="w-16 h-16 rounded-full object-cover mb-3 border-2 border-slate-600" />
                      <div className="font-bold text-white leading-tight text-center text-sm">{player.name}</div>
                      <div className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{player.position}</div>
                    </motion.button>
                  ))}
                </div>

                <button 
                  onClick={() => setStep("SELECT_BADGE")}
                  className="mt-8 text-slate-400 hover:text-white font-medium px-4 py-2 rounded-full hover:bg-white/5 transition-colors"
                >
                  ย้อนกลับไปเปลี่ยนรางวัล
                </button>
              </motion.div>
            )}

            {step === "ANIMATING" && currentBadge && currentPlayer && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center justify-center text-center"
              >
                {/* Gamified Assignment Animation */}
                {BADGES.filter(b => b.id === currentBadge).map(badge => (
                  <motion.div 
                    key={badge.id}
                    animate={{ 
                      y: [0, -20, 0],
                      scale: [1, 1.2, 1]
                    }}
                    transition={{ duration: 1, ease: "easeInOut" }}
                    className={`w-32 h-32 rounded-full flex items-center justify-center mb-8 ${badge.bg} ${badge.color} ${badge.glow}`}
                  >
                    <badge.icon size={64} />
                  </motion.div>
                ))}
                
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <h3 className="text-3xl font-black text-white mb-2">ยอดเยี่ยม!</h3>
                  <p className="text-slate-300 text-lg">
                    มอบรางวัลให้ <span className="font-bold text-white">{availableTeammates.find(t => t.id === currentPlayer)?.name}</span> เรียบร้อยแล้ว
                  </p>
                </motion.div>
              </motion.div>
            )}

            {step === "SUBMITTED" && (
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-24 h-24 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 size={48} />
                </div>
                <h3 className="text-4xl font-black text-white mb-4">ส่งผลโหวตสำเร็จ!</h3>
                <p className="text-slate-400 text-lg mb-8 max-w-md">
                  คุณได้มอบรางวัลให้เพื่อนร่วมทีมทั้งหมด {votes.length} คน ขอบคุณที่ร่วมส่งต่อกำลังใจให้ทีม!
                </p>

                {/* Summary of awarded badges */}
                <div className="flex flex-wrap justify-center gap-4">
                  {votes.map((v, i) => {
                    const badge = BADGES.find(b => b.id === v.badgeId);
                    const player = teammates.find(t => t.id === v.playerId);
                    if (!badge || !player) return null;
                    return (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 flex items-center gap-4"
                      >
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${badge.bg} ${badge.color}`}>
                          <badge.icon size={24} />
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-white text-sm">{badge.name}</div>
                          <div className="text-slate-400 text-xs">{player.name}</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {isSubmitting && step !== "SUBMITTED" && (
              <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center z-10 backdrop-blur-sm">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-500"></div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
