import React, { useState, useMemo, useEffect } from "react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import {
  Search,
  ArrowLeft,
  Filter,
  Plus,
  FileText,
  UserPlus,
  X,
  Loader2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useAcademy } from "../contexts/AcademyContext";
import { ProPlayer } from "../types/ProPlayer";
import { db } from "../lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch } from "firebase/firestore";
import { Edit2, Trash2, AlertCircle, Upload, Users } from "lucide-react";
import Papa from "papaparse";

const MOCK_PRO_PLAYERS: ProPlayer[] = [];

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function ProPlayerManager({
  onBack,
  onSelectPlayer,
}: {
  onBack: () => void;
  onSelectPlayer: (p: ProPlayer) => void;
}) {
  const [players, setPlayers] = useState<ProPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<ProPlayer | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  
  // Bulk Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const { getAcademyCollection } = useAcademy();
  const hasManagePermission = currentUser?.role === "SUPERADMIN" || currentUser?.role === "ADMIN";

  useEffect(() => {
    const proPlayersRef = getAcademyCollection("proPlayers");
    const unsubscribe = onSnapshot(
      proPlayersRef,
      (snapshot) => {
        const playersData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ProPlayer[];
        setPlayers(playersData);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching pro players:", error);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm("คุณต้องการลบนักเตะคนนี้ใช่หรือไม่?")) {
      try {
        await deleteDoc(doc(getAcademyCollection("proPlayers"), id));
      } catch (err) {
        console.error("Error deleting pro player:", err);
        alert("เกิดข้อผิดพลาดในการลบข้อมูล");
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            setCsvError("Invalid CSV format. Please check the template.");
          } else {
            const parsedData = results.data.map((row: any) => ({
              name: row.name || row.Name || "",
              nationality: row.nationality || row.Nationality || "Thailand",
              dob: row.dob || row.DOB || "",
              position: row.position || row.Position || "Striker",
              height: parseInt(row.height || row.Height) || 175,
              weight: parseInt(row.weight || row.Weight) || 70,
              currentClub: row.currentClub || row.CurrentClub || "",
              league: row.league || row.League || "T1",
              marketValue: row.marketValue || row.MarketValue || "",
            })).filter(p => p.name); // basic validation
            
            setCsvData(parsedData);
            setCsvError(null);
            setIsImportModalOpen(true);
          }
        },
        error: (err) => {
          setCsvError(err.message);
        }
      });
    }
    // reset input
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (csvData.length === 0) return;
    setIsLoading(true);
    setIsImportModalOpen(false);
    
    try {
      const batch = writeBatch(db);
      let count = 0;
      
      // Limit to 50
      const dataToImport = csvData.slice(0, 50);

      dataToImport.forEach((player) => {
        const newPlayerRef = doc(getAcademyCollection("proPlayers"));
        batch.set(newPlayerRef, {
          ...player,
          preferredFoot: "Right",
          avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}${Date.now()}${count}`,
          attributes: {
            technical: 70,
            tactical: 70,
            physical: 70,
            mental: 70,
            attacking: 70,
            defending: 70,
          },
        });
        count++;
      });

      await batch.commit();
      setCsvData([]);
      alert(`นำเข้าผู้เล่นสำเร็จ ${count} คน`);
    } catch (error: any) {
      console.error("Error bulk importing players:", error);
      alert("เกิดข้อผิดพลาดในการนำเข้าข้อมูล: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,name,nationality,dob,position,height,weight,currentClub,league,marketValue\nSupachok Sarachat,Thailand,1998-05-22,Winger,169,60,Hokkaido Consadole Sapporo,T1,€1.00m";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "pro_player_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };



  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
      if (
        searchQuery &&
        !player.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      if (leagueFilter && player.league !== leagueFilter) return false;
      return true;
    });
  }, [players, searchQuery, leagueFilter]);

  const LEAGUES = ["T1", "T2", "T3", "Semi-pro", "Free Agent"];

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 relative">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 shrink-0 lg:flex-row flex-col lg:justify-between lg:items-center items-start">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 bg-white dark:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent dark:border-slate-700/50 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-indigo-400 dark:to-emerald-400 tracking-tight dark:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">
              Pro Player Management
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-widest mt-0.5">
              Professional Squad & Digital CVs
            </p>
          </div>
        </div>

        {hasManagePermission && (
          <div className="flex gap-3 ml-auto lg:ml-0 w-full lg:w-auto">
            <button
              onClick={downloadTemplate}
              className="hidden lg:flex px-4 py-2 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-transparent dark:border-slate-700/50 font-bold rounded-xl text-sm transition-colors cursor-pointer"
            >
              CSV Template
            </button>
            <div className="relative">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Upload CSV"
              />
              <button
                className="px-4 py-2 bg-amber-500 dark:bg-amber-600 hover:bg-amber-600 dark:hover:bg-amber-500 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 pointer-events-none w-full lg:w-auto shadow-sm shadow-amber-500/20 dark:shadow-amber-500/10 border border-transparent dark:border-amber-500/50"
              >
                <Upload size={18} />
                Bulk Import
              </button>
            </div>
            <button
              onClick={() => {
                setEditingPlayer(null);
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-sm shadow-indigo-600/20 dark:shadow-indigo-500/20 border border-transparent dark:border-indigo-400/30 hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors w-full lg:w-auto justify-center cursor-pointer"
            >
              <UserPlus size={18} />
              เพิ่มนักเตะอาชีพ
            </button>
          </div>
        )}
      </div>

      {csvError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm font-medium">
          {csvError}
        </div>
      )}

      <div className="bg-white dark:bg-slate-800/40 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700/50 mb-6 flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            size={18}
          />
          <input
            type="text"
            placeholder="ค้นหาชื่อนักเตะ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all font-medium"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Filter size={18} className="text-slate-400 dark:text-slate-500 hidden sm:block" />
          <select
            value={leagueFilter}
            onChange={(e) => setLeagueFilter(e.target.value)}
            className="w-full sm:w-48 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 font-bold text-slate-700 dark:text-slate-200"
          >
            <option value="">ทุกลีก (All Leagues)</option>
            {LEAGUES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 pb-8 overflow-y-auto">
        {isLoading ? (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
            <p className="font-medium text-sm">กำลังโหลดข้อมูล...</p>
          </div>
        ) : players.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 border-dashed rounded-3xl flex flex-col items-center justify-center shadow-sm backdrop-blur-sm">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4 border border-transparent dark:border-slate-700/50">
              <UserPlus size={32} />
            </div>
            <h3 className="text-slate-700 dark:text-slate-300 font-bold text-lg mb-1">
              ยังไม่มีรายชื่อนักเตะในระบบ
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              โปรดกดปุ่ม 'เพิ่มนักเตะอาชีพ' ด้านบน
            </p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 font-medium">
            ไม่พบผลลัพธ์ที่ค้นหา
          </div>
        ) : (
          filteredPlayers.map((player) => (
            <div
              key={player.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectPlayer(player)}
            >
              <div className="flex items-start p-5 gap-4 relative">
                {hasManagePermission && (
                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPlayer(player);
                        setIsAddModalOpen(true);
                      }}
                      className="p-2 bg-white/80 hover:bg-indigo-50 text-indigo-600 rounded-full transition-colors shadow-sm border border-slate-100"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(player.id!);
                      }}
                      className="p-2 bg-white/80 hover:bg-red-50 text-red-600 rounded-full transition-colors shadow-sm border border-slate-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
                <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                  <img
                    src={
                      player.avatarUrl ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}`
                    }
                    alt={player.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-800 text-lg truncate group-hover:text-indigo-600 transition-colors">
                    {player.name}
                  </h3>
                  <p className="text-sm text-slate-500 truncate">
                    {player.currentClub}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100">
                      {player.league}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                      {player.position}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-auto p-4 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPlayer(player);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white font-bold text-sm py-2 rounded-xl transition-colors"
                >
                  <FileText size={16} /> Digital CV
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isAddModalOpen && (
        <AddProPlayerModal
          initialData={editingPlayer}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingPlayer(null);
          }}
          onSave={async (p) => {
            try {
              if (editingPlayer && editingPlayer.id) {
                await updateDoc(doc(getAcademyCollection("proPlayers"), editingPlayer.id), p as any);
              } else {
                await addDoc(getAcademyCollection("proPlayers"), p);
              }
              setIsAddModalOpen(false);
              setEditingPlayer(null);
            } catch (err) {
              console.error("Error saving pro player:", err);
              alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
            }
          }}
        />
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <Users className="text-amber-500" /> Confirm Import
              </h3>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setCsvData([]);
                }}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4 text-slate-600">
                Found <span className="font-bold text-slate-800">{csvData.length}</span> players in the CSV file. {csvData.length > 50 && <span className="text-rose-500 text-xs font-bold block mt-1">(Note: Only the first 50 players will be imported at a time.)</span>}
              </div>
              <div className="max-h-48 overflow-y-auto bg-slate-50 rounded-xl border border-slate-100 p-2">
                {csvData.slice(0, 5).map((player, idx) => (
                  <div key={idx} className="p-2 border-b border-slate-100 last:border-0 text-sm">
                    <span className="font-bold text-slate-700">{player.name}</span> - {player.position} ({player.currentClub})
                  </div>
                ))}
                {csvData.length > 5 && (
                  <div className="p-2 text-center text-sm text-slate-400 font-medium">
                    ... and {csvData.length - 5} more
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setCsvData([]);
                }}
                className="px-6 py-2.5 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImportConfirm}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors shadow-sm"
              >
                Import Players
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddProPlayerModal({
  initialData,
  onClose,
  onSave,
}: {
  initialData?: ProPlayer | null;
  onClose: () => void;
  onSave: (p: Partial<ProPlayer>) => void;
}) {
  const [formData, setFormData] = useState<Partial<ProPlayer>>(initialData || {
    name: "",
    nationality: "",
    dob: "",
    position: "Striker",
    height: 175,
    weight: 70,
    preferredFoot: "Right",
    currentClub: "",
    league: "T1",
    contractExpiry: "",
    marketValue: "",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=new",
    actionShotUrl: "",
    highlightVideoUrl: "",
    careerHistory: [],
    attributes: {
      technical: 70,
      tactical: 70,
      physical: 70,
      mental: 70,
      attacking: 70,
      defending: 70,
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      <div className="relative bg-white rounded-2xl w-full max-w-3xl max-h-full overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
          <h2 className="text-lg font-bold text-slate-800">
            {initialData ? "แก้ไขข้อมูลนักเตะ (Edit Pro Player)" : "เพิ่มข้อมูลนักเตะอาชีพ (Add Pro Player)"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8 flex-1">
          {/* Section 1: Basic Info */}
          <div>
            <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4 border-b border-indigo-100 pb-2">
              1. ข้อมูลพื้นฐาน (Basic Info)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  ชื่อ-นามสกุล
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="e.g. Chanathip Songkrasin"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  สัญชาติ
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="Thailand"
                  value={formData.nationality}
                  onChange={(e) =>
                    setFormData({ ...formData, nationality: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  วัน/เดือน/ปีเกิด
                </label>
                <ThaiDatePicker
                  max={new Date().toISOString().split("T")[0]}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-within:border-indigo-500"
                  value={formData.dob}
                  onChange={(e) =>
                    setFormData({ ...formData, dob: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                    ส่วนสูง (cm)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                    value={formData.height}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        height: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                    น้ำหนัก (kg)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                    value={formData.weight}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        weight: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  เท้าที่ถนัด (Foot)
                </label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  value={formData.preferredFoot}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      preferredFoot: e.target.value as any,
                    })
                  }
                >
                  <option value="Right">ขวา (Right)</option>
                  <option value="Left">ซ้าย (Left)</option>
                  <option value="Both">ทั้งสองเท้า (Both)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  ตำแหน่งหลัก (Position)
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="Attacking Midfielder"
                  value={formData.position}
                  onChange={(e) =>
                    setFormData({ ...formData, position: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Section 2: Club & Contract */}
          <div>
            <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4 border-b border-indigo-100 pb-2">
              2. สังกัดและสัญญา (Club & Contract)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  สโมสรปัจจุบัน
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="Club Name"
                  value={formData.currentClub}
                  onChange={(e) =>
                    setFormData({ ...formData, currentClub: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  ลีก (League)
                </label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  value={formData.league}
                  onChange={(e) =>
                    setFormData({ ...formData, league: e.target.value as any })
                  }
                >
                  <option value="T1">T1 (Thai League 1)</option>
                  <option value="T2">T2</option>
                  <option value="T3">T3</option>
                  <option value="Semi-pro">Semi-pro</option>
                  <option value="Free Agent">Free Agent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  สัญญาหมดอายุ (Contract Expiry)
                </label>
                <ThaiDatePicker
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-within:border-indigo-500"
                  value={formData.contractExpiry}
                  onChange={(e) =>
                    setFormData({ ...formData, contractExpiry: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  ค่าตัวประเมิน (Market Value)
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="e.g. €500k"
                  value={formData.marketValue}
                  onChange={(e) =>
                    setFormData({ ...formData, marketValue: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Section 3: Media */}
          <div>
            <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4 border-b border-indigo-100 pb-2">
              3. สื่อและรูปถ่าย (Media & Photos)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  รูปโปรไฟล์ (Avatar)
                </label>
                <div className="flex items-center gap-3 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  {formData.avatarUrl &&
                    !formData.avatarUrl.includes("dicebear") && (
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-slate-200">
                        <img
                          src={formData.avatarUrl}
                          alt="Avatar Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  <input
                    type="file"
                    accept="image/*"
                    className="text-xs text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 w-full"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const dataUrl = await compressImage(file);
                          setFormData({
                            ...formData,
                            avatarUrl: dataUrl,
                          });
                        } catch (error) {
                          console.error("Error compressing image:", error);
                        }
                      }
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  รูปขณะลงเล่น (Action Shot)
                </label>
                <div className="flex flex-col gap-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  {formData.actionShotUrl && (
                    <div className="h-20 rounded-md overflow-hidden shrink-0 border border-slate-200 bg-slate-100 flex items-center justify-center">
                      <img
                        src={formData.actionShotUrl}
                        alt="Action Shot Preview"
                        className="h-full object-contain"
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="text-xs text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 w-full"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const dataUrl = await compressImage(file);
                          setFormData({
                            ...formData,
                            actionShotUrl: dataUrl,
                          });
                        } catch (error) {
                          console.error("Error compressing image:", error);
                        }
                      }
                    }}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  URL วิดีโอไฮไลต์ (YouTube/Vimeo)
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="https://youtube.com/..."
                  value={formData.highlightVideoUrl}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      highlightVideoUrl: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* Section 4: Contact Info */}
          <div>
            <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4 border-b border-indigo-100 pb-2">
              4. ข้อมูลติดต่อ (Contact Info)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  เบอร์โทรศัพท์ (Phone)
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="08x-xxx-xxxx"
                  value={formData.phoneNumber || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, phoneNumber: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  Line ID
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="@username"
                  value={formData.lineId || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, lineId: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  Facebook
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="Facebook Profile"
                  value={formData.facebook || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, facebook: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Section 5: Career History */}
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-indigo-100 pb-2">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest">
                5. ประวัติการค้าแข้ง (Career History)
              </h3>
              <button
                type="button"
                onClick={() => {
                  const newHistory = [
                    ...(formData.careerHistory || []),
                    { year: "", club: "", apps: 0, goals: 0, assists: 0 },
                  ];
                  setFormData({ ...formData, careerHistory: newHistory });
                }}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md"
              >
                <Plus size={14} /> เพิ่มประวัติ
              </button>
            </div>

            {formData.careerHistory && formData.careerHistory.length > 0 ? (
              <div className="space-y-3">
                {formData.careerHistory.map((history, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl relative group"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const newHistory = formData.careerHistory!.filter(
                          (_, i) => i !== idx,
                        );
                        setFormData({ ...formData, careerHistory: newHistory });
                      }}
                      className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm hover:bg-red-200"
                    >
                      <X size={12} strokeWidth={3} />
                    </button>

                    <input
                      type="text"
                      placeholder="ปี (เช่น 2020-2023)"
                      className="w-full sm:w-32 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                      value={history.year}
                      onChange={(e) => {
                        const newHistory = [...formData.careerHistory!];
                        newHistory[idx] = {
                          ...newHistory[idx],
                          year: e.target.value,
                        };
                        setFormData({ ...formData, careerHistory: newHistory });
                      }}
                    />

                    <input
                      type="text"
                      placeholder="สโมสร"
                      className="w-full sm:flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                      value={history.club}
                      onChange={(e) => {
                        const newHistory = [...formData.careerHistory!];
                        newHistory[idx] = {
                          ...newHistory[idx],
                          club: e.target.value,
                        };
                        setFormData({ ...formData, careerHistory: newHistory });
                      }}
                    />

                    <div className="flex gap-2 w-full sm:w-auto">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase w-8">
                          Apps
                        </span>
                        <input
                          type="number"
                          placeholder="0"
                          className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                          value={history.apps || ""}
                          onChange={(e) => {
                            const newHistory = [...formData.careerHistory!];
                            newHistory[idx] = {
                              ...newHistory[idx],
                              apps: parseInt(e.target.value) || 0,
                            };
                            setFormData({
                              ...formData,
                              careerHistory: newHistory,
                            });
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase w-8">
                          Gls
                        </span>
                        <input
                          type="number"
                          placeholder="0"
                          className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                          value={history.goals || ""}
                          onChange={(e) => {
                            const newHistory = [...formData.careerHistory!];
                            newHistory[idx] = {
                              ...newHistory[idx],
                              goals: parseInt(e.target.value) || 0,
                            };
                            setFormData({
                              ...formData,
                              careerHistory: newHistory,
                            });
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase w-8">
                          Asts
                        </span>
                        <input
                          type="number"
                          placeholder="0"
                          className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                          value={history.assists || ""}
                          onChange={(e) => {
                            const newHistory = [...formData.careerHistory!];
                            newHistory[idx] = {
                              ...newHistory[idx],
                              assists: parseInt(e.target.value) || 0,
                            };
                            setFormData({
                              ...formData,
                              careerHistory: newHistory,
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
                <p className="text-xs text-slate-400 mb-2">
                  ยังไม่มีข้อมูลประวัติการค้าแข้ง
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const newHistory = [
                      { year: "", club: "", apps: 0, goals: 0, assists: 0 },
                    ];
                    setFormData({ ...formData, careerHistory: newHistory });
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  เพิ่มประวัติรายการแรก
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-white flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave({
                ...formData,
                name: formData.name || "Unknown",
              });
            }}
            className="flex-1 py-2.5 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm shadow-sm"
          >
            Save Player Data
          </button>
        </div>
      </div>
    </div>
  );
}
