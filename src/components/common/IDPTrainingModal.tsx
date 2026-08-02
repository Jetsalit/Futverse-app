import React, { useState, useEffect, useMemo } from "react";
import { BookOpen, X, CheckCircle2 } from "lucide-react";
import { collection, query, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { IDPTraining } from "../../hooks/useTrainingLog";

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position?: string;
  avatar?: string;
}

export interface IDPTrainingModalProps {
  player: Player | null; // Can be null initially for Dashboard
  academyId: string;
  idps: any[];
  initialData?: IDPTraining;
  
  // Extra fields for Quick IDP (Dashboard)
  availablePlayers?: Player[];
  onPlayerChange?: (player: Player) => void;
  selectedDateStr?: string;
  onDateChange?: (dateStr: string) => void;

  onSave: (idpTraining: IDPTraining | undefined) => void;
  onClose: () => void;
}

export default function IDPTrainingModal({
  player,
  academyId,
  idps,
  initialData,
  availablePlayers,
  onPlayerChange,
  selectedDateStr,
  onDateChange,
  onSave,
  onClose,
}: IDPTrainingModalProps) {
  const [enabled, setEnabled] = useState<boolean>(!!initialData);
  const [idpId, setIdpId] = useState<string>(initialData?.idpId || "");
  const [goalId, setGoalId] = useState<string>(initialData?.goalId || "");
  const [activity, setActivity] = useState<string>(initialData?.activity || "");
  const [minutes, setMinutes] = useState<number>(initialData?.minutes || 20);
  const [repetitions, setRepetitions] = useState<number>(initialData?.repetitions || 30);
  const [coachVerified, setCoachVerified] = useState<boolean>(initialData?.coachVerified ?? true);

  const [playerGoals, setPlayerGoals] = useState<any[]>([]);
  const [loadingGoals, setLoadingGoals] = useState<boolean>(true);

  const playerIDPs = useMemo(() => {
    if (!player) return [];
    return idps.filter((i) => i.playerId === player.id);
  }, [idps, player?.id]);

  useEffect(() => {
    if (!academyId || !player?.id) {
      setPlayerGoals([]);
      return;
    }
    setLoadingGoals(true);
    const goalsRef = collection(db, `academies/${academyId}/players/${player.id}/goals`);
    getDocs(query(goalsRef))
      .then((snap) => {
        setPlayerGoals(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingGoals(false);
      })
      .catch((err) => {
        console.error("Error loading goals for modal:", err);
        setLoadingGoals(false);
      });
  }, [academyId, player?.id]);

  const handleIdpChange = (selectedIdpId: string) => {
    setIdpId(selectedIdpId);
    const linkedIdp = playerIDPs.find((i) => i.id === selectedIdpId);
    if (linkedIdp) {
      if (!activity) setActivity(linkedIdp.goal || linkedIdp.playerRequest || "");
      const linkedGoal = playerGoals.find(
        (g) =>
          g.idpId === selectedIdpId ||
          g.sourceIdpId === selectedIdpId ||
          (linkedIdp.sourceGoalId && g.id === linkedIdp.sourceGoalId)
      );
      if (linkedGoal) setGoalId(linkedGoal.id);
    }
  };

  const handleSave = () => {
    if (!enabled) {
      onSave(undefined);
      return;
    }
    if (!activity.trim()) {
      alert("กรุณากรอกชื่อกิจกรรมฝึกซ้อม (Activity)");
      return;
    }
    onSave({
      activity: activity.trim(),
      minutes: Number(minutes) || 0,
      repetitions: Number(repetitions) || 0,
      completedAt: selectedDateStr || new Date().toISOString(),
      coachVerified: coachVerified,
      idpId: idpId || undefined,
      goalId: goalId || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <BookOpen size={20} />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-slate-100 text-lg">
                IDP Extra Training
              </h3>
              {!availablePlayers && player && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  นักกีฬา: <span className="font-bold text-indigo-600 dark:text-indigo-400">{player.firstName} {player.lastName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Enable Checkbox */}
        <div className="flex items-center gap-3 bg-indigo-50/60 dark:bg-indigo-950/30 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
          <input
            type="checkbox"
            id="enableIdpTraining"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
          />
          <label htmlFor="enableIdpTraining" className="text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
            ☑ บันทึกการฝึกซ้อมพิเศษ IDP Training
          </label>
        </div>

        {enabled && (
          <div className="space-y-4 text-sm animate-in fade-in duration-200">
            {/* Quick IDP extra fields (Date & Player) */}
            {availablePlayers && onPlayerChange && onDateChange && (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    วันที่ฝึกซ้อม (Date)
                  </label>
                  <input
                    type="date"
                    value={selectedDateStr || ""}
                    onChange={(e) => onDateChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    นักกีฬา (Player)
                  </label>
                  <select
                    value={player?.id || ""}
                    onChange={(e) => {
                      const p = availablePlayers.find(p => p.id === e.target.value);
                      if (p) onPlayerChange(p);
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                  >
                    <option value="" disabled>-- เลือกนักกีฬา --</option>
                    {availablePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Select IDP */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                เลือก IDP (Individual Development Plan)
              </label>
              <select
                value={idpId}
                onChange={(e) => handleIdpChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
              >
                <option value="">-- ไม่เลือก IDP --</option>
                {playerIDPs.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.goal || i.playerRequest || `IDP #${i.id?.slice(0, 6)}`} ({i.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Select Goal */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                เลือก Goal (เป้าหมายเฉพาะ)
              </label>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                disabled={loadingGoals}
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                <option value="">-- ไม่เลือก Goal --</option>
                {playerGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title} ({g.category})
                  </option>
                ))}
              </select>
            </div>

            {/* Activity Input */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                กิจกรรม (Activity Name) *
              </label>
              <input
                type="text"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="เช่น ฝึกเลี้ยงบอลผ่านกรวย / แปบอลเท้าซ้าย"
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>

            {/* Minutes & Repetitions */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  เวลา (นาที)
                </label>
                <input
                  type="number"
                  min="1"
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  จำนวน (ครั้ง / Reps)
                </label>
                <input
                  type="number"
                  min="1"
                  value={repetitions}
                  onChange={(e) => setRepetitions(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 text-xs transition-colors cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={!player}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 size={16} /> บันทึก IDP Training
          </button>
        </div>
      </div>
    </div>
  );
}
