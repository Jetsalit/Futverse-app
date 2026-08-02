import React from "react";
import { ParentObservationMetric } from "../types";
import CounterCard from "./CounterCard";
import ToggleCard from "./ToggleCard";

interface ParentMetricCategoryProps {
  title: string;
  metrics: ParentObservationMetric[];
  counts: Record<string, number>;
  onIncrement: (id: string) => void;
  onDecrement: (id: string, e: React.MouseEvent) => void;
  onToggle: (id: string, newState: boolean) => void;
}

export default function ParentMetricCategory({
  title,
  metrics,
  counts,
  onIncrement,
  onDecrement,
  onToggle
}: ParentMetricCategoryProps) {
  if (metrics.length === 0) return null;

  return (
    <div className="mb-4 md:mb-8">
      <h3 className="font-black text-slate-800 text-base md:text-lg mb-2 md:mb-4 pb-1 md:pb-2 border-b border-slate-100">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-4">
        {metrics.map(metric => {
          const countOrState = counts[metric.id] || 0;
          
          if (metric.displayType === "Toggle") {
            return (
              <ToggleCard
                key={metric.id}
                id={metric.id}
                name={metric.name}
                icon={metric.icon}
                color={metric.color}
                isOn={countOrState > 0}
                onToggle={onToggle}
              />
            );
          } else {
            return (
              <CounterCard
                key={metric.id}
                id={metric.id}
                name={metric.name}
                icon={metric.icon}
                color={metric.color}
                count={countOrState}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
              />
            );
          }
        })}
      </div>
    </div>
  );
}
