import React from "react";

export type MatchEventIconType = 
  | "svg-goal" 
  | "svg-assist" 
  | "svg-yellow-card" 
  | "svg-red-card" 
  | "svg-offside" 
  | "svg-corner" 
  | "svg-free-kick" 
  | "svg-penalty" 
  | "svg-substitution" 
  | "svg-captain";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const GoalIcon = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

export const AssistIcon = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17 8l4 4-4 4" />
    <path d="M3 12h18" />
    <path d="M7 8l-4 4 4 4" />
  </svg>
);

export const YellowCardIcon = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="6" y="4" width="12" height="16" rx="2" fill="currentColor" className="text-yellow-400" />
    <rect x="6" y="4" width="12" height="16" rx="2" />
  </svg>
);

export const RedCardIcon = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="6" y="4" width="12" height="16" rx="2" fill="currentColor" className="text-red-500" />
    <rect x="6" y="4" width="12" height="16" rx="2" />
  </svg>
);

export const OffsideIcon = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 22h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2Z" />
    <path d="M10 2v20" />
    <circle cx="15" cy="12" r="2" />
    <path d="M6 12h4" />
  </svg>
);

export const CornerIcon = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 21v-8a2 2 0 0 1 2-2h8" />
    <path d="M3 3v18h18" />
    <path d="M14 7l4 4-4 4" />
  </svg>
);

export const FreeKickIcon = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="19" r="2" />
    <path d="M12 17v-4" />
    <path d="M8 8h8" />
    <path d="M10 13l2-4 2 4" />
  </svg>
);

export const PenaltyIcon = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 21h18" />
    <path d="M3 10h18" />
    <circle cx="12" cy="16" r="2" />
    <path d="M3 3v18" />
    <path d="M21 3v18" />
  </svg>
);

export const SubstitutionIcon = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 3h5v5" />
    <path d="M8 3H3v5" />
    <path d="M12 22v-8" />
    <path d="M8 14l4-4 4 4" />
    <path d="M21 3l-6 6" />
    <path d="M3 3l6 6" />
  </svg>
);

export const CaptainIcon = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

export const MATCH_EVENT_ICONS = [
  { id: "svg-goal", component: GoalIcon, label: "Goal" },
  { id: "svg-assist", component: AssistIcon, label: "Assist" },
  { id: "svg-yellow-card", component: YellowCardIcon, label: "Yellow Card" },
  { id: "svg-red-card", component: RedCardIcon, label: "Red Card" },
  { id: "svg-offside", component: OffsideIcon, label: "Offside" },
  { id: "svg-corner", component: CornerIcon, label: "Corner" },
  { id: "svg-free-kick", component: FreeKickIcon, label: "Free Kick" },
  { id: "svg-penalty", component: PenaltyIcon, label: "Penalty" },
  { id: "svg-substitution", component: SubstitutionIcon, label: "Substitution" },
  { id: "svg-captain", component: CaptainIcon, label: "Captain" },
];

export const DynamicMatchIcon = ({ iconId, size = 24, className = "" }: { iconId: string, size?: number, className?: string }) => {
  const IconDef = MATCH_EVENT_ICONS.find(i => i.id === iconId);
  if (IconDef) {
    const IconComponent = IconDef.component;
    return <IconComponent size={size} className={className} />;
  }
  // Fallback to text/emoji if it's not a known SVG id
  return <span style={{ fontSize: size }} className={className}>{iconId}</span>;
};
