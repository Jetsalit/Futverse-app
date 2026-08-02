import React from "react";
import { ParentObservationMetric } from "../types";
import { CheckCircle } from "lucide-react";
import { DynamicMatchIcon } from "./MatchEventIcons";

interface ParentSummaryProps {
  metrics: ParentObservationMetric[];
  counts: Record<string, number>;
}

export default function ParentSummary({ metrics, counts }: ParentSummaryProps) {
  const activeMetrics = metrics.filter(m => counts[m.id] > 0);

  if (activeMetrics.length === 0) return null;

  return (
    <div className="bg-slate-800 rounded-2xl p-5 mb-6 text-white shadow-lg overflow-hidden relative">
      <div className="absolute -right-10 -top-10 opacity-10 pointer-events-none">
        <DynamicMatchIcon iconId="svg-goal" size={120} />
      </div>
      
      <h3 className="text-slate-300 text-sm font-bold tracking-wider uppercase mb-3">Today's Observation</h3>
      
      <div className="flex flex-wrap gap-2">
        {activeMetrics.map(metric => (
          <div 
            key={metric.id}
            className="flex items-center gap-2 bg-slate-700/50 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-600/50"
          >
            <DynamicMatchIcon iconId={metric.icon} size={16} />
            <span className="text-sm font-medium">{metric.name}</span>
            <span className="ml-1 text-sm font-black text-indigo-300">
              {metric.displayType === "Toggle" ? <CheckCircle size={14} className="text-emerald-400" /> : counts[metric.id]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
