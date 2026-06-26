import { useState } from "react";
import {
  ChevronLeft,
  Search,
  Filter,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface IDPPlayerSummary {
  id: string;
  name: string;
  position: string;
  avatarUrl: string;
  team: string;
  overallProgress: number;
  shortTermProgress: number;
  longTermProgress: number;
  status: "On Track" | "Needs Attention" | "Exceeding";
  lastUpdated: string;
}

const MOCK_IDP_SUMMARY: IDPPlayerSummary[] = [
  {
    id: "p1",
    name: "Teerasil Dangda",
    position: "Striker",
    avatarUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Teerasil&backgroundColor=0284c7",
    team: "Senior Team",
    overallProgress: 85,
    shortTermProgress: 90,
    longTermProgress: 80,
    status: "On Track",
    lastUpdated: "2 days ago",
  },
  {
    id: "p2",
    name: "Supachok Sarachat",
    position: "Midfielder",
    avatarUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Supachok&backgroundColor=dc2626",
    team: "Senior Team",
    overallProgress: 60,
    shortTermProgress: 50,
    longTermProgress: 70,
    status: "Needs Attention",
    lastUpdated: "1 week ago",
  },
  {
    id: "p3",
    name: "Ekanit Panya",
    position: "Winger",
    avatarUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Ekanit&backgroundColor=ea580c",
    team: "Senior Team",
    overallProgress: 95,
    shortTermProgress: 100,
    longTermProgress: 90,
    status: "Exceeding",
    lastUpdated: "1 day ago",
  },
  {
    id: "p4",
    name: "Suphanat Mueanta",
    position: "Forward",
    avatarUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Suphanat&backgroundColor=0d9488",
    team: "U-23 Squad",
    overallProgress: 75,
    shortTermProgress: 80,
    longTermProgress: 70,
    status: "On Track",
    lastUpdated: "4 days ago",
  },
];

export default function IDPDashboard({
  onBack,
  onNavigateToPlayer,
}: {
  onBack: () => void;
  onNavigateToPlayer?: (id: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPlayers = MOCK_IDP_SUMMARY.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.position.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "On Track":
        return "text-emerald-600 bg-emerald-50 border-emerald-200";
      case "Needs Attention":
        return "text-rose-600 bg-rose-50 border-rose-200";
      case "Exceeding":
        return "text-indigo-600 bg-indigo-50 border-indigo-200";
      default:
        return "text-slate-600 bg-slate-50 border-slate-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "On Track":
        return <CheckCircle2 size={14} />;
      case "Needs Attention":
        return <AlertCircle size={14} />;
      case "Exceeding":
        return <TrendingUp size={14} />;
      default:
        return null;
    }
  };

  const averageProgress = Math.round(
    MOCK_IDP_SUMMARY.reduce((acc, curr) => acc + curr.overallProgress, 0) /
      MOCK_IDP_SUMMARY.length,
  );

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-slate-200 bg-white shadow-sm text-slate-600 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight uppercase">
              IDP Dashboard Overview
            </h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              FIFA & JFA Standard Tracking
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
              Squad IDP Active
            </p>
            <h3 className="text-3xl font-black text-slate-800">
              {MOCK_IDP_SUMMARY.length}
            </h3>
          </div>
          <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-500">
            <TrendingUp size={24} />
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
              Avg Overall Form
            </p>
            <h3 className="text-3xl font-black text-emerald-600">
              {averageProgress}%
            </h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500">
            <CheckCircle2 size={24} />
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
              Needs Attention
            </p>
            <h3 className="text-3xl font-black text-rose-600">
              {
                MOCK_IDP_SUMMARY.filter((p) => p.status === "Needs Attention")
                  .length
              }
            </h3>
          </div>
          <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-500">
            <AlertCircle size={24} />
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50">
          <div className="relative w-full sm:w-72">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Search player or position..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-sm font-bold text-slate-600 rounded-lg hover:bg-slate-50">
            <Filter size={16} /> Filter
          </button>
        </div>

        {/* List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Player
                </th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Overall Progress
                </th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Short-term
                </th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Long-term
                </th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Last Updated
                </th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPlayers.map((player) => (
                <tr
                  key={player.id}
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          player.avatarUrl ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}`
                        }
                        alt={player.name}
                        className="w-10 h-10 rounded-full border border-slate-200 bg-slate-100 object-cover"
                      />
                      <div>
                        <div className="font-bold text-slate-900">
                          {player.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {player.position} • {player.team}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden max-w-[120px]">
                        <div
                          className={`h-full rounded-full ${player.overallProgress >= 75 ? "bg-emerald-500" : player.overallProgress >= 50 ? "bg-amber-500" : "bg-rose-500"}`}
                          style={{ width: `${player.overallProgress}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700">
                        {player.overallProgress}%
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                        {player.shortTermProgress}%
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                        {player.longTermProgress}%
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(player.status)}`}
                    >
                      {getStatusIcon(player.status)}
                      {player.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-xs text-slate-500 font-medium">
                      {player.lastUpdated}
                    </span>
                  </td>
                  <td className="p-4 text-right cursor-pointer">
                    <button
                      onClick={() => onNavigateToPlayer?.(player.id)}
                      className="text-indigo-600 hover:text-indigo-800 text-sm font-bold bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      View IDP
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
