import React from "react";

export const getPerformanceBadgeProps = (score: number) => {
  if (score >= 4.5) {
    return {
      label: "Excellent",
      emoji: "🟢",
      bgClass: "bg-emerald-100 dark:bg-emerald-900/30",
      textClass: "text-emerald-800 dark:text-emerald-400",
      borderClass: "border-emerald-200 dark:border-emerald-800"
    };
  } else if (score >= 3.5) {
    return {
      label: "Good",
      emoji: "🔵",
      bgClass: "bg-blue-100 dark:bg-blue-900/30",
      textClass: "text-blue-800 dark:text-blue-400",
      borderClass: "border-blue-200 dark:border-blue-800"
    };
  } else if (score >= 2.5) {
    return {
      label: "Developing",
      emoji: "🟠",
      bgClass: "bg-orange-100 dark:bg-orange-900/30",
      textClass: "text-orange-800 dark:text-orange-400",
      borderClass: "border-orange-200 dark:border-orange-800"
    };
  } else {
    return {
      label: "Needs Improvement",
      emoji: "🔴",
      bgClass: "bg-rose-100 dark:bg-rose-900/30",
      textClass: "text-rose-800 dark:text-rose-400",
      borderClass: "border-rose-200 dark:border-rose-800"
    };
  }
};

export const PerformanceBadge = ({ score, className = "" }: { score: number, className?: string }) => {
  const { label, emoji, bgClass, textClass, borderClass } = getPerformanceBadgeProps(score);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${bgClass} ${textClass} ${borderClass} ${className}`}>
      <span className="text-[10px] leading-none">{emoji}</span>
      {label}
    </span>
  );
};
