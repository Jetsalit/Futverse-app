const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/YouthPlayerCV.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// The props interface for all tabs
const propsInterface = `import React, { useState, useMemo } from "react";
import {
  ArrowLeft, Download, Share2, Award, Activity, Target, MessageSquare, MapPin,
  Star, Shield, Zap, Video, Trophy, History, Calendar, CheckCircle, XCircle,
  Clock, Trash2, Edit2, ChevronDown, ChevronUp, Check, Sun, Moon, Utensils,
  Droplet, Bed, Egg, Wheat, Salad, GraduationCap, PhoneCall, Flame, ArrowRight, FileText
} from "lucide-react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import { getBMICategory } from "../../lib/utils";
import { PerformanceBadge } from "../common/PerformanceBadge";

export interface CVTabProps {
  player: any;
  localPlayer: any;
  academyId: string;
  evaluations: any[];
  criteriaMapping: Record<string, string>;
  growthHistory: any[];
  dailyLogs: any[];
  playerMatches: any[];
  playedUpMatches: any[];
  idpsList: any[];
  idpStats: any;
  careerStats: any;
  isSaving: boolean;
  dashboardWidgets?: React.ReactNode;
  
  // Handlers and states that might be used
  isEditingVideo?: boolean;
  setIsEditingVideo?: (val: boolean) => void;
  videoUrlInput?: string;
  setVideoUrlInput?: (val: string) => void;
  handleSaveVideo?: () => void;
  setIsAddingGrowth?: (val: boolean) => void;
  handleDeleteGrowth?: (id: string) => void;
  isSelfView?: boolean;
  getEmbedUrl?: (url: string) => string;
}
`;

function extractTab(tabName, componentName) {
  let startMarker = `{activeTab === "${tabName}" && (`;
  let startIndex = content.indexOf(startMarker);
  
  // Handle the Daily Log tab which has extra condition
  if (startIndex === -1 && tabName === 'daily_log') {
     const altStartMarker = `{activeTab === "daily_log" && isSelfView && (`;
     startIndex = content.indexOf(altStartMarker);
     if (startIndex !== -1) {
         startMarker = altStartMarker;
     }
  }

  if (startIndex === -1) {
    console.log(`Tab ${tabName} not found.`);
    return;
  }

  // Find the matching closing parenthesis for the tab block
  let openCount = 0;
  let endIndex = -1;
  for (let i = startIndex + startMarker.length - 1; i < content.length; i++) {
    if (content[i] === '(') openCount++;
    if (content[i] === ')') {
      openCount--;
      if (openCount === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) {
    console.log(`Could not find end of tab ${tabName}`);
    return;
  }

  const jsxContent = content.substring(startIndex + startMarker.length, endIndex).trim();
  
  const componentContent = `${propsInterface}
export default function ${componentName}(props: CVTabProps) {
  const {
    player, localPlayer, academyId, evaluations, criteriaMapping, growthHistory,
    dailyLogs, playerMatches, playedUpMatches, idpsList, idpStats, careerStats,
    isSaving, dashboardWidgets, isEditingVideo, setIsEditingVideo, videoUrlInput,
    setVideoUrlInput, handleSaveVideo, setIsAddingGrowth, handleDeleteGrowth,
    isSelfView, getEmbedUrl
  } = props;

  return (
    ${jsxContent}
  );
}
`;

  const targetDir = path.join(__dirname, '../src/components/player-cv');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(path.join(targetDir, `${componentName}.tsx`), componentContent);
  console.log(`Created ${componentName}.tsx`);

  // Replace the extracted block with the component call
  let replacement = `{activeTab === "${tabName}" && (
            <${componentName} {...cvTabProps} />
          )}`;
          
  if (tabName === 'daily_log') {
    replacement = `{activeTab === "${tabName}" && isSelfView && (
            <${componentName} {...cvTabProps} />
          )}`;
  }
  
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex + 1);
}

// 1. Define tabs to extract
const tabs = [
  { name: 'overview', comp: 'CVOverviewTab' },
  { name: 'history', comp: 'CVHistoryTab' },
  { name: 'career', comp: 'CVCareerTab' },
  { name: 'training', comp: 'CVTrainingTab' },
  { name: 'bio', comp: 'CVBioTab' },
  { name: 'idp_log', comp: 'CVIDPLogTab' },
  { name: 'daily_log', comp: 'CVDailyLogTab' }
];

tabs.forEach(t => extractTab(t.name, t.comp));

// 2. Add imports to YouthPlayerCV.tsx
const importsToAdd = tabs.map(t => `import ${t.comp} from "./player-cv/${t.comp}";`).join('\\n');
// Find the last import
const lastImportIndex = content.lastIndexOf('import ');
const endOfLastImport = content.indexOf('\\n', lastImportIndex);
content = content.substring(0, endOfLastImport) + '\\n' + importsToAdd + '\\n' + content.substring(endOfLastImport);

// 3. Add cvTabProps object inside YouthPlayerCV component, right before return
const propsObj = `
  const cvTabProps = {
    player, localPlayer, academyId, evaluations, criteriaMapping, growthHistory,
    dailyLogs, playerMatches, playedUpMatches, idpsList, idpStats, careerStats,
    isSaving, dashboardWidgets, isEditingVideo, setIsEditingVideo, videoUrlInput,
    setVideoUrlInput, handleSaveVideo, setIsAddingGrowth, handleDeleteGrowth,
    isSelfView, getEmbedUrl
  };
`;
const returnIndex = content.indexOf('return (', content.indexOf('export default function YouthPlayerCV'));
content = content.substring(0, returnIndex) + propsObj + '\\n  ' + content.substring(returnIndex);

fs.writeFileSync(filePath, content);
console.log('Successfully updated YouthPlayerCV.tsx');
