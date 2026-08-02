import React, { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { Heart, Info, Zap, Bed, Droplets, Activity } from "lucide-react";

interface DailyWellnessProps {
  academyId: string;
  playerId: string;
  todayAttendance?: any;
}

export default function DailyWellness({ academyId, playerId, todayAttendance }: DailyWellnessProps) {
  const { currentUser } = useAuth();

  const [wellnessValues, setWellnessValues] = useState({
    fitness: 3,
    fatigue: 3,
    pain: 1,
    sleepHours: 8,
    hydration: 4,
  });

  const [isWellnessSaved, setIsWellnessSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!academyId || !playerId) return;

    const today = new Date().toISOString().split("T")[0];
    const wellnessRef = doc(db, `academies/${academyId}/players/${playerId}/daily_wellness`, today);

    const unsub = onSnapshot(wellnessRef, (wellSnap) => {
      if (wellSnap.exists()) {
        const data = wellSnap.data();
        setWellnessValues({
          fitness: data.fitness ?? 3,
          fatigue: data.fatigue ?? 3,
          pain: data.pain ?? 1,
          sleepHours: data.sleepHours ?? 8,
          hydration: data.hydration ?? 4,
        });
      } else {
        setWellnessValues({ fitness: 3, fatigue: 3, pain: 1, sleepHours: 8, hydration: 4 });
      }
      setLoading(false);
    });

    return () => unsub();
  }, [academyId, playerId]);

  const handleSaveWellness = async () => {
    if (!academyId || !playerId || !currentUser?.id) return;

    try {
      const today = new Date().toISOString().split("T")[0];
      const wellnessRef = doc(db, `academies/${academyId}/players/${playerId}/daily_wellness`, today);

      await setDoc(wellnessRef, {
        date: today,
        timestamp: serverTimestamp(),
        fitness: wellnessValues.fitness,
        fatigue: wellnessValues.fatigue,
        pain: wellnessValues.pain,
        sleepHours: wellnessValues.sleepHours,
        hydration: wellnessValues.hydration,
        reportedBy: currentUser.id,
      });

      setIsWellnessSaved(true);
      setTimeout(() => setIsWellnessSaved(false), 3000);
    } catch (error) {
      console.error("Error saving wellness:", error);
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-slate-500 animate-pulse">กำลังโหลดข้อมูล...</div>;
  }

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
          <Heart size={24} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-800">Daily Wellness</h3>
          <p className="text-slate-500 text-sm">อัปเดตสภาพร่างกายประจำวัน</p>
        </div>
      </div>

      {!todayAttendance && (
        <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-700 text-sm flex gap-2">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            การบันทึกสภาพร่างกายจะบันทึกเข้าสู่วันที่ {new Date().toLocaleDateString("th-TH")}{" "}
            หากคุณเพิ่งตื่นนอน กรุณาเช็คอินเพื่อบันทึกข้อมูลก่อน
          </p>
        </div>
      )}

      <div className="space-y-6 max-w-2xl mx-auto">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Zap size={16} className="text-blue-500" /> ระดับความฟิต (Fitness)
            </span>
            <span className="text-sm font-bold text-blue-600">{wellnessValues.fitness}/5</span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            value={wellnessValues.fitness}
            onChange={(e) => setWellnessValues({ ...wellnessValues, fitness: parseInt(e.target.value) })}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>เหนื่อยล้ามาก (1)</span>
            <span>สมบูรณ์เต็มที่ (5)</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Bed size={16} className="text-indigo-500" /> การนอนหลับ (Sleep)
            </span>
            <span className="text-sm font-bold text-indigo-600">{wellnessValues.sleepHours} ชม.</span>
          </div>
          <input
            type="range"
            min="4"
            max="12"
            step="0.5"
            value={wellnessValues.sleepHours}
            onChange={(e) => setWellnessValues({ ...wellnessValues, sleepHours: parseFloat(e.target.value) })}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>น้อยกว่า 4 ชม.</span>
            <span>มากกว่า 10 ชม.</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Droplets size={16} className="text-cyan-500" /> การดื่มน้ำ (Hydration)
            </span>
            <span className="text-sm font-bold text-cyan-600">{wellnessValues.hydration} ลิตร</span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            step="0.5"
            value={wellnessValues.hydration}
            onChange={(e) => setWellnessValues({ ...wellnessValues, hydration: parseFloat(e.target.value) })}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-cyan-600"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>น้อยเกินไป</span>
            <span>เพียงพอ</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Activity size={16} className="text-red-500" /> อาการบาดเจ็บ (Pain)
            </span>
            <span className="text-sm font-bold text-red-600">{wellnessValues.pain}/5</span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            value={wellnessValues.pain}
            onChange={(e) => setWellnessValues({ ...wellnessValues, pain: parseInt(e.target.value) })}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>ไม่มีอาการ (1)</span>
            <span>เจ็บหนัก (5)</span>
          </div>
        </div>

        <button
          onClick={handleSaveWellness}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-sm hover:bg-indigo-700 transition-colors"
        >
          บันทึกสภาพร่างกายวันนี้
        </button>

        {isWellnessSaved && (
          <div className="text-center text-sm font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
            ✓ บันทึกข้อมูลสำเร็จ
          </div>
        )}
      </div>
    </div>
  );
}
