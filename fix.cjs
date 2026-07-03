const fs = require('fs');
let content = fs.readFileSync('src/components/FitnessTesting.tsx', 'utf-8');

const importsToAdd = `
import { doc, deleteDoc, addDoc, updateDoc } from "firebase/firestore";
import { useAcademy } from "../contexts/AcademyContext";
import { Plus, Edit2, Trash2, X, Upload, Calendar, ChevronDown, Filter } from "lucide-react";
`;
content = content.replace('import { EmptyState } from "./common/EmptyState";', 'import { EmptyState } from "./common/EmptyState";\n' + importsToAdd);

const mainCompStart = content.indexOf('export default function FitnessTesting({');
let mainCompBody = content.substring(mainCompStart);

const oldUseState = 'const [players, setPlayers] = useState<Player[]>(MOCK_PLAYERS);';
const newUseState = `const { settings } = useAcademy();
  const [players, setPlayers] = useState<Player[]>([]);
  const [filterAge, setFilterAge] = useState("All");
  
  // CRUD state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    fitness_status: "Fit",
    position: "CM",
    ageGroup: "U15",
    avatarUrl: "",
  });`;
mainCompBody = mainCompBody.replace(oldUseState, newUseState);

const oldUseEffect = `  useEffect(() => {
    // Mock data
  }, [selectedPlayerId]);`;

const newUseEffect = `  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, "players"), (snapshot) => {
      const playersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Player[];
      setPlayers(playersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching players:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const calculateAge = (dob: string) => {
    if (!dob) return 0;
    const diff_ms = Date.now() - new Date(dob).getTime();
    const age_dt = new Date(diff_ms);
    return Math.abs(age_dt.getUTCFullYear() - 1970);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, avatarUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const openAddModal = () => {
    setEditingPlayerId(null);
    setFormData({
      firstName: "",
      lastName: "",
      dob: "",
      fitness_status: "Fit",
      position: "CM",
      ageGroup: settings?.squads?.[0] || "U15",
      avatarUrl: "",
    });
    setIsModalOpen(true);
  };

  const handleEditClick = (player: Player) => {
    setFormData({
      firstName: player.firstName,
      lastName: player.lastName,
      dob: player.dob,
      fitness_status: player.fitness_status || "Fit",
      position: player.position,
      ageGroup: player.ageGroup,
      avatarUrl: player.avatar || "",
    });
    setEditingPlayerId(player.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPlayerId(null);
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const playerData = {
        ...formData,
        age: calculateAge(formData.dob),
        avatar: formData.avatarUrl,
      };
      delete playerData.avatarUrl;

      if (editingPlayerId) {
        await updateDoc(doc(db, "players", editingPlayerId), playerData);
      } else {
        await addDoc(collection(db, "players"), playerData);
      }
      closeModal();
    } catch (error: any) {
      console.error("Error saving player:", error);
      alert("Error saving: " + error.message);
    }
  };

  const handleDeleteConfirm = async () => {
    if (playerToDelete) {
      try {
        await deleteDoc(doc(db, "players", playerToDelete));
        setPlayerToDelete(null);
      } catch (error: any) {
        console.error("Error deleting player:", error);
        alert("Error deleting: " + error.message);
      }
    }
  };

  const filteredPlayers = players.filter((p) => filterAge === "All" || p.ageGroup === filterAge);`;

mainCompBody = mainCompBody.replace(oldUseEffect, newUseEffect);

const oldGridCall = `<FitnessTestingGrid
            players={players}`;
const newGridCall = `<FitnessTestingGrid
            players={filteredPlayers}
            onEditPlayer={handleEditClick}
            onDeletePlayer={(p) => setPlayerToDelete(p.id)}
            filterAge={filterAge}
            setFilterAge={setFilterAge}
            squads={settings?.squads || ["U13", "U15", "U17", "U19", "U21"]}
            onAddPlayer={openAddModal}`;
mainCompBody = mainCompBody.replace(oldGridCall, newGridCall);

const modalsHtml = `
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-0">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h2 className="text-lg font-bold text-slate-800">
                {editingPlayerId ? "Edit Player" : "Add New Player"}
              </h2>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSavePlayer} className="p-6 overflow-y-auto">
              <div className="flex flex-col items-center justify-center mb-6">
                <label className="w-24 h-24 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors group relative overflow-hidden">
                  {formData.avatarUrl ? (
                    <img src={formData.avatarUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Upload size={24} className="mb-1 group-hover:-translate-y-1 transition-transform" />
                      <span className="text-[10px] font-medium uppercase tracking-wider">Photo</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">First Name</label>
                    <input required name="firstName" value={formData.firstName} onChange={handleInputChange} type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Last Name</label>
                    <input required name="lastName" value={formData.lastName} onChange={handleInputChange} type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Date of Birth</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input required name="dob" value={formData.dob} onChange={handleInputChange} type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Fitness Status</label>
                    <div className="relative">
                      <select name="fitness_status" value={formData.fitness_status} onChange={handleInputChange} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                        <option value="Fit">Fit</option>
                        <option value="Injured">Injured</option>
                        <option value="Returning">Returning</option>
                      </select>
                      <ChevronDown className="absolute right-3 text-slate-400 pointer-events-none top-1/2 -translate-y-1/2" size={18} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Position</label>
                    <div className="relative">
                      <select name="position" value={formData.position} onChange={handleInputChange} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                        <option value="GK">GK</option>
                        <option value="CB">CB</option>
                        <option value="LB">LB</option>
                        <option value="RB">RB</option>
                        <option value="CM">CM</option>
                        <option value="Winger">Winger</option>
                        <option value="Striker">Striker</option>
                      </select>
                      <ChevronDown className="absolute right-3 text-slate-400 pointer-events-none top-1/2 -translate-y-1/2" size={18} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Age Group</label>
                    <div className="relative">
                      <select name="ageGroup" value={formData.ageGroup} onChange={handleInputChange} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                        {(settings?.squads || ["U13", "U15", "U17", "U19"]).map((squad: string) => (
                          <option key={squad} value={squad}>{squad}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 text-slate-400 pointer-events-none top-1/2 -translate-y-1/2" size={18} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-8 flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">{editingPlayerId ? "Save Changes" : "Save Player"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {playerToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPlayerToDelete(null)}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirm Delete</h3>
            <p className="text-slate-500 text-sm mb-6">Are you sure you want to delete this player? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setPlayerToDelete(null)} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
              <button type="button" onClick={handleDeleteConfirm} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`;

