import React, { useState } from "react";
import { CheckCircle } from "lucide-react";
import { DynamicMatchIcon } from "./MatchEventIcons";

interface ToggleCardProps {
  id: string;
  name: string;
  icon: string;
  color: string;
  isOn: boolean;
  onToggle: (id: string, newState: boolean) => void;
}

export default function ToggleCard({
  id,
  name,
  icon,
  color,
  isOn,
  onToggle
}: ToggleCardProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleTap = () => {
    setIsAnimating(true);
    onToggle(id, !isOn);
    setTimeout(() => setIsAnimating(false), 200);
  };

  return (
    <button
      onClick={handleTap}
      className={`relative flex flex-col items-center justify-center p-2 md:p-4 min-h-[90px] md:min-h-0 rounded-xl md:rounded-2xl border-2 transition-all select-none w-full ${
        isOn 
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
      <div className={`flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-full transition-colors ${isOn ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
        {isOn && <CheckCircle className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={3} />}
      </div>
    </button>
  );
}
