import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { ThaiDatePicker } from "./ThaiDatePicker";
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, addDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAcademy } from "../contexts/AcademyContext";
import PlayerTrainingDashboard from "./PlayerTrainingDashboard";
import { getBMICategory } from "../lib/utils";
import PeerVotingModal from "./PeerVotingModal";
import { PerformanceBadge } from "./common/PerformanceBadge";
import { useAuth } from "../contexts/AuthContext";
import { serverTimestamp, increment, writeBatch } from "firebase/firestore";
import { useCareerStats } from "../hooks/useCareerStats";
import {
  ArrowLeft,
  Download,
  Share2,
  Award,
  Activity,
  Target,
  MessageSquare,
  MapPin,
  Star,
  Shield,
  Zap,
  Video,
  Trophy,
  History,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Check,
  Sun,
  Moon,
  Utensils,
  Droplet,
  Bed,
  Egg,
  Wheat,
  Salad,
  GraduationCap,
  PhoneCall,
  Flame,
  ArrowRight,
  FileText,
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import CVOverviewTab from "./player-cv/CVOverviewTab";
import CVHistoryTab from "./player-cv/CVHistoryTab";
import CVIDPLogTab from "./player-cv/CVIDPLogTab";
import CVCareerTab from "./player-cv/CVCareerTab";
import CVTrainingTab from "./player-cv/CVTrainingTab";
import CVBioTab from "./player-cv/CVBioTab";
import CVDailyLogTab from "./player-cv/CVDailyLogTab";
import { useTrainingLog } from "../hooks/useTrainingLog";

interface YouthPlayerCVProps {
  player: any;
  onBack?: () => void;
  isSelfView?: boolean;
  children?: React.ReactNode;
  academyIdOverride?: string;
  dashboardWidgets?: React.ReactNode;
  onCreateGoalFromEval?: (evalData: { evaluationId: string; category?: string }) => void;
}

const calculateDaysInAcademy = (joinedStr?: string, leftStr?: string) => {
  if (!joinedStr) return 0;
  const start = new Date(joinedStr);
  start.setHours(0, 0, 0, 0);
  const end = leftStr ? new Date(leftStr) : new Date();
  end.setHours(0, 0, 0, 0);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays) + 1;
};

