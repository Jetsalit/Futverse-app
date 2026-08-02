import React, { useState, useMemo, useEffect } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useAcademy } from "../contexts/AcademyContext";
import {
  Search,
  ArrowLeft,
  Filter,
  SlidersHorizontal,
  MapPin,
  Medal,
  Star,
  BarChart2,
  Plus,
  X,
  Video,
  Send,
  Clock,
  BadgeCheck,
  Edit2,
  Trash2,
} from "lucide-react";

interface ScoutPlayer {
  id: string;
  name: string;
  academy: string;
  province: string;
  age: number;
  height: number;
  weight: number;
  position: string[];
  grade: "A+" | "A" | "B" | "C";
  stars: number;
  stats: {
    pace: number;
    stamina: number;
    passing: number;
    dribbling?: number;
    shooting?: number;
    tackling?: number;
    technique?: number;
    decision?: number;
    teamwork?: number;
  };
  image: string;
  status: "Verified" | "Pending";
  submitterRole?: string;
  videoLink?: string;
}



export default function ScoutDashboard({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const { getAcademyCollection } = useAcademy();
  const canEdit = hasPermission(["SUPERADMIN"]) || hasPermission(["ADMIN"]);
  
  const [players, setPlayers] = useState<ScoutPlayer[]>([]);
  const [editingPlayer, setEditingPlayer] = useState<ScoutPlayer | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(getAcademyCollection("scoutPlayers"), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          id: doc.id, 
          ...d,
          position: Array.isArray(d.position) ? d.position : (d.position ? [d.position] : [])
        } as ScoutPlayer
      });
      setPlayers(data);
    }, (error) => {
      console.error("Snapshot error:", error);
      alert("ไม่สามารถดึงข้อมูลได้: " + error.message);
    });
    return () => unsub();
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    province: "",
    ageMin: "",
    ageMax: "",
    position: "",
    grade: "",
  });

  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
      // Name Search
      if (
        searchQuery &&
        !player.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;

      // Province Filter
      if (filters.province && player.province !== filters.province)
        return false;

      // Age Filter
      if (filters.ageMin && player.age < parseInt(filters.ageMin)) return false;
      if (filters.ageMax && player.age > parseInt(filters.ageMax)) return false;

      // Position Filter
      if (filters.position) {
        if (!player.position.includes(filters.position)) {
          return false;
        }
      }// Grade Filter
      if (filters.grade && player.grade !== filters.grade) return false;

      return true;
    });
  }, [players, filters, searchQuery]);

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === prev[key] ? "" : value,
    }));
  };

  const PROVINCES = Array.from(new Set(players.map((p) => p.province)));
  const POSITIONS = ["GK", "LB", "RB", "CB", "DM", "CM", "AM", "LW", "RW", "ST"];
  const GRADES = ["A+", "A", "B", "C"];

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 shrink-0">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-200 bg-white rounded-xl transition-colors shadow-sm text-slate-600"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            National Scout Portal
          </h1>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-widest mt-0.5">
            Talent Discovery Database
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 gap-6 min-h-0">
        {/* Mobile Filter Toggle */}
        <div className="lg:hidden flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border border-slate-200">
          <button
            onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}
            className="flex items-center gap-2 text-slate-700 font-bold text-sm"
          >
            <Filter size={18} /> ตัวกรองอัจฉริยะ (Filters)
          </button>
          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold">
            {filteredPlayers.length} พบเจอ
          </span>
        </div>

        {/* Smart Filter Sidebar */}
        <div
          className={`lg:w-72 shrink-0 flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-y-auto lg:flex ${isMobileFilterOpen ? "flex" : "hidden"} h-max lg:h-full`}
        >
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-emerald-500" />
              คัดกรองนักเตะ (Filter)
            </h2>
          </div>

          <div className="p-5 space-y-6">
            {/* Province Filter */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                ภูมิภาค/จังหวัด
              </h3>
              <select
                value={filters.province}
                onChange={(e) => updateFilter("province", e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
              >
                <option value="">ทั้งหมด (All)</option>
                {PROVINCES.map((prov) => (
                  <option key={prov} value={prov}>
                    {prov}
                  </option>
                ))}
              </select>
            </div>

            {/* Age Range Filter */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                ช่วงอายุ (Age Range)
              </h3>
              <div className="flex gap-2 items-center">
                <input 
                  type="number" 
                  placeholder="Min" 
                  value={filters.ageMin}
                  onChange={(e) => setFilters({...filters, ageMin: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2 outline-none"
                />
                <span className="text-slate-400">-</span>
                <input 
                  type="number" 
                  placeholder="Max" 
                  value={filters.ageMax}
                  onChange={(e) => setFilters({...filters, ageMax: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2 outline-none"
                />
              </div>
            </div>

            {/* Position Filter */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                ตำแหน่ง (Position)
              </h3>
              <div className="flex flex-wrap gap-2">
                {POSITIONS.map((pos) => (
                  <button
                    key={pos}
                    onClick={() => updateFilter("position", pos)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${filters.position === pos ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"}`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Grade Filter */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                เกรดพรสวรรค์ (Potential)
              </h3>
              <div className="flex gap-2">
                {GRADES.map((grade) => (
                  <button
                    key={grade}
                    onClick={() => updateFilter("grade", grade)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors border text-center ${filters.grade === grade ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"}`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {(filters.province ||
            filters.ageMin ||
            filters.ageMax ||
            filters.position ||
            filters.grade) && (
            <div className="p-4 mt-auto border-t border-slate-100">
              <button
                onClick={() =>
                  setFilters({
                    province: "",
                    ageMin: "",
                    ageMax: "",
                    position: "",
                    grade: "",
                  })
                }
                className="w-full py-2 text-sm text-slate-500 font-bold hover:text-slate-800 transition-colors"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            </div>
          )}
        </div>

        {/* Talent Grid Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-6">
            <div className="flex w-full md:w-auto gap-4 flex-1">
              <div className="relative w-full md:max-w-md">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อนักเตะ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => setIsSubmitModalOpen(true)}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors"
              >
                <Plus size={18} /> ส่งโปรไฟล์นักเตะ
              </button>
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm border ${compareMode ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}
              >
                <BarChart2 size={18} /> โหมดเปรียบเทียบ
              </button>
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto pr-1 pb-4">
            {filteredPlayers.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 border-dashed h-64">
                <Filter className="text-slate-300 w-12 h-12 mb-4" />
                <p className="text-slate-500 font-medium">
                  ไม่พบผลลัพธ์นักเตะจากตัวกรอง
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filteredPlayers.map((player) => (
                  <TalentCard
                    key={player.id}
                    player={player}
                    compareMode={compareMode}
                    canEdit={canEdit}
                    onEdit={() => {
                      setEditingPlayer(player);
                      setIsSubmitModalOpen(true);
                    }}
                    onDelete={async () => {
                      if (confirm("Are you sure you want to delete this player?")) {
                        await deleteDoc(doc(getAcademyCollection("scoutPlayers"), player.id));
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {isSubmitModalOpen && (
        <SubmitTalentModal 
          initialData={editingPlayer}
          isAdmin={canEdit}
          onClose={() => {
            setIsSubmitModalOpen(false);
            setEditingPlayer(null);
          }}
          onSave={async (p) => {
            try {
              if (editingPlayer && editingPlayer.id) {
                await updateDoc(doc(getAcademyCollection("scoutPlayers"), editingPlayer.id), p as any);
              } else {
                await addDoc(getAcademyCollection("scoutPlayers"), {
                  ...p,
                  status: p.status || "Pending",
                  grade: p.grade || "C",
                  stars: p.stars || 3,
                  stats: p.stats || { pace: 70, stamina: 70, passing: 70 },
                  image: p.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`
                });
              }
            } catch (err) {
              console.error("Error saving scout player:", err);
              alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
            }
          }}
        />
      )}
    </div>
  );
}

function TalentCard({
  player,
  compareMode,
  canEdit,
  onEdit,
  onDelete,
}: {
  player: ScoutPlayer;
  compareMode: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden relative group cursor-pointer ${compareMode ? "ring-2 ring-transparent hover:ring-indigo-500" : ""}`}
    >
      {/* Compare Mode Overlay Select */}
      {compareMode && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded border-2 border-slate-300 bg-white z-10 group-hover:border-indigo-500 transition-colors"></div>
      )}

      {/* Edit/Delete Actions */}
      {canEdit && !compareMode && (
        <div className="absolute top-3 left-3 flex gap-2 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            className="w-8 h-8 rounded-full bg-white text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center shadow-sm border border-slate-200 transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            className="w-8 h-8 rounded-full bg-white text-slate-600 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shadow-sm border border-slate-200 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Card Header & Profile */}
      <div className="p-5 flex gap-4 border-b border-slate-100 relative overflow-hidden">
        {/* Grade/Status Badge */}
        {player.status === "Verified" ? (
          <div
            className={`absolute top-0 right-0 px-3 py-1.5 rounded-bl-xl font-bold text-sm text-white shadow-sm flex items-center gap-1.5 ${
              player.grade === "A+"
                ? "bg-gradient-to-r from-amber-400 to-amber-500"
                : player.grade === "A"
                  ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                  : "bg-gradient-to-r from-blue-400 to-blue-500"
            }`}
          >
            <BadgeCheck size={14} /> {player.grade}
          </div>
        ) : (
          <div className="absolute top-0 right-0 px-3 py-1.5 rounded-bl-xl font-bold text-xs text-amber-700 bg-amber-100 border-b border-l border-amber-200 shadow-sm flex items-center gap-1.5">
            <Clock size={12} className="text-amber-600" /> รอตรวจสอบ (Pending)
          </div>
        )}

        <div className="w-16 h-16 rounded-full bg-slate-100 shrink-0 border border-slate-200 overflow-hidden mt-2 relative">
          <img
            src={
              player.image ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}`
            }
            alt={player.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 mt-2">
          <h3 className="font-bold text-slate-800 text-lg leading-tight">
            {player.name}
          </h3>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            {player.academy}
          </p>
          <div className="flex items-center gap-1 mt-1.5 text-[11px] font-bold text-slate-400 bg-slate-100 w-max px-2 py-0.5 rounded-md">
            <MapPin size={10} /> {player.province}
          </div>
        </div>
      </div>

      {/* Info Stats */}
      <div className="grid grid-cols-3 bg-slate-50/50 border-b border-slate-100 p-3 text-center divide-x divide-slate-100">
        <div>
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
            Age
          </div>
          <div className="font-bold text-slate-700 text-sm">
            {player.age}{" "}
            <span className="text-[10px] text-slate-500 font-medium">yrs</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
            Height
          </div>
          <div className="font-bold text-slate-700 text-sm">
            {player.height}{" "}
            <span className="text-[10px] text-slate-500 font-medium">cm</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
            Pos
          </div>
          <div className="font-bold text-slate-700 text-sm">
            {player.position.join(", ")}
          </div>
        </div>
      </div>

      {/* Performance Radar/Bars */}
      <div className="p-5 space-y-3">
        {/* Stars */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-bold text-slate-600 mr-1">Rating</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={14}
                className={
                  i < player.stars
                    ? "text-amber-400 fill-amber-400 drop-shadow-sm"
                    : "text-slate-200"
                }
              />
            ))}
          </div>
        </div>

        {/* Stats Bars */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <StatBar label="Pace" value={player.stats.pace} color="bg-emerald-500" />
          <StatBar label="Stamina" value={player.stats.stamina} color="bg-blue-500" />
          <StatBar label="Passing" value={player.stats.passing} color="bg-amber-500" />
          <StatBar label="Dribbling" value={player.stats.dribbling} color="bg-indigo-500" />
          <StatBar label="Shooting" value={player.stats.shooting} color="bg-rose-500" />
          <StatBar label="Tackling" value={player.stats.tackling} color="bg-slate-500" />
          <StatBar label="Technique" value={player.stats.technique} color="bg-purple-500" />
          <StatBar label="Decision" value={player.stats.decision} color="bg-teal-500" />
          <StatBar label="Teamwork" value={player.stats.teamwork} color="bg-orange-500" />
        </div>
      </div>
    </div>
  );
}

function StatBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const displayValue = value > 10 ? Math.round(value / 10) : (value || 0);
  return (
    <div>
      <div className="flex justify-between items-end mb-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate pr-2">
          {label}
        </span>
        <span className="text-[10px] font-bold text-slate-700">{displayValue}/10</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${displayValue * 10}%` }}
        ></div>
      </div>
    </div>
  );
}

function SubmitTalentModal({ 
  initialData, 
  onClose, 
  onSave,
  isAdmin
}: { 
  initialData?: ScoutPlayer | null;
  onClose: () => void;
  onSave: (p: Partial<ScoutPlayer>) => void;
  isAdmin?: boolean;
}) {
  const [formData, setFormData] = useState<Partial<ScoutPlayer>>(initialData || {
    name: "",
    age: 15,
    height: 170,
    weight: 60,
    position: [],
    academy: "",
    province: "",
    status: "Pending",
    grade: "C",
    stars: 3,
    stats: { pace: 5, stamina: 5, passing: 5, dribbling: 5, shooting: 5, tackling: 5, technique: 5, decision: 5, teamwork: 5 },
    submitterRole: "",
    videoLink: "",
  });
  
  const [submitComplete, setSubmitComplete] = useState(false);

  if (submitComplete) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white max-w-sm w-full rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-indigo-500"></div>
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-500 mb-6 border-4 border-emerald-50 shadow-sm">
            <BadgeCheck size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">
            ส่งข้อมูลสำเร็จ!
          </h2>
          <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
            ข้อมูลโปรไฟล์นักเตะถูกส่งเข้าสู่ระบบแล้ว ทีมงาน Scout
            จะทำการตรวจสอบและประเมินผลในขั้นตอนต่อไป (สถานะปัจจุบัน: Pending)
          </p>
          <button
            onClick={() => {
              setSubmitComplete(false);
              onClose();
            }}
            className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-indigo-600 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white backdrop-blur-sm">
              <Send size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight leading-tight">
                ส่งโปรไฟล์นักเตะ
              </h2>
              <p className="text-[11px] font-medium text-indigo-200 uppercase tracking-wider">
                Crowdsource Talent Submission
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form */}
        <form
          className="flex-1 overflow-y-auto p-6 space-y-8"
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave(formData);
            setSubmitComplete(true);
          }}
        >
          {/* Section 1: Submitter Info */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-black">
                1
              </span>
              <h3 className="font-bold text-slate-800 text-base">
                ข้อมูลผู้ส่ง (Submitter)
              </h3>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                คุณส่งข้อมูลในฐานะอะไร? <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={formData.submitterRole || ""}
                onChange={(e) => setFormData({ ...formData, submitterRole: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
              >
                <option value="" disabled>
                  กรุณาเลือกความสัมพันธ์...
                </option>
                <option value="parent">ผู้ปกครอง / ครอบครัว</option>
                <option value="coach">โค้ชต้นสังกัด / โรงเรียน</option>
                <option value="freelance">แมวมองอิสระ (Freelance Scout)</option>
                <option value="player">ส่งข้อมูลตัวเอง (Self-Submit)</option>
              </select>
            </div>

            <div className="border-t border-slate-100 pt-4 mt-4">
              <label className="block text-sm font-bold text-slate-800 mb-2">
                ประเมินค่าพลังนักเตะ (1-10)
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'pace', label: 'Pace' },
                  { key: 'stamina', label: 'Stamina' },
                  { key: 'passing', label: 'Passing' },
                  { key: 'dribbling', label: 'Dribbling' },
                  { key: 'shooting', label: 'Shooting' },
                  { key: 'tackling', label: 'Tackling' },
                  { key: 'technique', label: 'Technique' },
                  { key: 'decision', label: 'Decision' },
                  { key: 'teamwork', label: 'Teamwork' },
                ].map(stat => {
                  let val = (formData.stats as any)?.[stat.key];
                  if (val > 10) val = Math.round(val / 10);
                  if (val === undefined) val = 5;
                  
                  return (
                    <div key={stat.key}>
                      <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">{stat.label}</div>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={val}
                        onChange={(e) => setFormData({ ...formData, stats: { ...formData.stats, [stat.key]: Number(e.target.value) } as any })}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg p-2 outline-none text-center focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Section 2: Player Info */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-black">
                2
              </span>
              <h3 className="font-bold text-slate-800 text-base">
                ข้อมูลนักกีฬา (Player Details)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  ชื่อ - นามสกุล <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ด.ช. หรือ นาย..."
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  อายุ (ปี) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  placeholder="เช่น 15"
                  min={10}
                  max={22}
                  value={formData.age || ""}
                  onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  ส่วนสูง (ซม.) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  placeholder="เช่น 170"
                  min={120}
                  max={210}
                  value={formData.height || ""}
                  onChange={(e) => setFormData({ ...formData, height: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  ตำแหน่งที่ถนัด <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {["GK", "LB", "RB", "CB", "DM", "CM", "AM", "LW", "RW", "ST"].map(pos => {
                    const currentPos = Array.isArray(formData.position) ? formData.position : [];
                    const isSelected = currentPos.includes(pos);
                    return (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setFormData({ ...formData, position: currentPos.filter(p => p !== pos) });
                          } else {
                            setFormData({ ...formData, position: [...currentPos, pos] });
                          }
                        }}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                          isSelected ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"
                        }`}
                      >
                        {pos}
                      </button>
                    )
                  })}
                </div>
                <input type="hidden" required value={(formData.position && formData.position.length > 0) ? "ok" : ""} />
                {(!formData.position || formData.position.length === 0) && (
                  <p className="text-rose-500 text-xs mt-2">* กรุณาเลือกอย่างน้อย 1 ตำแหน่ง</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  สังกัด / โรงเรียนชุดปัจจุบัน{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น รร.อัสสัมชัญธนบุรี, อะคาเดมี่..."
                  value={formData.academy || ""}
                  onChange={(e) => setFormData({ ...formData, academy: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  จังหวัด <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น กรุงเทพมหานคร"
                  value={formData.province || ""}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />
              </div>
            </div>
          </section>

          {/* Section 3: Performance Highlights */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-black">
                3
              </span>
              <h3 className="font-bold text-slate-800 text-base">
                ผลงาน & วิดีโอ (Highlights)
              </h3>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-bold text-slate-700">
                ลิงก์วิดีโอไฮไลท์การเล่น{" "}
                <span className="text-rose-500">*</span>
              </label>
              <p className="text-xs font-medium text-slate-500 leading-relaxed mb-2">
                สำคัญมาก: กรุณาวางลิงก์ YouTube หรือ TikTok
                ที่แสดงให้เห็นจังหวะการเล่นที่ชัดเจน
                (หลีกเลี่ยงวิดีโอที่ตัดต่อเยอะเกินไป)
              </p>
              <div className="relative">
                <Video
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  type="url"
                  required
                  value={formData.videoLink || ""}
                  onChange={(e) => setFormData({ ...formData, videoLink: e.target.value })}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block outline-none transition-shadow"
                />
              </div>
            </div>
          </section>

          {/* Section 4: Admin Evaluation (Only visible to Admin/Superadmin) */}
          {isAdmin && (
            <section className="space-y-4 bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
              <div className="flex items-center gap-2 border-b border-indigo-200 pb-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">
                  4
                </span>
                <h3 className="font-bold text-indigo-900 text-base">
                  สำหรับผู้ดูแลระบบ (Admin Evaluation)
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-bold text-indigo-900 mb-1.5">
                    สถานะการประเมิน (Status)
                  </label>
                  <select
                    value={formData.status || "Pending"}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as "Verified" | "Pending" })}
                    className="w-full bg-white border border-indigo-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                  >
                    <option value="Pending">รอตรวจสอบ (Pending)</option>
                    <option value="Verified">ผ่านการประเมิน (Verified)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-indigo-900 mb-1.5">
                    เกรด (Grade)
                  </label>
                  <select
                    value={formData.grade || "C"}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value as any })}
                    className="w-full bg-white border border-indigo-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                  >
                    <option value="A+">A+ (ยอดเยี่ยม)</option>
                    <option value="A">A (ดีมาก)</option>
                    <option value="B">B (ดี)</option>
                    <option value="C">C (พอใช้)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-indigo-900 mb-1.5">
                    ดาวประเมินรวม (Stars 1-5)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={formData.stars || 3}
                    onChange={(e) => setFormData({ ...formData, stars: Number(e.target.value) })}
                    className="w-full bg-white border border-indigo-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Form Actions (Sticky on Mobile) */}
          <div className="pt-6 pb-2 border-t border-slate-100 flex gap-3 sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex-[2] py-3.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm text-white font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              <Send size={16} /> ยืนยันการส่งข้อมูล
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
