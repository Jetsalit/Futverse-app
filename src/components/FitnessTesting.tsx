import { useState, memo, useCallback } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  Save,
  User,
  ShieldAlert,
  Activity,
  ChevronLeft,
  ClipboardList,
  Database,
  Check,
} from "lucide-react";

// Mock Data
const MOCK_PLAYERS = [
  { id: 1, name: "ศุภณัฏฐ์ เหมือนตา", position: "FW", uClass: "U-17" },
  { id: 2, name: "เอกนิษฐ์ ปัญญา", position: "MF", uClass: "U-17" },
  { id: 3, name: "กฤษดา กาแมน", position: "DF", uClass: "U-17" },
  { id: 4, name: "สุภโชค สารชาติ", position: "MF", uClass: "U-17" },
];

const METRICS_CONFIG = [
  { key: "yoyo_level", label: "Yo-Yo Test", unit: "Level", max: 20 },
  {
    key: "calculated_vo2max",
    label: "VO2 Max (Auto)",
    unit: "ml/kg/min",
    max: 80,
    readonly: true,
  },
  { key: "speed_10m", label: "10m Sprint", unit: "Sec", max: 3, invert: true },
  { key: "speed_30m", label: "30m Sprint", unit: "Sec", max: 6, invert: true },
  { key: "vertical_jump", label: "Vertical Jump", unit: "cm", max: 80 },
];

const MOCK_HISTORIC_DATA = [
  { month: "Jan", yoyo_level: 16.5, speed_30m: 4.8 },
  { month: "Feb", yoyo_level: 16.2, speed_30m: 4.6 },
  { month: "Mar", yoyo_level: 15.8, speed_30m: 4.5 },
  { month: "Apr", yoyo_level: 15.5, speed_30m: 4.3 },
];

// --- FitnessTestingGrid Implementation ---

// 1. ฟังก์ชันคำนวณอัตโนมัติ (Real-time Calculation)
const calculateVO2Max = (yoyoLevel: string) => {
  if (!yoyoLevel) return "";
  const level = parseFloat(yoyoLevel);
  if (isNaN(level)) return "";
  // จำลองสูตรคำนวณ (เช่น ถ้าระดับ 16.1 -> 44.4)
  // ตัวอย่างใช้สูตรสมมุติเพื่อให้ใกล้เคียงกับเงื่อนไข
  return (level * 2.758).toFixed(1);
};

// 2. จัดการ State ของตารางระดับ Row (เพื่อประสิทธิภาพที่ดี ไม่ให้เกิดการ re-render ทั้ง 30 แถวเมื่อพิมพ์ทีละช่อง)
const PlayerTestRow = memo(
  ({
    player,
    rowData,
    onChange,
  }: {
    player: any;
    rowData: any;
    onChange: (id: string, field: string, value: string) => void;
  }) => {
    const handleInputChange = (field: string, value: string) => {
      onChange(player.id.toString(), field, value);
    };

    return (
      <tr className="hover:bg-slate-50 border-b border-slate-100 transition-colors group">
        <td className="px-6 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[1px_0_0_#e2e8f0]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors shrink-0">
              <User size={14} />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-slate-800 truncate">
                {player.name}
              </div>
              <div className="text-[10px] text-slate-500 flex gap-1.5 mt-0.5">
                <span className="font-bold text-slate-400">{player.id}</span>
              </div>
            </div>
          </div>
        </td>
        {METRICS_CONFIG.map((m) => (
          <td key={m.key} className="px-4 py-3 text-center">
            <input
              type="number"
              step="any"
              readOnly={m.readonly}
              placeholder={m.readonly ? "-" : "0.0"}
              value={rowData?.[m.key] || ""}
              onChange={(e) => handleInputChange(m.key, e.target.value)}
              className={`w-20 border rounded px-2 py-1.5 text-sm text-center mx-auto block font-mono transition-all ${
                m.readonly
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700 font-bold focus:outline-none cursor-default shadow-inner"
                  : "bg-white border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              }`}
            />
          </td>
        ))}
      </tr>
    );
  },
);

