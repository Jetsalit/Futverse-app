import React, { useState, useEffect } from "react";
import { X, Search, FileText } from "lucide-react";
import { useAcademy } from "../../contexts/AcademyContext";
import { getDocs, query, orderBy, Timestamp } from "firebase/firestore";

interface LoadMatchPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (plan: any) => void;
}

export default function LoadMatchPlanModal({ isOpen, onClose, onLoad }: LoadMatchPlanModalProps) {
  const { getAcademyCollection } = useAcademy();
  
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchPlans();
    }
  }, [isOpen]);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const plansRef = getAcademyCollection("match_plans");
      const q = query(plansRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      
      const loadedPlans = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setPlans(loadedPlans);
    } catch (err) {
      console.error("Failed to fetch match plans:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredPlans = plans.filter(p => 
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.squad?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.coachName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: any) => {
    if (!date) return "";
    // Handle Firestore Timestamp or Date object
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-800">Load Match Plan</h2>
            <p className="text-sm font-bold text-slate-500">
              Select a previously saved plan to restore
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by plan name, squad, or coach..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 font-bold"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="text-slate-400" size={24} />
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-1">No plans found</h3>
              <p className="text-sm font-bold text-slate-500">
                {searchQuery ? "Try a different search term" : "You haven't saved any match plans yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPlans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => {
                    onLoad(plan);
                    onClose();
                  }}
                  className="w-full text-left bg-white border border-slate-200 p-4 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-black text-slate-800 truncate group-hover:text-indigo-700 transition-colors">
                      {plan.name || "Untitled Plan"}
                    </h4>
                    <div className="flex items-center gap-3 mt-1.5 text-xs font-bold text-slate-500">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                        {plan.squad || "Unknown Squad"}
                      </span>
                      <span>•</span>
                      <span className="truncate">{plan.formation || "Unknown Formation"}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 sm:gap-1 text-xs font-bold text-slate-400 shrink-0">
                    <span>By {plan.coachName || "Unknown Coach"}</span>
                    <span>{formatDate(plan.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
