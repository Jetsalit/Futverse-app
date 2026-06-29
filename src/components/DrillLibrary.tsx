import React, { useState } from "react";
import { useDrillDatabase, Drill } from "../hooks/useDrillDatabase";
import {
  Plus,
  Users,
  User,
  LayoutGrid,
  Search,
  Edit2,
  Trash2,
  X,
  ClipboardList
} from "lucide-react";
import DrillDetailModal from "./DrillDetailModal";
import { EmptyState } from "./common/EmptyState";

export default function DrillLibrary({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { myDrills, academyDrills, updateDrill, deleteDrill, currentUser } =
    useDrillDatabase();
  const [activeTab, setActiveTab] = useState<"my" | "academy">("my");
  const [searchQuery, setSearchQuery] = useState("");

  // Edit Modal State
  const [editingDrill, setEditingDrill] = useState<Drill | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    category: "Tactical",
    is_shared: false,
    duration: "",
    ageGroup: "",
    phase: "",
    trainingMethod: "",
    coachingPoints: "",
  });

  // Delete Modal State
  const [deletingDrillId, setDeletingDrillId] = useState<string | null>(null);

  // Detail Modal State
  const [selectedDrill, setSelectedDrill] = useState<Drill | null>(null);

  const displayDrills = activeTab === "my" ? myDrills : academyDrills;

  const filteredDrills = displayDrills.filter(
    (d) =>
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
            คลังแบบฝึกซ้อม (Drill Library)
          </h1>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Practice & Tactics DB
          </p>
        </div>

        <button
          onClick={() => onNavigate("tactic")}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm w-full sm:w-auto justify-center"
        >
          <Plus size={18} />
          <span>สร้างแผนซ้อมใหม่</span>
        </button>
      </div>

      {/* Toolbar & Tabs */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab("my")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold text-sm transition-colors ${activeTab === "my" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <User size={16} /> แผนซ้อมของฉัน
          </button>
          <button
            onClick={() => setActiveTab("academy")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold text-sm transition-colors ${activeTab === "academy" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <Users size={16} /> คลังส่วนกลาง
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="ค้นหาแผนซ้อม..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Grid Area */}
      <div className="flex-1 overflow-y-auto">
        {filteredDrills.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredDrills.map((drill) => (
              <div
                key={drill.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-shadow cursor-pointer overflow-hidden flex flex-col"
                onClick={() => setSelectedDrill(drill)}
              >
                <div className="aspect-[4/3] bg-white border-b border-slate-100 relative flex items-center justify-center overflow-hidden group">
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/80 backdrop-blur-sm p-1 rounded-lg z-20 shadow-sm border border-slate-100">
                    {drill.created_by === currentUser && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDrill(drill);
                            setEditForm({
                              title: drill.title,
                              category: drill.category,
                              is_shared: drill.is_shared,
                              duration: drill.duration || "",
                              ageGroup: drill.ageGroup || "",
                              phase: drill.phase || "",
                              trainingMethod: drill.trainingMethod || "",
                              coachingPoints: drill.coachingPoints || "",
                            });
                          }}
                          className="p-1.5 hover:text-blue-600 hover:bg-white rounded-md transition-colors text-slate-800"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingDrillId(drill.id);
                          }}
                          className="p-1.5 hover:text-rose-600 hover:bg-white rounded-md transition-colors text-slate-800"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Subtle Grid Pattern */}
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNykiLz48L3N2Zz4=')] z-0 pointer-events-none opacity-50"></div>

                  <div className="absolute inset-4 ring-[1px] ring-slate-800 pointer-events-none z-0">
                    {drill.canvas_data.fieldType === "full" ? (
                      <>
                        <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-slate-800 -translate-x-1/2"></div>
                        <div className="absolute top-1/2 left-1/2 w-[22%] max-w-[200px] aspect-square border-[1px] border-slate-800 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
                        <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-slate-800 rounded-full -translate-x-1/2 -translate-y-1/2"></div>

                        <div className="absolute top-1/2 left-0 w-[16%] h-[55%] border-[1px] border-slate-800 -translate-y-1/2 border-l-0"></div>
                        <div className="absolute top-1/2 left-0 w-[5%] h-[24%] border-[1px] border-slate-800 -translate-y-1/2 border-l-0"></div>
                        <div className="absolute top-1/2 left-[11%] w-1.5 h-1.5 bg-slate-800 rounded-full -translate-y-1/2"></div>
                        <div className="absolute top-1/2 left-[16%] w-[8%] max-w-[80px] h-[20%] border-[1px] border-slate-800 border-l-0 rounded-r-full -translate-y-1/2"></div>
                        <div className="absolute top-1/2 left-0 w-[2.5%] h-[12%] border-[1px] border-slate-800 -translate-y-1/2 -translate-x-full border-r-0"></div>

                        <div className="absolute top-1/2 right-0 w-[16%] h-[55%] border-[1px] border-slate-800 -translate-y-1/2 border-r-0"></div>
                        <div className="absolute top-1/2 right-0 w-[5%] h-[24%] border-[1px] border-slate-800 -translate-y-1/2 border-r-0"></div>
                        <div className="absolute top-1/2 right-[11%] w-1.5 h-1.5 bg-slate-800 rounded-full -translate-y-1/2"></div>
                        <div className="absolute top-1/2 right-[16%] w-[8%] max-w-[80px] h-[20%] border-[1px] border-slate-800 border-r-0 rounded-l-full -translate-y-1/2"></div>
                        <div className="absolute top-1/2 right-0 w-[2.5%] h-[12%] border-[1px] border-slate-800 -translate-y-1/2 translate-x-full border-l-0"></div>

                        <div className="absolute top-0 left-0 w-3 h-3 border-b-[1px] border-r-[1px] border-slate-800 rounded-br-full"></div>
                        <div className="absolute bottom-0 left-0 w-3 h-3 border-t-[1px] border-r-[1px] border-slate-800 rounded-tr-full"></div>
                        <div className="absolute top-0 right-0 w-3 h-3 border-b-[1px] border-l-[1px] border-slate-800 rounded-bl-full"></div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 border-t-[1px] border-l-[1px] border-slate-800 rounded-tl-full"></div>
                      </>
                    ) : (
                      <>
                        <div className="absolute top-0 left-1/2 w-[55%] h-[35%] border-[1px] border-slate-800 border-t-0 -translate-x-1/2"></div>
                        <div className="absolute top-0 left-1/2 w-[24%] h-[12%] border-[1px] border-slate-800 border-t-0 -translate-x-1/2"></div>
                        <div className="absolute top-[24%] left-1/2 w-1.5 h-1.5 bg-slate-800 rounded-full -translate-x-1/2"></div>
                        <div className="absolute top-[35%] left-1/2 w-[20%] max-w-[200px] h-[15%] border-[1px] border-slate-800 border-t-0 rounded-b-full -translate-x-1/2"></div>

                        <div className="absolute top-0 left-1/2 w-[12%] h-[5%] border-[1px] border-slate-800 border-b-0 -translate-y-full -translate-x-1/2"></div>

                        <div className="absolute top-0 left-0 w-4 h-4 border-b-[1px] border-r-[1px] border-slate-800 rounded-br-full"></div>
                        <div className="absolute top-0 right-0 w-4 h-4 border-b-[1px] border-l-[1px] border-slate-800 rounded-bl-full"></div>

                        <div className="absolute bottom-0 left-1/2 w-[35%] max-w-[300px] aspect-square border-[1px] border-slate-800 border-b-0 rounded-t-full -translate-x-1/2 translate-y-[50%]"></div>
                        <div className="absolute bottom-0 left-1/2 w-1.5 h-1.5 bg-slate-800 rounded-full -translate-x-1/2 translate-y-1/2"></div>
                      </>
                    )}
                  </div>
                  {drill.previewImage ? (
                    <img
                      src={drill.previewImage}
                      alt="Preview"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10 scale-[0.8]"
                    />
                  ) : (
                    <LayoutGrid className="text-slate-200 w-12 h-12" />
                  )}
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-800 line-clamp-1">
                      {drill.title}
                    </h3>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <span className="inline-flex bg-blue-50 text-blue-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                      {drill.category}
                    </span>
                    {drill.is_shared && activeTab === "my" && (
                      <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                        <Users size={12} /> shared
                      </span>
                    )}
                    {activeTab === "academy" && (
                      <span className="text-xs text-slate-400">
                        By {drill.created_by}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col justify-center">
            <EmptyState
              icon={ClipboardList}
              title="No Drills Found"
              description="There are no practice drills matching your criteria in this category."
              primaryActionLabel={activeTab === "my" ? "Create New Drill" : undefined}
              onPrimaryAction={activeTab === "my" ? () => onNavigate("tactic_board") : undefined}
            />
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingDrill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setEditingDrill(null)}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">
                แก้ไขข้อมูลแบบฝึกซ้อม
              </h2>
              <button
                onClick={() => setEditingDrill(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    ชื่อแผนการฝึก (Title)
                  </label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm({ ...editForm, title: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    หมวดหมู่ (Category)
                  </label>
                  <select
                    value={editForm.category}
                    onChange={(e) =>
                      setEditForm({ ...editForm, category: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Tactical">Tactical</option>
                    <option value="Technical">Technical</option>
                    <option value="Physical">Physical</option>
                    <option value="Psychological">Psychological</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    ระยะเวลา (Duration)
                  </label>
                  <input
                    type="text"
                    value={editForm.duration}
                    onChange={(e) =>
                      setEditForm({ ...editForm, duration: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    กลุ่มผู้เล่น (Age Group)
                  </label>
                  <input
                    type="text"
                    value={editForm.ageGroup}
                    onChange={(e) =>
                      setEditForm({ ...editForm, ageGroup: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Phase
                  </label>
                  <input
                    type="text"
                    value={editForm.phase}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phase: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    วิธีการฝึก (Training Method)
                  </label>
                  <textarea
                    value={editForm.trainingMethod}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        trainingMethod: e.target.value,
                      })
                    }
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  ></textarea>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    จุดโค้ชชิ่ง (Coaching Points)
                  </label>
                  <textarea
                    value={editForm.coachingPoints}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        coachingPoints: e.target.value,
                      })
                    }
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  ></textarea>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div>
                  <div className="font-bold text-sm text-slate-800">
                    แชร์ลงคลังส่วนกลาง
                  </div>
                  <div className="text-xs text-slate-500">
                    ให้โค้ชคนอื่นเห็นแผนซ้อมนี้
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={editForm.is_shared}
                    onChange={(e) =>
                      setEditForm({ ...editForm, is_shared: e.target.checked })
                    }
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => setEditingDrill(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => {
                    updateDrill(editingDrill.id, {
                      title: editForm.title || "Untitled Drill",
                      category: editForm.category,
                      is_shared: editForm.is_shared,
                      duration: editForm.duration,
                      ageGroup: editForm.ageGroup,
                      phase: editForm.phase,
                      trainingMethod: editForm.trainingMethod,
                      coachingPoints: editForm.coachingPoints,
                    });
                    setEditingDrill(null);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingDrillId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setDeletingDrillId(null)}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              ยืนยันการลบข้อมูล
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              คุณต้องการลบข้อมูลแบบฝึกซ้อมนี้ใช่หรือไม่?
              ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingDrillId(null)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  deleteDrill(deletingDrillId);
                  setDeletingDrillId(null);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm"
              >
                ลบข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drill Detail Modal */}
      {selectedDrill && (
        <DrillDetailModal
          drill={selectedDrill}
          isOpen={!!selectedDrill}
          onClose={() => setSelectedDrill(null)}
          currentUser={currentUser}
          onEdit={(drill) => {
            setEditingDrill(drill);
            setEditForm({
              title: drill.title,
              category: drill.category,
              is_shared: drill.is_shared,
              duration: drill.duration || "",
              ageGroup: drill.ageGroup || "",
              phase: drill.phase || "",
              trainingMethod: drill.trainingMethod || "",
              coachingPoints: drill.coachingPoints || "",
            });
          }}
          onDelete={(id) => {
            deleteDrill(id);
          }}
        />
      )}
    </div>
  );
}
