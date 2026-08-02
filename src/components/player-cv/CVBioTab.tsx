import React from "react";
import { Utensils, Sun, Moon, Droplet, Calendar, Trash2 } from "lucide-react";
import { ThaiDatePicker } from "../ThaiDatePicker";

interface CVBioTabProps {
  selectedLogDate: string;
  setSelectedLogDate: (val: string) => void;
  handleOpenAddDailyLog: () => void;
  currentDailyLog: any;
  dailyLogs: any[];
  handleDeleteDailyLog: (id: string) => void;
}

function CVBioTab(props: CVBioTabProps) {
  const {
    selectedLogDate, setSelectedLogDate, handleOpenAddDailyLog,
    currentDailyLog, dailyLogs, handleDeleteDailyLog
  } = props;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Utensils className="text-indigo-600 dark:text-purple-400 dark:[filter:drop-shadow(0_0_8px_rgba(192,132,252,0.8))]" size={28} />
          <h2 className="text-2xl font-black text-slate-800 tracking-tight dark:text-purple-400 dark:[text-shadow:0_0_8px_rgba(192,132,252,0.6)]">Nutrition & Lifestyle</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-sm text-sm font-bold text-slate-700 dark:text-slate-300">
            <span className="text-xs text-slate-400 dark:text-slate-500">เลือกวันที่:</span>
            <ThaiDatePicker
              value={selectedLogDate}
              onChange={(e) => setSelectedLogDate(e.target.value)}
              className="outline-none border-none text-slate-700 dark:text-slate-300 font-extrabold cursor-pointer bg-transparent"
            />
          </div>
          <button
            onClick={handleOpenAddDailyLog}
            className="px-4 py-2 bg-indigo-600 dark:bg-purple-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 dark:hover:bg-purple-500 transition shadow-sm flex items-center gap-1.5 whitespace-nowrap dark:[box-shadow:0_0_10px_rgba(168,85,247,0.5)]"
          >
            <Utensils size={14} /> บันทึกโภชนาการวันนี้
          </button>
        </div>
      </div>

      {/* 1. Daily Nutrition & Lifestyle Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Breakfast Card */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/30 dark:to-amber-900/10 border border-amber-200/60 dark:border-amber-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px] dark:[box-shadow:0_0_15px_rgba(251,191,36,0.1)]">
          <div className="absolute -right-3 -top-3 text-amber-500/10 dark:text-amber-500/5">
            <Sun size={80} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 dark:[text-shadow:0_0_5px_rgba(251,191,36,0.5)] font-bold text-sm mb-3">
              <Sun size={18} className="text-amber-600 dark:text-amber-400 dark:[filter:drop-shadow(0_0_5px_rgba(251,191,36,0.8))]" />
              มื้อเช้า (Breakfast)
            </div>
            <div className="text-slate-800 dark:text-slate-200 font-extrabold text-base min-h-[40px]">
              {currentDailyLog?.breakfast || "ไม่ได้บันทึก"}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-4">
            {currentDailyLog?.breakfastNutrients?.includes("protein") && <span className="px-2 py-0.5 bg-white dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-full">🥚 โปรตีน</span>}
            {currentDailyLog?.breakfastNutrients?.includes("carb") && <span className="px-2 py-0.5 bg-white dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-full">🌾 คาร์บ</span>}
            {currentDailyLog?.breakfastNutrients?.includes("vitamin") && <span className="px-2 py-0.5 bg-white dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-full">🥗 วิตามิน</span>}
          </div>
        </div>

        {/* Lunch Card */}
        <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-900/30 dark:to-orange-900/10 border border-orange-200/60 dark:border-orange-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px] dark:[box-shadow:0_0_15px_rgba(249,115,22,0.1)]">
          <div className="absolute -right-3 -top-3 text-orange-500/10 dark:text-orange-500/5">
            <Utensils size={80} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-orange-800 dark:text-orange-400 dark:[text-shadow:0_0_5px_rgba(249,115,22,0.5)] font-bold text-sm mb-3">
              <Utensils size={18} className="text-orange-600 dark:text-orange-400 dark:[filter:drop-shadow(0_0_5px_rgba(249,115,22,0.8))]" />
              มื้อกลางวัน (Lunch)
            </div>
            <div className="text-slate-800 dark:text-slate-200 font-extrabold text-base min-h-[40px]">
              {currentDailyLog?.lunch || "ไม่ได้บันทึก"}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-4">
            {currentDailyLog?.lunchNutrients?.includes("protein") && <span className="px-2 py-0.5 bg-white dark:bg-orange-900/50 border border-orange-200 dark:border-orange-700 text-orange-800 dark:text-orange-300 text-[10px] font-bold rounded-full">🥚 โปรตีน</span>}
            {currentDailyLog?.lunchNutrients?.includes("carb") && <span className="px-2 py-0.5 bg-white dark:bg-orange-900/50 border border-orange-200 dark:border-orange-700 text-orange-800 dark:text-orange-300 text-[10px] font-bold rounded-full">🌾 คาร์บ</span>}
            {currentDailyLog?.lunchNutrients?.includes("vitamin") && <span className="px-2 py-0.5 bg-white dark:bg-orange-900/50 border border-orange-200 dark:border-orange-700 text-orange-800 dark:text-orange-300 text-[10px] font-bold rounded-full">🥗 วิตามิน</span>}
          </div>
        </div>

        {/* Dinner Card */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-900/30 dark:to-indigo-900/10 border border-indigo-200/60 dark:border-indigo-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px] dark:[box-shadow:0_0_15px_rgba(99,102,241,0.1)]">
          <div className="absolute -right-3 -top-3 text-indigo-500/10 dark:text-indigo-500/5">
            <Moon size={80} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-400 dark:[text-shadow:0_0_5px_rgba(99,102,241,0.5)] font-bold text-sm mb-3">
              <Moon size={18} className="text-indigo-600 dark:text-indigo-400 dark:[filter:drop-shadow(0_0_5px_rgba(99,102,241,0.8))]" />
              มื้อเย็น (Dinner)
            </div>
            <div className="text-slate-800 dark:text-slate-200 font-extrabold text-base min-h-[40px]">
              {currentDailyLog?.dinner || "ไม่ได้บันทึก"}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-4">
            {currentDailyLog?.dinnerNutrients?.includes("protein") && <span className="px-2 py-0.5 bg-white dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold rounded-full">🥚 โปรตีน</span>}
            {currentDailyLog?.dinnerNutrients?.includes("carb") && <span className="px-2 py-0.5 bg-white dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold rounded-full">🌾 คาร์บ</span>}
            {currentDailyLog?.dinnerNutrients?.includes("vitamin") && <span className="px-2 py-0.5 bg-white dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold rounded-full">🥗 วิตามิน</span>}
          </div>
        </div>

        {/* Hydration & Sleep Card */}
        <div className="bg-gradient-to-br from-sky-50 to-sky-100/50 dark:from-sky-900/30 dark:to-sky-900/10 border border-sky-200/60 dark:border-sky-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px] dark:[box-shadow:0_0_15px_rgba(14,165,233,0.1)]">
          <div className="absolute -right-3 -top-3 text-sky-500/10 dark:text-sky-500/5">
            <Droplet size={80} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sky-800 dark:text-sky-400 dark:[text-shadow:0_0_5px_rgba(14,165,233,0.5)] font-bold text-sm mb-3">
              <Droplet size={18} className="text-sky-600 dark:text-sky-400 dark:[filter:drop-shadow(0_0_5px_rgba(14,165,233,0.8))]" />
              น้ำดื่ม & การนอน
            </div>
            <div className="space-y-2 mt-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>💧 ดื่มน้ำ:</span>
                <span className="dark:text-sky-300">{currentDailyLog?.hydration || "0"} แก้ว</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>💤 การนอน:</span>
                <span className="dark:text-sky-300">{currentDailyLog?.sleep || "0"} ชั่วโมง</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider mt-4">
            วันที่แสดง: {selectedLogDate}
          </div>
        </div>
      </div>



      {/* 3. Daily Logs History List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">ประวัติการบันทึกอาหารย้อนหลัง (Food & Lifestyle Log)</h3>
        </div>
        {dailyLogs.length === 0 ? (
          <div className="p-10 text-center text-slate-400 dark:text-slate-500 text-sm">
            ไม่มีประวัติการบันทึกโภชนาการ
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {dailyLogs.map((log) => (
              <div key={log.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 dark:bg-purple-900/30 text-indigo-600 dark:text-purple-400 p-2.5 rounded-xl shrink-0 dark:border dark:border-purple-800 dark:[box-shadow:0_0_10px_rgba(168,85,247,0.3)]">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 dark:text-slate-500">วันที่บันทึก</div>
                      <div className="text-sm font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        {log.date}
                        {log.isMatchDay && <span className="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-[10px] px-1.5 py-0.5 rounded-md font-bold dark:border dark:border-rose-800">Match Day</span>}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-400 dark:text-slate-500">รายการอาหาร</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium leading-relaxed">
                      🍳 เช้า: {log.breakfast || "-"}<br />
                      🍜 กลางวัน: {log.lunch || "-"}<br />
                      {log.isMatchDay && (
                        <>⚽ ของว่าง: {log.snacks || "-"}<br /></>
                      )}
                      🌙 เย็น: {log.dinner || "-"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-400 dark:text-slate-500">กลุ่มสารอาหารที่ได้รับ</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(log.breakfastNutrients?.includes("protein") || log.lunchNutrients?.includes("protein") || log.dinnerNutrients?.includes("protein")) && <span className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded dark:border dark:border-emerald-800">🥚 โปรตีน</span>}
                      {(log.breakfastNutrients?.includes("carb") || log.lunchNutrients?.includes("carb") || log.dinnerNutrients?.includes("carb")) && <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded dark:border dark:border-amber-800">🌾 คาร์บ</span>}
                      {(log.breakfastNutrients?.includes("vitamin") || log.lunchNutrients?.includes("vitamin") || log.dinnerNutrients?.includes("vitamin")) && <span className="px-1.5 py-0.5 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 text-[10px] font-bold rounded dark:border dark:border-sky-800">🥗 วิตามิน</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-xs font-bold text-slate-400 dark:text-slate-500">💧 น้ำดื่ม</div>
                      <div className="text-sm font-extrabold text-slate-700 dark:text-sky-400">{log.hydration || "0"} แก้ว</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 dark:text-slate-500">💤 การนอน</div>
                      <div className="text-sm font-extrabold text-slate-700 dark:text-sky-400">{log.sleep || "8"} ชม.</div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteDailyLog(log.id)}
                  className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors self-end md:self-auto"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(CVBioTab);
