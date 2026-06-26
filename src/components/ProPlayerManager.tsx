import React, { useState, useMemo, useEffect } from 'react';
import { Search, ArrowLeft, Filter, Plus, FileText, UserPlus, X, Loader2 } from 'lucide-react';
import { ProPlayer } from '../types/ProPlayer';

const MOCK_PRO_PLAYERS: ProPlayer[] = [
  {
    id: 'p1',
    name: 'Teerasil Dangda',
    nationality: 'Thailand',
    dob: '1988-06-06',
    position: 'Striker',
    secondaryPosition: 'Attacking Midfielder',
    height: 181,
    weight: 75,
    preferredFoot: 'Right',
    currentClub: 'BG Pathum United',
    league: 'T1',
    contractExpiry: '2025-05-31',
    marketValue: '€300k',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Teerasil&backgroundColor=0284c7',
    actionShotUrl: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=800&auto=format&fit=crop',
    highlightVideoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    careerHistory: [
      { year: '2020-Present', club: 'BG Pathum United', apps: 85, goals: 34, assists: 12 },
      { year: '2020', club: 'Shimizu S-Pulse', apps: 24, goals: 3, assists: 1 },
      { year: '2018', club: 'Sanfrecce Hiroshima', apps: 32, goals: 6, assists: 3 },
      { year: '2009-2020', club: 'Muangthong United', apps: 268, goals: 117, assists: 40 },
    ],
    attributes: {
      technical: 85,
      tactical: 80,
      physical: 72,
      mental: 88,
      attacking: 89,
      defending: 40,
    }
  },
  {
    id: 'p2',
    name: 'Supachok Sarachat',
    nationality: 'Thailand',
    dob: '1998-05-22',
    position: 'Winger',
    secondaryPosition: 'Attacking Midfielder',
    height: 169,
    weight: 60,
    preferredFoot: 'Right',
    currentClub: 'Hokkaido Consadole Sapporo',
    league: 'T1',
    contractExpiry: '2027-12-31',
    marketValue: '€1.00m',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Supachok&backgroundColor=dc2626',
    actionShotUrl: 'https://images.unsplash.com/photo-1518605368461-1e1e11111111?q=80&w=800&auto=format&fit=crop',
    careerHistory: [
      { year: '2022-Present', club: 'Hokkaido Consadole Sapporo', apps: 42, goals: 9, assists: 6 },
      { year: '2015-2022', club: 'Buriram United', apps: 153, goals: 34, assists: 20 },
    ],
    attributes: {
      technical: 88,
      tactical: 78,
      physical: 75,
      mental: 80,
      attacking: 85,
      defending: 45,
    }
  }
];

