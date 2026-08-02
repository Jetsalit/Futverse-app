import React, { useState, useEffect, useMemo } from "react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import { collection, query, getDocs, addDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { Save, ChevronLeft, Star, User } from "lucide-react";
import { Criteria, CATEGORY_ICONS } from "./EvaluationCriteriaManager";
import { useAcademy } from "../contexts/AcademyContext";

interface PlayerEvaluationFormProps {
  onBack: () => void;
}

export default function PlayerEvaluationForm({ onBack }: PlayerEvaluationFormProps) {
  const { currentUser } = useAuth();
  const { getAcademyCollection, academyId } = useAcademy();
  
  const [players, setPlayers] = useState<{id: string, name: string, ageGroup: string}[]>([]);
  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [evaluationDate, setEvaluationDate] = useState(new Date().toISOString().split('T')[0]);
  const [scores, setScores] = useState<Record<string, number>>({});
  
  const CATEGORIES = [
    "Attacking Techniques",
    "Defending Techniques",
    "Tactical Awareness",
    "Physical Attributes",
    "Mental Attributes",
    "Social Skills",
    "Goalkeeping"
  ];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Players
        const playersRef = getAcademyCollection("players");
        const playersQ = query(playersRef);
        const playersSnap = await getDocs(playersQ);
        const fetchedPlayers = playersSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: `${data.firstName} ${data.lastName}`,
            ageGroup: data.ageGroup
          };
        });
        setPlayers(fetchedPlayers);

        // Fetch Criteria - read from current academy-scoped collection
        const criteriaRef = getAcademyCollection("evaluation_criteria");
        const criteriaSnap = await getDocs(criteriaRef);
        let fetchedCriteria = criteriaSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Criteria))
          .filter(c => c.status !== "inactive");

        // Also fetch global criteria from superadmin_system (where SUPERADMIN saves them)
        if (academyId !== "superadmin_system") {
          try {
            const globalRef = collection(db, "academies", "superadmin_system", "evaluation_criteria");
            const globalSnap = await getDocs(globalRef);
            const globalData = globalSnap.docs
              .map(doc => ({ id: doc.id, ...doc.data() } as Criteria))
              .filter(c => c.status !== "inactive");
            const existingNames = new Set(fetchedCriteria.map(d => d.criteria_name));
            globalData.forEach(d => {
              if (!existingNames.has(d.criteria_name)) fetchedCriteria.push(d);
            });
          } catch (e) {
            console.warn("Failed to fetch global criteria from superadmin_system", e);
          }
        }
        
        setCriteriaList(fetchedCriteria);
        
        // Initialize scores
        const initialScores: Record<string, number> = {};
        fetchedCriteria.forEach(c => {
          initialScores[c.criteria_name] = 0; // 0 means unrated
        });
        setScores(initialScores);
        
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    if (currentUser) {
      fetchData();
    }
  }, [currentUser]);

  const handleScoreChange = (criteriaName: string, score: number) => {
    setScores(prev => ({
      ...prev,
      [criteriaName]: score
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedPlayerId) {
      alert("Please select a player");
      return;
    }

    try {
      const evaluationData = {
        player_id: selectedPlayerId,
        coach_id: currentUser.id,
        academy_id: currentUser.academyId || "",
        evaluation_date: evaluationDate,
        scores: scores,
        timestamp: new Date().toISOString()
      };

      await addDoc(getAcademyCollection("player_evaluations"), evaluationData);
      alert("Evaluation saved successfully!");
      onBack();
    } catch (error) {
      console.error("Error saving evaluation:", error);
      alert("Failed to save evaluation");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-3 cursor-pointer"
          >
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="text-3xl font-black text-slate-800 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-indigo-400 dark:to-emerald-400 tracking-tight flex items-center gap-3 dark:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">
            Player Evaluation
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Comprehensive Performance Evaluation</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm mb-8 backdrop-blur-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Select Player</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={18} className="text-slate-400 dark:text-slate-500" />
              </div>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-500/50 focus:border-indigo-500 dark:focus:border-indigo-500/50 outline-none transition-all text-slate-700 dark:text-slate-200"
                required
              >
                <option value="">-- Choose a player --</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.ageGroup})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Evaluation Date</label>
            <ThaiDatePicker
              required
              value={evaluationDate}
              onChange={(e) => setEvaluationDate(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500 dark:focus-within:ring-indigo-500/50 focus-within:border-indigo-500 dark:focus-within:border-indigo-500/50 outline-none transition-all text-slate-700 dark:text-slate-200"
            />
          </div>
        </div>
      </div>

      {selectedPlayerId && criteriaList.length > 0 ? (
        <form onSubmit={handleSubmit} className="space-y-8">
          {CATEGORIES.map(category => {
            const categoryCriteria = criteriaList.filter(c => c.category === category);
            if (categoryCriteria.length === 0) return null;

            return (
              <div key={category} className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden shadow-sm backdrop-blur-sm">
                <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-700/50 flex items-center gap-3">
                  {CATEGORY_ICONS[category] && React.createElement(CATEGORY_ICONS[category], { className: "text-indigo-600 dark:text-indigo-400", size: 24 })}
                  <h3 className="font-black text-slate-800 dark:text-slate-200 text-lg">{category}</h3>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {categoryCriteria.map(criteria => (
                    <div key={criteria.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200">{criteria.criteria_name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => handleScoreChange(criteria.criteria_name, star)}
                            className="p-1 focus:outline-none transition-transform hover:scale-110 cursor-pointer"
                          >
                            <Star
                              size={28}
                              className={
                                star <= (scores[criteria.criteria_name] || 0)
                                  ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]"
                                  : "fill-slate-100 dark:fill-slate-700 text-slate-200 dark:text-slate-600"
                              }
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-3 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-8 py-3 font-bold text-white bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 cursor-pointer"
            >
              <Save size={20} />
              <span>Save Evaluation</span>
            </button>
          </div>
        </form>
      ) : selectedPlayerId ? (
        <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-8 text-center text-slate-500 dark:text-slate-400 backdrop-blur-sm">
          No active criteria found. Please add criteria in Settings first.
        </div>
      ) : null}
    </div>
  );
}
