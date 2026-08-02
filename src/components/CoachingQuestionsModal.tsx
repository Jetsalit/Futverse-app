import React, { useState, useEffect } from "react";
import {
  Brain,
  X,
  RefreshCw,
  Copy,
  Check,
  Eye,
  Zap,
  CheckCircle,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Flame,
  Award,
  Shield,
  ArrowRightLeft,
  Target
} from "lucide-react";
import { Drill } from "../hooks/useDrillDatabase";
import {
  CoachingMoment,
  CoachingQuestionSuggestion,
  QuestionCategory,
  generateCoachingQuestions
} from "../services/coachingAiService";
import { matchDrillToGlobalPedagogy } from "../services/globalFootballPedagogyDatabase";

interface CoachingQuestionsModalProps {
  drill: Drill;
  onClose: () => void;
}

export default function CoachingQuestionsModal({
  drill,
  onClose,
}: CoachingQuestionsModalProps) {
  const [selectedMoment, setSelectedMoment] = useState<CoachingMoment>("BEFORE");
  const [questions, setQuestions] = useState<CoachingQuestionSuggestion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pedagogyKnowledge = matchDrillToGlobalPedagogy(drill);

  const fetchQuestions = async (moment: CoachingMoment) => {
    setLoading(true);
    try {
      const results = await generateCoachingQuestions(drill, moment);
      setQuestions(results);
    } catch (error) {
      console.error("Error generating coaching questions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions(selectedMoment);
  }, [selectedMoment, drill]);

  const handleCopyQuestion = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getCategoryBadge = (category: QuestionCategory) => {
    switch (category) {
      case "OBSERVATION":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50">
            <Eye size={12} /> Observation (สังเกต)
          </span>
        );
      case "ANALYSIS":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50">
            <Zap size={12} /> Analysis (วิเคราะห์)
          </span>
        );
      case "DECISION":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50">
            <CheckCircle size={12} /> Decision (ตัดสินใจ)
          </span>
        );
      case "REFLECTION":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700/50">
            <RotateCcw size={12} /> Reflection (ทบทวน)
          </span>
        );
    }
  };

  const getDifficultyBadge = (diff: string) => {
    switch (diff) {
      case "SIMPLE":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            ระดับง่าย (U11/U13)
          </span>
        );
      case "INTERMEDIATE":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
            ระดับกลาง (U15/U17)
          </span>
        );
      case "ADVANCED":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
            ระดับสูง (PRO/Adult)
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-yellow-300 shadow-inner">
              <Brain size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">
                  COACHING QUESTION ASSISTANT
                </span>
                <span className="px-2 py-0.5 rounded-md bg-yellow-400/20 text-yellow-300 text-[10px] font-bold">
                  {drill.ageGroup || "U13"}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center gap-1 border border-emerald-400/30">
                  <Target size={10} /> {pedagogyKnowledge.footballMoment}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5 flex items-center gap-2">
                {drill.title}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          {/* Coaching Moment Selector Tabs */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              เลือกจังหวะการสอนในสนาม (Coaching Moment)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => setSelectedMoment("BEFORE")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedMoment === "BEFORE"
                    ? "bg-indigo-600 text-white border-indigo-600 font-bold shadow-md shadow-indigo-600/20"
                    : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className={selectedMoment === "BEFORE" ? "text-yellow-300" : "text-indigo-500"} />
                  BEFORE
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">เช็กความเข้าใจก่อนเริ่ม</div>
              </button>

              <button
                onClick={() => setSelectedMoment("DURING")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedMoment === "DURING"
                    ? "bg-indigo-600 text-white border-indigo-600 font-bold shadow-md shadow-indigo-600/20"
                    : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                  <Flame size={14} className={selectedMoment === "DURING" ? "text-amber-300" : "text-amber-500"} />
                  DURING
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">ช่วยเมื่อติดขัด/ทำผิด</div>
              </button>

              <button
                onClick={() => setSelectedMoment("FREEZE")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedMoment === "FREEZE"
                    ? "bg-indigo-600 text-white border-indigo-600 font-bold shadow-md shadow-indigo-600/20"
                    : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                  <HelpCircle size={14} className={selectedMoment === "FREEZE" ? "text-emerald-300" : "text-emerald-500"} />
                  FREEZE
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">หยุดเกมวิเคราะห์สด</div>
              </button>

              <button
                onClick={() => setSelectedMoment("AFTER")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedMoment === "AFTER"
                    ? "bg-indigo-600 text-white border-indigo-600 font-bold shadow-md shadow-indigo-600/20"
                    : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                  <Award size={14} className={selectedMoment === "AFTER" ? "text-purple-300" : "text-purple-500"} />
                  AFTER
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">ถอดบทเรียนหลังซ้อม</div>
              </button>
            </div>
          </div>

          {/* Regenerate Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
              ตัวเลือกคำถามกระตุ้นการเรียนรู้ ({questions.length} คำถาม)
            </div>
            <button
              onClick={() => fetchQuestions(selectedMoment)}
              disabled={loading}
              className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin text-indigo-500" : ""} />
              {loading ? "กำลังสร้าง..." : "สร้างคำถามชุดใหม่"}
            </button>
          </div>

          {/* Generated Question Cards */}
          {loading ? (
            <div className="py-12 text-center space-y-3">
              <Brain size={40} className="mx-auto text-indigo-500 animate-pulse" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
                ผู้ช่วย AI กำลังวิเคราะห์จังหวะการซ้อมและสร้างคำถาม...
              </p>
            </div>
          ) : questions.length > 0 ? (
            <div className="space-y-4">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4.5 space-y-3 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getCategoryBadge(q.category)}
                      {getDifficultyBadge(q.difficulty)}
                    </div>
                    <button
                      onClick={() => handleCopyQuestion(q.id, q.question)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:text-indigo-600 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === q.id ? (
                        <>
                          <Check size={12} className="text-emerald-500" />
                          <span className="text-emerald-600">คัดลอกแล้ว!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>คัดลอกคำถาม</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug">
                    "{q.question}"
                  </div>

                  <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-medium">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">💡 จุดประสงค์ของคำถาม:</span>{" "}
                    {q.coachingPurpose}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400 font-medium">
              ไม่พบคำถาม กรุณากดสร้างคำถามชุดใหม่
            </div>
          )}

          {/* Pedagogy Note for Coach */}
          <div className="bg-indigo-50/50 dark:bg-indigo-950/30 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <span className="font-bold text-indigo-700 dark:text-indigo-300 block">
              📌 คำแนะนำเชิงครุศาสตร์ฟุตบอล (Coaching Principles):
            </span>
            <p>
              เลือกคำถามข้อที่เหมาะสมนำไปถามนักกีฬาในสนามซ้อมจริง ให้เวลานักกีฬาคิดและตอบด้วยตนเอง หลีกเลี่ยงการเฉลยคำตอบตรงๆ เพื่อสร้างความเข้าใจเชิงแท็กติกระยะยาว
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
