import React, { useState } from "react";
import { ChevronLeft, CheckCircle2, Search, X } from "lucide-react";

interface Position {
  x: number;
  y: number;
  label: string;
}

const FORMATIONS: Record<string, Position[]> = {
  "4-4-2": [
    { x: 50, y: 90, label: "GK" },
    { x: 15, y: 70, label: "LB" },
    { x: 35, y: 70, label: "CB" },
    { x: 65, y: 70, label: "CB" },
    { x: 85, y: 70, label: "RB" },
    { x: 15, y: 45, label: "LM" },
    { x: 35, y: 45, label: "CM" },
    { x: 65, y: 45, label: "CM" },
    { x: 85, y: 45, label: "RM" },
    { x: 35, y: 20, label: "ST" },
    { x: 65, y: 20, label: "ST" },
  ],
  "4-3-3": [
    { x: 50, y: 90, label: "GK" },
    { x: 15, y: 70, label: "LB" },
    { x: 35, y: 70, label: "CB" },
    { x: 65, y: 70, label: "CB" },
    { x: 85, y: 70, label: "RB" },
    { x: 30, y: 50, label: "CM" },
    { x: 50, y: 55, label: "CDM" },
    { x: 70, y: 50, label: "CM" },
    { x: 20, y: 25, label: "LW" },
    { x: 50, y: 20, label: "ST" },
    { x: 80, y: 25, label: "RW" },
  ],
  "3-5-2": [
    { x: 50, y: 90, label: "GK" },
    { x: 25, y: 75, label: "CB" },
    { x: 50, y: 70, label: "CB" },
    { x: 75, y: 75, label: "CB" },
    { x: 15, y: 45, label: "LWB" },
    { x: 35, y: 50, label: "CM" },
    { x: 50, y: 40, label: "CAM" },
    { x: 65, y: 50, label: "CM" },
    { x: 85, y: 45, label: "RWB" },
    { x: 35, y: 20, label: "ST" },
    { x: 65, y: 20, label: "ST" },
  ],
};

const MOCK_SQUAD = [
  { id: "1", name: "Kawin Thamsatchanan", number: 1, position: "GK" },
  { id: "2", name: "Nicholas Mickelson", number: 12, position: "RB" },
  { id: "3", name: "Pansa Hemviboon", number: 4, position: "CB" },
  { id: "4", name: "Elias Dolah", number: 15, position: "CB" },
  { id: "5", name: "Theerathon Bunmathan", number: 3, position: "LB" },
  { id: "6", name: "Sarach Yooyen", number: 6, position: "CM" },
  { id: "7", name: "Chanathip Songkrasin", number: 18, position: "CM" },
  { id: "8", name: "Supachok Sarachat", number: 7, position: "CAM" },
  { id: "9", name: "Bordin Phala", number: 11, position: "LW" },
  { id: "10", name: "Suphanat Mueanta", number: 10, position: "RW" },
  { id: "11", name: "Teerasil Dangda", number: 8, position: "ST" },
  { id: "12", name: "Supachai Chaided", number: 9, position: "ST" },
  { id: "13", name: "Kritsada Kaman", number: 5, position: "CB" },
  {
    id: "14",
    name: "Pathompol Charoenrattanapirom",
    number: 14,
    position: "RW",
  },
  { id: "15", name: "Picha Autra", number: 22, position: "CM" },
];

