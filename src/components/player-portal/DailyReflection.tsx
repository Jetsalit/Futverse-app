import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, deleteField } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { BookOpen, Smile, Meh, Frown, Plus, X, Edit2, Trash2, Target } from "lucide-react";

interface DailyReflectionProps {
  academyId: string;
  playerId: string;
}

export default function DailyReflection({ academyId, playerId }: DailyReflectionProps) {
  const [journals, setJournals] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    mood: "GOOD",
    reflection: "",
    tags: [] as string[],
    goalId: "",
  });

  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (!academyId || !playerId) return;
    const ref = collection(db, `academies/${academyId}/players/${playerId}/journals`);
    const q = query(ref, orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setJournals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [academyId, playerId]);

  useEffect(() => {
    if (!academyId || !playerId) return;
    const goalsRef = collection(db, `academies/${academyId}/players/${playerId}/goals`);
    const qGoals = query(goalsRef, orderBy("createdAt", "desc"));
    const unsubGoals = onSnapshot(qGoals, (snap) => {
      setGoals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubGoals();
  }, [academyId, playerId]);

  const handleAddTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
      setForm({ ...form, tags: [...form.tags, tagInput.trim()] });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setForm({ ...form, tags: form.tags.filter(t => t !== tag) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reflection.trim()) return;

    try {
      const payload: any = {
        date: form.date,
        mood: form.mood,
        reflection: form.reflection,
        tags: form.tags,
        updatedAt: serverTimestamp()
      };

      if (form.goalId) {
        payload.goalId = form.goalId;
        const selectedGoal = goals.find(g => g.id === form.goalId);
        const linkedIdpId = selectedGoal?.idpId || selectedGoal?.sourceIdpId;
        if (linkedIdpId) {
          payload.idpId = linkedIdpId;
        }
      }

      if (editingId) {
        const docRef = doc(db, `academies/${academyId}/players/${playerId}/journals`, editingId);
        if (form.goalId) {
          const selectedGoal = goals.find(g => g.id === form.goalId);
          const linkedIdpId = selectedGoal?.idpId || selectedGoal?.sourceIdpId;
          const updateObj: any = {
            ...payload,
            goalId: form.goalId
          };
          if (linkedIdpId) {
            updateObj.idpId = linkedIdpId;
          } else {
            updateObj.idpId = deleteField();
          }
          await updateDoc(docRef, updateObj);
        } else {
          await updateDoc(docRef, {
            ...payload,
            goalId: deleteField(),
            idpId: deleteField()
          });
        }
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, `academies/${academyId}/players/${playerId}/journals`), payload);
      }
      setIsAdding(false);
      setEditingId(null);
      setForm({ date: new Date().toISOString().split("T")[0], mood: "GOOD", reflection: "", tags: [], goalId: "" });
    } catch (error) {
      console.error("Error saving journal:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("คุณต้องการลบบันทึกนี้ใช่หรือไม่?")) return;
    try {
      await deleteDoc(doc(db, `academies/${academyId}/players/${playerId}/journals`, id));
    } catch (error) {
      console.error("Error deleting journal:", error);
    }
  };

  const getMoodIcon = (mood: string, size = 16) => {
    switch (mood) {
      case "GREAT": return <Smile size={size} className="text-green-500" />;
      case "GOOD": return <Smile size={size} className="text-blue-500" />;
      case "OKAY": return <Meh size={size} className="text-amber-500" />;
      case "BAD": return <Frown size={size} className="text-red-500" />;
      default: return <Smile size={size} />;
    }
  };

  if (loading) return <div className="p-4 text-center text-slate-500 animate-pulse">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="bg-white rounded-3xl p-6 pb-28 sm:pb-32 shadow-sm border border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
            <BookOpen size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Daily Reflection</h2>
            <p className="text-sm text-slate-500">บันทึกความรู้สึกและสิ่งที่ได้เรียนรู้</p>
          </div>
        </div>
        <button
          onClick={() => {
            setForm({ date: new Date().toISOString().split("T")[0], mood: "GOOD", reflection: "", tags: [], goalId: "" });
            setIsAdding(true);
            setEditingId(null);
          }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          เขียนบันทึกใหม่
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-700">{editingId ? "แก้ไขบันทึก" : "บันทึกใหม่"}</h3>
            <button type="button" onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">เป้าหมายที่ฝึกซ้อมวันนี้ (Optional)</label>
              <select
                value={form.goalId}
                onChange={e => setForm({...form, goalId: e.target.value})}
                className="w-full border border-slate-300 rounded-xl px-4 py-2 bg-white text-slate-900 font-medium"
                style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
              >
                <option value="" style={{ color: '#0f172a' }}>-- ไม่ได้เชื่อมกับเป้าหมายใด --</option>
                {goals
                  .filter(g => (g.approvalStatus === "APPROVED" || !g.approvalStatus) && (g.status === "IN_PROGRESS" || g.id === form.goalId))
                  .map(g => (
                    <option key={g.id} value={g.id} style={{ color: '#0f172a' }}>
                      {g.title} ({g.category})
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">วันที่</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={e => setForm({...form, date: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 bg-white font-medium"
                  style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ความรู้สึกวันนี้</label>
                <select 
                  value={form.mood}
                  onChange={e => setForm({...form, mood: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2 bg-white text-slate-900 font-medium"
                  style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
                >
                  <option value="GREAT" style={{ color: '#0f172a' }}>ยอดเยี่ยม (Great)</option>
                  <option value="GOOD" style={{ color: '#0f172a' }}>ดี (Good)</option>
                  <option value="OKAY" style={{ color: '#0f172a' }}>เฉยๆ (Okay)</option>
                  <option value="BAD" style={{ color: '#0f172a' }}>แย่ (Bad)</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">สิ่งที่ได้เรียนรู้ หรืออยากบันทึกไว้</label>
              <textarea
                required
                value={form.reflection}
                onChange={e => setForm({...form, reflection: e.target.value})}
                rows={4}
                className="w-full border border-slate-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-slate-900 bg-white font-medium placeholder:text-slate-400"
                style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
                placeholder="วันนี้ซ้อมเป็นยังไงบ้าง มีอะไรที่ทำได้ดี หรือต้องปรับปรุง..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tags (เช่น แมตช์เดย์, ฟื้นฟูร่างกาย)</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  className="flex-1 border border-slate-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 bg-white font-medium placeholder:text-slate-400"
                  style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
                  placeholder="พิมพ์แท็กแล้วกด Add"
                />
                <button type="button" onClick={handleAddTag} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-sm font-medium">Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-sm font-medium">
                    #{tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-indigo-800"><X size={14} /></button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 font-medium text-sm">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-medium text-sm">บันทึก</button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {journals.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <BookOpen size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500">ยังไม่มีบันทึก เริ่มเขียนความรู้สึกแรกของคุณเลย!</p>
          </div>
        ) : (
          journals.map(journal => {
            const linkedGoal = journal.goalId ? goals.find(g => g.id === journal.goalId) : null;
            return (
              <div key={journal.id} className="bg-white rounded-2xl p-5 border border-slate-200 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                      {getMoodIcon(journal.mood, 20)}
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-800">{new Date(journal.date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => {
                        setForm({ date: journal.date, mood: journal.mood, reflection: journal.reflection, tags: journal.tags || [], goalId: journal.goalId || "" });
                        setEditingId(journal.id);
                        setIsAdding(true);
                      }}
                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(journal.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {linkedGoal && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl w-fit">
                      <Target size={14} className="text-indigo-600" />
                      <span>🎯 เป้าหมาย: {linkedGoal.title}</span>
                    </div>
                    {(journal.idpId || linkedGoal?.idpId || linkedGoal?.sourceIdpId) && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg w-fit">
                        <Target size={12} className="text-purple-600" />
                        <span>IDP Connected</span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-slate-700 text-sm whitespace-pre-wrap">{journal.reflection}</p>
                {journal.tags && journal.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
                    {journal.tags.map((tag: string) => (
                      <span key={tag} className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
