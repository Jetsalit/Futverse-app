import React, { useState, useMemo } from "react";
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
} from "lucide-react";

interface ScoutPlayer {
  id: string;
  name: string;
  academy: string;
  province: string;
  age: number;
  height: number;
  weight: number;
  position: string;
  grade: "A+" | "A" | "B" | "C";
  stars: number;
  stats: {
    pace: number;
    stamina: number;
    passing: number;
  };
  image: string;
  status: "Verified" | "Pending";
}

const MOCK_PLAYERS: ScoutPlayer[] = [
  {
    id: "1",
    name: "Somchai Jaidee",
    academy: "BG Pathum United",
    province: "Bangkok",
    age: 16,
    height: 178,
    weight: 65,
    position: "Midfielder",
    grade: "A+",
    stars: 5,
    stats: { pace: 85, stamina: 92, passing: 88 },
    image:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Somchai1&backgroundColor=e2e8f0",
    status: "Verified",
  },
  {
    id: "2",
    name: "Tawan Singsomboon",
    academy: "Buriram United",
    province: "Buriram",
    age: 14,
    height: 172,
    weight: 60,
    position: "Forward",
    grade: "A",
    stars: 4,
    stats: { pace: 90, stamina: 78, passing: 75 },
    image:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Tawan2&backgroundColor=e2e8f0",
    status: "Verified",
  },
  {
    id: "3",
    name: "Kasem Wongsawan",
    academy: "Chonburi FC",
    province: "Chonburi",
    age: 17,
    height: 185,
    weight: 74,
    position: "Defender",
    grade: "B",
    stars: 3,
    stats: { pace: 70, stamina: 85, passing: 65 },
    image:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Kasem3&backgroundColor=e2e8f0",
    status: "Verified",
  },
  {
    id: "4",
    name: "Nithinan Panyarat",
    academy: "Muangthong United",
    province: "Nonthaburi",
    age: 16,
    height: 188,
    weight: 78,
    position: "Goalkeeper",
    grade: "A+",
    stars: 5,
    stats: { pace: 60, stamina: 70, passing: 80 },
    image:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Nithinan4&backgroundColor=e2e8f0",
    status: "Verified",
  },
  {
    id: "5",
    name: "Worawit Rattanapan",
    academy: "Port FC",
    province: "Bangkok",
    age: 13,
    height: 165,
    weight: 55,
    position: "Midfielder",
    grade: "A",
    stars: 4,
    stats: { pace: 82, stamina: 88, passing: 85 },
    image:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Worawit5&backgroundColor=e2e8f0",
    status: "Verified",
  },
  {
    id: "6",
    name: "Arnon Suthilak",
    academy: "Chiangrai United",
    province: "Chiang Rai",
    age: 17,
    height: 174,
    weight: 68,
    position: "Forward",
    grade: "B",
    stars: 3,
    stats: { pace: 88, stamina: 75, passing: 70 },
    image:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Arnon6&backgroundColor=e2e8f0",
    status: "Verified",
  },
  {
    id: "7",
    name: "Supachai Meesri",
    academy: "Suphanburi FC Academy",
    province: "Suphan Buri",
    age: 15,
    height: 170,
    weight: 62,
    position: "Forward",
    grade: "C",
    stars: 3,
    stats: { pace: 75, stamina: 70, passing: 60 },
    image:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Supachai7&backgroundColor=e2e8f0",
    status: "Pending",
  },
];

export default function ScoutDashboard({ onBack }: { onBack: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    province: "",
    ageGroup: "",
    position: "",
    grade: "",
  });

  const filteredPlayers = useMemo(() => {
    return MOCK_PLAYERS.filter((player) => {
      // Name Search
      if (
        searchQuery &&
        !player.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;

      // Province Filter
      if (filters.province && player.province !== filters.province)
        return false;

      // Age Group Filter
      if (filters.ageGroup === "U13" && player.age > 13) return false;
      if (filters.ageGroup === "U15" && (player.age <= 13 || player.age > 15))
        return false;
      if (filters.ageGroup === "U17" && (player.age <= 15 || player.age > 17))
        return false;

      // Position Filter
      if (filters.position && player.position !== filters.position)
        return false;

      // Grade Filter
      if (filters.grade && player.grade !== filters.grade) return false;

      return true;
    });
  }, [filters, searchQuery]);

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === prev[key] ? "" : value,
    }));
  };

  const PROVINCES = Array.from(new Set(MOCK_PLAYERS.map((p) => p.province)));
  const AGE_GROUPS = ["U13", "U15", "U17"];
  const POSITIONS = ["Forward", "Midfielder", "Defender", "Goalkeeper"];
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

            {/* Age Group Filter */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                รุ่นอายุ (Age Group)
              </h3>
              <div className="flex flex-wrap gap-2">
                {AGE_GROUPS.map((age) => (
                  <button
                    key={age}
                    onClick={() => updateFilter("ageGroup", age)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${filters.ageGroup === age ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"}`}
                  >
                    {age}
                  </button>
                ))}
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
            filters.ageGroup ||
            filters.position ||
            filters.grade) && (
            <div className="p-4 mt-auto border-t border-slate-100">
              <button
                onClick={() =>
                  setFilters({
                    province: "",
                    ageGroup: "",
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
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {isSubmitModalOpen && (
        <SubmitTalentModal onClose={() => setIsSubmitModalOpen(false)} />
      )}
    </div>
  );
}

function TalentCard({
  player,
  compareMode,
}: {
  player: ScoutPlayer;
  compareMode: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden relative group cursor-pointer ${compareMode ? "ring-2 ring-transparent hover:ring-indigo-500" : ""}`}
    >
      {/* Compare Mode Overlay Select */}
      {compareMode && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded border-2 border-slate-300 bg-white z-10 group-hover:border-indigo-500 transition-colors"></div>
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
            {player.position.slice(0, 3).toUpperCase()}
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
        <div className="space-y-2">
          <StatBar
            label="Pace (ความเร็ว)"
            value={player.stats.pace}
            color="bg-emerald-500"
          />
          <StatBar
            label="Stamina (ความฟิต)"
            value={player.stats.stamina}
            color="bg-blue-500"
          />
          <StatBar
            label="Passing (การส่ง)"
            value={player.stats.passing}
            color="bg-amber-500"
          />
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
  return (
    <div>
      <div className="flex justify-between items-end mb-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
          {label}
        </span>
        <span className="text-[10px] font-bold text-slate-700">{value}</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${value}%` }}
        ></div>
      </div>
    </div>
  );
}

function SubmitTalentModal({ onClose }: { onClose: () => void }) {
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
            onClick={onClose}
            className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
          >
            กลับสู่หน้าหลัก
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
          onSubmit={(e) => {
            e.preventDefault();
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
                defaultValue=""
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
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  ตำแหน่งที่ถนัด <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  defaultValue=""
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none transition-shadow"
                >
                  <option value="" disabled>
                    เลือกตำแหน่งหลัก...
                  </option>
                  <option value="gk">Goalkeeper (GK)</option>
                  <option value="def">Defender (CB, LB, RB)</option>
                  <option value="mid">Midfielder (DM, CM, AM)</option>
                  <option value="fwd">Forward (ST, LW, RW)</option>
                </select>
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
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block outline-none transition-shadow"
                />
              </div>
            </div>
          </section>

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