const getEmbedUrl = (url: string) => {
  if (!url) return "https://www.youtube.com/embed/dQw4w9WgXcQ?controls=0";
  try {
    // Handle YouTube
    let videoId = "";
    if (url.includes("youtube.com/watch")) {
      videoId = new URLSearchParams(new URL(url).search).get("v") || "";
      return videoId ? `https://www.youtube.com/embed/${videoId}?controls=0` : url;
    } else if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0] || "";
      return videoId ? `https://www.youtube.com/embed/${videoId}?controls=0` : url;
    } else if (url.includes("youtube.com/shorts/")) {
      videoId = url.split("youtube.com/shorts/")[1]?.split("?")[0] || "";
      return videoId ? `https://www.youtube.com/embed/${videoId}?controls=0` : url;
    } else if (url.includes("youtube.com/embed/")) {
      return url;
    }
    
    // Handle TikTok
    if (url.includes("tiktok.com")) {
      // Matches /video/123456, /v/123456, or /photo/123456
      const match = url.match(/(?:video|v|photo)\/(\d+)/);
      if (match && match[1]) {
        return `https://www.tiktok.com/embed/v2/${match[1]}`;
      } else if (url.includes("tiktok.com/embed/")) {
        return url;
      }
      // If it's vt.tiktok.com or similar without an ID in the URL, we might not be able to parse it directly.
    }

    // Handle Instagram
    if (url.includes("instagram.com")) {
      const cleanUrl = url.split("?")[0].replace(/\/$/, "");
      return `${cleanUrl}/embed/`;
    }

    // Handle Facebook
    if (url.includes("facebook.com")) {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}`;
    }

    return url;
  } catch (e) {
    return url;
  }
};

export default function YouthPlayerCV({ player, onBack, isSelfView = false, children, academyIdOverride, dashboardWidgets, onCreateGoalFromEval }: YouthPlayerCVProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "career" | "training" | "bio" | "idp_log" | "daily_log">(
    "overview",
  );
  const { currentUser, hasPermission } = useAuth();
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const academyContext = useAcademy();
  const academyId = academyIdOverride || academyContext.academyId;
  const getAcademyCollection = useCallback((collectionName: string) => collection(db, "academies", academyId, collectionName), [academyId]);
  const settings = academyContext.settings;
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [criteriaMapping, setCriteriaMapping] = useState<Record<string, string>>({});
  const [growthHistory, setGrowthHistory] = useState<any[]>([]);
  const [isAddingGrowth, setIsAddingGrowth] = useState(false);
  const [newGrowth, setNewGrowth] = useState({
    date: new Date().toISOString().split("T")[0],
    height: "",
    weight: "",
  });

  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  // playedUpMatches is derived from playerMatches via useMemo (consolidated listener)
  
  const { stats: careerStats, loading: careerStatsLoading } = useCareerStats(academyId, player?.id);
  const [isAddingDailyLog, setIsAddingDailyLog] = useState(false);
  const [newDailyLog, setNewDailyLog] = useState({
    date: new Date().toISOString().split("T")[0],
    breakfast: "",
    breakfastNutrients: [] as string[],
    lunch: "",
    lunchNutrients: [] as string[],
    dinner: "",
    dinnerNutrients: [] as string[],
    hydration: "0",
    sleep: "8",
  });

  const [selectedLogDate, setSelectedLogDate] = useState(new Date().toISOString().split("T")[0]);

  const currentDailyLog = useMemo(() => {
    return dailyLogs.find(log => log.date === selectedLogDate) || null;
  }, [dailyLogs, selectedLogDate]);

  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioForm, setBioForm] = useState({
    faCardId: player.faCardId || "",
    school: player.school || "",
    grade: player.grade || "",
    parentName: player.parentName || "",
    parentPhone: player.parentPhone || "",
    parentLineId: player.parentLineId || "",
    joinedDate: player.joinedDate || new Date().toISOString().split("T")[0],
    leftDate: player.leftDate || "",
    status: player.status || "ACTIVE",
  });

  const [localPlayer, setLocalPlayer] = useState(player);
  const { sessions: cvTrainingLogs } = useTrainingLog(localPlayer?.id, "Career");
  
  const [isEditingVideo, setIsEditingVideo] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState(localPlayer.videoHighlightsUrl || "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

  const [editingEvalId, setEditingEvalId] = useState<string | null>(null);
  const [evalFormScores, setEvalFormScores] = useState<Record<string, number>>({});
  const [expandedEvals, setExpandedEvals] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLocalPlayer(player);
    setBioForm({
      faCardId: player.faCardId || "",
      school: player.school || "",
      grade: player.grade || "",
      parentName: player.parentName || "",
      parentPhone: player.parentPhone || "",
      parentLineId: player.parentLineId || "",
      joinedDate: player.joinedDate || new Date().toISOString().split("T")[0],
      leftDate: player.leftDate || "",
      status: player.status || "ACTIVE",
    });
  }, [player]);

  const [idpStats, setIdpStats] = useState({ total: 0, completed: 0, percentage: 0 });
  const [idpsList, setIdpsList] = useState<any[]>([]);
  const [cvPlayerGoals, setCvPlayerGoals] = useState<any[]>([]);
  const [cvJournals, setCvJournals] = useState<any[]>([]);

  useEffect(() => {
    if (!player?.id || !academyId) return;
    const unsubIDPs = onSnapshot(query(getAcademyCollection("idps"), where("playerId", "==", player.id)), (snap) => {
      let total = 0;
      let completed = 0;
      const list: any[] = [];
      snap.forEach(doc => {
        const data = doc.data();
        list.push({ id: doc.id, ...data });
        total++;
        if (data.status === "Completed") completed++;
      });
      // Sort by date descending
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setIdpsList(list);
      setIdpStats({
        total,
        completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0
      });
    });

    const unsubGoals = onSnapshot(collection(db, `academies/${academyId}/players/${player.id}/goals`), (snap) => {
      setCvPlayerGoals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubJournals = onSnapshot(collection(db, `academies/${academyId}/players/${player.id}/journals`), (snap) => {
      setCvJournals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubIDPs();
      unsubGoals();
      unsubJournals();
    };
  }, [player?.id, academyId]);

  useEffect(() => {
    if (!player?.id || !academyId) return;
    const growthRef = collection(db, "academies", academyId, "players", player.id, "growth_history");
    const unsubscribe = onSnapshot(growthRef, (snapshot) => {
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as any));
      // Sort by date ascending for the line chart
      const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setGrowthHistory(sortedHistory);
    });
    return () => unsubscribe();
  }, [player?.id, academyId]);

  useEffect(() => {
    if (!player?.id || !academyId) return;
    const logsRef = collection(db, "academies", academyId, "players", player.id, "daily_logs");
    const unsubscribe = onSnapshot(logsRef, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as any));
      const sortedLogs = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setDailyLogs(sortedLogs);
    });
    return () => unsubscribe();
  }, [player?.id, academyId]);

  const [playerMatches, setPlayerMatches] = useState<any[]>([]);
  useEffect(() => {
    if (!player?.id || !academyId) return;
    if (isSelfView) {
      setPlayerMatches([]);
      return;
    }
    const unsubMatches = onSnapshot(getAcademyCollection("matches"), (snap) => {
      const pMatches: any[] = [];
      snap.forEach(doc => {
        const m = doc.data();
        if (
          m.playersData?.[player.id] ||
          m.players?.some((p:any) => p.id === player.id) ||
          (m.guestPlayers && m.guestPlayers.some((gp: any) => gp.id === player.id))
        ) {
          pMatches.push({ id: doc.id, ...m });
        }
      });
      pMatches.sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime());
      setPlayerMatches(pMatches);
    });
    return () => unsubMatches();
  }, [player?.id, academyId, isSelfView]);

  // Derived from playerMatches — no extra Firestore listener needed
  const playedUpMatches = useMemo(() => playerMatches, [playerMatches]);

  const [isAddingAcademy, setIsAddingAcademy] = useState(false);
  const [newAcademy, setNewAcademy] = useState({ name: "", startYear: "", endYear: "", achievements: "" });
  const [isAddingAward, setIsAddingAward] = useState(false);
  const [newAward, setNewAward] = useState({ title: "", year: "", tournament: "", description: "" });
  const [isSaving, setIsSaving] = useState(false);

  const handleDeleteMatch = useCallback(async (matchId: string) => {
    if (window.confirm("Are you sure you want to delete this match record? This cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "academies", academyId || "default_academy", "matches", matchId));
      } catch (err) {
        console.error("Error deleting match:", err);
        alert("Failed to delete match");
      }
    }
  }, [academyId]);

  const handleEditScore = useCallback(async (matchId: string, currentOur: string, currentOpp: string) => {
    const newScoreStr = window.prompt("แก้ไขสกอร์ (เช่น 0-3):", `${currentOur || 0}-${currentOpp || 0}`);
    if (newScoreStr !== null) {
      const parts = newScoreStr.split("-").map(p => p.trim());
      if (parts.length === 2) {
        try {
          await updateDoc(doc(db, "academies", academyId || "default_academy", "matches", matchId), {
            ourScore: parts[0],
            opponentScore: parts[1]
          });
        } catch (err) {
          console.error("Error updating score:", err);
          alert("Failed to update score");
        }
      } else {
        alert("กรุณากรอกสกอร์ให้ถูกต้อง เช่น 0-3");
      }
    }
  }, [academyId]);

  const handleVotingClose = useCallback(() => {
    setShowVotingModal(false);
    setHasVoted(true);
  }, []);

  const handleVoteSubmit = useCallback(async (votes: {playerId: string, badgeId: string}[]) => {
    if (!academyId || !currentUser?.id || votes.length === 0) return;
    try {
      const batch = writeBatch(db);
      
      votes.forEach(vote => {
        const endorsementRef = doc(collection(db, `academies/${academyId}/endorsements`));
        batch.set(endorsementRef, {
          receiverId: vote.playerId,
          voterId: currentUser.id,
          voterName: currentUser.name || "Coach",
          badgeType: vote.badgeId,
          createdAt: serverTimestamp()
        });

        const playerRef = doc(db, `academies/${academyId}/players`, vote.playerId);
        batch.update(playerRef, {
          [`endorsementStats.${vote.badgeId}`]: increment(1)
        });
      });

      await batch.commit();
    } catch (error) {
      console.error("Error submitting votes:", error);
      throw error;
    }
  }, [academyId, currentUser?.id, currentUser?.name]);

  const handleDeleteEval = useCallback(async (evalId: string) => {
    if (window.confirm("Are you sure you want to delete this evaluation?")) {
      try {
        await deleteDoc(doc(getAcademyCollection("player_evaluations"), evalId));
        setEvaluations(prev => prev.filter(e => e.id !== evalId));
      } catch (error) {
        console.error("Error deleting evaluation:", error);
      }
    }
  }, [getAcademyCollection]);

  const openEditEval = useCallback((evaluation: any) => {
    setEditingEvalId(evaluation.id);
    setEvalFormScores(evaluation.scores || {});
  }, []);

  const handleSaveEvalEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvalId) return;
    try {
      setIsSaving(true);
      await updateDoc(doc(getAcademyCollection("player_evaluations"), editingEvalId), {
        scores: evalFormScores
      });
      setEvaluations(prev => prev.map(ev => ev.id === editingEvalId ? { ...ev, scores: evalFormScores } : ev));
      setEditingEvalId(null);
    } catch (error) {
      console.error("Error saving evaluation:", error);
    } finally {
      setIsSaving(false);
    }
  }, [editingEvalId, evalFormScores, getAcademyCollection]);

  const toggleEvalExpand = useCallback((evalId: string) => {
    setExpandedEvals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(evalId)) newSet.delete(evalId);
      else newSet.add(evalId);
      return newSet;
    });
  }, []);

  const handleSaveVideo = useCallback(async () => {
    try {
      setIsSaving(true);
      const playerRef = doc(getAcademyCollection("players"), localPlayer.id);
      await updateDoc(playerRef, {
        videoHighlightsUrl: videoUrlInput
      });
      setLocalPlayer((prev: any) => ({
        ...prev,
        videoHighlightsUrl: videoUrlInput
      }));
      setIsEditingVideo(false);
    } catch (err) {
      console.error(err);
      alert("Error saving video link");
    } finally {
      setIsSaving(false);
    }
  }, [localPlayer.id, videoUrlInput, getAcademyCollection]);

  const handleSaveAcademy = async () => {
    if (!newAcademy.name || !newAcademy.startYear) return;
    try {
      setIsSaving(true);
      const playerRef = doc(getAcademyCollection("players"), localPlayer.id);
      const academyEntry = { ...newAcademy, id: Date.now().toString() };
      await updateDoc(playerRef, {
        academy_history: arrayUnion(academyEntry)
      });
      setLocalPlayer((prev: any) => ({
        ...prev,
        academy_history: [...(prev.academy_history || []), academyEntry]
      }));
      setIsAddingAcademy(false);
      setNewAcademy({ name: "", startYear: "", endYear: "", achievements: "" });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAward = async () => {
    if (!newAward.title || !newAward.year) return;
    try {
      setIsSaving(true);
      const playerRef = doc(getAcademyCollection("players"), localPlayer.id);
      const awardEntry = { ...newAward, id: Date.now().toString() };
      await updateDoc(playerRef, {
        personal_awards: arrayUnion(awardEntry)
      });
      setLocalPlayer((prev: any) => ({
        ...prev,
        personal_awards: [...(prev.personal_awards || []), awardEntry]
      }));
      setIsAddingAward(false);
      setNewAward({ title: "", year: "", tournament: "", description: "" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGrowth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGrowth.height || !newGrowth.weight || !newGrowth.date) return;
    try {
      setIsSaving(true);
      const growthRef = collection(db, "academies", academyId || "default_academy", "players", localPlayer.id, "growth_history");
      const h = Number(newGrowth.height);
      const w = Number(newGrowth.weight);
      const bmiVal = (w / Math.pow(h / 100, 2)).toFixed(1);
      
      await addDoc(growthRef, {
        date: newGrowth.date,
        height: h,
        weight: w,
        bmi: Number(bmiVal),
        createdAt: new Date().toISOString()
      });

      const playerRef = doc(getAcademyCollection("players"), localPlayer.id);
      await updateDoc(playerRef, {
        height: h,
        weight: w
      });
      setLocalPlayer((prev: any) => ({
        ...prev,
        height: h,
        weight: w
      }));

      setIsAddingGrowth(false);
      setNewGrowth({
        date: new Date().toISOString().split("T")[0],
        height: "",
        weight: "",
      });
    } catch (err) {
      console.error("Error saving growth record:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGrowth = useCallback(async (growthId: string) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      const growthDocRef = doc(db, "academies", academyId || "default_academy", "players", localPlayer.id, "growth_history", growthId);
      await deleteDoc(growthDocRef);
    } catch (err) {
      console.error("Error deleting growth record:", err);
    }
  }, [academyId, localPlayer.id]);

  const handleOpenAddDailyLog = useCallback(() => {
    setNewDailyLog({
      date: selectedLogDate,
      breakfast: "",
      breakfastNutrients: [],
      lunch: "",
      lunchNutrients: [],
      dinner: "",
      dinnerNutrients: [],
      hydration: "0",
      sleep: "8",
    });
    setIsAddingDailyLog(true);
  }, [selectedLogDate]);

  const handleSaveDailyLog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const logsRef = collection(db, "academies", academyId || "default_academy", "players", localPlayer.id, "daily_logs");
      await addDoc(logsRef, {
        date: newDailyLog.date,
        breakfast: newDailyLog.breakfast,
        breakfastNutrients: newDailyLog.breakfastNutrients,
        lunch: newDailyLog.lunch,
        lunchNutrients: newDailyLog.lunchNutrients,
        dinner: newDailyLog.dinner,
        dinnerNutrients: newDailyLog.dinnerNutrients,
        hydration: Number(newDailyLog.hydration),
        sleep: Number(newDailyLog.sleep),
        createdAt: new Date().toISOString()
      });
      setIsAddingDailyLog(false);
      setNewDailyLog({
        date: new Date().toISOString().split("T")[0],
        breakfast: "",
        breakfastNutrients: [],
        lunch: "",
        lunchNutrients: [],
        dinner: "",
        dinnerNutrients: [],
        hydration: "0",
        sleep: "8",
      });
    } catch (err) {
      console.error("Error saving daily log:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDailyLog = useCallback(async (logId: string) => {
    if (!window.confirm("Are you sure you want to delete this log?")) return;
    try {
      const logDocRef = doc(db, "academies", academyId || "default_academy", "players", localPlayer.id, "daily_logs", logId);
      await deleteDoc(logDocRef);
    } catch (err) {
      console.error("Error deleting daily log:", err);
    }
  }, [academyId, localPlayer.id]);

  const handleSaveBio = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const playerRef = doc(getAcademyCollection("players"), localPlayer.id);
      await updateDoc(playerRef, {
        faCardId: bioForm.faCardId,
        school: bioForm.school,
        grade: bioForm.grade,
        parentName: bioForm.parentName,
        parentPhone: bioForm.parentPhone,
        parentLineId: bioForm.parentLineId,
        joinedDate: bioForm.joinedDate,
        leftDate: bioForm.leftDate,
        status: bioForm.status,
      });
      setLocalPlayer((prev: any) => ({
        ...prev,
        ...bioForm
      }));
      setIsEditingBio(false);
    } catch (err) {
      console.error("Error updating bio details:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const [radarData, setRadarData] = useState<any[]>([
    { subject: "Attacking", A: 0, fullMark: 100 },
    { subject: "Defending", A: 0, fullMark: 100 },
    { subject: "Tactical", A: 0, fullMark: 100 },
    { subject: "Physical", A: 0, fullMark: 100 },
    { subject: "Mental", A: 0, fullMark: 100 },
    { subject: "Social", A: 0, fullMark: 100 },
  ]);

  useEffect(() => {
    const fetchEvaluationsAndCriteria = async () => {
      if (!player?.id) return;
      
      const evalQ = query(getAcademyCollection("player_evaluations"), where("player_id", "==", player.id));
      const evalSnap = await getDocs(evalQ);
      const evals = evalSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Sort evaluations by date descending
      const sortedEvals = [...evals].sort((a, b) => new Date(b.evaluation_date).getTime() - new Date(a.evaluation_date).getTime());
      setEvaluations(sortedEvals);
      
      let criteriaList: any[] = [];

      // Criteria collections are academy configuration, not owner-scoped Player data.
      // Staff views retain the existing reads; Player self-view stays fail-closed.
      if (!isSelfView) {
        const criteriaSnap = await getDocs(getAcademyCollection("evaluation_criteria"));
        criteriaList = criteriaSnap.docs.map(doc => doc.data());

        // Also fetch global criteria from superadmin_system
        if (academyId !== "superadmin_system") {
          try {
            const globalRef = collection(db, "academies", "superadmin_system", "evaluation_criteria");
            const globalSnap = await getDocs(globalRef);
            const globalData = globalSnap.docs.map(doc => doc.data());
            const existingNames = new Set(criteriaList.map(c => c.criteria_name));
            globalData.forEach(g => {
              if (!existingNames.has(g.criteria_name)) criteriaList.push(g);
            });
          } catch (e) {
            console.warn("Failed to fetch global criteria from superadmin_system", e);
          }
        }
      }
      
      // Map criteria name to category
      const criteriaToCategory: Record<string, string> = {};
      criteriaList.forEach(c => {
        criteriaToCategory[c.criteria_name] = c.category;
      });
      setCriteriaMapping(criteriaToCategory);
      
      const categoryTotals: Record<string, { sum: number, count: number }> = {
        "Attacking Techniques": { sum: 0, count: 0 },
        "Defending Techniques": { sum: 0, count: 0 },
        "Tactical Awareness": { sum: 0, count: 0 },
        "Physical Attributes": { sum: 0, count: 0 },
        "Mental Attributes": { sum: 0, count: 0 },
        "Social Skills": { sum: 0, count: 0 },
      };
      
      evals.forEach(evaluation => {
        const scores = evaluation.scores || {};
        Object.entries(scores).forEach(([critName, score]) => {
          const category = criteriaToCategory[critName];
          if (category && categoryTotals[category]) {
            categoryTotals[category].sum += Number(score);
            categoryTotals[category].count += 1;
          }
        });
      });
      
      const calculateScore = (cat: string) => {
        const { sum, count } = categoryTotals[cat];
        if (count === 0) return 0;
        // score is 1-5, convert to 0-100 percentage: score / 5 * 100
        return Math.round((sum / count) / 5 * 100);
      };
      
      setRadarData([
        { subject: "Attacking", A: calculateScore("Attacking Techniques"), fullMark: 100 },
        { subject: "Defending", A: calculateScore("Defending Techniques"), fullMark: 100 },
        { subject: "Tactical", A: calculateScore("Tactical Awareness"), fullMark: 100 },
        { subject: "Physical", A: calculateScore("Physical Attributes"), fullMark: 100 },
        { subject: "Mental", A: calculateScore("Mental Attributes"), fullMark: 100 },
        { subject: "Social", A: calculateScore("Social Skills"), fullMark: 100 },
      ]);
    };
    fetchEvaluationsAndCriteria();
  }, [player?.id, academyId, isSelfView]);

  const teammates = useMemo(() => [{ 
    id: player.id, 
    name: `${player.firstName} ${player.lastName}`.trim(), 
    avatar: player.avatar, 
    position: player.position || "Player" 
  }], [player.id, player.firstName, player.lastName, player.avatar, player.position]);

  const cvRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportToPDF = async () => {
    if (!cvRef.current) return;
    try {
      setIsExporting(true);
      const element = cvRef.current;
      const imgData = await toPng(element, {
        cacheBust: true,
        backgroundColor: "#0f172a",
        pixelRatio: 2,
        width: element.scrollWidth,
        height: element.scrollHeight,
        style: {
          width: `${element.scrollWidth}px`,
          height: `${element.scrollHeight}px`,
        },
        filter: (node) => {
          // Exclude elements with hide-on-export class
          if (node?.classList?.contains && node.classList.contains('hide-on-export')) {
            return false;
          }
          return true;
        }
      });
      
      const pdf = new jsPDF({
        orientation: element.scrollHeight > element.scrollWidth ? "portrait" : "landscape",
        unit: "px",
        format: [element.scrollWidth, element.scrollHeight]
      });
      
      pdf.addImage(imgData, "PNG", 0, 0, element.scrollWidth, element.scrollHeight);
      pdf.save(`${player.firstName}_${player.lastName}_CV.pdf`);
    } catch (err: any) {
      console.error("Error exporting PDF:", err);
      alert(`เกิดข้อผิดพลาดในการสร้าง PDF: ${err.message || 'กรุณาลองใหม่อีกครั้ง'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const shareLink = async () => {
    try {
      const shareData = {
        title: `${player.firstName} ${player.lastName} - Futverse Player Profile`,
        text: `Check out ${player.firstName}'s player profile!`,
        url: window.location.href,
      };
      
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert("คัดลอกลิงก์เรียบร้อยแล้ว!");
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Error sharing:", err);
        try {
          await navigator.clipboard.writeText(window.location.href);
          alert("คัดลอกลิงก์เรียบร้อยแล้ว!");
        } catch (copyErr) {
          alert("ไม่สามารถแชร์หรือคัดลอกลิงก์ได้ กรุณาคัดลอก URL ด้านบนด้วยตนเอง");
        }
      }
    }
  };

  return (
    <div ref={cvRef} className="w-full flex-1 flex flex-col lg:flex-row bg-slate-50 min-h-screen overflow-x-hidden">
      <PeerVotingModal
        isOpen={showVotingModal}
        onClose={handleVotingClose}
        teammates={teammates}
        onSubmitVote={handleVoteSubmit}
      />
      {/* Left Sidebar (Hero Section) */}
      <div className="w-full lg:w-80 xl:w-96 bg-slate-900 text-white flex flex-col shadow-2xl relative overflow-hidden z-10 shrink-0">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Award size={160} />
        </div>

        <div className="p-6 md:p-8 flex-1 flex flex-col relative z-20">
          <div className="flex justify-between items-center w-full mb-8">
            {!isSelfView ? (
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold bg-slate-800/50 hover:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700/50"
              >
                <ArrowLeft size={16} /> Back to Roster
              </button>
            ) : (
              <div className="text-slate-400 text-sm font-bold bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                Player Dashboard
              </div>
            )}
          </div>

          <div className="flex flex-col items-center text-center mt-4">
            <div className="relative mb-6">
              <div className="w-40 h-40 rounded-full border-4 border-slate-700 overflow-hidden shadow-2xl bg-slate-800">
                <img
                  src={
                    player.avatar ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.firstName}`
                  }
                  alt={`${player.firstName} ${player.lastName}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full border-2 border-slate-900 whitespace-nowrap shadow-lg">
                Academy
              </div>
            </div>

            <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
              {player.firstName} <br />{" "}
              <span className="text-indigo-400">{player.lastName}</span>
            </h1>

            <div className="flex items-center justify-center gap-3 mt-4 w-full">
              <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-xs font-bold uppercase tracking-widest border border-slate-700">
                {player.position || "CM"}
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-600"></span>
              <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-xs font-bold uppercase tracking-widest border border-slate-700">
                {player.fitness_status || "Fit"}
              </span>
            </div>
            {player.futId ? (
              <div className="mt-4 inline-block px-3 py-1.5 bg-[#E1FF01]/10 text-[#E1FF01] font-mono text-sm tracking-wider rounded-lg border border-[#E1FF01]/20 shadow-sm">
                {player.futId}
              </div>
            ) : (
              <div className="mt-4 inline-block px-3 py-1.5 bg-slate-800 text-slate-400 font-mono text-xs tracking-wider rounded-lg border border-slate-700 shadow-sm">
                ไม่มีข้อมูล FUTID
              </div>
            )}
          </div>

          <div className="mt-10 pt-8 border-t border-slate-800 grid grid-cols-2 gap-4 gap-y-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Age
              </div>
              <div className="text-lg font-bold text-slate-200">
                {player.age || 15}{" "}
                <span className="text-xs text-slate-500 font-normal">ปี</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Age Group
              </div>
              <div className="text-lg font-bold text-slate-200">
                {player.ageGroup || "U15"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Height
              </div>
              <div className="text-lg font-bold text-slate-200">
                {player.height || 170}{" "}
                <span className="text-xs text-slate-500 font-normal">cm</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Weight
              </div>
              <div className="text-lg font-bold text-slate-200">
                {player.weight || 62}{" "}
                <span className="text-xs text-slate-500 font-normal">kg</span>
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Preferred Foot
              </div>
              <div className="text-lg font-bold text-slate-200">{player.preferredFoot || "Right"}</div>
            </div>
          </div>

          {/* Academy Membership Duration */}
          <div className="mt-6 pt-6 border-t border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">ข้อมูลอคาเดมี่</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                (localPlayer.status || "ACTIVE") === "ACTIVE" 
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                  : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
              }`}>
                {(localPlayer.status || "ACTIVE") === "ACTIVE" ? "กำลังศึกษาอยู่ (Active)" : "ย้ายออกแล้ว (Left)"}
              </span>
            </div>
            
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-slate-400" />
                <span className="text-slate-300 font-semibold">
                  วันแรกที่เข้า: {localPlayer.joinedDate || "ไม่มีข้อมูล"}
                </span>
              </div>
              
              {(localPlayer.status || "ACTIVE") === "LEFT" && localPlayer.leftDate && (
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-rose-400" />
                  <span className="text-slate-300 font-semibold">
                    วันที่ย้ายออก: {localPlayer.leftDate}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Clock size={14} className="text-indigo-400" />
                <span className="text-slate-300 font-semibold">
                  ระยะเวลาที่อยู่: <span className="text-indigo-300 font-extrabold text-sm">{calculateDaysInAcademy(localPlayer.joinedDate, localPlayer.leftDate)}</span> วัน
                </span>
              </div>
            </div>
          </div>

          {/* Bio & Contacts in Sidebar */}
          <div className="mt-6 pt-6 border-t border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">ข้อมูลประวัติ & ติดต่อ</span>
              {!isSelfView && (
                <button
                  onClick={() => setIsEditingBio(true)}
                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider"
                >
                  แก้ไข
                </button>
              )}
            </div>
            
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-slate-400" />
                <span className="text-slate-300 font-semibold">เลขสมาคม: {localPlayer.faCardId || "ไม่มีข้อมูล"}</span>
              </div>
              <div className="flex items-center gap-2">
                <GraduationCap size={14} className="text-slate-400" />
                <span className="text-slate-300 font-semibold">โรงเรียน: {localPlayer.school || "ไม่มีข้อมูล"} {localPlayer.grade && `(${localPlayer.grade})`}</span>
              </div>
              <div className="flex items-center gap-2">
                <PhoneCall size={14} className="text-slate-400" />
                <div>
                  <span className="text-slate-300 font-semibold">ผู้ปกครอง: {localPlayer.parentName || "ไม่มีข้อมูล"}</span>
                  {localPlayer.parentPhone && <span className="block text-[10px] text-slate-400 font-bold mt-0.5">📞 {localPlayer.parentPhone}</span>}
                  {localPlayer.parentLineId && <span className="block text-[9px] text-emerald-400 font-bold">🟢 LINE: {localPlayer.parentLineId}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-800 bg-slate-950 flex flex-col gap-3 relative z-20">
          {!isSelfView && !hasVoted && (
            <button
              onClick={() => setShowVotingModal(true)}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-900 rounded-xl p-4 shadow-lg border border-indigo-400/30 flex items-center justify-between group hover:shadow-indigo-500/20 transition-all text-left mb-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/40 rounded-lg flex items-center justify-center shrink-0 border border-indigo-400/50 group-hover:scale-110 transition-transform">
                  <Award className="text-[#E1FF01]" size={20} />
                </div>
                <div>
                  <h3 className="text-[#E1FF01] font-black text-sm tracking-tight mb-0.5">
                    📢 โหวตแมตช์เดย์!
                  </h3>
                  <p className="text-indigo-100 text-xs font-medium">
                    โหวตให้ {player.firstName}
                  </p>
                </div>
              </div>
            </button>
          )}

          <div className="flex gap-3 hide-on-export">
            <button onClick={shareLink} className="flex-1 flex justify-center items-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-sm transition-colors border border-slate-700">
              <Share2 size={16} /> Share Link
            </button>
            <button disabled={isExporting} onClick={exportToPDF} className={`flex-1 flex justify-center items-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-900/50 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <Download size={16} /> {isExporting ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-0">
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] px-4 sm:px-6 md:px-10 py-5 flex items-center justify-between z-10 shadow-sm shrink-0 w-full overflow-hidden">
          <div className="flex gap-6 md:gap-8 overflow-x-auto hide-scrollbar w-full">
            <button
              className={`pb-5 -mb-5 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === "overview" ? "border-indigo-600 text-indigo-600 dark:border-cyan-400 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.8)] dark:[box-shadow:0_2px_10px_-2px_rgba(34,211,238,0.5)]" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-cyan-200"}`}
              onClick={() => setActiveTab("overview")}
            >
              Development Report
            </button>
            <button
              className={`pb-5 -mb-5 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === "history" ? "border-indigo-600 text-indigo-600 dark:border-cyan-400 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.8)] dark:[box-shadow:0_2px_10px_-2px_rgba(34,211,238,0.5)]" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-cyan-200"}`}
              onClick={() => setActiveTab("history")}
            >
              Evaluation History
            </button>
            <button
              className={`pb-5 -mb-5 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === "career" ? "border-indigo-600 text-indigo-600 dark:border-cyan-400 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.8)] dark:[box-shadow:0_2px_10px_-2px_rgba(34,211,238,0.5)]" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-cyan-200"}`}
              onClick={() => setActiveTab("career")}
            >
              Career Profile
            </button>
            <button
              className={`pb-5 -mb-5 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === "training" ? "border-indigo-600 text-indigo-600 dark:border-cyan-400 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.8)] dark:[box-shadow:0_2px_10px_-2px_rgba(34,211,238,0.5)]" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-cyan-200"}`}
              onClick={() => setActiveTab("training")}
            >
              Training Log
            </button>
            <button
              className={`pb-5 -mb-5 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === "idp_log" ? "border-indigo-600 text-indigo-600 dark:border-cyan-400 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.8)] dark:[box-shadow:0_2px_10px_-2px_rgba(34,211,238,0.5)]" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-cyan-200"}`}
              onClick={() => setActiveTab("idp_log")}
            >
              IDP Log
            </button>
            <button
              className={`pb-5 -mb-5 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === "bio" ? "border-indigo-600 text-indigo-600 dark:border-cyan-400 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.8)] dark:[box-shadow:0_2px_10px_-2px_rgba(34,211,238,0.5)]" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-cyan-200"}`}
              onClick={() => setActiveTab("bio")}
            >
              Nutrition & Lifestyle
            </button>
            {isSelfView && (
              <button
                className={`pb-5 -mb-5 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === "daily_log" ? "border-indigo-600 text-indigo-600 dark:border-cyan-400 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.8)] dark:[box-shadow:0_2px_10px_-2px_rgba(34,211,238,0.5)]" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-cyan-200"}`}
                onClick={() => setActiveTab("daily_log")}
              >
                Daily Log (Self)
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 hide-scrollbar bg-slate-50/50 dark:bg-[#0B1120]">
          {activeTab === "overview" && <CVOverviewTab player={player} localPlayer={localPlayer} academyId={academyId} evaluations={evaluations} criteriaMapping={criteriaMapping} growthHistory={growthHistory} dailyLogs={dailyLogs} playerMatches={playerMatches} idpsList={idpsList} idpStats={idpStats} isSaving={isSaving} dashboardWidgets={dashboardWidgets} isEditingVideo={isEditingVideo} setIsEditingVideo={setIsEditingVideo} videoUrlInput={videoUrlInput} setVideoUrlInput={setVideoUrlInput} handleSaveVideo={handleSaveVideo} setIsAddingGrowth={setIsAddingGrowth} handleDeleteGrowth={handleDeleteGrowth} getEmbedUrl={getEmbedUrl} />}
          {/* @ts-ignore */}
          {false && activeTab === "overview" && (
            <div className="max-w-5xl mx-auto space-y-6">
              {dashboardWidgets}
              
              {/* Top Row: Chart & IDP target */}
              {/* --- New Development Report Layout --- */}
              {(() => {
                const latestEval = evaluations.length > 0 ? evaluations[0] : null;
                const previousEval = evaluations.length > 1 ? evaluations[1] : null;

                const calculateCategoryAverages = (evalData: any) => {
                  if (!evalData) return {};
                  const catTotals: Record<string, { sum: number; count: number }> = {};
                  const scores = evalData.scores || {};
                  Object.entries(scores).forEach(([critName, score]) => {
                    const category = criteriaMapping[critName];
                    if (category) {
                      if (!catTotals[category]) catTotals[category] = { sum: 0, count: 0 };
                      catTotals[category].sum += Number(score);
                      catTotals[category].count += 1;
                    }
                  });
                  const averages: Record<string, number> = {};
                  Object.entries(catTotals).forEach(([cat, { sum, count }]) => {
                    averages[cat] = count > 0 ? sum / count : 0;
                  });
                  return averages;
                };

                const latestCatScores = calculateCategoryAverages(latestEval);
                const previousCatScores = calculateCategoryAverages(previousEval);

                const CATEGORY_KEYS = [
                  { key: "Attacking Techniques", label: "Attacking" },
                  { key: "Defending Techniques", label: "Defending" },
                  { key: "Tactical Awareness", label: "Tactical" },
                  { key: "Physical Attributes", label: "Physical" },
                  { key: "Mental Attributes", label: "Mental" },
                  { key: "Social Skills", label: "Social" },
                ];

                let strongestArea = "N/A";
                let weakestArea = "N/A";
                let overallAverage = 0;
                
                if (latestEval) {
                  let max = -1;
                  let min = 6;
                  let totalSum = 0;
                  let totalCount = 0;
                  Object.entries(latestCatScores).forEach(([cat, score]) => {
                    if (score > max) { max = score; strongestArea = cat.split(" ")[0]; }
                    if (score < min && score > 0) { min = score; weakestArea = cat.split(" ")[0]; }
                    totalSum += score;
                    totalCount++;
                  });
                  if (totalCount > 0) overallAverage = totalSum / totalCount;
                }

                const getBadgeFromScore = (score: number) => {
                  if (score === 0) return { label: "N/A", emoji: "⚪", color: "text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700", bar: "bg-slate-300 dark:bg-slate-600" };
                  if (score >= 4.5) return { label: "Excellent", emoji: "🟢", color: "text-emerald-700 bg-emerald-100 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800", bar: "bg-emerald-500" };
                  if (score >= 3.5) return { label: "Good", emoji: "🟡", color: "text-yellow-700 bg-yellow-100 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/30 dark:border-yellow-800", bar: "bg-yellow-500" };
                  if (score >= 2.5) return { label: "Developing", emoji: "🟠", color: "text-orange-700 bg-orange-100 border-orange-200 dark:text-orange-400 dark:bg-orange-900/30 dark:border-orange-800", bar: "bg-orange-500" };
                  return { label: "Needs Improvement", emoji: "🔴", color: "text-rose-700 bg-rose-100 border-rose-200 dark:text-rose-400 dark:bg-rose-900/30 dark:border-rose-800", bar: "bg-rose-500" };
                };

                const overallBadge = getBadgeFromScore(overallAverage);
                const overallPercentage = Math.round((overallAverage / 5) * 100);

                const activeIDP = idpsList.find((idp: any) => idp.status === "Active" || idp.status === "Draft") || idpsList[0];
                const recentIDPs = idpsList.slice(0, 3);

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Summary & Potential Assessment */}
                    <div className="lg:col-span-2 flex flex-col gap-6">
                      
                      {/* Section 4: Player Development Summary */}
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col sm:flex-row gap-6 items-center justify-between">
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                          <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-800/50">
                            <span className="text-2xl font-black text-indigo-600 dark:text-cyan-400 dark:[text-shadow:0_0_10px_rgba(34,211,238,0.6)]">{overallPercentage}%</span>
                          </div>
                          <div>
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Current Level</h3>
                            <div className="flex items-center gap-2">
                              <span className="text-xl font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_8px_rgba(255,255,255,0.5)]">{overallBadge.label}</span>
                              <span className="text-lg leading-none">{overallBadge.emoji}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-6 w-full sm:w-auto sm:justify-end">
                          <div className="text-left sm:text-right">
                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Strongest</div>
                            <div className="text-base font-black text-emerald-600 dark:text-emerald-400 dark:[text-shadow:0_0_10px_rgba(52,211,153,0.6)]">{strongestArea}</div>
                          </div>
                          <div className="w-px bg-slate-100 dark:bg-slate-800 shrink-0 hidden sm:block"></div>
                          <div className="text-left sm:text-right">
                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Weakest</div>
                            <div className="text-base font-black text-rose-600 dark:text-rose-400 dark:[text-shadow:0_0_10px_rgba(251,113,133,0.6)]">{weakestArea}</div>
                          </div>
                        </div>
                      </div>

                      {/* Section 1: Potential Assessment */}
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex-1">
                        <div className="flex items-center gap-2 mb-8">
                          <Target className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={24} />
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">
                            Potential Assessment
                          </h3>
                        </div>
                        
                        {!latestEval ? (
                          <div className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">No evaluation data available.</div>
                        ) : (
                          <div className="space-y-6">
                            {CATEGORY_KEYS.map((cat) => {
                              const score = latestCatScores[cat.key] || 0;
                              const prevScore = previousCatScores[cat.key] || 0;
                              const diff = score - prevScore;
                              const badge = getBadgeFromScore(score);
                              const percentage = (score / 5) * 100;

                              return (
                                <div key={cat.key}>
                                  <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-2 gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200 min-w-[90px]">{cat.label}</span>
                                      {prevScore > 0 && (
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                          diff > 0 ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" :
                                          diff < 0 ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                        }`}>
                                          {diff > 0 ? `↑ +${diff.toFixed(1)}` : diff < 0 ? `↓ ${Math.abs(diff).toFixed(1)}` : `→ 0.0`}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${badge.color}`}>
                                        {badge.emoji} {badge.label}
                                      </span>
                                      <span className="text-lg font-black text-slate-800 dark:text-white tabular-nums dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">
                                        {score > 0 ? score.toFixed(1) : "0.0"} <span className="text-xs text-slate-400 dark:text-slate-500">/ 5</span>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-1000 ${badge.bar} dark:[box-shadow:0_0_10px_currentColor]`} style={{ width: `${percentage}%` }}></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Pipeline */}
                    <div className="lg:col-span-1 flex flex-col gap-6">
                      {/* Section 2: Player Progress Pipeline (Match -> IDP -> Training) */}
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col">
                        <div className="flex items-center gap-2 mb-6">
                          <Activity className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={20} />
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">
                            Player Progress Pipeline
                          </h3>
                        </div>

                        <div className="flex-1 flex flex-col gap-6 relative ml-2">
                          {/* Pipeline Connection Line */}
                          <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-200 dark:bg-slate-700/50 z-0"></div>

                          {/* 1. Match Insights */}
                          <div className="relative z-10 flex gap-3">
                            <div className="w-8 h-8 shrink-0 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center text-amber-500">
                              <Flame size={14} />
                            </div>
                            <div className="flex-1 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 mt-1">
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">1. Match Insights</h4>
                              {playerMatches.length > 0 ? (
                                <div className="space-y-2">
                                  {playerMatches.slice(0, 2).map((m, idx) => {
                                    const pData = m.playersData?.[player.id] || m.players?.find((p:any) => p.id === player.id) || {};
                                    return (
                                      <div key={idx} className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                        <span className="font-bold opacity-75 mr-1">[{m.matchDate}]</span>
                                        {pData.trainingRecommendation || pData.metrics?.trainingRecommendation || "ไม่มีคำแนะนำพิเศษ"}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-xs text-slate-400">ยังไม่มีข้อมูลจากแมตช์</div>
                              )}
                            </div>
                          </div>

                          {/* 2. Active IDP Goal */}
                          <div className="relative z-10 flex gap-3">
                            <div className="w-8 h-8 shrink-0 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-500">
                              <Target size={14} />
                            </div>
                            <div className="flex-1 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 mt-1">
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2 flex-wrap">
                                2. Active IDP Goal 
                                {activeIDP && (
                                  <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${activeIDP.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
                                    {activeIDP.status}
                                  </span>
                                )}
                              </h4>
                              {activeIDP ? (
                                <div>
                                  <div className="font-black text-indigo-900 dark:text-indigo-400 text-sm mb-1.5 leading-tight">{activeIDP.goal || "ไม่ได้ระบุเป้าหมาย"}</div>
                                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                    <span className="font-bold">Process:</span> {activeIDP.process || "ไม่มีกระบวนการ"}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs text-slate-400">ยังไม่มีแผนพัฒนาส่วนบุคคล</div>
                              )}
                            </div>
                          </div>

                          {/* 3. Training Progress */}
                          <div className="relative z-10 flex gap-3">
                            <div className="w-8 h-8 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-500">
                              <Activity size={14} />
                            </div>
                            <div className="flex-1 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 mt-1">
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">3. Training Translation</h4>
                              <div className="grid grid-cols-2 gap-2 text-center">
                                <div className="bg-white dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Training Sessions</div>
                                  <div className="text-lg font-black text-slate-700 dark:text-slate-300">{dailyLogs.length}</div>
                                </div>
                                <div className="bg-white dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">IDPs Completed</div>
                                  <div className="text-lg font-black text-slate-700 dark:text-slate-300">{idpStats.completed}/{idpStats.total}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>

                      {/* Section 3: Recent IDP Activities */}
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 mb-5 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">
                          Recent IDP Activities
                        </h3>
                        {recentIDPs.length === 0 ? (
                          <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-xs font-medium">No recent activities found.</div>
                        ) : (
                          <div className="space-y-3">
                            {recentIDPs.map((idp: any, idx: number) => {
                              const isCompleted = idp.status === "Completed";
                              return (
                                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
                                  <div className="text-center w-12 shrink-0 border-r border-slate-200 dark:border-slate-700 pr-3">
                                    <div className="text-xs font-black text-slate-700 dark:text-slate-300 leading-tight">
                                      {idp.createdAt ? new Date(idp.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short'}) : "N/A"}
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{idp.title}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                      {idp.targetValue} {idp.unit}
                                    </div>
                                  </div>
                                  <div className="shrink-0">
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${isCompleted ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'}`}>
                                      {idp.status}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })()}
              {/* --- End New Layout --- */}

            {/* Physical Growth Section */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Activity className="text-emerald-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={24} />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">
                  Physical Growth
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Metric 1 */}
                <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    VO2 Max
                  </div>
                  <div className="flex items-end justify-between mb-3">
                    <div className="text-2xl font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">
                      54.2
                    </div>
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md dark:border dark:border-emerald-800">
                      +2.1 from last test
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 dark:[box-shadow:0_0_10px_#10b981]"
                      style={{ width: "75%" }}
                    ></div>
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    30m Sprint
                  </div>
                  <div className="flex items-end justify-between mb-3">
                    <div className="text-2xl font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">
                      4.12{" "}
                      <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">
                        sec
                      </span>
                    </div>
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md dark:border dark:border-emerald-800">
                      -0.05 from last test
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 dark:bg-cyan-500 dark:[box-shadow:0_0_10px_#06b6d4]"
                      style={{ width: "80%" }}
                    ></div>
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Vertical Jump
                  </div>
                  <div className="flex items-end justify-between mb-3">
                    <div className="text-2xl font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">
                      58{" "}
                      <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">
                        cm
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                      Stable
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-500 dark:bg-slate-400"
                      style={{ width: "60%" }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Growth Tracking Section */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <Activity className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={24} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">
                    ความเติบโตทางร่างกาย (Growth Tracking)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingGrowth(true)}
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:[box-shadow:0_0_10px_rgba(6,182,212,0.5)] transition-colors shadow-sm self-start sm:self-auto"
                >
                  + บันทึกส่วนสูง/น้ำหนัก
                </button>
              </div>

              {growthHistory.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  ไม่มีบันทึกประวัติการเติบโต กดปุ่มเพื่อบันทึกครั้งแรก
                </div>
              ) : (
                <div className="flex flex-col">
                  {/* Latest Status Banner */}
                  {(() => {
                    const latest = growthHistory[growthHistory.length - 1];
                    if (!latest || !latest.bmi) return null;
                    const cat = getBMICategory(latest.bmi);
                    if (!cat) return null;
                    
                    const textColor = cat.color.split(' ')[0];
                    const borderColor = cat.color.split(' ')[2];
                    
                    let darkBorder = "";
                    let darkText = "";
                    let darkBg = "";
                    if (textColor.includes("emerald")) { darkBorder = "dark:border-emerald-800"; darkText = "dark:text-emerald-400"; darkBg = "dark:bg-emerald-900/30"; }
                    if (textColor.includes("yellow")) { darkBorder = "dark:border-yellow-800"; darkText = "dark:text-yellow-400"; darkBg = "dark:bg-yellow-900/30"; }
                    if (textColor.includes("orange")) { darkBorder = "dark:border-orange-800"; darkText = "dark:text-orange-400"; darkBg = "dark:bg-orange-900/30"; }
                    if (textColor.includes("rose")) { darkBorder = "dark:border-rose-800"; darkText = "dark:text-rose-400"; darkBg = "dark:bg-rose-900/30"; }

                    return (
                      <div className="mb-6 flex flex-col md:flex-row items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm gap-4 relative overflow-hidden">
                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${cat.color.split(' ')[1].replace('50', '400')}`}></div>
                        <div className="flex items-center gap-4 z-10 w-full md:w-auto">
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 shadow-sm bg-white dark:bg-slate-800 ${borderColor} ${darkBorder} ${textColor} ${darkText}`}>
                            <Activity size={24} />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                              สถานะปัจจุบัน (ล่าสุด: {latest.date})
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-2xl font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">
                                BMI: {latest.bmi}
                              </div>
                              <div className={`px-3 py-1 rounded-full text-sm font-bold border shadow-sm ${cat.color} ${darkBg} ${darkText} ${darkBorder}`}>
                                {cat.label}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-4 w-full md:w-auto justify-end">
                          <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">ส่วนสูง</div>
                            <div className="font-black text-slate-700 dark:text-slate-200 text-lg leading-none">{latest.height} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">cm</span></div>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">น้ำหนัก</div>
                            <div className="font-black text-slate-700 dark:text-slate-200 text-lg leading-none">{latest.weight} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">kg</span></div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Chart */}
                    <div className="lg:col-span-2">
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={growthHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#2dd4bf" }} label={{ value: 'ส่วนสูง (cm)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#2dd4bf', fontSize: 10, fontWeight: 'bold' } }} domain={['dataMin - 5', 'dataMax + 5']} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#0ea5e9" }} label={{ value: 'น้ำหนัก (kg)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#0ea5e9', fontSize: 10, fontWeight: 'bold' } }} domain={['dataMin - 5', 'dataMax + 5']} />
                          <Tooltip contentStyle={{ borderRadius: '12px', borderColor: '#334155', backgroundColor: '#0B1120', color: '#f8fafc' }} />
                          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                          <Line yAxisId="left" type="monotone" dataKey="height" name="ส่วนสูง (cm)" stroke="#2dd4bf" strokeWidth={3} activeDot={{ r: 8 }} />
                          <Line yAxisId="right" type="monotone" dataKey="weight" name="น้ำหนัก (kg)" stroke="#0ea5e9" strokeWidth={3} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* History List */}
                  <div className="lg:col-span-1 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 flex flex-col max-h-[250px]">
                    <div className="p-3 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200/60 dark:border-slate-700/60 font-bold text-xs text-slate-700 dark:text-slate-300 tracking-wider uppercase">
                      ประวัติการชั่งน้ำหนักย้อนหลัง
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {[...growthHistory].reverse().map((entry) => (
                        <div key={entry.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                          <div>
                            <div className="font-bold text-slate-700 dark:text-slate-200">{entry.date}</div>
                            <div className="text-slate-400 dark:text-slate-500 font-medium mt-0.5 flex flex-wrap items-center gap-1">
                              {entry.height} cm / {entry.weight} kg 
                              {entry.bmi && (
                                <span className="ml-1 inline-flex items-center">
                                  (BMI: {entry.bmi})
                                  {(() => {
                                    const cat = getBMICategory(entry.bmi);
                                    if (!cat) return null;
                                    
                                    const textColor = cat.color.split(' ')[0];
                                    let darkBorder = "";
                                    let darkText = "";
                                    let darkBg = "";
                                    if (textColor.includes("emerald")) { darkBorder = "dark:border-emerald-800"; darkText = "dark:text-emerald-400"; darkBg = "dark:bg-emerald-900/30"; }
                                    if (textColor.includes("yellow")) { darkBorder = "dark:border-yellow-800"; darkText = "dark:text-yellow-400"; darkBg = "dark:bg-yellow-900/30"; }
                                    if (textColor.includes("orange")) { darkBorder = "dark:border-orange-800"; darkText = "dark:text-orange-400"; darkBg = "dark:bg-orange-900/30"; }
                                    if (textColor.includes("rose")) { darkBorder = "dark:border-rose-800"; darkText = "dark:text-rose-400"; darkBg = "dark:bg-rose-900/30"; }

                                    return (
                                      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${cat.color} ${darkBg} ${darkText} ${darkBorder}`}>
                                        {cat.label}
                                      </span>
                                    );
                                  })()}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteGrowth(entry.id)}
                            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Gamified Teammate Endorsements & Video Highlights */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Teammate Endorsements */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm xl:col-span-1">
                <div className="flex items-center gap-2 mb-6">
                  <Star className="text-yellow-500 dark:text-yellow-400 dark:[filter:drop-shadow(0_0_8px_rgba(250,204,21,0.8))]" size={24} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-yellow-400 dark:[text-shadow:0_0_8px_rgba(250,204,21,0.6)]">
                    Teammate Endorsements
                  </h3>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/30 text-yellow-500 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
                        <Star size={20} />
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        MVP
                      </div>
                    </div>
                    <div className="flex items-center gap-1 font-black text-lg text-slate-800 dark:text-yellow-400 dark:[text-shadow:0_0_5px_rgba(250,204,21,0.6)]">
                      {player.endorsementStats?.mvp || 0}{" "}
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-medium ml-1">
                        times
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                        <Shield size={20} />
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        Best Defender
                      </div>
                    </div>
                    <div className="flex items-center gap-1 font-black text-lg text-slate-800 dark:text-blue-400 dark:[text-shadow:0_0_5px_rgba(96,165,250,0.6)]">
                      {player.endorsementStats?.defender || 0}{" "}
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-medium ml-1">
                        times
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        <Zap size={20} />
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        Hard Worker
                      </div>
                    </div>
                    <div className="flex items-center gap-1 font-black text-lg text-slate-800 dark:text-amber-400 dark:[text-shadow:0_0_5px_rgba(251,191,36,0.6)]">
                      {player.endorsementStats?.hardworker || 0}{" "}
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-medium ml-1">
                        times
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Video Highlights */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm xl:col-span-2">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Video className="text-rose-500 dark:text-rose-400 dark:[filter:drop-shadow(0_0_8px_rgba(244,63,94,0.8))]" size={24} />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-rose-400 dark:[text-shadow:0_0_8px_rgba(244,63,94,0.6)]">
                      Video Highlights
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsEditingVideo(!isEditingVideo)}
                    className="text-xs font-bold text-indigo-600 dark:text-cyan-400 hover:text-indigo-500 dark:hover:text-cyan-300 dark:[text-shadow:0_0_5px_rgba(34,211,238,0.5)] transition-colors uppercase tracking-wider flex items-center gap-1"
                  >
                    <Edit2 size={12} /> {isEditingVideo ? 'ยกเลิก' : 'แก้ไข'}
                  </button>
                </div>

                {isEditingVideo && (
                  <div className="mb-4 flex gap-2">
                    <input 
                      type="text" 
                      placeholder="วางลิงก์ YouTube ที่นี่..."
                      className="flex-1 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500"
                      value={videoUrlInput}
                      onChange={(e) => setVideoUrlInput(e.target.value)}
                    />
                    <button 
                      onClick={handleSaveVideo}
                      disabled={isSaving}
                      className="px-4 py-2 bg-indigo-600 dark:bg-cyan-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 dark:hover:bg-cyan-500 transition-colors disabled:opacity-50 flex items-center gap-2 dark:[box-shadow:0_0_10px_rgba(6,182,212,0.5)]"
                    >
                      {isSaving ? "กำลังบันทึก..." : <><Check size={16} /> บันทึก</>}
                    </button>
                  </div>
                )}

                <div className="w-full aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm relative dark:[box-shadow:0_0_15px_rgba(244,63,94,0.2)]">
                  <iframe
                    width="100%"
                    height="100%"
                    src={getEmbedUrl(localPlayer.videoHighlightsUrl || "")}
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  ></iframe>
                </div>
              </div>
            </div>
            </div>
          )}

          {activeTab === "history" && <CVHistoryTab evaluations={evaluations} criteriaMapping={criteriaMapping} expandedEvals={expandedEvals} toggleEvalExpand={toggleEvalExpand} openEditEval={openEditEval} handleDeleteEval={handleDeleteEval} onCreateGoalFromEval={onCreateGoalFromEval} />}
          {/* @ts-ignore */}
          {false && activeTab === "history" && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <Activity className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={28} />
                <h2 className="text-2xl font-black text-slate-800 tracking-tight dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">Evaluation History</h2>
              </div>
              
              {evaluations.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Activity size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">No Evaluations Yet</h3>
                  <p className="text-slate-500 dark:text-slate-400">This player hasn't received any formal evaluations.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {evaluations.map((evaluation) => {
                    const scores = evaluation.scores || {};
                    const categoryTotals: Record<string, { sum: number, count: number }> = {};
                    const categoryScores: Record<string, Record<string, number>> = {};
                    
                    Object.entries(scores).forEach(([critName, score]) => {
                      const category = criteriaMapping[critName] || "Uncategorized";
                      if (!categoryTotals[category]) {
                        categoryTotals[category] = { sum: 0, count: 0 };
                        categoryScores[category] = {};
                      }
                      categoryTotals[category].sum += Number(score);
                      categoryTotals[category].count += 1;
                      categoryScores[category][critName] = Number(score);
                    });
                    
                    const isExpanded = expandedEvals.has(evaluation.id);
                    
                    return (
                      <div key={evaluation.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                        <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-indigo-100 dark:bg-cyan-900/30 text-indigo-600 dark:text-cyan-400 p-2 rounded-xl dark:border dark:border-cyan-800 dark:[box-shadow:0_0_10px_rgba(6,182,212,0.3)]">
                              <Star size={20} />
                            </div>
                            <div>
                              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Evaluation Date</div>
                              <div className="text-lg font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">{new Date(evaluation.evaluation_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => toggleEvalExpand(evaluation.id)}
                              className="px-3 py-1.5 flex items-center gap-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              {isExpanded ? (
                                <><ChevronUp size={16} /> Hide Details</>
                              ) : (
                                <><ChevronDown size={16} /> View Details</>
                              )}
                            </button>
                            <button 
                              onClick={() => openEditEval(evaluation)}
                              className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-cyan-400 hover:bg-indigo-50 dark:hover:bg-cyan-900/30 rounded-lg transition-colors"
                              title="Edit Evaluation"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button 
                              onClick={() => handleDeleteEval(evaluation.id)}
                              className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                              title="Delete Evaluation"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                        <div className="p-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                            {Object.entries(categoryTotals).map(([category, { sum, count }]) => {
                              const avg = count > 0 ? (sum / count) : 0;
                              const percentage = (avg / 5) * 100;
                              
                              let colorClass = "bg-indigo-500 dark:bg-cyan-500 dark:[box-shadow:0_0_10px_#06b6d4]";
                              if (avg >= 4) colorClass = "bg-emerald-500 dark:bg-emerald-500 dark:[box-shadow:0_0_10px_#10b981]";
                              else if (avg >= 3) colorClass = "bg-blue-500 dark:bg-blue-500 dark:[box-shadow:0_0_10px_#3b82f6]";
                              else if (avg < 2) colorClass = "bg-rose-500 dark:bg-rose-500 dark:[box-shadow:0_0_10px_#f43f5e]";
                              else colorClass = "bg-amber-500 dark:bg-amber-500 dark:[box-shadow:0_0_10px_#f59e0b]";
                              
                              return (
                                <div key={category} className="space-y-2">
                                  <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{category}</span>
                                    <div className="flex items-center gap-3">
                                      <PerformanceBadge score={avg} />
                                      <span className="text-lg font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">{avg.toFixed(1)} <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">/ 5</span></span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                                    <div 
                                      className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${colorClass}`}
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                  
                                  {isExpanded && categoryScores[category] && (
                                    <div className="pt-3 pb-1 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                      {Object.entries(categoryScores[category]).map(([crit, cScore]) => (
                                        <div key={crit} className="flex items-center justify-between text-xs">
                                          <span className="text-slate-500 dark:text-slate-400">{crit}</span>
                                          <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map(star => (
                                              <Star 
                                                key={star} 
                                                size={10} 
                                                className={star <= cScore ? "fill-amber-400 text-amber-400 dark:[filter:drop-shadow(0_0_3px_#fbbf24)]" : "fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700"} 
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "idp_log" && (
            <CVIDPLogTab 
              idpsList={idpsList} 
              playerGoals={cvPlayerGoals} 
              journals={cvJournals} 
              trainingLogs={cvTrainingLogs}
            />
          )}
          {/* @ts-ignore */}
          {false && activeTab === "idp_log" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)] flex items-center gap-2">
                      <Target className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" />
                      Individual Development Plan (IDP) Log
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">ประวัติแผนการฝึกซ้อมรายบุคคลทั้งหมด</p>
                  </div>
                </div>
                <div className="p-6">
                  {idpsList.length > 0 ? (
                    <div className="space-y-6">
                      {idpsList.map((idp: any) => (
                        <div key={idp.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden relative bg-white dark:bg-slate-900/50">
                          <div className={`absolute top-0 left-0 w-1.5 h-full ${idp.status === 'Completed' ? 'bg-blue-500 dark:bg-blue-500 dark:[box-shadow:0_0_10px_#3b82f6]' : idp.status === 'Active' ? 'bg-emerald-500 dark:bg-emerald-500 dark:[box-shadow:0_0_10px_#10b981]' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                          <div className="p-5 pl-6 flex flex-col md:flex-row gap-6">
                            <div className="md:w-1/3 space-y-4">
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${idp.status === 'Completed' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : idp.status === 'Active' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{idp.status}</span>
                                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{idp.startDate} - {idp.endDate || 'Present'}</span>
                                </div>
                                <h4 className="text-base font-black text-slate-800 dark:text-slate-200">{idp.goal}</h4>
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Player's Request</div>
                                  <div className="text-sm text-slate-700 dark:text-slate-300">{idp.playerRequest || '-'}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Parent's Request</div>
                                  <div className="text-sm text-slate-700 dark:text-slate-300">{idp.parentRequest || '-'}</div>
                                </div>
                              </div>
                            </div>
                            <div className="md:w-2/3 space-y-4 md:border-l md:border-slate-100 dark:md:border-slate-800 md:pl-6">
                              <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-300 mb-1 flex items-center gap-1.5"><Activity size={14} className="text-indigo-500 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_3px_#22d3ee)]"/> Training Process</div>
                                <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl whitespace-pre-wrap">{idp.process || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-300 mb-1 flex items-center gap-1.5"><Target size={14} className="text-indigo-500 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_3px_#22d3ee)]"/> Real-world Application</div>
                                <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl whitespace-pre-wrap">{idp.applicationNote || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-300 mb-1 flex items-center gap-1.5"><CheckCircle size={14} className="text-emerald-500 dark:text-emerald-400 dark:[filter:drop-shadow(0_0_3px_#34d399)]"/> Final Evaluation</div>
                                <div className="text-sm text-slate-600 dark:text-slate-300 bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-xl whitespace-pre-wrap">{idp.evaluation || '-'}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Target className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={48} />
                      <h4 className="text-lg font-bold text-slate-700 dark:text-slate-400">ไม่มีประวัติ IDP</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">นักกีฬาคนนี้ยังไม่เคยมีแผนพัฒนารายบุคคล</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "career" && <CVCareerTab player={player} localPlayer={localPlayer} careerStatsLoading={careerStatsLoading} careerStats={careerStats} playedUpMatches={playedUpMatches} hasPermission={hasPermission} handleEditScore={handleEditScore} handleDeleteMatch={handleDeleteMatch} settings={settings} setIsAddingAcademy={setIsAddingAcademy} setIsAddingAward={setIsAddingAward} />}
          {/* @ts-ignore */}
          {false && activeTab === "career" && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <Trophy className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={28} />
                <h2 className="text-2xl font-black text-slate-800 tracking-tight dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">Career Profile</h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Played Up History */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <Trophy className="text-amber-500" size={24} />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400">Match History & Played Up</h3>
                  </div>
                  
                  <div className="space-y-4">
                    {careerStatsLoading ? (
                      <div className="flex items-center justify-center py-6 text-slate-400">Loading match statistics...</div>
                    ) : careerStats && careerStats.totalMatches > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                          <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Matches</span>
                          <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{careerStats.totalMatches}</span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                          <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Goals</span>
                          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{careerStats.totalGoals}</span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                          <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Assists</span>
                          <span className="text-2xl font-black text-sky-600 dark:text-sky-400">{careerStats.totalAssists}</span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                          <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Avg Rating</span>
                          <span className="text-2xl font-black text-amber-500">{careerStats.averageRating > 0 ? careerStats.averageRating : "-"}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Played Up Matches</span>
                        <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">{playedUpMatches.length}</span>
                      </div>
                    )}
                    
                    {playedUpMatches.length > 0 ? (
                      <div className="space-y-4 mt-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {playedUpMatches.map(m => {
                          const matchPlayer = (m.playersData && m.playersData[player.id]) 
                            || m.players?.find((p: any) => p.id === player.id) 
                            || m.guestPlayers?.find((gp: any) => gp.id === player.id);
                          
                          // Compatibility mapping for V3 vs old format
                          const rating = matchPlayer?.rating || "0";
                          const note = matchPlayer?.playerVisibleNote || matchPlayer?.note || "";
                          const goals = matchPlayer?.goals || matchPlayer?.metrics?.goals || "0";
                          const assists = matchPlayer?.assists || matchPlayer?.metrics?.assists || "0";
                          const minutes = matchPlayer?.minutesPlayed || matchPlayer?.metrics?.minutes || "0";
                          const isGuest = matchPlayer?.isGuest || m.guestPlayers?.some((gp: any) => gp.id === player.id);
                          
                          // Convert V3 flat stats to metrics for UI compatibility
                          const displayMetrics = matchPlayer?.metrics || {
                            goals, assists, minutes,
                            shotsOnTarget: matchPlayer?.shotsOnTarget || "0",
                            passAccuracy: matchPlayer?.passAccuracy || "0",
                            saves: matchPlayer?.saves || "0"
                          };
                          return (
                          <div key={m.id} className="flex flex-col p-4 border border-slate-100 dark:border-slate-700/50 rounded-xl bg-white dark:bg-slate-800/30 hover:border-indigo-200 transition-colors">
                             <div className="flex justify-between items-start">
                               <div>
                                 <div className="font-bold text-slate-800 dark:text-slate-200 text-sm flex flex-wrap items-center gap-2">
                                   {m.matchType || 'Match'} vs {m.opponentName || 'Opponent'}
                                   <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                                     Played in {m.ageGroup}
                                   </span>
                                 </div>
                                 <div className="text-xs text-slate-500 mt-1">{m.matchDate}</div>
                               </div>
                               <div className="flex items-center gap-2">
                                 <div className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
                                   {m.ourScore || "0"} - {m.opponentScore || "0"}
                                 </div>
                                 {(hasPermission(["COACH", "ADMIN", "SUPERADMIN"])) && (
                                   <div className="flex items-center gap-1">
                                     <button
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         handleEditScore(m.id, m.ourScore, m.opponentScore);
                                       }}
                                       className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors"
                                       title="Edit Score"
                                     >
                                       <Edit2 size={16} />
                                     </button>
                                     <button
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         handleDeleteMatch(m.id);
                                       }}
                                       className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                       title="Delete Match Record"
                                     >
                                       <Trash2 size={16} />
                                     </button>
                                   </div>
                                 )}
                               </div>
                             </div>
                             
                             {matchPlayer && (
                               <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                                 <div className="flex justify-between items-center mb-2">
                                   <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Coach Rating</span>
                                   <span className="text-base font-black text-indigo-600 dark:text-indigo-400">{rating || '-'}</span>
                                 </div>
                                 {displayMetrics && Object.keys(displayMetrics).length > 0 && (
                                   <div className="grid grid-cols-2 gap-2 mt-2">
                                      {Object.entries(displayMetrics).map(([key, val]) => {
                                        const metricDef = settings?.performanceMetrics?.find((sm: any) => sm.id === key);
                                        const metricName = metricDef ? metricDef.name : key;
                                        return (
                                          <div key={key} className="text-xs flex justify-between bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                            <span className="text-slate-500 dark:text-slate-400 truncate max-w-[100px]">{metricName}</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-300">{val as React.ReactNode}</span>
                                          </div>
                                        );
                                      })}
                                   </div>
                                 )}
                                 {note && (
                                   <div className="mt-3 text-xs bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300 p-2.5 rounded-lg flex gap-2">
                                      <MessageSquare size={14} className="shrink-0 mt-0.5 opacity-70" />
                                      <span className="leading-relaxed">{note}</span>
                                   </div>
                                 )}
                               </div>
                             )}
                          </div>
                        )})}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-sm text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">No played up history found.</div>
                    )}
                  </div>
                </div>

                {/* Academy History */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <History className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={24} />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">Academy History</h3>
                    </div>
                    <button 
                      onClick={() => setIsAddingAcademy(true)}
                      className="text-xs font-bold bg-indigo-50 dark:bg-cyan-900/30 text-indigo-600 dark:text-cyan-400 px-3 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-cyan-900/50 transition-colors dark:border dark:border-cyan-800"
                    >
                      + Add
                    </button>
                  </div>
                  
                  {localPlayer.academy_history && localPlayer.academy_history.length > 0 ? (
                    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-slate-700 before:to-transparent">
                      {localPlayer.academy_history.map((academy: any, index: number) => (
                        <div key={academy.id || index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-slate-900 bg-indigo-600 dark:bg-cyan-600 text-slate-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 dark:[box-shadow:0_0_10px_rgba(6,182,212,0.5)]">
                            <MapPin size={16} />
                          </div>
                          <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm z-10">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{academy.name}</h4>
                              <span className="text-xs font-bold text-indigo-600 dark:text-cyan-400 bg-indigo-50 dark:bg-cyan-900/30 px-2 py-0.5 rounded-full">{academy.startYear} - {academy.endYear || "Present"}</span>
                            </div>
                            {academy.achievements && (
                              <p className="text-slate-500 dark:text-slate-400 text-xs">{academy.achievements}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">No academy history added yet.</div>
                  )}
                </div>

                {/* Achievements */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Award className="text-indigo-600 dark:text-amber-400 dark:[filter:drop-shadow(0_0_8px_rgba(251,191,36,0.8))]" size={24} />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-amber-400 dark:[text-shadow:0_0_8px_rgba(251,191,36,0.6)]">Achievements & Awards</h3>
                    </div>
                    <button 
                      onClick={() => setIsAddingAward(true)}
                      className="text-xs font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors dark:border dark:border-amber-800"
                    >
                      + Add
                    </button>
                  </div>
                  
                  {localPlayer.personal_awards && localPlayer.personal_awards.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                      {localPlayer.personal_awards.map((award: any, index: number) => (
                        <div key={award.id || index} className="flex items-start gap-4 p-4 rounded-xl border border-amber-100 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10">
                          <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 p-3 rounded-full shrink-0 dark:border dark:border-amber-800 dark:[box-shadow:0_0_10px_rgba(251,191,36,0.3)]">
                            <Trophy size={20} />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{award.title}</h4>
                            <div className="text-xs text-amber-600 dark:text-amber-500 font-medium mb-1">{award.year} {award.tournament && `• ${award.tournament}`}</div>
                            {award.description && (
                              <p className="text-slate-500 dark:text-slate-400 text-xs">{award.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">No awards added yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "training" && <CVTrainingTab player={player} />}
          {/* @ts-ignore */}
          {false && activeTab === "training" && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <Calendar className="text-indigo-600" size={28} />
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Training Log & Attendance</h2>
              </div>
              
              <PlayerTrainingDashboard playerId={player.id} />
            </div>
          )}

          {activeTab === "bio" && <CVBioTab selectedLogDate={selectedLogDate} setSelectedLogDate={setSelectedLogDate} handleOpenAddDailyLog={handleOpenAddDailyLog} currentDailyLog={currentDailyLog} dailyLogs={dailyLogs} handleDeleteDailyLog={handleDeleteDailyLog} />}
          {/* @ts-ignore */}
          {false && activeTab === "bio" && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <Utensils className="text-indigo-600 dark:text-purple-400 dark:[filter:drop-shadow(0_0_8px_rgba(192,132,252,0.8))]" size={28} />
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight dark:text-purple-400 dark:[text-shadow:0_0_8px_rgba(192,132,252,0.6)]">Nutrition & Lifestyle</h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-sm text-sm font-bold text-slate-700 dark:text-slate-300">
                    <span className="text-xs text-slate-400 dark:text-slate-500">เลือกวันที่:</span>
                    <ThaiDatePicker
                      value={selectedLogDate}
                      onChange={(e) => setSelectedLogDate(e.target.value)}
                      className="outline-none border-none text-slate-700 dark:text-slate-300 font-extrabold cursor-pointer bg-transparent"
                    />
                  </div>
                  <button
                    onClick={handleOpenAddDailyLog}
                    className="px-4 py-2 bg-indigo-600 dark:bg-purple-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 dark:hover:bg-purple-500 transition shadow-sm flex items-center gap-1.5 whitespace-nowrap dark:[box-shadow:0_0_10px_rgba(168,85,247,0.5)]"
                  >
                    <Utensils size={14} /> บันทึกโภชนาการวันนี้
                  </button>
                </div>
              </div>

              {/* 1. Daily Nutrition & Lifestyle Cards (Filtered by selectedLogDate) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Breakfast Card */}
                <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/30 dark:to-amber-900/10 border border-amber-200/60 dark:border-amber-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px] dark:[box-shadow:0_0_15px_rgba(251,191,36,0.1)]">
                  <div className="absolute -right-3 -top-3 text-amber-500/10 dark:text-amber-500/5">
                    <Sun size={80} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 dark:[text-shadow:0_0_5px_rgba(251,191,36,0.5)] font-bold text-sm mb-3">
                      <Sun size={18} className="text-amber-600 dark:text-amber-400 dark:[filter:drop-shadow(0_0_5px_rgba(251,191,36,0.8))]" />
                      มื้อเช้า (Breakfast)
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 font-extrabold text-base min-h-[40px]">
                      {currentDailyLog?.breakfast || "ไม่ได้บันทึก"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-4">
                    {currentDailyLog?.breakfastNutrients?.includes("protein") && <span className="px-2 py-0.5 bg-white dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-full">🥚 โปรตีน</span>}
                    {currentDailyLog?.breakfastNutrients?.includes("carb") && <span className="px-2 py-0.5 bg-white dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-full">🌾 คาร์บ</span>}
                    {currentDailyLog?.breakfastNutrients?.includes("vitamin") && <span className="px-2 py-0.5 bg-white dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-full">🥗 วิตามิน</span>}
                  </div>
                </div>

                {/* Lunch Card */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-900/30 dark:to-orange-900/10 border border-orange-200/60 dark:border-orange-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px] dark:[box-shadow:0_0_15px_rgba(249,115,22,0.1)]">
                  <div className="absolute -right-3 -top-3 text-orange-500/10 dark:text-orange-500/5">
                    <Utensils size={80} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-orange-800 dark:text-orange-400 dark:[text-shadow:0_0_5px_rgba(249,115,22,0.5)] font-bold text-sm mb-3">
                      <Utensils size={18} className="text-orange-600 dark:text-orange-400 dark:[filter:drop-shadow(0_0_5px_rgba(249,115,22,0.8))]" />
                      มื้อกลางวัน (Lunch)
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 font-extrabold text-base min-h-[40px]">
                      {currentDailyLog?.lunch || "ไม่ได้บันทึก"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-4">
                    {currentDailyLog?.lunchNutrients?.includes("protein") && <span className="px-2 py-0.5 bg-white dark:bg-orange-900/50 border border-orange-200 dark:border-orange-700 text-orange-800 dark:text-orange-300 text-[10px] font-bold rounded-full">🥚 โปรตีน</span>}
                    {currentDailyLog?.lunchNutrients?.includes("carb") && <span className="px-2 py-0.5 bg-white dark:bg-orange-900/50 border border-orange-200 dark:border-orange-700 text-orange-800 dark:text-orange-300 text-[10px] font-bold rounded-full">🌾 คาร์บ</span>}
                    {currentDailyLog?.lunchNutrients?.includes("vitamin") && <span className="px-2 py-0.5 bg-white dark:bg-orange-900/50 border border-orange-200 dark:border-orange-700 text-orange-800 dark:text-orange-300 text-[10px] font-bold rounded-full">🥗 วิตามิน</span>}
                  </div>
                </div>

                {/* Dinner Card */}
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-900/30 dark:to-indigo-900/10 border border-indigo-200/60 dark:border-indigo-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px] dark:[box-shadow:0_0_15px_rgba(99,102,241,0.1)]">
                  <div className="absolute -right-3 -top-3 text-indigo-500/10 dark:text-indigo-500/5">
                    <Moon size={80} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-400 dark:[text-shadow:0_0_5px_rgba(99,102,241,0.5)] font-bold text-sm mb-3">
                      <Moon size={18} className="text-indigo-600 dark:text-indigo-400 dark:[filter:drop-shadow(0_0_5px_rgba(99,102,241,0.8))]" />
                      มื้อเย็น (Dinner)
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 font-extrabold text-base min-h-[40px]">
                      {currentDailyLog?.dinner || "ไม่ได้บันทึก"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-4">
                    {currentDailyLog?.dinnerNutrients?.includes("protein") && <span className="px-2 py-0.5 bg-white dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold rounded-full">🥚 โปรตีน</span>}
                    {currentDailyLog?.dinnerNutrients?.includes("carb") && <span className="px-2 py-0.5 bg-white dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold rounded-full">🌾 คาร์บ</span>}
                    {currentDailyLog?.dinnerNutrients?.includes("vitamin") && <span className="px-2 py-0.5 bg-white dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold rounded-full">🥗 วิตามิน</span>}
                  </div>
                </div>

                {/* Hydration & Sleep Card */}
                <div className="bg-gradient-to-br from-sky-50 to-sky-100/50 dark:from-sky-900/30 dark:to-sky-900/10 border border-sky-200/60 dark:border-sky-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px] dark:[box-shadow:0_0_15px_rgba(14,165,233,0.1)]">
                  <div className="absolute -right-3 -top-3 text-sky-500/10 dark:text-sky-500/5">
                    <Droplet size={80} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sky-800 dark:text-sky-400 dark:[text-shadow:0_0_5px_rgba(14,165,233,0.5)] font-bold text-sm mb-3">
                      <Droplet size={18} className="text-sky-600 dark:text-sky-400 dark:[filter:drop-shadow(0_0_5px_rgba(14,165,233,0.8))]" />
                      น้ำดื่ม & การนอน
                    </div>
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span>💧 ดื่มน้ำ:</span>
                        <span className="dark:text-sky-300">{currentDailyLog?.hydration || "0"} แก้ว</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span>💤 การนอน:</span>
                        <span className="dark:text-sky-300">{currentDailyLog?.sleep || "0"} ชั่วโมง</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wider mt-4">
                    วันที่แสดง: {selectedLogDate}
                  </div>
                </div>
              </div>



              {/* 3. Daily Logs History List */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">ประวัติการบันทึกอาหารย้อนหลัง (Food & Lifestyle Log)</h3>
                </div>
                {dailyLogs.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 dark:text-slate-500 text-sm">
                    ไม่มีประวัติการบันทึกโภชนาการ
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {dailyLogs.map((log) => (
                      <div key={log.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-indigo-100 dark:bg-purple-900/30 text-indigo-600 dark:text-purple-400 p-2.5 rounded-xl shrink-0 dark:border dark:border-purple-800 dark:[box-shadow:0_0_10px_rgba(168,85,247,0.3)]">
                              <Calendar size={18} />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-400 dark:text-slate-500">วันที่บันทึก</div>
                              <div className="text-sm font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                {log.date}
                                {log.isMatchDay && <span className="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-[10px] px-1.5 py-0.5 rounded-md font-bold dark:border dark:border-rose-800">Match Day</span>}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-bold text-slate-400 dark:text-slate-500">รายการอาหาร</div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium leading-relaxed">
                              🍳 เช้า: {log.breakfast || "-"}<br />
                              🍜 กลางวัน: {log.lunch || "-"}<br />
                              {log.isMatchDay && (
                                <>⚽ ของว่าง: {log.snacks || "-"}<br /></>
                              )}
                              🌙 เย็น: {log.dinner || "-"}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-bold text-slate-400 dark:text-slate-500">กลุ่มสารอาหารที่ได้รับ</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(log.breakfastNutrients?.includes("protein") || log.lunchNutrients?.includes("protein") || log.dinnerNutrients?.includes("protein")) && <span className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded dark:border dark:border-emerald-800">🥚 โปรตีน</span>}
                              {(log.breakfastNutrients?.includes("carb") || log.lunchNutrients?.includes("carb") || log.dinnerNutrients?.includes("carb")) && <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded dark:border dark:border-amber-800">🌾 คาร์บ</span>}
                              {(log.breakfastNutrients?.includes("vitamin") || log.lunchNutrients?.includes("vitamin") || log.dinnerNutrients?.includes("vitamin")) && <span className="px-1.5 py-0.5 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 text-[10px] font-bold rounded dark:border dark:border-sky-800">🥗 วิตามิน</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div>
                              <div className="text-xs font-bold text-slate-400 dark:text-slate-500">💧 น้ำดื่ม</div>
                              <div className="text-sm font-extrabold text-slate-700 dark:text-sky-400">{log.hydration || "0"} แก้ว</div>
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-400 dark:text-slate-500">💤 การนอน</div>
                              <div className="text-sm font-extrabold text-slate-700 dark:text-sky-400">{log.sleep || "8"} ชม.</div>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteDailyLog(log.id)}
                          className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors self-end md:self-auto"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Modals */}
          {isAddingAcademy && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-800">Add Academy History</h3>
                  <button onClick={() => setIsAddingAcademy(false)} className="text-slate-400 hover:text-slate-600">
                    <XCircle size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Academy Name *</label>
                    <input type="text" value={newAcademy.name} onChange={e => setNewAcademy({...newAcademy, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" placeholder="e.g. Futverse Academy" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Start Year *</label>
                      <input type="text" value={newAcademy.startYear} onChange={e => setNewAcademy({...newAcademy, startYear: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" placeholder="e.g. 2021" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">End Year</label>
                      <input type="text" value={newAcademy.endYear} onChange={e => setNewAcademy({...newAcademy, endYear: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" placeholder="Leave blank if Present" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Achievements / Details</label>
                    <textarea value={newAcademy.achievements} onChange={e => setNewAcademy({...newAcademy, achievements: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 h-20 resize-none" placeholder="Key developments, notes..."></textarea>
                  </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                  <button onClick={() => setIsAddingAcademy(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                  <button onClick={handleSaveAcademy} disabled={!newAcademy.name || !newAcademy.startYear || isSaving} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50">{isSaving ? "Saving..." : "Save"}</button>
                </div>
              </div>
            </div>
          )}

          {isAddingAward && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-800">Add Personal Award</h3>
                  <button onClick={() => setIsAddingAward(false)} className="text-slate-400 hover:text-slate-600">
                    <XCircle size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Award Title *</label>
                    <input type="text" value={newAward.title} onChange={e => setNewAward({...newAward, title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" placeholder="e.g. Player of the Month" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Year / Date *</label>
                      <input type="text" value={newAward.year} onChange={e => setNewAward({...newAward, year: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" placeholder="e.g. 2024" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tournament</label>
                      <input type="text" value={newAward.tournament} onChange={e => setNewAward({...newAward, tournament: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" placeholder="Optional" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                    <textarea value={newAward.description} onChange={e => setNewAward({...newAward, description: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 h-20 resize-none" placeholder="Reason for award..."></textarea>
                  </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                  <button onClick={() => setIsAddingAward(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                  <button onClick={handleSaveAward} disabled={!newAward.title || !newAward.year || isSaving} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50">{isSaving ? "Saving..." : "Save"}</button>
                </div>
              </div>
            </div>
          )}

          {isAddingGrowth && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-800">บันทึกสถิติร่างกาย (Log Growth)</h3>
                  <button onClick={() => setIsAddingGrowth(false)} className="text-slate-400 hover:text-slate-600">
                    <XCircle size={20} />
                  </button>
                </div>
                <form onSubmit={handleSaveGrowth}>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">วันที่บันทึก *</label>
                      <ThaiDatePicker
                        required
                        value={newGrowth.date}
                        onChange={e => setNewGrowth({ ...newGrowth, date: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus-within:border-indigo-500 font-bold"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">ส่วนสูง (cm) *</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="เช่น 165"
                          value={newGrowth.height}
                          onChange={e => setNewGrowth({ ...newGrowth, height: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">น้ำหนัก (kg) *</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="เช่น 55"
                          value={newGrowth.weight}
                          onChange={e => setNewGrowth({ ...newGrowth, weight: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                          required
                        />
                      </div>
                    </div>

                    {newGrowth.height && newGrowth.weight && (
                      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between text-indigo-900">
                        <div>
                          <div className="text-xs font-bold text-indigo-500">ดัชนีมวลกายที่คำนวณได้</div>
                          <div className="text-xl font-black mt-1">
                            BMI: {(Number(newGrowth.weight) / Math.pow(Number(newGrowth.height) / 100, 2)).toFixed(1)}
                          </div>
                        </div>
                        <div className="text-xs font-bold px-3 py-1 bg-indigo-200/50 rounded-full">
                          {(() => {
                            const bmi = Number(newGrowth.weight) / Math.pow(Number(newGrowth.height) / 100, 2);
                            if (bmi < 18.5) return "ผอม (Underweight)";
                            if (bmi < 23) return "สมส่วน (Normal)";
                            if (bmi < 25) return "น้ำหนักเกิน (Overweight)";
                            return "อ้วน (Obese)";
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setIsAddingGrowth(false)}
                      className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {isAddingDailyLog && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Utensils size={18} className="text-indigo-600" /> บันทึกโภชนาการประจำวัน (Daily Log)
                  </h3>
                  <button onClick={() => setIsAddingDailyLog(false)} className="text-slate-400 hover:text-slate-600">
                    <XCircle size={20} />
                  </button>
                </div>
                <form onSubmit={handleSaveDailyLog} className="p-6 overflow-y-auto space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">วันที่บันทึก *</label>
                    <ThaiDatePicker
                      required
                      value={newDailyLog.date}
                      onChange={e => setNewDailyLog({ ...newDailyLog, date: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus-within:border-indigo-500 font-bold"
                    />
                  </div>

                  {/* Breakfast Section */}
                  <div className="bg-amber-50/30 p-4 rounded-xl border border-amber-100">
                    <label className="block text-xs font-bold text-amber-800 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                      <Sun size={14} /> มื้อเช้า (Breakfast)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น ข้าวต้มหมูใส่ไข่"
                      value={newDailyLog.breakfast}
                      onChange={e => setNewDailyLog({ ...newDailyLog, breakfast: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold mb-3"
                    />
                    <div className="flex gap-4">
                      {["protein", "carb", "vitamin"].map(nutrient => (
                        <label key={nutrient} className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newDailyLog.breakfastNutrients.includes(nutrient)}
                            onChange={() => {
                              const isSelected = newDailyLog.breakfastNutrients.includes(nutrient);
                              setNewDailyLog({
                                ...newDailyLog,
                                breakfastNutrients: isSelected
                                  ? newDailyLog.breakfastNutrients.filter(n => n !== nutrient)
                                  : [...newDailyLog.breakfastNutrients, nutrient]
                              });
                            }}
                            className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                          />
                          <span>{nutrient === "protein" ? "🥚 โปรตีน" : nutrient === "carb" ? "🌾 คาร์บ" : "🥗 วิตามิน"}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Lunch Section */}
                  <div className="bg-orange-50/30 p-4 rounded-xl border border-orange-100">
                    <label className="block text-xs font-bold text-orange-800 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                      <Utensils size={14} /> มื้อกลางวัน (Lunch)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น ข้าวกะเพราไก่ไข่ดาว"
                      value={newDailyLog.lunch}
                      onChange={e => setNewDailyLog({ ...newDailyLog, lunch: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold mb-3"
                    />
                    <div className="flex gap-4">
                      {["protein", "carb", "vitamin"].map(nutrient => (
                        <label key={nutrient} className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newDailyLog.lunchNutrients.includes(nutrient)}
                            onChange={() => {
                              const isSelected = newDailyLog.lunchNutrients.includes(nutrient);
                              setNewDailyLog({
                                ...newDailyLog,
                                lunchNutrients: isSelected
                                  ? newDailyLog.lunchNutrients.filter(n => n !== nutrient)
                                  : [...newDailyLog.lunchNutrients, nutrient]
                              });
                            }}
                            className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                          />
                          <span>{nutrient === "protein" ? "🥚 โปรตีน" : nutrient === "carb" ? "🌾 คาร์บ" : "🥗 วิตามิน"}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Dinner Section */}
                  <div className="bg-indigo-50/30 p-4 rounded-xl border border-indigo-100">
                    <label className="block text-xs font-bold text-indigo-800 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                      <Moon size={14} /> มื้อเย็น (Dinner)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น สลัดอกไก่ย่าง"
                      value={newDailyLog.dinner}
                      onChange={e => setNewDailyLog({ ...newDailyLog, dinner: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold mb-3"
                    />
                    <div className="flex gap-4">
                      {["protein", "carb", "vitamin"].map(nutrient => (
                        <label key={nutrient} className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newDailyLog.dinnerNutrients.includes(nutrient)}
                            onChange={() => {
                              const isSelected = newDailyLog.dinnerNutrients.includes(nutrient);
                              setNewDailyLog({
                                ...newDailyLog,
                                dinnerNutrients: isSelected
                                  ? newDailyLog.dinnerNutrients.filter(n => n !== nutrient)
                                  : [...newDailyLog.dinnerNutrients, nutrient]
                              });
                            }}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          />
                          <span>{nutrient === "protein" ? "🥚 โปรตีน" : nutrient === "carb" ? "🌾 คาร์บ" : "🥗 วิตามิน"}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Vitals Section */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <Droplet size={14} className="text-sky-600" /> ดื่มน้ำ (แก้ว)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={newDailyLog.hydration}
                        onChange={e => setNewDailyLog({ ...newDailyLog, hydration: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <Bed size={14} className="text-purple-600" /> การนอน (ชั่วโมง)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="24"
                        value={newDailyLog.sleep}
                        onChange={e => setNewDailyLog({ ...newDailyLog, sleep: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                        required
                      />
                    </div>
                  </div>

                  <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsAddingDailyLog(false)}
                      className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {isEditingBio && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <FileText size={18} className="text-indigo-600" /> แก้ไขข้อมูลประวัติ & ข้อมูลติดต่อ
                  </h3>
                  <button onClick={() => setIsEditingBio(false)} className="text-slate-400 hover:text-slate-600">
                    <XCircle size={20} />
                  </button>
                </div>
                <form onSubmit={handleSaveBio} className="p-6 overflow-y-auto space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">เลขขึ้นทะเบียนสมาคม (FA ID)</label>
                    <input
                      type="text"
                      value={bioForm.faCardId}
                      onChange={e => setBioForm({ ...bioForm, faCardId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                      placeholder="e.g. FA-12345"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">โรงเรียน (School)</label>
                      <input
                        type="text"
                        value={bioForm.school}
                        onChange={e => setBioForm({ ...bioForm, school: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                        placeholder="ชื่อโรงเรียน"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">ชั้นเรียน (Grade)</label>
                      <input
                        type="text"
                        value={bioForm.grade}
                        onChange={e => setBioForm({ ...bioForm, grade: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                        placeholder="เช่น ม.3"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">วันที่เข้าร่วม (Joined Date) *</label>
                        <ThaiDatePicker
                          required
                          value={bioForm.joinedDate}
                          onChange={e => setBioForm({ ...bioForm, joinedDate: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus-within:border-indigo-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">สถานะนักเตะ (Status)</label>
                        <select
                          value={bioForm.status}
                          onChange={e => setBioForm({ ...bioForm, status: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                        >
                          <option value="ACTIVE">Active (กำลังอยู่)</option>
                          <option value="LEFT">Left (ย้ายออกแล้ว)</option>
                        </select>
                      </div>
                    </div>

                    {bioForm.status === "LEFT" && (
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">วันที่ย้ายออก (Left Date) *</label>
                        <ThaiDatePicker
                          required
                          value={bioForm.leftDate}
                          onChange={e => setBioForm({ ...bioForm, leftDate: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus-within:border-indigo-500 font-bold"
                        />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อผู้ปกครอง (Parent Name)</label>
                      <input
                        type="text"
                        value={bioForm.parentName}
                        onChange={e => setBioForm({ ...bioForm, parentName: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                        placeholder="ชื่อผู้ปกครอง"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">เบอร์โทรศัพท์ผู้ปกครอง (Phone)</label>
                        <input
                          type="text"
                          value={bioForm.parentPhone}
                          onChange={e => setBioForm({ ...bioForm, parentPhone: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                          placeholder="08x-xxx-xxxx"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">LINE ID ผู้ปกครอง</label>
                        <input
                          type="text"
                          value={bioForm.parentLineId}
                          onChange={e => setBioForm({ ...bioForm, parentLineId: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-bold"
                          placeholder="LINE ID"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsEditingBio(false)}
                      className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {editingEvalId && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Edit2 size={18} className="text-indigo-600" /> แก้ไขผลประเมิน (Edit Evaluation)
                  </h3>
                  <button onClick={() => setEditingEvalId(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle size={20} />
                  </button>
                </div>
                <form onSubmit={handleSaveEvalEdit} className="p-6 overflow-y-auto bg-slate-50">
                  <div className="space-y-6">
                    {Object.entries(
                      Object.keys(evalFormScores).reduce((acc, critName) => {
                        const category = criteriaMapping[critName] || "Uncategorized";
                        if (!acc[category]) acc[category] = [];
                        acc[category].push(critName);
                        return acc;
                      }, {} as Record<string, string[]>)
                    ).map(([category, critNames]) => (
                      <div key={category} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-3">
                          <h3 className="font-black text-slate-800 text-lg">{category}</h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {critNames.map((critName) => (
                            <div key={critName} className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                              <div className="flex-1">
                                <h4 className="font-bold text-slate-800">{critName}</h4>
                              </div>
                              <div className="flex items-center gap-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => setEvalFormScores(prev => ({ ...prev, [critName]: star }))}
                                    className="p-1 focus:outline-none transition-transform hover:scale-110"
                                  >
                                    <Star
                                      size={28}
                                      className={
                                        star <= (evalFormScores[critName] || 0)
                                          ? "fill-amber-400 text-amber-400"
                                          : "fill-slate-100 text-slate-200"
                                      }
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-8 flex justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingEvalId(null)}
                      className="px-6 py-3 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-8 py-3 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-50"
                    >
                      {isSaving ? "กำลังบันทึก..." : "บันทึกผลประเมิน"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {activeTab === "daily_log" && <CVDailyLogTab isSelfView={isSelfView}>{children}</CVDailyLogTab>}
          {/* @ts-ignore */}
          {false && activeTab === "daily_log" && isSelfView && (
            <div className="max-w-5xl mx-auto py-8 space-y-6">
              {children || (
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8">
                  <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-6">Daily Wellness & Nutrition</h2>
                  <p className="text-slate-500 mb-8">
                    คุณสามารถเพิ่มบันทึกโภชนาการและสภาพร่างกายได้ที่นี่
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