function FitnessTestingGrid({
  players,
  isOnline,
  onOfflineSave,
  saveStatus,
  setSaveStatus,
  testData,
  setTestData,
}: {
  players: any[];
  isOnline: boolean;
  onOfflineSave?: () => void;
  saveStatus: "success" | "offline_queued" | null;
  setSaveStatus: React.Dispatch<
    React.SetStateAction<"success" | "offline_queued" | null>
  >;
  testData: Record<string, any>;
  setTestData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const [isSaving, setIsSaving] = useState(false);

  // ควบคุมการอัปเดตข้อมูลรายบุคคลและคำนวณอัตโนมัติ
  const handleRowChange = useCallback(
    (playerId: string, field: string, value: string) => {
      setTestData((prev) => {
        const updatedPlayerStats = {
          ...(prev[playerId] || {}),
          [field]: value,
        };

        // เมื่อกรอก Yo-Yo Test Level ให้คำนวณ VO2 Max ใส่ช่องแบบ Read-only ทันที
        if (field === "yoyo_level") {
          updatedPlayerStats["calculated_vo2max"] = calculateVO2Max(value);
        }

        return {
          ...prev,
          [playerId]: updatedPlayerStats,
        };
      });
      setSaveStatus(null);
    },
    [setTestData, setSaveStatus],
  );

  // 3. ระบบจัดเก็บข้อมูลแยกรายบุคคล (Upsert Logic)
  const handleSaveAllResults = () => {
    setIsSaving(true);

    // แปลงเทเบิล State ให้อยู่ในรูปแบบ Array of Objects ตามเงื่อนไข
    const todayDate = new Date().toISOString().split("T")[0];
    const payloadToSave = players
      .map((player) => {
        const stats = testData[player.id] || {};
        return {
          player_id: player.id.toString(),
          test_date: todayDate,
          yoyo_level: Number(stats["yoyo_level"]) || null,
          calculated_vo2max: Number(stats["calculated_vo2max"]) || null,
          speed_10m: Number(stats["speed_10m"]) || null,
          speed_30m: Number(stats["speed_30m"]) || null,
          vertical_jump: Number(stats["vertical_jump"]) || null,
        };
      })
      .filter(
        (data) =>
          data.yoyo_level !== null ||
          data.speed_10m !== null ||
          data.speed_30m !== null ||
          data.vertical_jump !== null,
      ); // Filter rows that actually have data filled

    /**
     * --- [EXPLANATION: SUPABASE UPSERT LOGIC] ---
     *
     * หลักการใช้ Upsert ใน Supabase สำหรับ Requirement นี้เพื่อกระจายปัญหาการกด Save ซ้ำหน้าบ้าน:
     *
     * const { data, error } = await supabase
     *   .from('fitness_tests')
     *   .upsert(
     *     payloadToSave,
     *     {
     *       onConflict: 'player_id, test_date', // เราจะกำหนด Composite Unique Key (player_id + test_date) ที่ระดับ Database Table
     *       ignoreDuplicates: false // อนุญาตให้ Update ทับของเดิมได้เลยถ้ารายการนั้นมีอยู่แล้ว
     *     }
     *   );
     *
     * สิ่งที่จะเกิดขึ้นเมื่อส่งคำสั่งนี้:
     * 1. ฐานข้อมูลจะเช็กว่า วันนี้ (test_date) นักกีฬาคนนี้ (player_id) เคยบันทึกสถิติไปหรือยัง
     * 2. หากยังไม่เคย (ไม่มี Record ที่ตรงทั้ง 2 คอลัมน์): Supabase จะ INSERT แถวใหม่ให้
     * 3. หากมีแล้ว แต่เราแค่พิมพ์แก้ตัวเลข 10m Sprint ใหม่และกด Save: Supabase จะ UPDATE ทับ Record ของวันนี้ด้วยข้อมูลใหม่ทันที
     *
     * ข้อดีคือไม่เกิดขยะ Data Duplicate ในกรณีที่คนใช้งานกดปุ่ม "Save All Results" หลายๆ ครั้งในวันเดียวกัน
     */

    // Simulate Supabase Response wait time
    setTimeout(() => {
      setIsSaving(false);
      console.log(
        "--- Payload Prepared for Upsert (Supabase) ---",
        payloadToSave,
      );

      if (isOnline) {
        setSaveStatus("success");
      } else {
        setSaveStatus("offline_queued");
        onOfflineSave?.();
      }

      setTimeout(() => setSaveStatus(null), 3000);
    }, 800);
  };

  return (
    <>
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {saveStatus === "success" && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <Check size={14} /> Saved to Cloud
            </span>
          )}
          {saveStatus === "offline_queued" && (
            <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
              <Database size={14} /> Saved Offline
            </span>
          )}

          <button
            onClick={handleSaveAllResults}
            disabled={isSaving}
            className="px-4 py-2 flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition shadow-sm disabled:opacity-70 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {isSaving ? (
              "Saving..."
            ) : (
              <>
                <Save size={16} />
                {isOnline ? "Save All Results" : "Save Offline"}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
              <th className="px-6 py-3 border-b sticky left-0 bg-slate-50 z-10 w-72 shadow-[1px_0_0_#e2e8f0]">
                Player Info & Actions
              </th>
              {METRICS_CONFIG.map((m) => (
                <th
                  key={m.key}
                  className="px-4 py-3 border-b text-center align-bottom min-w-[120px]"
                >
                  {m.label}{" "}
                  <span className="font-normal text-slate-400 block mt-0.5">
                    ({m.unit})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm">
            {players.map((player) => (
              <PlayerTestRow
                key={player.id}
                player={player}
                rowData={testData[player.id.toString()]}
                onChange={handleRowChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function FitnessTesting({
  onBack,
  teamName,
  isOnline = true,
  onOfflineSave,
}: {
  onBack: () => void;
  teamName?: string;
  isOnline?: boolean;
  onOfflineSave?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"entry" | "report">("entry");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(
    MOCK_PLAYERS[0].id,
  );

  // State from main wrapper for reports functionality and passing to grid
  const [testData, setTestData] = useState<
    Record<string, Record<string, string>>
  >({});
  const [saveStatus, setSaveStatus] = useState<
    null | "success" | "offline_queued"
  >(null);

  const getRadarData = (playerId: number) => {
    return METRICS_CONFIG.filter((m) => m.key !== "calculated_vo2max").map(
      (m) => {
        let val = 0;
        if (testData[playerId]?.[m.key]) {
          val = parseFloat(testData[playerId][m.key]);
        } else {
          // Mock default values if not entered to show *something* in radar
          val = m.key.includes("speed")
            ? 4 + playerId * 0.1
            : m.key === "vertical_jump"
              ? 50 + playerId * 2
              : m.key === "yoyo_level"
                ? 14 + playerId * 0.5
                : 15 - playerId * 0.2;
        }

        // Normalize for radar (0-100 scale)
        let normalized = 0;
        if (m.invert) {
          normalized = Math.max(0, 100 - (val / m.max) * 50);
        } else {
          normalized = Math.min(100, (val / m.max) * 100);
        }

        return {
          subject: m.label,
          A: Math.round(normalized),
          fullMark: 100,
          actualValue: val,
        };
      },
    );
  };

  return (
    <div className="w-full flex-1 flex flex-col animate-in fade-in duration-300 relative">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-slate-200 bg-white shadow-sm text-slate-600 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
            Fitness Testing System
          </h1>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Assessment Engine
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 space-x-8">
        <button
          onClick={() => setActiveTab("entry")}
          className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${
            activeTab === "entry"
              ? "text-emerald-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <ClipboardList size={18} />
          Squad Entry Grid
          {activeTab === "entry" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("report")}
          className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${
            activeTab === "report"
              ? "text-emerald-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Activity size={18} />
          Player Reports Overview
          {activeTab === "report" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
          )}
        </button>
      </div>

      {activeTab === "entry" && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col animate-in fade-in duration-300">
          <FitnessTestingGrid
            players={MOCK_PLAYERS}
            isOnline={isOnline}
            onOfflineSave={onOfflineSave}
            saveStatus={saveStatus}
            setSaveStatus={setSaveStatus}
            testData={testData}
            setTestData={setTestData}
          />
        </section>
      )}

      {activeTab === "report" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-300">
          <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sticky top-6 h-fit">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 px-2">
              Squad Roster
            </h3>
            <div className="space-y-1.5">
              {MOCK_PLAYERS.map((player) => (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayerId(player.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between border ${
                    selectedPlayerId === player.id
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm"
                      : "border-transparent hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className="font-medium text-sm">{player.name}</span>
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded ${selectedPlayerId === player.id ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}
                  >
                    {player.position}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <div className="flex gap-3 mb-2">
                <ShieldAlert className="text-amber-500 shrink-0" size={20} />
                <span className="font-semibold text-amber-800 text-sm">
                  Injury Risk Analysis
                </span>
              </div>
              <div className="text-sm text-amber-700/90 leading-relaxed">
                High load detected in last 3 microcycles for selected position
                group. Recommend active recovery session.
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-6 border-b border-slate-100 pb-3">
                Performance Spider Chart
              </h3>
              <div className="h-[400px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    cx="50%"
                    cy="50%"
                    outerRadius="75%"
                    data={getRadarData(selectedPlayerId)}
                  >
                    <PolarGrid stroke="#e2e8f0" strokeWidth={1.5} />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{
                        fill: "#64748b",
                        fontSize: 11,
                        fontWeight: "bold",
                      }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={false}
                      axisLine={false}
                    />
                    <Radar
                      name="Current Assessment"
                      dataKey="A"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="#10b981"
                      fillOpacity={0.3}
                      dot={{
                        r: 4,
                        fill: "#10b981",
                        strokeWidth: 2,
                        stroke: "#fff",
                      }}
                      activeDot={{ r: 6, fill: "#10b981", strokeWidth: 0 }}
                    />
                    <Tooltip
                      formatter={(value: any, name: any, props: any) => [
                        props?.payload?.actualValue || value,
                        "Value",
                      ]}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        boxShadow:
                          "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                        padding: "12px",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-6 border-b border-slate-100 pb-3">
                Fitness Progression Timeline
              </h3>
              <div className="h-[300px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={MOCK_HISTORIC_DATA}
                    margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f1f5f9"
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: "#64748b",
                        fontSize: 11,
                        fontWeight: "bold",
                      }}
                      dy={10}
                    />
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      stroke="#0ea5e9"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      domain={["dataMin - 0.5", "dataMax + 0.5"]}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#10b981"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      domain={["dataMin - 0.5", "dataMax + 0.5"]}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        padding: "12px",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{
                        paddingTop: "20px",
                        fontSize: "11px",
                        fontWeight: "bold",
                        color: "#64748b",
                      }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      name="Yo-Yo Level"
                      dataKey="yoyo_level"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 5, strokeWidth: 2, fill: "#fff" }}
                      activeDot={{ r: 7 }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      name="30m Sprint (sec)"
                      dataKey="speed_30m"
                      stroke="#0ea5e9"
                      strokeWidth={3}
                      dot={{ r: 5, strokeWidth: 2, fill: "#fff" }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
