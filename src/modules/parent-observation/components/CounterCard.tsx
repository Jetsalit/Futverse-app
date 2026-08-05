import React, { useState } from "react";
import { DynamicMatchIcon } from "./MatchEventIcons";

interface CounterCardProps {
  id: string;
  name: string;
  icon: string;
  color: string;
  count: number;
  onIncrement: (id: string) => void;
  onDecrement: (id: string, e: React.MouseEvent) => void;
}

export default function CounterCard({
  id,
  name,
  icon,
  color,
  count,
  onIncrement,
  onDecrement
}: CounterCardProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  const handleTap = () => {
    if (isDisabled) return;
    setIsAnimating(true);
    setIsDisabled(true);
    onIncrement(id);
    
    // Cooldown logic to prevent spamming
    setTimeout(() => {
      setIsAnimating(false);
      setIsDisabled(false);
    }, 1000); // 1-second cooldown
  };

  return (
    <button
      onClick={handleTap}
      disabled={isDisabled}
      className={`relative flex flex-col items-center justify-center p-2 md:p-4 min-h-[90px] md:min-h-0 rounded-xl md:rounded-2xl border-2 transition-all select-none w-full ${isDisabled ? 'opacity-75 cursor-not-allowed' : ''} ${
        count > 0 
          ? `border-indigo-500 bg-indigo-50 shadow-sm md:shadow-md ring-1 md:ring-2 ring-indigo-200 ring-offset-1 md:ring-offset-2 ${isAnimating ? 'scale-95' : 'scale-100'}` 
          : `border-slate-200 hover:border-slate-300 hover:bg-slate-50 ${isAnimating ? 'scale-95' : 'scale-100'}`
      }`}
    >
      <div className="mb-1 md:mb-2 flex items-center justify-center">
        <div className="md:hidden">
          <DynamicMatchIcon iconId={icon} size={24} />
        </div>
        <div className="hidden md:flex">
          <DynamicMatchIcon iconId={icon} size={36} />
        </div>
      </div>
      <div className="text-[11px] md:text-sm font-bold text-slate-700 text-center leading-tight mb-1.5 md:mb-2 line-clamp-2 px-1">{name}</div>
      <div className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs md:text-sm font-black transition-colors ${count > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
        {count > 0 ? `+${count}` : "0"}
      </div>
      {count > 0 && (
        <div 
          onClick={(e) => onDecrement(id, e)}
          className="absolute -top-1.5 -right-1.5 md:-top-2 md:-right-2 w-7 h-7 md:w-8 md:h-8 bg-white border border-slate-200 text-slate-500 rounded-full flex items-center justify-center text-[10px] md:text-sm font-black hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-colors shadow-sm z-10 cursor-pointer"
        >
          -
        </div>
      )}
    </button>
  );
}