export default function StartingXIBuilder({ onBack }: { onBack: () => void }) {
  const [formation, setFormation] = useState<string>("4-3-3");
  const [lineup, setLineup] = useState<Record<number, string | null>>({});
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const currentFormation = FORMATIONS[formation];

  const handleFormationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormation(e.target.value);
    // Optionally clear lineup when changing formation?
    // It's better to keep it and remap by index. Let's just keep the lineup state.
  };

  const handleSlotClick = (idx: number) => {
    // If the slot already has a player, clicking it might deselect or select it again
    setActiveSlot(activeSlot === idx ? null : idx);
  };

  const assignPlayer = (playerId: string) => {
    if (activeSlot === null) return;

    setLineup((prev) => ({
      ...prev,
      [activeSlot]: playerId,
    }));
    setActiveSlot(null);
  };

  const removePlayer = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    const newLineup = { ...lineup };
    delete newLineup[idx];
    setLineup(newLineup);
    if (activeSlot === idx) {
      setActiveSlot(null);
    }
  };

  const selectedPlayerIds = Object.values(lineup).filter(Boolean) as string[];
  const selectedCount = selectedPlayerIds.length;

  const filteredSquad = MOCK_SQUAD.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.position.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="w-full max-w-6xl mx-auto pb-10 flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4 shrink-0">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-3"
          >
            <ChevronLeft size={16} /> Back to Dashboard
          </button>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            Starting XI & Tactics
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Design your match setup and player assignments
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">
            Formation
          </label>
          <select
            value={formation}
            onChange={handleFormationChange}
            className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm font-black text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
          >
            {Object.keys(FORMATIONS).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 flex-1 min-h-0">
        {/* Left: Pitch UI */}
        <div className="w-full lg:w-2/3 overflow-x-auto rounded-3xl shadow-xl border-[6px] border-white flex-shrink-0 bg-slate-100 hidden-scrollbar">
          <div className="min-w-[400px] md:w-full aspect-[3/4] md:aspect-auto md:h-full max-h-[800px] bg-emerald-600 relative overflow-hidden mx-auto">
            {/* Pitch Patterns & Lines */}
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 50px, rgba(0,0,0,0.1) 50px, rgba(0,0,0,0.1) 100px)",
              }}
            ></div>

            <div className="absolute inset-0 border-white border-2 m-4 pointer-events-none"></div>
            <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-white -translate-y-1/2 pointer-events-none"></div>
            <div className="absolute top-1/2 left-1/2 w-32 h-32 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
            <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

            <div className="absolute top-4 left-1/2 w-64 h-32 border-2 border-white -translate-x-1/2 pointer-events-none"></div>
            <div className="absolute bottom-4 left-1/2 w-64 h-32 border-2 border-white -translate-x-1/2 pointer-events-none"></div>
            <div className="absolute top-4 left-1/2 w-24 h-12 border-2 border-white -translate-x-1/2 pointer-events-none"></div>
            <div className="absolute bottom-4 left-1/2 w-24 h-12 border-2 border-white -translate-x-1/2 pointer-events-none"></div>

            <div className="absolute top-36 left-1/2 w-24 h-16 border-b-2 border-white rounded-b-full -translate-x-1/2 pointer-events-none"></div>
            <div className="absolute bottom-36 left-1/2 w-24 h-16 border-t-2 border-white rounded-t-full -translate-x-1/2 pointer-events-none"></div>

            {/* Player Slots */}
            {currentFormation.map((pos, idx) => {
              const isSelected = activeSlot === idx;
              const assignedPlayerId = lineup[idx];
              const player = MOCK_SQUAD.find((p) => p.id === assignedPlayerId);

              return (
                <div
                  key={idx}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-500 ease-in-out"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <div className="relative">
                    <button
                      onClick={() => handleSlotClick(idx)}
                      className={`w-8 h-8 md:w-12 md:h-12 rounded-full border-2 flex items-center justify-center font-black text-sm md:text-lg transition-transform ${
                        isSelected
                          ? "ring-4 ring-amber-400 scale-110 shadow-lg"
                          : "hover:scale-110 shadow-md"
                      } ${
                        player
                          ? "bg-white text-indigo-800 border-indigo-200"
                          : "bg-black/30 border-white/50 text-white border-dashed"
                      }`}
                    >
                      {player ? player.number : "+"}
                    </button>
                    {player && (
                      <button
                        onClick={(e) => removePlayer(e, idx)}
                        className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-white text-rose-500 rounded-full flex items-center justify-center shadow-md hover:bg-rose-50 border border-rose-100 transition-colors"
                      >
                        <X
                          size={10}
                          strokeWidth={3}
                          className="md:w-3 md:h-3"
                        />
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 px-2 py-1 md:px-4 md:py-2 bg-black/70 backdrop-blur-sm text-white text-[10px] md:text-sm font-bold rounded min-w-[60px] md:min-w-[80px] text-center whitespace-nowrap shadow-sm">
                    {player ? player.name.split(" ")[0] : pos.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Squad List */}
        <div className="w-full lg:w-1/3 h-[500px] lg:h-full flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden shrink-0">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="font-black text-slate-800 text-lg">Squad Roster</h2>
            <div
              className={`text-xs font-bold px-3 py-1 rounded-full ${selectedCount === 11 ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
            >
              {selectedCount} / 11 Selected
            </div>
          </div>

          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {activeSlot !== null && (
              <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between animate-pulse">
                <span className="text-xs font-bold text-indigo-800">
                  Select a player for this position
                </span>
                <button
                  onClick={() => setActiveSlot(null)}
                  className="text-indigo-400 hover:text-indigo-600"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {filteredSquad.map((player) => {
              const isAssigned = Object.values(lineup).includes(player.id);
              return (
                <button
                  key={player.id}
                  onClick={() => assignPlayer(player.id)}
                  disabled={isAssigned || activeSlot === null}
                  className={`w-full flex items-center justify-between p-3 mb-1.5 rounded-xl border transition-all text-left group ${
                    isAssigned
                      ? "bg-slate-50 border-transparent opacity-60 cursor-not-allowed"
                      : activeSlot !== null
                        ? "bg-white border-slate-200 hover:border-indigo-400 hover:shadow-sm cursor-pointer"
                        : "bg-white border-transparent cursor-default"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm transition-colors ${
                        isAssigned
                          ? "bg-slate-200 text-slate-500"
                          : "bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white"
                      }`}
                    >
                      {player.number}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-800">
                        {player.name}
                      </div>
                      <div className="text-[10px] font-black text-slate-400">
                        {player.position}
                      </div>
                    </div>
                  </div>
                  {isAssigned ? (
                    <CheckCircle2
                      size={18}
                      strokeWidth={2.5}
                      className="text-emerald-500"
                    />
                  ) : activeSlot !== null ? (
                    <div className="w-5 h-5 rounded-full border-2 border-indigo-200 group-hover:border-indigo-400"></div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
