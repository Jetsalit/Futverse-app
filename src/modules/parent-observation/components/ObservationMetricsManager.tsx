import React, { useState, useEffect } from "react";
import { 
  Plus, Edit2, Trash2, CheckCircle2, XCircle, GripVertical, Save, X, Archive
} from "lucide-react";
import { ObservationMetric } from "../types";
import { DynamicMatchIcon, MATCH_EVENT_ICONS } from "./MatchEventIcons";
import { 
  getSystemMetrics, 
  createSystemMetric, 
  updateSystemMetric, 
  archiveSystemMetric 
} from "../firebase/api";

const PRESET_COLORS = [
  "bg-emerald-50 text-emerald-600 border-emerald-200",
  "bg-blue-50 text-blue-600 border-blue-200",
  "bg-indigo-50 text-indigo-600 border-indigo-200",
  "bg-rose-50 text-rose-600 border-rose-200",
  "bg-amber-50 text-amber-600 border-amber-200",
  "bg-purple-50 text-purple-600 border-purple-200",
  "bg-slate-50 text-slate-600 border-slate-200"
];

export default function ObservationMetricsManager() {
  const [metrics, setMetrics] = useState<ObservationMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ObservationMetric>>({});

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const data = await getSystemMetrics();
      // Filter out ARCHIVED metrics for standard view, but keep them in system
      setMetrics(data.filter(m => m.status !== "ARCHIVED"));
    } catch (error) {
      console.error("Error fetching metrics", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handleAddNew = () => {
    setFormData({
      metricCode: "",
      metricName: "",
      allowedSource: ["PARENT", "COACH"],
      evaluationCategories: ["Attacking"],
      learningObjectives: [],
      positionType: "FIELD_PLAYER",
      metricDifficulty: 3,
      status: "ACTIVE",
      weights: { technical: 0, tactical: 0, mental: 0, physical: 0, social: 0 },
      icon: "⭐",
      category: "Attack",
      displayType: "Counter",
      color: PRESET_COLORS[0],
    });
    setIsEditing("NEW");
  };

  const handleEdit = (metric: ObservationMetric) => {
    setFormData(metric);
    setIsEditing(metric.id);
  };

  const handleSave = async () => {
    if (!formData.metricCode?.trim() || !formData.metricName?.trim()) {
      alert("กรุณากรอก Metric Code และ Display Name ให้ครบถ้วน");
      return;
    }

    try {
      if (isEditing === "NEW") {
        // Strip id from create payload
        const { id, ...createData } = formData;
        await createSystemMetric(createData as Omit<ObservationMetric, "id">);
      } else if (isEditing) {
        // Enforce Immutable metricCode by stripping it from update payload
        // Also strip id to avoid Firestore field conflicts
        const { metricCode, id, ...safeUpdateData } = formData;
        await updateSystemMetric(isEditing, safeUpdateData);
      }
      setIsEditing(null);
      fetchMetrics();
    } catch (error) {
      console.error("Error saving metric", error);
      alert("เกิดข้อผิดพลาดในการบันทึก: " + (error as any)?.message);
    }
  };

  const handleArchive = async (id: string, metricCode: string) => {
    if (!confirm(`Are you sure you want to archive metric "${metricCode}"? \n\n(No Hard Delete Policy: Data is kept safe for AI Analytics but will be hidden from UI.)`)) return;
    try {
      await archiveSystemMetric(id);
      fetchMetrics();
    } catch (error) {
      console.error("Error archiving metric", error);
    }
  };

  const toggleStatus = async (metric: ObservationMetric) => {
    try {
      const newStatus = metric.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
      await updateSystemMetric(metric.id, { status: newStatus });
      fetchMetrics();
    } catch (error) {
      console.error("Error toggling status", error);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading Observation Engine metrics...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-black text-slate-800">Observation Engine Metrics (Rev 3.8)</h2>
          <p className="text-sm text-slate-500">Manage global metrics used by Parents, Coaches, and AI.</p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700"
        >
          <Plus size={16} /> Create Metric
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="divide-y divide-slate-100">
          {metrics.map((metric) => (
            <div key={metric.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <GripVertical size={20} className="text-slate-300 cursor-grab active:cursor-grabbing" />
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${metric.color}`}>
                  <DynamicMatchIcon iconId={metric.icon} size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800">{metric.metricName}</h3>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono border border-slate-200">{metric.metricCode}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span>{metric.category}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span>{metric.positionType}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleStatus(metric)}
                  className={`px-3 py-1 text-xs font-bold rounded-full border flex items-center gap-1 ${
                    metric.status === "ACTIVE" 
                      ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                      : "bg-slate-50 text-slate-400 border-slate-200"
                  }`}
                >
                  {metric.status === "ACTIVE" ? <><CheckCircle2 size={12} /> ACTIVE</> : <><XCircle size={12} /> {metric.status}</>}
                </button>
                <button
                  onClick={() => handleEdit(metric)}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Edit Metric"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleArchive(metric.id, metric.metricCode)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Archive Metric (No Hard Delete)"
                >
                  <Archive size={16} />
                </button>
              </div>
            </div>
          ))}
          {metrics.length === 0 && (
            <div className="p-8 text-center text-slate-500">No active metrics found in Observation Engine.</div>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 my-8">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">
                {isEditing === "NEW" ? "Create Global Metric" : "Edit Metric"}
              </h3>
              <button onClick={() => setIsEditing(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Primary Identity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Metric Code <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    value={formData.metricCode || ""}
                    onChange={(e) => setFormData({ ...formData, metricCode: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-sm bg-slate-50"
                    placeholder="e.g. goal, pass_acc"
                    disabled={isEditing !== "NEW"} // IMMUTABLE RULE
                  />
                  {isEditing !== "NEW" && <p className="text-[10px] text-slate-400 mt-1">Immutable Contract: Cannot be changed</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Display Name</label>
                  <input
                    type="text"
                    value={formData.metricName || ""}
                    onChange={(e) => setFormData({ ...formData, metricName: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Goal"
                  />
                </div>
              </div>

              {/* Classification */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                  <select
                    value={formData.category || "Attack"}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Attack">Attack</option>
                    <option value="Defense">Defense</option>
                    <option value="Goalkeeper">Goalkeeper</option>
                    <option value="Behaviour">Behaviour</option>
                    <option value="Match Event">Match Event</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Position</label>
                  <select
                    value={formData.positionType || "ALL"}
                    onChange={(e) => setFormData({ ...formData, positionType: e.target.value as any })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="FIELD_PLAYER">Field Player</option>
                    <option value="GOALKEEPER">Goalkeeper</option>
                    <option value="ALL">All Players</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                  <select
                    value={formData.displayType || "Counter"}
                    onChange={(e) => setFormData({ ...formData, displayType: e.target.value as any })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Counter">Counter</option>
                    <option value="Toggle">Toggle</option>
                  </select>
                </div>
              </div>

              {/* Advanced Weights */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-3">AI Analysis Weights (0.0 - 1.0)</label>
                <div className="grid grid-cols-5 gap-2">
                  {['technical', 'tactical', 'mental', 'physical', 'social'].map(w => (
                    <div key={w}>
                      <span className="text-[10px] text-slate-500 uppercase block mb-1">{w.slice(0,3)}</span>
                      <input 
                        type="number" step="0.1" min="0" max="1"
                        value={formData.weights?.[w as keyof typeof formData.weights] || 0}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          weights: { ...formData.weights, [w]: parseFloat(e.target.value) } as any 
                        })}
                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Icons & Colors */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between">
                  <span>Icon / Emoji</span>
                  <input
                    type="text"
                    value={!formData.icon?.startsWith("svg-") ? formData.icon || "" : ""}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="w-16 px-2 py-0.5 border border-slate-200 rounded text-center text-sm"
                    placeholder="⭐"
                  />
                </label>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-32 overflow-y-auto">
                  {MATCH_EVENT_ICONS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setFormData({ ...formData, icon: preset.id })}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                        formData.icon === preset.id 
                          ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500' 
                          : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'
                      }`}
                      title={preset.label}
                    >
                      <preset.component size={20} />
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Color Theme</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-8 h-8 rounded-full border-2 ${color} ${formData.color === color ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setIsEditing(null)}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold hover:bg-indigo-700 rounded-xl transition-colors"
              >
                <Save size={16} /> Save Metric
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
