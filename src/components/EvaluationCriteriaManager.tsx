import React, { useState, useEffect } from "react";
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useAcademy } from "../contexts/AcademyContext";
import { Save, Plus, Edit2, Trash2, X, AlertTriangle, Filter, Swords, Shield, Brain, Zap, Target, Users, Hand } from "lucide-react";
import { EmptyState } from "./common/EmptyState";

export interface Criteria {
  id: string;
  criteria_name: string;
  category: string;
  academy_id: string;
  created_by: string;
  status: "active" | "inactive";
}

export const CATEGORIES = [
  "Attacking Techniques",
  "Defending Techniques",
  "Tactical Awareness",
  "Physical Attributes",
  "Mental Attributes",
  "Social Skills",
  "Goalkeeping"
];

export const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Attacking Techniques": Swords,
  "Defending Techniques": Shield,
  "Tactical Awareness": Brain,
  "Physical Attributes": Zap,
  "Mental Attributes": Target,
  "Social Skills": Users,
  "Goalkeeping": Hand
};

export default function EvaluationCriteriaManager() {
  const { currentUser, hasPermission, actualUser } = useAuth();
  const { getAcademyCollection, academyId } = useAcademy();
  const isActualSuperAdmin = actualUser?.role === "SUPERADMIN";
  const isSuperAdmin = hasPermission(["SUPERADMIN"]);
  const isAdmin = hasPermission(["ADMIN", "SUPERADMIN"]);
  
  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    criteria_name: "",
    category: CATEGORIES[0],
    academy_id: currentUser?.academyId || "global",
    status: "active" as "active" | "inactive"
  });

  // Track which criteria come from superadmin_system vs current academy
  const [globalCriteriaIds, setGlobalCriteriaIds] = useState<Set<string>>(new Set());

  const fetchCriteria = async () => {
    setLoading(true);
    try {
      const criteriaRef = getAcademyCollection("evaluation_criteria");
      const snapshot = await getDocs(criteriaRef);
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Criteria));
      const newGlobalIds = new Set<string>();

      // Also fetch global criteria from superadmin_system
      if (academyId !== "superadmin_system") {
        try {
          const globalRef = collection(db, "academies", "superadmin_system", "evaluation_criteria");
          const globalSnap = await getDocs(globalRef);
          const globalData = globalSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Criteria));
          const existingNames = new Set(data.map(d => d.criteria_name));
          globalData.forEach(d => {
            if (!existingNames.has(d.criteria_name)) {
              data.push(d);
              newGlobalIds.add(d.id);
            }
          });
        } catch (e) {
          console.warn("Failed to fetch global criteria from superadmin_system", e);
        }
      }

      setGlobalCriteriaIds(newGlobalIds);
      setCriteriaList(data);
    } catch (error) {
      console.error("Error fetching criteria:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchCriteria();
    }
  }, [currentUser]);

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      criteria_name: "",
      category: CATEGORIES[0],
      // When inside an academy, new criteria belong to that academy
      academy_id: academyId === "superadmin_system" ? "global" : (currentUser?.academyId || academyId),
      status: "active"
    });
    setIsModalOpen(true);
  };

  const openEditModal = (criteria: Criteria) => {
    setEditingId(criteria.id);
    setFormData({
      criteria_name: criteria.criteria_name,
      category: criteria.category,
      academy_id: criteria.academy_id,
      status: criteria.status
    });
    setIsModalOpen(true);
  };

  const isFromGlobal = (criteriaId: string) => globalCriteriaIds.has(criteriaId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      const dataToSave = {
        ...formData,
        created_by: currentUser.id
      };

      if (editingId) {
        // If editing a global criteria, write to superadmin_system collection
        if (isFromGlobal(editingId)) {
          const globalDocRef = doc(db, "academies", "superadmin_system", "evaluation_criteria", editingId);
          await updateDoc(globalDocRef, dataToSave);
        } else {
          await updateDoc(doc(getAcademyCollection("evaluation_criteria"), editingId), dataToSave);
        }
      } else {
        await addDoc(getAcademyCollection("evaluation_criteria"), dataToSave);
      }
      
      setIsModalOpen(false);
      fetchCriteria();
    } catch (error) {
      console.error("Error saving criteria:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this criteria?")) {
      try {
        // If deleting a global criteria, delete from superadmin_system collection
        if (isFromGlobal(id)) {
          const globalDocRef = doc(db, "academies", "superadmin_system", "evaluation_criteria", id);
          await deleteDoc(globalDocRef);
        } else {
          await deleteDoc(doc(getAcademyCollection("evaluation_criteria"), id));
        }
        fetchCriteria();
      } catch (error) {
        console.error("Error deleting criteria:", error);
      }
    }
  };

  const initializeDefaultCriteria = async () => {
    if (!currentUser) return;
    if (!window.confirm("This will automatically generate the standard 6-dimensional criteria. Proceed?")) return;
    
    setLoading(true);
    const defaultCriteria = [
      { category: "Attacking Techniques", criteria_name: "Dribbling" },
      { category: "Attacking Techniques", criteria_name: "Passing" },
      { category: "Attacking Techniques", criteria_name: "Shooting" },
      { category: "Attacking Techniques", criteria_name: "First Touch" },
      { category: "Attacking Techniques", criteria_name: "1v1 Attacking" },
      { category: "Defending Techniques", criteria_name: "Tackling" },
      { category: "Defending Techniques", criteria_name: "Marking" },
      { category: "Defending Techniques", criteria_name: "Interceptions" },
      { category: "Defending Techniques", criteria_name: "1v1 Defending" },
      { category: "Defending Techniques", criteria_name: "Aerial Ability" },
      { category: "Tactical Awareness", criteria_name: "Game Intelligence" },
      { category: "Tactical Awareness", criteria_name: "Spatial Awareness" },
      { category: "Tactical Awareness", criteria_name: "Vision" },
      { category: "Physical Attributes", criteria_name: "Speed" },
      { category: "Physical Attributes", criteria_name: "Stamina" },
      { category: "Physical Attributes", criteria_name: "Strength" },
      { category: "Physical Attributes", criteria_name: "Agility" },
      { category: "Mental Attributes", criteria_name: "Focus" },
      { category: "Mental Attributes", criteria_name: "Determination" },
      { category: "Mental Attributes", criteria_name: "Composure" },
      { category: "Mental Attributes", criteria_name: "Work Rate" },
      { category: "Social Skills", criteria_name: "Communication" },
      { category: "Social Skills", criteria_name: "Teamwork" },
      { category: "Social Skills", criteria_name: "Coachability" },
      { category: "Goalkeeping", criteria_name: "The \"Set Position\"" },
      { category: "Goalkeeping", criteria_name: "The \"Scoop\" technique" },
      { category: "Goalkeeping", criteria_name: "The \"Cup\" Technique" },
      { category: "Goalkeeping", criteria_name: "The \"W\" Technique" },
      { category: "Goalkeeping", criteria_name: "The \"Collapsing Save\"" },
      { category: "Goalkeeping", criteria_name: "The \"Low Diving Save\"" },
      { category: "Goalkeeping", criteria_name: "The \"High Diving Save\"" },
      { category: "Goalkeeping", criteria_name: "One v One: Diving at Feet" },
      { category: "Goalkeeping", criteria_name: "Dealing with Crosses" },
      { category: "Goalkeeping", criteria_name: "Distribution: Throwing" },
      { category: "Goalkeeping", criteria_name: "Distribution: Passing" }
    ];

    try {
      const criteriaCol = getAcademyCollection("evaluation_criteria");
      for (const item of defaultCriteria) {
        const existing = criteriaList.find(c => c.criteria_name === item.criteria_name && c.category === item.category);
        if (!existing) {
          await addDoc(criteriaCol, {
            ...item,
            academy_id: academyId === "superadmin_system" ? "global" : (currentUser.academyId || academyId),
            status: "active",
            created_by: currentUser.id
          });
        }
      }
      await fetchCriteria();
    } catch (e) {
      console.error("Error seeding default criteria:", e);
      setLoading(false);
    }
  };

  const canEdit = (criteria: Criteria) => {
    // Actual SUPERADMIN can always edit
    if (isActualSuperAdmin) return true;
    if (isAdmin) return true;
    // Global criteria from superadmin_system are read-only for non-admins
    if (isFromGlobal(criteria.id)) return false;
    // Coaches can edit their own academy's criteria
    return criteria.academy_id === currentUser?.academyId && criteria.academy_id !== "global";
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-indigo-400 dark:to-emerald-400 tracking-tight dark:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">Evaluation Criteria</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage performance evaluation dimensions and criteria.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={initializeDefaultCriteria}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition-colors shadow-sm"
          >
            <span>Restore Default Criteria</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={20} />
            <span>Add Criteria</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : criteriaList.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No Criteria Found"
          description="You haven't defined any evaluation criteria yet."
          primaryActionLabel="Add First Criteria"
          onPrimaryAction={openAddModal}
          secondaryActionLabel="Seed Standard Criteria"
          onSecondaryAction={initializeDefaultCriteria}
        />
      ) : (
        <div className="grid gap-6">
          {CATEGORIES.map(category => {
            const categoryCriteria = criteriaList.filter(c => c.category === category);
            if (categoryCriteria.length === 0) return null;
            
            return (
              <div key={category} className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden shadow-sm backdrop-blur-sm">
                <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {CATEGORY_ICONS[category] && React.createElement(CATEGORY_ICONS[category], { className: "text-indigo-600 dark:text-indigo-400", size: 20 })}
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">{category}</h3>
                  </div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-full">
                    {categoryCriteria.length} items
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {categoryCriteria.map(criteria => (
                    <div key={criteria.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-slate-800 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-indigo-400 dark:to-emerald-400 dark:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">{criteria.criteria_name}</h4>
                          {criteria.academy_id === "global" ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Global</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">Academy</span>
                          )}
                          {criteria.status === "inactive" && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border dark:border-slate-700">Inactive</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canEdit(criteria) ? (
                          <>
                            <button
                              onClick={() => openEditModal(criteria)}
                              className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Edit Criteria"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(criteria.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Delete Criteria"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        ) : (
                          <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1" title="Global criteria can only be edited by Superadmins">
                            <AlertTriangle size={14} /> Read Only
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-800">
                {editingId ? "Edit Criteria" : "Add Criteria"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Criteria Name</label>
                <input
                  type="text"
                  required
                  value={formData.criteria_name}
                  onChange={(e) => setFormData({ ...formData, criteria_name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="e.g. First Touch"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {isSuperAdmin && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Scope</label>
                  <select
                    value={formData.academy_id}
                    onChange={(e) => setFormData({ ...formData, academy_id: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="global">Global (All Academies)</option>
                    <option value={currentUser?.academyId || ""}>Academy Specific</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as "active" | "inactive" })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </form>

            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2.5 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors flex items-center gap-2 shadow-sm"
              >
                <Save size={18} />
                <span>Save Criteria</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
