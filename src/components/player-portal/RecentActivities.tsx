import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, orderBy, limit, doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Target, BookOpen, Heart, ClipboardCheck, ArrowRight } from "lucide-react";

interface RecentActivitiesProps {
  academyId: string;
  playerId: string;
}

export default function RecentActivities({ academyId, playerId }: RecentActivitiesProps) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!academyId || !playerId) return;
    
    let isSubscribed = true;
    let localActivities: any[] = [];
    let activeSubscriptions = 0;

    const checkAndSet = () => {
      if (!isSubscribed) return;
      const sorted = [...localActivities].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
      setActivities(sorted);
      if (activeSubscriptions === 4) setLoading(false);
    };

    // 1. Goals
    const goalsQ = query(collection(db, `academies/${academyId}/players/${playerId}/goals`), orderBy("updatedAt", "desc"), limit(5));
    const unsubGoals = onSnapshot(goalsQ, (snap) => {
      localActivities = localActivities.filter(a => a.source !== "GOAL");
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.updatedAt) {
          localActivities.push({
            id: doc.id,
            source: "GOAL",
            title: data.status === "ACHIEVED" ? `ทำเป้าหมายสำเร็จ: ${data.title}` : `ตั้งเป้าหมาย: ${data.title}`,
            timestamp: data.updatedAt.toMillis(),
            icon: Target,
            color: data.status === "ACHIEVED" ? "text-green-500 bg-green-100" : "text-blue-500 bg-blue-100"
          });
        }
      });
      activeSubscriptions = Math.max(activeSubscriptions, 1);
      checkAndSet();
    });

    // 2. Journals (Reflections)
    const journalsQ = query(collection(db, `academies/${academyId}/players/${playerId}/journals`), orderBy("createdAt", "desc"), limit(5));
    const unsubJournals = onSnapshot(journalsQ, (snap) => {
      localActivities = localActivities.filter(a => a.source !== "JOURNAL");
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.createdAt) {
          localActivities.push({
            id: doc.id,
            source: "JOURNAL",
            title: `เขียนบันทึกประจำวัน (${data.mood})`,
            timestamp: data.createdAt.toMillis(),
            icon: BookOpen,
            color: "text-indigo-500 bg-indigo-100"
          });
        }
      });
      activeSubscriptions = Math.max(activeSubscriptions, 2);
      checkAndSet();
    });

    // 3. Wellness (Using today's doc as a proxy for recent activity, or fetch recent ones if they have a collection. Currently it's daily_wellness/{date})
    const wellnessRef = collection(db, `academies/${academyId}/players/${playerId}/daily_wellness`);
    const wellnessUnsub = onSnapshot(wellnessRef, (snap) => {
      localActivities = localActivities.filter(a => a.source !== "WELLNESS");
      snap.docs.forEach(doc => {
        // Doc ID is YYYY-MM-DD
        const date = new Date(doc.id);
        if (!isNaN(date.getTime())) {
          localActivities.push({
            id: doc.id,
            source: "WELLNESS",
            title: "อัปเดตสภาพร่างกาย (Wellness)",
            timestamp: date.getTime(),
            icon: Heart,
            color: "text-rose-500 bg-rose-100"
          });
        }
      });
      activeSubscriptions = Math.max(activeSubscriptions, 3);
      checkAndSet();
    });

    // 4. Evaluations (Coach) - Single Source of Truth: academies/{academyId}/player_evaluations
    const evalsQFixed = query(
      collection(db, `academies/${academyId}/player_evaluations`),
      where("player_id", "==", playerId)
    ); 
    const unsubEvals = onSnapshot(evalsQFixed, (snap) => {
      localActivities = localActivities.filter(a => a.source !== "EVALUATION");
      snap.docs.forEach(doc => {
        const data = doc.data();
        const evalTime = data.updatedAt?.toMillis 
          ? data.updatedAt.toMillis() 
          : data.evaluation_date 
          ? new Date(data.evaluation_date).getTime() 
          : data.timestamp 
          ? new Date(data.timestamp).getTime() 
          : 0;

        if (evalTime > 0) {
          localActivities.push({
            id: doc.id,
            source: "EVALUATION",
            title: `โค้ชประเมินผลการฝึกซ้อม/แข่ง`,
            timestamp: evalTime,
            icon: ClipboardCheck,
            color: "text-amber-500 bg-amber-100"
          });
        }
      });
      activeSubscriptions = Math.max(activeSubscriptions, 4);
      checkAndSet();
    });

    return () => {
      isSubscribed = false;
      unsubGoals();
      unsubJournals();
      wellnessUnsub();
      unsubEvals();
    };
  }, [academyId, playerId]);

  if (loading) return <div className="p-4 text-center text-slate-500 animate-pulse">กำลังโหลด Activities...</div>;

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-800">Recent Activities</h2>
        <button className="text-indigo-600 text-sm font-semibold hover:text-indigo-800 flex items-center gap-1">
          ดูทั้งหมด <ArrowRight size={14} />
        </button>
      </div>

      <div className="space-y-4">
        {activities.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">ยังไม่มีกิจกรรมล่าสุด</p>
        ) : (
          activities.map((act) => {
            const Icon = act.icon;
            return (
              <div key={`${act.source}-${act.id}`} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${act.color}`}>
                  <Icon size={14} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{act.title}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(act.timestamp).toLocaleString('th-TH', { 
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    })} น.
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
