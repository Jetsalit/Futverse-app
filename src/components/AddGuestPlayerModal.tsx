import React, { useState, useEffect } from "react";
import { Search, X, UserPlus } from "lucide-react";
import { useAcademy } from "../contexts/AcademyContext";
import { query, getDocs } from "firebase/firestore";

interface AddGuestPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddGuest: (player: any) => void;
  currentAgeGroup: string;
}

export const AddGuestPlayerModal: React.FC<AddGuestPlayerModalProps> = ({
  isOpen,
  onClose,
  onAddGuest,
  currentAgeGroup,
}) => {
  const { getAcademyCollection, settings, activeSeason } = useAcademy();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const ageGroups = settings?.squads || ["U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18"];

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setSelectedAgeGroup("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    
    const fetchPlayers = async () => {
      setLoading(true);
      try {
        const playersRef = getAcademyCollection("players");
        const q = query(playersRef);
        const snapshot = await getDocs(q);
        
        let results = snapshot.docs.map(doc => {
          const data = doc.data();
          const pSquad = data.seasonHistory?.[activeSeason]?.squad || data.ageGroup;
          const pActive = data.seasonHistory?.[activeSeason]?.active ?? (data.status === "ACTIVE");
          return { id: doc.id, ...data, activeSquad: pSquad, isActive: pActive };
        }).filter(p => p.isActive);
        
        if (selectedAgeGroup) {
          results = results.filter(p => p.activeSquad === selectedAgeGroup);
        }

        if (searchQuery) {
          const lowerQ = searchQuery.toLowerCase();
          results = results.filter(p => 
            p.firstName?.toLowerCase().includes(lowerQ) ||
            p.lastName?.toLowerCase().includes(lowerQ) ||
            p.futId?.toLowerCase().includes(lowerQ)
          );
        }

        // Sort results by activeSquad and firstName for predictable order
        results.sort((a, b) => {
          const squadA = a.activeSquad || "";
          const squadB = b.activeSquad || "";
          const squadComp = squadA.localeCompare(squadB, undefined, { numeric: true });
          if (squadComp !== 0) return squadComp;
          return (a.firstName || "").localeCompare(b.firstName || "");
        });

        setSearchResults(results);
      } catch (err) {
        console.error("Error fetching players:", err);
      } finally {
        setLoading(false);
      }
    };
    
    const timeoutId = setTimeout(fetchPlayers, 300);
    return () => clearTimeout(timeoutId);
  }, [isOpen, searchQuery, selectedAgeGroup, getAcademyCollection, activeSeason]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Add Guest Player</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Age Group</label>
            <select
              value={selectedAgeGroup}
              onChange={(e) => setSelectedAgeGroup(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Age Groups</option>
              {ageGroups.map((ag: string) => (
                <option key={ag} value={ag}>{ag}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Search Player</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search by Name or FUT ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center p-8 text-slate-500 text-sm">
              No players found.
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map(player => (
                <div key={player.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                      {player.photoUrl ? (
                        <img src={player.photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold">
                          {player.firstName?.[0]}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        {player.firstName} {player.lastName}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span>{player.position || "N/A"}</span>
                        <span>•</span>
                        <span className="font-bold text-indigo-500">{player.activeSquad}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onAddGuest(player);
                      onClose();
                    }}
                    disabled={player.activeSquad === currentAgeGroup}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${player.activeSquad === currentAgeGroup ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'}`}
                  >
                    <UserPlus size={14} /> {player.activeSquad === currentAgeGroup ? 'In Group' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
