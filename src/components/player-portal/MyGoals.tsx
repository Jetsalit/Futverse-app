import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, getDocs, where, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import notificationService from "../../services/notificationService";
import { Plus, Target, CheckCircle, Clock, Trash2, Edit2, X, Activity, Brain, Dumbbell, ShieldAlert, Star, MessageSquare } from "lucide-react";

interface MyGoalsProps {
  academyId: string;
  playerId: string;
  initialEvaluation?: { evaluationId: string; category?: string } | null;
  onGoalCreated?: () => void;
}

export default function MyGoals({ academyId, playerId, initialEvaluation, onGoalCreated }: MyGoalsProps) {
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    type: "SHORT_TERM",
    category: "TECHNICAL",
    status: "IN_PROGRESS",
  });

  useEffect(() => {
    if (!academyId || !playerId) return;
    const goalsRef = collection(db, `academies/${academyId}/players/${playerId}/goals`);
    const q = query(goalsRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setGoals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [academyId, playerId]);

  useEffect(() => {
    if (initialEvaluation) {
      setIsAdding(true);
      if (initialEvaluation.category) {
        const catUpper = initialEvaluation.category.toUpperCase();
        const validCat = ["TECHNICAL", "TACTICAL", "PHYSICAL", "MENTAL"].includes(catUpper)
          ? catUpper
          : "TECHNICAL";
        setForm(f => ({ ...f, category: validCat }));
      }
    }
  }, [initialEvaluation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    try {
      let shouldNotifyCoach = false;
      let finalGoalId = editingId;

      if (editingId) {
        const ref = doc(db, `academies/${academyId}/players/${playerId}/goals`, editingId);
        const existingGoal = goals.find(g => g.id === editingId);
        const updatedPayload: any = {
          ...form,
          updatedAt: serverTimestamp()
        };
        // If re-submitting a goal that needed revision, set approvalStatus back to PROPOSED
        if (existingGoal?.approvalStatus === "NEEDS_REVISION" || !existingGoal?.approvalStatus || existingGoal?.approvalStatus === "PROPOSED") {
          updatedPayload.approvalStatus = "PROPOSED";
          shouldNotifyCoach = true;
        }
        await updateDoc(ref, updatedPayload);
      } else {
        const ref = collection(db, `academies/${academyId}/players/${playerId}/goals`);
        const payload: any = {
          ...form,
          approvalStatus: "PROPOSED",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        if (initialEvaluation?.evaluationId) {
          payload.evaluationId = initialEvaluation.evaluationId;
          payload.sourceEvaluationId = initialEvaluation.evaluationId;
        }
        const newDoc = await addDoc(ref, payload);
        finalGoalId = newDoc.id;
        shouldNotifyCoach = true;
      }

      if (shouldNotifyCoach && finalGoalId) {
        try {
          let playerName = "นักกีฬาในความดูแลของคุณ";
          const pSnap = await getDoc(doc(db, `academies/${academyId}/players/${playerId}`));
          if (pSnap.exists()) {
            const pData = pSnap.data();
            playerName = pData.firstName ? `${pData.firstName} ${pData.lastName || ''}`.trim() : playerName;
          }
          
          const coachesRef = collection(db, `academies/${academyId}/coaches`);
          const coachSnap = await getDocs(coachesRef);
          const coachUids = coachSnap.docs
            .map(d => {
              const data = d.data();
              return data.userId || data.userID || data.userid || data.uid || data.user_id || data.authUid;
            })
            .filter((uid): uid is string => Boolean(uid));
          
          if (coachUids.length > 0) {
            await notificationService.notifyGoalProposed(coachUids, playerName, finalGoalId, academyId);
          }
        } catch(e: any) {
          console.error("Error sending coach notification:", e);
        }
      }
      setIsAdding(false);
      setEditingId(null);
      setForm({ title: "", type: "SHORT_TERM", category: "TECHNICAL", status: "IN_PROGRESS" });
      onGoalCreated?.();
    } catch (error: any) {
      console.error("Error saving goal:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("คุณต้องการลบเป้าหมายนี้ใช่หรือไม่?")) return;
    try {
      await deleteDoc(doc(db, `academies/${academyId}/players/${playerId}/goals`, id));
    } catch (error) {
      console.error("Error deleting goal:", error);
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "TECHNICAL": return <Target size={16} className="text-blue-500" />;
      case "TACTICAL": return <Brain size={16} className="text-purple-500" />;
      case "PHYSICAL": return <Dumbbell size={16} className="text-orange-500" />;
      case "MENTAL": return <Activity size={16} className="text-green-500" />;
      default: return <Target size={16} />;
    }
  };

  if (loading) return <div className="p-4 text-center text-slate-500 animate-pulse">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="bg-white rounded-3xl p-6 pb-36 sm:pb-40 shadow-sm border border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
            <Target size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">My Goals</h2>
            <p className="text-sm text-slate-500">เป้าหมายการพัฒนาของฉัน</p>
          </div>
        </div>
        <button
          onClick={() => {
            setForm({ title: "", type: "SHORT_TERM", category: "TECHNICAL", status: "IN_PROGRESS" });
            setIsAdding(true);
            setEditingId(null);
          }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          เพิ่มเป้าหมาย
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-700">{editingId ? "แก้ไขเป้าหมาย" : "เป้าหมายใหม่"}</h3>
            <button type="button" onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">หัวข้อเป้าหมาย</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={e => setForm({...form, title: e.target.value})}
                className="w-full border border-slate-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 bg-white font-medium placeholder:text-slate-400"
                style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
                placeholder="เช่น ยิงประตูด้วยเท้าซ้าย"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ประเภทเป้าหมาย</label>
                <select 
                  value={form.type}
                  onChange={e => setForm({...form, type: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2 bg-white text-slate-900 font-medium"
                  style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
                >
                  <option value="SHORT_TERM" style={{ color: '#0f172a' }}>ระยะสั้น (Short Term)</option>
                  <option value="LONG_TERM" style={{ color: '#0f172a' }}>ระยะยาว (Long Term)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมวดหมู่</label>
                <select 
                  value={form.category}
                  onChange={e => setForm({...form, category: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2 bg-white text-slate-900 font-medium"
                  style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
                >
                  <option value="TECHNICAL" style={{ color: '#0f172a' }}>ทักษะ (Technical)</option>
                  <option value="TACTICAL" style={{ color: '#0f172a' }}>แทคติก (Tactical)</option>
                  <option value="PHYSICAL" style={{ color: '#0f172a' }}>ร่างกาย (Physical)</option>
                  <option value="MENTAL" style={{ color: '#0f172a' }}>จิตใจ (Mental)</option>
                </select>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/80 border border-indigo-100 text-xs text-indigo-700 font-medium flex items-center gap-2">
              <span>💡</span>
              <span><strong>หมายเหตุ:</strong> นักกีฬามีหน้าที่เสนอหัวข้อ เลือกประเภท และหมวดหมู่เป้าหมาย ส่วนวิธีการฝึกซ้อม (Training Process) จะเป็นความรับผิดชอบของโค้ชผ่านแผน IDP</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 font-medium text-sm">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-medium text-sm">บันทึกเป้าหมาย</button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {goals.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <Target size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500">ยังไม่มีเป้าหมาย เริ่มตั้งเป้าหมายแรกกันเลย!</p>
          </div>
        ) : (
          goals.map(goal => (
            <div key={goal.id} className={`flex items-start justify-between p-4 rounded-2xl border ${goal.status === 'ACHIEVED' ? 'bg-green-50/50 border-green-200' : 'bg-white border-slate-200'} transition-all hover:shadow-sm`}>
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  {getCategoryIcon(goal.category)}
                </div>
                <div>
                  <h3 className={`font-semibold ${goal.status === 'ACHIEVED' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                    {goal.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${goal.type === 'SHORT_TERM' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {goal.type.replace("_", " ")}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider bg-slate-100 text-slate-600">
                      {goal.category}
                    </span>
                    {goal.approvalStatus === "PROPOSED" && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock size={10} className="text-amber-500" />
                        รอโค้ชพิจารณา (Proposed)
                      </span>
                    )}
                    {goal.approvalStatus === "NEEDS_REVISION" && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                        <ShieldAlert size={10} className="text-orange-500" />
                        ต้องแก้ไข (Needs Revision)
                      </span>
                    )}
                    {goal.approvalStatus === "REJECTED" && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                        <X size={10} className="text-rose-500" />
                        ไม่อนุมัติ (Rejected)
                      </span>
                    )}
                    {(goal.evaluationId || goal.sourceEvaluationId) && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Star size={10} className="fill-indigo-500 text-indigo-500" />
                        Linked to Coach Evaluation
                      </span>
                    )}
                    {(goal.idpId || goal.convertedToIdp || goal.sourceIdpId) && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                        <Target size={10} className="text-purple-500" />
                        Converted to IDP
                      </span>
                    )}
                    {goal.status === 'ACHIEVED' && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-green-100 text-green-700">
                        <CheckCircle size={12} />
                        ACHIEVED
                      </span>
                    )}
                  </div>
                  {(goal.coachFeedback || goal.revisionReason || goal.revisionSuggestedTitle || goal.revisionOption) && (
                    <div className="mt-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-slate-800 space-y-1.5 shadow-sm">
                      <div className="font-bold flex items-center justify-between gap-1.5 text-amber-800">
                        <span className="flex items-center gap-1.5">
                          <MessageSquare size={13} className="text-amber-600" />
                          คำแนะนำจากโค้ช:
                        </span>
                        {goal.revisionOption === "OPTION_A" && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-bold">
                            Option A: แก้หัวข้อ Goal
                          </span>
                        )}
                        {goal.revisionOption === "OPTION_B" && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-bold">
                            Option B: ปรับทิศทางเป้าหมาย (Pivot)
                          </span>
                        )}
                        {goal.revisionOption === "OPTION_C" && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold">
                            Option C: โค้ชแก้ชื่อให้โดยตรง
                          </span>
                        )}
                      </div>
                      {goal.revisionReason && (
                        <div className="p-2 rounded-lg bg-white/80 border border-amber-200/60 text-orange-900 leading-relaxed">
                          <strong>⚠️ เหตุผลที่ส่งกลับให้แก้ไข:</strong> {goal.revisionReason}
                        </div>
                      )}
                      {goal.revisionSuggestedTitle && (
                        <div className="text-blue-800 font-medium">
                          💡 <strong>หัวข้อที่โค้ชแนะนำให้ปรับแก้:</strong> "{goal.revisionSuggestedTitle}"
                        </div>
                      )}
                      {goal.coachFeedback && (
                        <p className="text-slate-700 italic pt-0.5">"{goal.coachFeedback}"</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => {
                    setForm({ title: goal.title, type: goal.type, category: goal.category, status: goal.status });
                    setEditingId(goal.id);
                    setIsAdding(true);
                  }}
                  className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={() => handleDelete(goal.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
