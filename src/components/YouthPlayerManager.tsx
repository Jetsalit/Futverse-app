import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Filter,
  X,
  Upload,
  Calendar,
  ChevronDown,
  ChevronLeft,
  Edit2,
  Trash2,
  Users,
} from "lucide-react";
import YouthDevelopmentReport from "./YouthDevelopmentReport";
import { db } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import { useAcademy } from "../contexts/AcademyContext";
import { EmptyState } from "./common/EmptyState";

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  ageGroup: string;
  dob: string;
  age: number;
  fitness_status: string;
  avatar: string;
}

export default function YouthPlayerManager({
  onBack,
  onSelectPlayer,
}: {
  onBack: () => void;
  onSelectPlayer?: (player: any) => void;
}) {
  const { settings } = useAcademy();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAge, setFilterAge] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [reportPlayer, setReportPlayer] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    fitness_status: "Fit",
    position: "CM",
    ageGroup: settings.squads.length > 0 ? settings.squads[0] : "U15",
    avatarUrl: "",
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "players"), (snapshot) => {
      const loadedPlayers = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Player[];
      setPlayers(loadedPlayers);
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

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({
          ...prev,
          avatarUrl: reader.result as string,
        }));
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
      ageGroup: settings.squads.length > 0 ? settings.squads[0] : "U15",
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
      avatarUrl: player.avatar,
    });
    setEditingPlayerId(player.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPlayerId(null);
    setFormData({
      firstName: "",
      lastName: "",
      dob: "",
      fitness_status: "Fit",
      position: "CM",
      ageGroup: settings.squads.length > 0 ? settings.squads[0] : "U15",
      avatarUrl: "",
    });
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPlayerId) {
        await updateDoc(doc(db, "players", editingPlayerId), {
          firstName: formData.firstName,
          lastName: formData.lastName,
          position: formData.position,
          ageGroup: formData.ageGroup,
          dob: formData.dob,
          age: calculateAge(formData.dob),
          fitness_status: formData.fitness_status,
          ...(formData.avatarUrl ? { avatar: formData.avatarUrl } : {}),
        });
      } else {
        const newPlayer = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          position: formData.position,
          ageGroup: formData.ageGroup,
          dob: formData.dob,
          age: calculateAge(formData.dob),
          fitness_status: formData.fitness_status,
          avatar:
            formData.avatarUrl ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.firstName}${Date.now()}`,
        };
        await addDoc(collection(db, "players"), newPlayer);
      }
      closeModal();
    } catch (error) {
      console.error("Error saving player:", error);
    }
  };

  const handleDeleteConfirm = async () => {
    if (playerToDelete) {
      try {
        await deleteDoc(doc(db, "players", playerToDelete));
        setPlayerToDelete(null);
      } catch (error) {
        console.error("Error deleting player:", error);
      }
    }
  };

  const filteredPlayers = players.filter((p) => {
    const matchAge = filterAge === "All" || p.ageGroup === filterAge;
    const matchName = `${p.firstName} ${p.lastName}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchAge && matchName;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (reportPlayer) {
    return (
      <YouthDevelopmentReport
        player={reportPlayer}
        onBack={() => setReportPlayer(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="flex items-center gap-4 mb-4 shrink-0">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-slate-200 bg-white shadow-sm text-slate-600 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Youth Academy
          </h1>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
            Manage prospect rosters
          </p>
        </div>
        <div className="ml-auto">
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-colors text-sm"
          >
            <Plus size={18} />
            Add Player
          </button>
        </div>
      </div>

      {players.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Youth Players Yet"
          description="Add players to start managing your academy rosters."
          primaryActionLabel="Add Player"
          onPrimaryAction={openAddModal}
        />
      ) : (
        <>
          {/* Filters and Search */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 sm:w-48">
              <Filter className="text-slate-400 shrink-0" size={18} />
              <div className="relative w-full">
                <select
                  value={filterAge}
                  onChange={(e) => setFilterAge(e.target.value)}
                  className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="All">All Squads</option>
                  {settings.squads.map((squad) => (
                    <option key={squad} value={squad}>
                      {squad} Squad
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  size={16}
                />
              </div>
            </div>
          </div>

          {/* Player Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredPlayers.map((player) => (
              <div
                key={player.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow group relative"
              >
                <div className="h-20 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-100 relative group-hover:from-blue-100 group-hover:to-indigo-100 transition-colors">
                  <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/50 backdrop-blur-sm p-1 rounded-lg">
                    <button
                      onClick={() => handleEditClick(player)}
                      className="p-1 hover:text-blue-600 hover:bg-white rounded-md transition-colors text-slate-600"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setPlayerToDelete(player.id)}
                      className="p-1 hover:text-rose-600 hover:bg-white rounded-md transition-colors text-slate-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <span className="absolute top-3 right-3 bg-white px-2 py-1 rounded-md text-[10px] font-bold tracking-widest text-blue-700 uppercase border border-blue-100 shadow-sm">
                    {player.ageGroup}
                  </span>
                </div>

                <div className="px-5 pb-5 relative -mt-10">
                  <div className="w-20 h-20 rounded-full border-4 border-white bg-slate-100 mx-auto mb-3 overflow-hidden shadow-sm">
                    <img
                      src={
                        player.avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.firstName}`
                      }
                      alt={player.firstName}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="text-center mb-4">
                    <h3 className="font-bold text-slate-800 text-lg leading-tight">
                      {player.firstName}
                    </h3>
                    <p className="text-slate-500 text-sm">{player.lastName}</p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <div className="inline-flex items-center justify-center bg-slate-100 px-2.5 py-1 rounded-md text-xs font-bold text-slate-600">
                        {player.position}
                      </div>
                      <div
                        className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-bold ${
                          player.fitness_status === "Fit"
                            ? "bg-emerald-100 text-emerald-700"
                            : player.fitness_status === "Injured"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {player.fitness_status}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4 mt-2">
                    <div className="text-center mb-3">
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                        Age
                      </div>
                      <div className="font-semibold text-slate-700 text-sm">
                        {player.age}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => onSelectPlayer && onSelectPlayer(player)}
                        className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg transition-colors"
                      >
                        ดูโปรไฟล์ / IDP
                      </button>
                      <button
                        onClick={() => setReportPlayer(player)}
                        className="w-full text-xs font-bold text-teal-600 bg-teal-50 hover:bg-teal-100 px-3 py-2 rounded-lg transition-colors"
                      >
                        รายงานพัฒนาการ
                      </button>
                      <button
                        onClick={() => {
                          alert("Fitness Update Modal Coming Soon");
                        }}
                        className="w-full text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-lg transition-colors"
                      >
                        อัปเดตความฟิต
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filteredPlayers.length === 0 && (
              <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200 border-dashed">
                <p className="text-slate-500">
                  No players found matching your criteria.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Add/Edit Player Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeModal}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h2 className="text-lg font-bold text-slate-800">
                {editingPlayerId ? "Edit Youth Player" : "Add New Youth Player"}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePlayer} className="p-6 overflow-y-auto">
              {/* Photo Upload */}
              <div className="flex flex-col items-center justify-center mb-6">
                <label className="w-24 h-24 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors group relative overflow-hidden">
                  {formData.avatarUrl ? (
                    <img
                      src={formData.avatarUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <Upload
                        size={24}
                        className="mb-1 group-hover:-translate-y-1 transition-transform"
                      />
                      <span className="text-[10px] font-medium uppercase tracking-wider">
                        Photo
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      First Name
                    </label>
                    <input
                      required
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                      placeholder="Enter first name"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Last Name
                    </label>
                    <input
                      required
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                      placeholder="Enter last name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Date of Birth
                  </label>
                  <div className="relative">
                    <Calendar
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                    />
                    <input
                      required
                      name="dob"
                      value={formData.dob}
                      onChange={handleInputChange}
                      type="date"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700"
                    />
                  </div>
                  {formData.dob && (
                    <p className="text-xs text-emerald-600 mt-1.5 font-medium ml-1">
                      Calculated Age: {calculateAge(formData.dob)} years old
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Fitness Status
                    </label>
                    <div className="relative flex items-center">
                      <select
                        name="fitness_status"
                        value={formData.fitness_status}
                        onChange={handleInputChange}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 font-medium"
                      >
                        <option value="Fit">Fit</option>
                        <option value="Injured">Injured</option>
                        <option value="Returning">Returning</option>
                      </select>
                      <ChevronDown
                        className="absolute right-3 text-slate-400 pointer-events-none"
                        size={18}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Position
                    </label>
                    <div className="relative flex items-center">
                      <select
                        name="position"
                        value={formData.position}
                        onChange={handleInputChange}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 font-medium"
                      >
                        <option value="GK">GK - Goalkeeper</option>
                        <option value="CB">CB - Center Back</option>
                        <option value="LB">LB - Left Back</option>
                        <option value="RB">RB - Right Back</option>
                        <option value="CM">CM - Center Mid</option>
                        <option value="Winger">Winger</option>
                        <option value="Striker">Striker</option>
                      </select>
                      <ChevronDown
                        className="absolute right-3 text-slate-400 pointer-events-none"
                        size={18}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Squad / Age Group
                    </label>
                    <div className="relative flex items-center">
                      <select
                        name="ageGroup"
                        value={formData.ageGroup}
                        onChange={handleInputChange}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 font-medium"
                      >
                        {settings.squads.map((squad) => (
                          <option key={squad} value={squad}>
                            {squad} Squad
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="absolute right-3 text-slate-400 pointer-events-none"
                        size={18}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
                >
                  {editingPlayerId ? "Save Changes" : "Save Player"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {playerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setPlayerToDelete(null)}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              ยืนยันการลบข้อมูล
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              คุณต้องการลบข้อมูลนักกีฬาเยาวชนคนนี้ใช่หรือไม่?
              ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPlayerToDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm"
              >
                ลบข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