mainCompBody = mainCompBody.replace('    </div>\n  );\n}', modalsHtml);
content = content.substring(0, mainCompStart) + mainCompBody;

// Update Grid Props
const gridStart = content.indexOf('function FitnessTestingGrid({');
const gridEnd = content.indexOf('  const [isSaving, setIsSaving]', gridStart);
const oldGridProps = content.substring(gridStart, gridEnd);
const newGridProps = `function FitnessTestingGrid({
  players,
  isOnline,
  onOfflineSave,
  saveStatus,
  setSaveStatus,
  testData,
  setTestData,
  onEditPlayer,
  onDeletePlayer,
  filterAge,
  setFilterAge,
  squads,
  onAddPlayer,
}: {
  players: Player[];
  isOnline: boolean;
  onOfflineSave?: () => void;
  saveStatus: "success" | "offline_queued" | null;
  setSaveStatus: React.Dispatch<React.SetStateAction<"success" | "offline_queued" | null>>;
  testData: Record<string, any>;
  setTestData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onEditPlayer: (player: Player) => void;
  onDeletePlayer: (player: Player) => void;
  filterAge: string;
  setFilterAge: (val: string) => void;
  squads: string[];
  onAddPlayer: () => void;
}) {
`;
content = content.replace(oldGridProps, newGridProps);

// Update PlayerTestRow props inside Grid
const oldPlayerRow = `const PlayerTestRow = memo(
  ({
    player,
    rowData,
    onChange,
  }: {
    player: Player;
    rowData: any;
    onChange: (id: string, field: string, value: string) => void;
  }) => {`;
const newPlayerRow = `const PlayerTestRow = memo(
  ({
    player,
    rowData,
    onChange,
    onEdit,
    onDelete,
  }: {
    player: Player;
    rowData: any;
    onChange: (id: string, field: string, value: string) => void;
    onEdit: (player: Player) => void;
    onDelete: (player: Player) => void;
  }) => {`;
content = content.replace(oldPlayerRow, newPlayerRow);

// Add Edit/Delete buttons to PlayerTestRow
const oldPlayerInfo = `              <div className="text-[10px] text-slate-500 flex gap-1.5 mt-0.5">
                <span className="font-bold text-slate-400">
                  {player.position}
                </span>
                <span>•</span>
                <span>{player.ageGroup}</span>
              </div>
            </div>
          </div>
        </td>`;
const newPlayerInfo = `              <div className="text-[10px] text-slate-500 flex gap-1.5 mt-0.5">
                <span className="font-bold text-slate-400">
                  {player.position}
                </span>
                <span>•</span>
                <span>{player.ageGroup}</span>
              </div>
            </div>
          </div>
          
          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
             <button type="button" onClick={() => onEdit(player)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
               <Edit2 size={14} />
             </button>
             <button type="button" onClick={() => onDelete(player)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
               <Trash2 size={14} />
             </button>
          </div>
        </td>`;
content = content.replace(oldPlayerInfo, newPlayerInfo);

// Render PlayerTestRow with onEdit/onDelete
const oldRowRender = `              <PlayerTestRow
                key={player.id}
                player={player}
                rowData={testData[player.id]}
                onChange={handleRowChange}
              />`;
const newRowRender = `              <PlayerTestRow
                key={player.id}
                player={player}
                rowData={testData[player.id]}
                onChange={handleRowChange}
                onEdit={onEditPlayer}
                onDelete={onDeletePlayer}
              />`;
content = content.replace(oldRowRender, newRowRender);

// Add Filter and Add Player buttons to Grid header
const oldGridHeader = `      <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
            ⚡
          </div>
          <div>
            <h2 className="font-bold text-sm sm:text-base">
              Squad Fitness Testing Bulk Entry
            </h2>
            <div className="text-xs text-slate-400 font-medium whitespace-nowrap">
              Input auto-calculates secondary metrics
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">`;
const newGridHeader = `      <div className="px-6 py-4 border-b border-slate-100 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
            ⚡
          </div>
          <div>
            <h2 className="font-bold text-sm sm:text-base">
              Squad Fitness Testing Bulk Entry
            </h2>
            <div className="text-xs text-slate-400 font-medium whitespace-nowrap">
              Input auto-calculates secondary metrics
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto shrink-0">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select
              value={filterAge}
              onChange={(e) => setFilterAge(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-8 py-2 text-sm font-bold text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="All">All Squads</option>
              {squads.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>
          
          <button type="button" onClick={onAddPlayer} className="px-3 py-2 flex items-center justify-center gap-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-sm font-bold transition shadow-sm">
            <Plus size={16} /> Add Player
          </button>
          `;
content = content.replace(oldGridHeader, newGridHeader);

fs.writeFileSync('src/components/FitnessTesting.tsx', content);
console.log('Success');