export default function ProPlayerManager({ onBack, onSelectPlayer }: { onBack: () => void, onSelectPlayer: (p: ProPlayer) => void }) {
  const [players, setPlayers] = useState<ProPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchPlayers = async () => {
      try {
        setIsLoading(true);
        // Simulate fetch delay to show loading state if needed
        await new Promise(r => setTimeout(r, 400)); 
        if (isMounted) setPlayers(MOCK_PRO_PLAYERS);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchPlayers();
    return () => { isMounted = false; };
  }, []);

  const filteredPlayers = useMemo(() => {
    return players.filter(player => {
      if (searchQuery && !player.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (leagueFilter && player.league !== leagueFilter) return false;
      return true;
    });
  }, [players, searchQuery, leagueFilter]);

  const LEAGUES = ['T1', 'T2', 'T3', 'Semi-pro', 'Free Agent'];

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 relative">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 shrink-0 lg:flex-row flex-col lg:justify-between lg:items-center items-start">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-200 bg-white rounded-xl transition-colors shadow-sm text-slate-600"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Pro Player Management</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest mt-0.5">Professional Squad & Digital CVs</p>
          </div>
        </div>
        
        <button 
           onClick={() => setIsAddModalOpen(true)}
           className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 transition-colors w-full lg:w-auto justify-center"
        >
          <UserPlus size={18} />
          เพิ่มนักเตะอาชีพ
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col sm:flex-row gap-4 items-center">
         <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="ค้นหาชื่อนักเตะ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
            />
         </div>
         <div className="flex items-center gap-3 w-full sm:w-auto">
            <Filter size={18} className="text-slate-400 hidden sm:block" />
            <select 
               value={leagueFilter}
               onChange={(e) => setLeagueFilter(e.target.value)}
               className="w-full sm:w-48 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-bold text-slate-700"
            >
               <option value="">ทุกลีก (All Leagues)</option>
               {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
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
            <div className="col-span-full py-16 text-center bg-white border border-slate-200 border-dashed rounded-3xl flex flex-col items-center justify-center shadow-sm">
                <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-4">
                    <UserPlus size={32} />
                </div>
                <h3 className="text-slate-700 font-bold text-lg mb-1">ยังไม่มีรายชื่อนักเตะในระบบ</h3>
                <p className="text-slate-500 text-sm">โปรดกดปุ่ม 'เพิ่มนักเตะอาชีพ' ด้านบน</p>
            </div>
         ) : filteredPlayers.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-500 font-medium">ไม่พบผลลัพธ์ที่ค้นหา</div>
         ) : (
            filteredPlayers.map(player => (
               <div key={player.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow cursor-pointer" onClick={() => onSelectPlayer(player)}>
                  <div className="flex items-start p-5 gap-4">
                     <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                        <img src={player.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}`} alt={player.name} className="w-full h-full object-cover" />
                     </div>
                     <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-800 text-lg truncate group-hover:text-indigo-600 transition-colors">{player.name}</h3>
                        <p className="text-sm text-slate-500 truncate">{player.currentClub}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                           <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100">{player.league}</span>
                           <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">{player.position}</span>
                        </div>
                     </div>
                  </div>
                  <div className="mt-auto p-4 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                     <button 
                        onClick={(e) => { e.stopPropagation(); onSelectPlayer(player); }}
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
         <AddProPlayerModal onClose={() => setIsAddModalOpen(false)} onAdd={(p) => {
            setPlayers(prev => [p, ...prev]);
            setIsAddModalOpen(false);
         }} />
      )}
    </div>
  );
}

function AddProPlayerModal({ onClose, onAdd }: { onClose: () => void, onAdd: (p: ProPlayer) => void }) {
   const [formData, setFormData] = useState<Partial<ProPlayer>>({
      name: '', nationality: '', dob: '', position: 'Striker', height: 175, weight: 70, preferredFoot: 'Right',
      currentClub: '', league: 'T1', contractExpiry: '', marketValue: '', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=new',
      actionShotUrl: '', highlightVideoUrl: '', careerHistory: [],
      attributes: { technical: 70, tactical: 70, physical: 70, mental: 70, attacking: 70, defending: 70 }
   });

   return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
         <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
         <div className="relative bg-white rounded-2xl w-full max-w-3xl max-h-full overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
               <h2 className="text-lg font-bold text-slate-800">เพิ่มข้อมูลนักเตะอาชีพ (Add Pro Player)</h2>
               <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={20} />
               </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-8 flex-1">
               {/* Section 1: Basic Info */}
               <div>
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4 border-b border-indigo-100 pb-2">1. ข้อมูลพื้นฐาน (Basic Info)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">ชื่อ-นามสกุล</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="e.g. Chanathip Songkrasin" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">สัญชาติ</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="Thailand" value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">วัน/เดือน/ปีเกิด</label>
                        <input type="date" max={new Date().toISOString().split('T')[0]} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                        <div>
                           <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">ส่วนสูง (cm)</label>
                           <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={formData.height} onChange={e => setFormData({...formData, height: parseInt(e.target.value)})} />
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">น้ำหนัก (kg)</label>
                           <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={formData.weight} onChange={e => setFormData({...formData, weight: parseInt(e.target.value)})} />
                        </div>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">เท้าที่ถนัด (Foot)</label>
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={formData.preferredFoot} onChange={e => setFormData({...formData, preferredFoot: e.target.value as any})}>
                           <option value="Right">ขวา (Right)</option>
                           <option value="Left">ซ้าย (Left)</option>
                           <option value="Both">ทั้งสองเท้า (Both)</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">ตำแหน่งหลัก (Position)</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="Attacking Midfielder" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} />
                     </div>
                  </div>
               </div>

               {/* Section 2: Club & Contract */}
               <div>
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4 border-b border-indigo-100 pb-2">2. สังกัดและสัญญา (Club & Contract)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">สโมสรปัจจุบัน</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="Club Name" value={formData.currentClub} onChange={e => setFormData({...formData, currentClub: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">ลีก (League)</label>
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={formData.league} onChange={e => setFormData({...formData, league: e.target.value as any})}>
                           <option value="T1">T1 (Thai League 1)</option>
                           <option value="T2">T2</option>
                           <option value="T3">T3</option>
                           <option value="Semi-pro">Semi-pro</option>
                           <option value="Free Agent">Free Agent</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">สัญญาหมดอายุ (Contract Expiry)</label>
                        <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={formData.contractExpiry} onChange={e => setFormData({...formData, contractExpiry: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">ค่าตัวประเมิน (Market Value)</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="e.g. €500k" value={formData.marketValue} onChange={e => setFormData({...formData, marketValue: e.target.value})} />
                     </div>
                  </div>
               </div>

               {/* Section 3: Media */}
               <div>
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4 border-b border-indigo-100 pb-2">3. สื่อและรูปถ่าย (Media & Photos)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">รูปโปรไฟล์ (Avatar)</label>
                        <div className="flex items-center gap-3 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                           {formData.avatarUrl && !formData.avatarUrl.includes('dicebear') && (
                              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-slate-200">
                                 <img src={formData.avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                              </div>
                           )}
                           <input type="file" accept="image/*" className="text-xs text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 w-full" onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                 const reader = new FileReader();
                                 reader.onloadend = () => setFormData({...formData, avatarUrl: reader.result as string});
                                 reader.readAsDataURL(file);
                              }
                           }} />
                        </div>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">รูปขณะลงเล่น (Action Shot)</label>
                        <div className="flex flex-col gap-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            {formData.actionShotUrl && (
                               <div className="h-20 rounded-md overflow-hidden shrink-0 border border-slate-200 bg-slate-100 flex items-center justify-center">
                                  <img src={formData.actionShotUrl} alt="Action Shot Preview" className="h-full object-contain" />
                               </div>
                            )}
                            <input type="file" accept="image/*" className="text-xs text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 w-full" onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                 const reader = new FileReader();
                                 reader.onloadend = () => setFormData({...formData, actionShotUrl: reader.result as string});
                                 reader.readAsDataURL(file);
                              }
                           }} />
                        </div>
                     </div>
                     <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">URL วิดีโอไฮไลต์ (YouTube/Vimeo)</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="https://youtube.com/..." value={formData.highlightVideoUrl} onChange={e => setFormData({...formData, highlightVideoUrl: e.target.value})} />
                     </div>
                  </div>
               </div>

               {/* Section 4: Contact Info */}
               <div>
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4 border-b border-indigo-100 pb-2">4. ข้อมูลติดต่อ (Contact Info)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">เบอร์โทรศัพท์ (Phone)</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="08x-xxx-xxxx" value={formData.phoneNumber || ''} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Line ID</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="@username" value={formData.lineId || ''} onChange={e => setFormData({...formData, lineId: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Facebook</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" placeholder="Facebook Profile" value={formData.facebook || ''} onChange={e => setFormData({...formData, facebook: e.target.value})} />
                     </div>
                  </div>
               </div>

               {/* Section 5: Career History */}
               <div>
                  <div className="flex items-center justify-between mb-4 border-b border-indigo-100 pb-2">
                     <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest">5. ประวัติการค้าแข้ง (Career History)</h3>
                     <button 
                        type="button"
                        onClick={() => {
                           const newHistory = [...(formData.careerHistory || []), { year: '', club: '', apps: 0, goals: 0, assists: 0 }];
                           setFormData({...formData, careerHistory: newHistory});
                        }}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md"
                     >
                        <Plus size={14} /> เพิ่มประวัติ
                     </button>
                  </div>
                  
                  {formData.careerHistory && formData.careerHistory.length > 0 ? (
                     <div className="space-y-3">
                        {formData.careerHistory.map((history, idx) => (
                           <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl relative group">
                              <button 
                                 type="button"
                                 onClick={() => {
                                    const newHistory = formData.careerHistory!.filter((_, i) => i !== idx);
                                    setFormData({...formData, careerHistory: newHistory});
                                 }}
                                 className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm hover:bg-red-200"
                              >
                                 <X size={12} strokeWidth={3} />
                              </button>
                              
                              <input type="text" placeholder="ปี (เช่น 2020-2023)" className="w-full sm:w-32 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500" value={history.year} onChange={e => {
                                 const newHistory = [...formData.careerHistory!];
                                 newHistory[idx] = { ...newHistory[idx], year: e.target.value };
                                 setFormData({...formData, careerHistory: newHistory});
                              }} />
                              
                              <input type="text" placeholder="สโมสร" className="w-full sm:flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500" value={history.club} onChange={e => {
                                 const newHistory = [...formData.careerHistory!];
                                 newHistory[idx] = { ...newHistory[idx], club: e.target.value };
                                 setFormData({...formData, careerHistory: newHistory});
                              }} />
                              
                              <div className="flex gap-2 w-full sm:w-auto">
                                 <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase w-8">Apps</span>
                                    <input type="number" placeholder="0" className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500" value={history.apps || ''} onChange={e => {
                                       const newHistory = [...formData.careerHistory!];
                                       newHistory[idx] = { ...newHistory[idx], apps: parseInt(e.target.value) || 0 };
                                       setFormData({...formData, careerHistory: newHistory});
                                    }} />
                                 </div>
                                 <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase w-8">Gls</span>
                                    <input type="number" placeholder="0" className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500" value={history.goals || ''} onChange={e => {
                                       const newHistory = [...formData.careerHistory!];
                                       newHistory[idx] = { ...newHistory[idx], goals: parseInt(e.target.value) || 0 };
                                       setFormData({...formData, careerHistory: newHistory});
                                    }} />
                                 </div>
                                 <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase w-8">Asts</span>
                                    <input type="number" placeholder="0" className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500" value={history.assists || ''} onChange={e => {
                                       const newHistory = [...formData.careerHistory!];
                                       newHistory[idx] = { ...newHistory[idx], assists: parseInt(e.target.value) || 0 };
                                       setFormData({...formData, careerHistory: newHistory});
                                    }} />
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                  ) : (
                     <div className="text-center py-6 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
                        <p className="text-xs text-slate-400 mb-2">ยังไม่มีข้อมูลประวัติการค้าแข้ง</p>
                        <button 
                           type="button"
                           onClick={() => {
                              const newHistory = [{ year: '', club: '', apps: 0, goals: 0, assists: 0 }];
                              setFormData({...formData, careerHistory: newHistory});
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
               <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm">Cancel</button>
               <button onClick={() => {
                  onAdd({ ...formData, id: 'new_'+Date.now(), name: formData.name || 'Unknown' } as ProPlayer);
               }} className="flex-1 py-2.5 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm shadow-sm">Save Player Data</button>
            </div>
         </div>
      </div>
   );
}
