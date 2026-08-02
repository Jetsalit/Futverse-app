import React, { useState, useMemo, useEffect } from "react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import {
  Plus,
  Search,
  Filter,
  X,
  Upload,
  Calendar,
  ChevronDown,
  ChevronLeft,
  Edit2,
  Trash2,
  Users,
  Bell,
  Send,
  Activity
} from "lucide-react";
import YouthDevelopmentReport from "./YouthDevelopmentReport";
import { db } from "../lib/firebase";
import { createNotification, NotificationType } from "../lib/notifications";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
  writeBatch,
  runTransaction,
  increment,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import Papa from "papaparse";
import { useAcademy } from "../contexts/AcademyContext";
import { useAuth } from "../contexts/AuthContext";
import { useActivityLogger } from "../hooks/useActivityLogger";
import { EmptyState } from "./common/EmptyState";
import { generateFutId } from "../lib/utils";

interface Player {
  id: string;
  futId?: string;
  linkedUserId?: string;
  firstName: string;
  lastName: string;
  position: string;
  ageGroup: string;
  dob: string;
  age: number;
  fitness_status: string;
  avatar: string;
  joinedDate?: string;
  leftDate?: string;
  status?: string;
  seasonHistory?: Record<string, { squad: string; active: boolean; jerseyNumber?: string }>;
}

const calculateDaysInAcademy = (joinedStr?: string, leftStr?: string) => {
  if (!joinedStr) return null;
  const start = new Date(joinedStr);
  start.setHours(0, 0, 0, 0);
  const end = leftStr ? new Date(leftStr) : new Date();
  end.setHours(0, 0, 0, 0);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays) + 1;
};

export default function YouthPlayerManager({
  onBack,
  onSelectPlayer,
  onNavigate,
}: {
  onBack: () => void;
  onSelectPlayer?: (player: any) => void;
  onNavigate?: (page: string) => void;
}) {
  const { settings, getAcademyCollection, activeSeason } = useAcademy();
  const { currentUser, hasPermission } = useAuth();
  const { logActivity } = useActivityLogger();
  const isCoachOrAdmin = hasPermission(["ADMIN", "COACH", "SUPERADMIN"]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterAge, setFilterAge] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [reportPlayer, setReportPlayer] = useState<any>(null);
  const [actionSheetPlayer, setActionSheetPlayer] = useState<any>(null);

  // Bulk Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);

  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"players" | "claims">("players");

  // Notification Modal State
  const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
  const [notifData, setNotifData] = useState({
    recipientId: "",
    type: "Coach" as NotificationType,
    title: "",
    message: ""
  });

  // Rollover State
  const [isRolloverModalOpen, setIsRolloverModalOpen] = useState(false);
  const [rolloverTargetSeason, setRolloverTargetSeason] = useState("");
  const [isRollingOver, setIsRollingOver] = useState(false);
  const [isSendingNotif, setIsSendingNotif] = useState(false);

  // Fitness Update State
  const [fitnessUpdatePlayer, setFitnessUpdatePlayer] = useState<any>(null);
  const [newFitnessStatus, setNewFitnessStatus] = useState("Fit");
  const [isUpdatingFitness, setIsUpdatingFitness] = useState(false);

  // Direct Link Parent State
  const [parentEmailToLink, setParentEmailToLink] = useState("");
  const [isLinkingParent, setIsLinkingParent] = useState(false);
  const [linkParentMessage, setLinkParentMessage] = useState({ type: "", text: "" });

  // Form State
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    fitness_status: "Fit",
    position: "CM",
    preferredFoot: "Right",
    ageGroup: settings.squads.length > 0 ? settings.squads[0] : "U15",
    avatarUrl: "",
    joinedDate: new Date().toISOString().split("T")[0],
    leftDate: "",
    status: "ACTIVE",
  });

  const maxLimit = currentUser?.maxPlayers || 200;
  const isAtLimit = players.length >= maxLimit;

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(
      getAcademyCollection("players"),
      (snapshot) => {
        const playersData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Player[];
        setPlayers(playersData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching players:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "profile_claims"), where("status", "==", "PENDING"));
    const unsub = onSnapshot(q, (snapshot) => {
      setPendingClaims(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const handleApproveClaim = async (claim: any) => {
    try {
      if (claim.role === "PARENT") {
        await updateDoc(doc(db, "users", claim.userId), { linkedPlayerId: claim.playerId });
      } else {
        await updateDoc(doc(getAcademyCollection("players"), claim.playerId), { linkedUserId: claim.userId });
      }
      await updateDoc(doc(db, "profile_claims", claim.id), { status: "APPROVED" });
      await createNotification(
        claim.userId,
        "Profile Claim Approved",
        "Your player profile has been successfully linked.",
        "System"
      );
    } catch (error) {
      console.error("Error approving claim", error);
    }
  };

  const handleRejectClaim = async (claimId: string, userId: string) => {
    try {
      await updateDoc(doc(db, "profile_claims", claimId), { status: "REJECTED" });
      await createNotification(
        userId,
        "Profile Claim Rejected",
        "Your player profile claim was rejected. Please contact the coach.",
        "System"
      );
    } catch (error) {
      console.error("Error rejecting claim", error);
    }
  };

  const handleLinkParent = async () => {
    if (!parentEmailToLink.trim() || !editingPlayerId) return;
    setIsLinkingParent(true);
    setLinkParentMessage({ type: "", text: "" });
    try {
      const q = query(collection(db, "users"), where("email", "==", parentEmailToLink.trim()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setLinkParentMessage({ type: "error", text: "ไม่พบผู้ปกครองที่ใช้อีเมลนี้ กรุณาให้ผู้ปกครองสมัครแอปก่อน" });
      } else {
        const parentUser = snap.docs[0];
        await updateDoc(doc(db, "users", parentUser.id), { linkedPlayerId: editingPlayerId });
        await updateDoc(doc(getAcademyCollection("players"), editingPlayerId), { linkedUserId: parentUser.id });
        setLinkParentMessage({ type: "success", text: "ผูกข้อมูลผู้ปกครองสำเร็จ!" });
        setParentEmailToLink("");
      }
    } catch (err) {
      console.error(err);
      setLinkParentMessage({ type: "error", text: "เกิดข้อผิดพลาดในการเชื่อมโยง" });
    } finally {
      setIsLinkingParent(false);
    }
  };

  const calculateAge = (dob: string) => {
    if (!dob) return 0;
    const diff_ms = Date.now() - new Date(dob).getTime();
    const age_dt = new Date(diff_ms);
    return Math.abs(age_dt.getUTCFullYear() - 1970);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_SIZE = 500;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG with 70% quality to ensure it fits in Firestore
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          setFormData((prev) => ({
            ...prev,
            avatarUrl: dataUrl,
          }));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const openAddModal = () => {
    if (!isCoachOrAdmin) return;
    if (isAtLimit) {
      alert(`ไม่สามารถเพิ่มนักกีฬาได้ โควตาของคุณเต็มแล้ว (${players.length}/${maxLimit} คน) กรุณาอัปเกรดแพ็กเกจ`);
      return;
    }
    setEditingPlayerId(null);
    setFormData({
      firstName: "",
      lastName: "",
      dob: "",
      fitness_status: "Fit",
      position: "CM",
      preferredFoot: "Right",
      ageGroup: settings.squads.length > 0 ? settings.squads[0] : "U15",
      avatarUrl: "",
      joinedDate: new Date().toISOString().split("T")[0],
      leftDate: "",
      status: "ACTIVE",
    });
    setIsModalOpen(true);
  };

  const handleEditClick = (player: Player) => {
    if (!isCoachOrAdmin) return;
    setFormData({
      firstName: player.firstName,
      lastName: player.lastName,
      dob: player.dob,
      fitness_status: player.fitness_status || "Fit",
      position: player.position,
      preferredFoot: player.preferredFoot || "Right",
      ageGroup: player.ageGroup,
      avatarUrl: player.avatar,
      joinedDate: player.joinedDate || new Date().toISOString().split("T")[0],
      leftDate: player.leftDate || "",
      status: player.status || "ACTIVE",
    });
    setEditingPlayerId(player.id);
    setParentEmailToLink("");
    setLinkParentMessage({ type: "", text: "" });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPlayerId(null);
    setParentEmailToLink("");
    setLinkParentMessage({ type: "", text: "" });
    setFormData({
      firstName: "",
      lastName: "",
      dob: "",
      fitness_status: "Fit",
      position: "CM",
      preferredFoot: "Right",
      ageGroup: settings.squads.length > 0 ? settings.squads[0] : "U15",
      avatarUrl: "",
      joinedDate: new Date().toISOString().split("T")[0],
      leftDate: "",
      status: "ACTIVE",
    });
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPlayerId) {
        const playerToUpdate = players.find(p => p.id === editingPlayerId);
        const currentSeasonHistory = playerToUpdate?.seasonHistory || {};
        
        await updateDoc(doc(getAcademyCollection("players"), editingPlayerId), {
          firstName: formData.firstName,
          lastName: formData.lastName,
          position: formData.position,
          preferredFoot: formData.preferredFoot,
          ageGroup: formData.ageGroup,
          dob: formData.dob,
          age: calculateAge(formData.dob),
          fitness_status: formData.fitness_status,
          joinedDate: formData.joinedDate,
          leftDate: formData.leftDate,
          status: formData.status,
          seasonHistory: {
            ...currentSeasonHistory,
            [activeSeason]: { squad: formData.ageGroup, active: true }
          },
          ...(formData.avatarUrl ? { avatar: formData.avatarUrl } : {}),
        });
        await logActivity(`แก้ไขข้อมูลนักกีฬา: ${formData.firstName} ${formData.lastName}`);
      } else {
        const futId = await generateFutId();
        await addDoc(getAcademyCollection("players"), {
          futId,
          firstName: formData.firstName,
          lastName: formData.lastName,
          position: formData.position,
          preferredFoot: formData.preferredFoot,
          ageGroup: formData.ageGroup,
          dob: formData.dob,
          age: calculateAge(formData.dob),
          fitness_status: formData.fitness_status,
          avatar: formData.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.firstName}`,
          joinedDate: formData.joinedDate,
          leftDate: formData.leftDate,
          status: formData.status,
          seasonHistory: {
            [activeSeason]: { squad: formData.ageGroup, active: true }
          }
        });
        
        // Track current usage increment safely
        try {
          const subDoc = doc(db, "subscriptions", (currentUser as any)!.uid || (currentUser as any)!.id);
          await setDoc(subDoc, {
            currentUsage: { players: increment(1) }
          }, { merge: true });
        } catch (subErr) {
          console.warn("Could not update subscription usage:", subErr);
        }
        await logActivity(`เพิ่มนักกีฬาใหม่: ${formData.firstName} ${formData.lastName}`);
      }
      closeModal();
    } catch (error) {
      console.error("Error saving player:", error);
      alert("Error saving player.");
    }
  };

  const handleDeletePlayer = async () => {
    if (!playerToDelete) return;
    try {
      await deleteDoc(doc(getAcademyCollection("players"), playerToDelete));
      setPlayerToDelete(null);
    } catch (error) {
      console.error("Error deleting player:", error);
      alert("Error deleting player.");
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingNotif(true);
    try {
      let targetUserIds = new Set<string>();

      if (notifData.recipientId === "all_parents" || notifData.recipientId === "all_players") {
        // Collect linked user IDs from players in the current squad instead of querying users collection directly
        // This avoids Firestore Permission Denied errors for Coaches.
        players.forEach(p => {
          if (p.linkedUserId) {
            targetUserIds.add(p.linkedUserId);
          }
        });
      } else {
        // Specific user
        targetUserIds.add(notifData.recipientId);
      }

      if (targetUserIds.size === 0) {
        alert("ไม่พบผู้รับในระบบ (No valid users found in this squad)");
        setIsSendingNotif(false);
        return;
      }

      const batch = writeBatch(db);
      let count = 0;
      
      targetUserIds.forEach((userId) => {
        const newNotifRef = doc(collection(db, "notifications"));
        batch.set(newNotifRef, {
          userId: userId,
          title: notifData.title,
          message: notifData.message,
          type: notifData.type,
          isRead: false,
          createdAt: serverTimestamp()
        });
        count++;
      });

      if (count > 0) {
        await batch.commit();
      }
      
      const targetLabel = notifData.recipientId === "all_parents" ? "ผู้ปกครอง" : notifData.recipientId === "all_players" ? "นักกีฬา" : "ผู้ใช้งาน";
      alert(`ส่งแจ้งเตือนถึง ${targetLabel} สำเร็จ (${count} คน)`);
      setIsNotifModalOpen(false);
      setNotifData({ recipientId: "", type: "Coach", title: "", message: "" });
    } catch (error) {
      console.error("Error sending notification", error);
      alert("เกิดข้อผิดพลาดในการส่งแจ้งเตือน");
    } finally {
      setIsSendingNotif(false);
    }
  };

  const handleUpdateFitness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fitnessUpdatePlayer) return;
    setIsUpdatingFitness(true);
    try {
      await updateDoc(doc(getAcademyCollection("players"), fitnessUpdatePlayer.id), {
        fitness_status: newFitnessStatus
      });
      await logActivity(`อัปเดตความฟิต ${fitnessUpdatePlayer.firstName} เป็น ${newFitnessStatus}`);
      setFitnessUpdatePlayer(null);
    } catch (error) {
      console.error("Error updating fitness", error);
      alert("เกิดข้อผิดพลาดในการอัปเดตความฟิต");
    } finally {
      setIsUpdatingFitness(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvError(null);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            setCsvError("ข้อผิดพลาดในไฟล์ CSV: " + results.errors[0].message);
            return;
          }
          setCsvData(results.data);
          setIsImportModalOpen(true);
        },
        error: (error) => {
          setCsvError("ไม่สามารถอ่านไฟล์ได้: " + error.message);
        }
      });
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    setIsImportModalOpen(false);
    setLoading(true);
    try {
      if (players.length + csvData.length > maxLimit) {
        throw new Error("QUOTA_FULL");
      }

      const batch = writeBatch(db);
      let count = 0;
      
      for (const row of csvData) {
        if (!row.firstName || !row.lastName) continue;
        
        const futId = await generateFutId();
        const newPlayerRef = doc(getAcademyCollection("players"));
        
        batch.set(newPlayerRef, {
          futId,
          firstName: row.firstName || "",
          lastName: row.lastName || "",
          position: row.position || "CM",
          ageGroup: row.ageGroup || (settings.squads.length > 0 ? settings.squads[0] : "U15"),
          dob: row.dob || "2010-01-01",
          age: calculateAge(row.dob || "2010-01-01"),
          fitness_status: row.fitness_status || "Fit",
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.firstName}`,
          joinedDate: new Date().toISOString().split("T")[0],
          status: "ACTIVE",
          seasonHistory: {
            [activeSeason]: { squad: row.ageGroup || "U15", active: true }
          }
        });
        count++;
      }

      await batch.commit();

      try {
        const subDoc = doc(db, "subscriptions", (currentUser as any)!.uid || (currentUser as any)!.id);
        await setDoc(subDoc, {
          currentUsage: { players: increment(count) }
        }, { merge: true });
      } catch (subErr) {
        console.warn("Could not update subscription usage:", subErr);
      }

      setCsvData([]);
      alert(`นำเข้าผู้เล่นสำเร็จ ${count} คน`);
    } catch (error: any) {
      console.error("Error bulk importing players:", error);
      if (error.message === "QUOTA_FULL") {
        alert("จำนวนนักเตะหลังนำเข้าจะเกินขีดจำกัด โปรดตรวจสอบโควตาที่เหลือ");
      } else {
        alert("เกิดข้อผิดพลาดในการนำเข้าข้อมูล: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,firstName,lastName,position,ageGroup,dob,fitness_status\nJohn,Doe,Striker,U15,2009-01-01,Fit";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "player_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRollover = async () => {
    if (!rolloverTargetSeason) return;
    setIsRollingOver(true);
    try {
      const batch = writeBatch(db);
      let count = 0;
      filteredPlayers.forEach(p => {
        const currentSeasonData = p.seasonHistory?.[activeSeason] || { squad: p.ageGroup, active: true };
        
        const newHistory = {
          ...(p.seasonHistory || {}),
          [rolloverTargetSeason]: currentSeasonData
        };

        const pRef = doc(getAcademyCollection("players"), p.id);
        batch.update(pRef, { seasonHistory: newHistory });
        count++;
      });

      await batch.commit();
      setIsRolloverModalOpen(false);
      setRolloverTargetSeason("");
      alert(`คัดลอกรายชื่อนักเตะ ${count} คนไปยังฤดูกาล ${rolloverTargetSeason} สำเร็จ`);
    } catch (err: any) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการคัดลอกข้อมูล: " + err.message);
    }
    setIsRollingOver(false);
  };

  const filteredPlayers = players.filter((p) => {
    const isSeasonActive = p.seasonHistory?.[activeSeason]?.active 
      || (!p.seasonHistory && activeSeason === (settings.currentSeason || "2026"));

    if (!isSeasonActive) return false;

    const activeSquad = p.seasonHistory?.[activeSeason]?.squad || p.ageGroup;
    const matchAge = filterAge === "All" || activeSquad === filterAge;
    const matchName = `${p.firstName} ${p.lastName}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchAge && matchName;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (reportPlayer) {
    return (
      <YouthDevelopmentReport
        player={reportPlayer}
        onBack={() => setReportPlayer(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 bg-white dark:bg-slate-800 shadow-sm text-slate-600 dark:text-slate-300 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_10px_rgba(34,211,238,0.8)] tracking-tight">
              Youth Academy
            </h1>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              Manage prospect rosters
            </p>
          </div>
        </div>
        <div className="flex flex-col xl:flex-row gap-3 mt-4 sm:mt-0 w-full sm:w-auto overflow-hidden items-center">
          
          <div className="flex flex-col items-end mr-4">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Youth Quota {currentUser?.maxPlayers === 9999 ? "(Unlimited)" : ""}
            </span>
            <div className="flex items-center gap-2">
              <div className="w-24 sm:w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    isAtLimit ? 'bg-rose-500' : (players.length / maxLimit > 0.8 ? 'bg-amber-500' : 'bg-emerald-500')
                  }`}
                  style={{ width: `${Math.min(100, (players.length / maxLimit) * 100)}%` }}
                ></div>
              </div>
              <span className={`text-sm font-black ${isAtLimit ? 'text-rose-600' : 'text-slate-700'}`}>
                {players.length}{currentUser?.maxPlayers !== 9999 ? `/${maxLimit}` : ''}
              </span>
            </div>
          </div>

          {/* Tabs Container */}
          <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab("players")}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 font-bold rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm ${
                activeTab === "players" ? "bg-slate-800 dark:bg-cyan-900/50 text-white dark:text-cyan-400 dark:border dark:border-cyan-500 dark:[box-shadow:0_0_10px_rgba(6,182,212,0.5)]" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              รายชื่อนักเตะ
            </button>
            <button
              onClick={() => setActiveTab("claims")}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 font-bold rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm ${
                activeTab === "claims" ? "bg-blue-600 dark:bg-blue-900/50 text-white dark:text-blue-400 dark:border dark:border-blue-500 dark:[box-shadow:0_0_10px_rgba(59,130,246,0.5)]" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              คำขอเชื่อมโยงโปรไฟล์
              {pendingClaims.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full dark:[box-shadow:0_0_10px_rgba(244,63,94,0.5)]">
                  {pendingClaims.length}
                </span>
              )}
            </button>
          </div>

          {isCoachOrAdmin && (
            <>
              <div className="h-px w-full xl:h-10 xl:w-px bg-slate-200 my-1 xl:my-0 xl:mx-1 hidden sm:block"></div>

              {/* Action Buttons Container */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-end gap-2 w-full sm:w-auto mt-4 xl:mt-0">
                <button
                  onClick={() => setIsRolloverModalOpen(true)}
                  className="px-2 py-2 sm:px-4 sm:py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap w-full sm:w-auto"
                >
                  <Calendar size={14} className="sm:w-[18px] sm:h-[18px]" />
                  Rollover
                </button>
                <button
                  onClick={openAddModal}
                  className="px-2 py-2 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap w-full sm:w-auto"
                >
                  <Plus size={14} className="sm:w-[18px] sm:h-[18px]" />
                  Add Player
                </button>
                <button
                  onClick={() => setIsNotifModalOpen(true)}
                  className="px-2 py-2 sm:px-4 sm:py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap w-full sm:w-auto"
                >
                  <Bell size={14} className="sm:w-[18px] sm:h-[18px]" />
                  Alert
                </button>
                <button
                  onClick={() => {
                    setCsvError(null);
                    downloadTemplate();
                  }}
                  className="px-2 py-2 sm:px-4 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center whitespace-nowrap w-full sm:w-auto"
                >
                  CSV Template
                </button>
                <div className="relative shrink-0 col-span-2 sm:col-span-1 w-full sm:w-auto">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    title="Upload CSV"
                  />
                  <button
                    className="px-2 py-2 sm:px-4 sm:py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-1 sm:gap-2 pointer-events-none whitespace-nowrap w-full"
                  >
                    <Upload size={14} className="sm:w-[18px] sm:h-[18px]" />
                    Bulk Import
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {csvError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm font-medium">
          {csvError}
        </div>
      )}

      {activeTab === "claims" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Player Name</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">FUTID</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User Email</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date Requested</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingClaims.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">ไม่มีคำขอที่รอการอนุมัติ</td>
                  </tr>
                ) : (
                  pendingClaims.map(claim => (
                    <tr key={claim.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-sm font-bold text-slate-800">{claim.playerName}</td>
                      <td className="p-4 text-sm font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block mt-2">{claim.futId}</td>
                      <td className="p-4 text-sm text-slate-600">{claim.userEmail}</td>
                      <td className="p-4 text-sm text-slate-500">
                        {claim.requestedAt?.toDate ? new Date(claim.requestedAt.toDate()).toLocaleDateString() : "Unknown"}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button onClick={() => handleRejectClaim(claim.id, claim.userId)} className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          Reject
                        </button>
                        <button onClick={() => handleApproveClaim(claim)} className="px-3 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors shadow-sm">
                          Approve
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : filteredPlayers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Youth Players Yet"
          description="Add players to start managing your academy rosters."
          primaryActionLabel="Add Player"
          onPrimaryAction={openAddModal}
        />
      ) : (
        <>
          {/* Filters and Search */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                size={18}
              />
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 dark:focus:border-cyan-500 transition-colors"
              />
            </div>
            <div className="flex items-center gap-2 sm:w-48">
              <Filter className="text-slate-400 dark:text-slate-500 shrink-0" size={18} />
              <div className="relative w-full">
                <select
                  value={filterAge}
                  onChange={(e) => setFilterAge(e.target.value)}
                  className="w-full appearance-none bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 dark:focus:border-cyan-500 transition-colors"
                >
                  <option value="All">All Squads</option>
                  {settings.squads.map((squad) => (
                    <option key={squad} value={squad}>
                      {squad} Squad
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  size={16}
                />
              </div>
            </div>
          </div>

          {/* Player Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            {filteredPlayers.map((player) => (
              <div
                key={player.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-md dark:hover:[box-shadow:0_0_15px_rgba(34,211,238,0.2)] transition-shadow group relative"
              >
                {/* === MOBILE: Compact Horizontal Card (visible < sm) === */}
                <div className="flex items-center gap-3 p-3 sm:hidden">
                  <div className="w-12 h-12 rounded-full border-2 border-slate-100 bg-slate-100 shrink-0 overflow-hidden">
                    <img
                      src={
                        player.avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.firstName}`
                      }
                      alt={player.firstName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-slate-800 dark:text-cyan-300 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)] text-sm truncate">
                        {player.firstName} {player.lastName}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600">
                        {player.position}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          player.fitness_status === "Fit"
                            ? "bg-emerald-100 text-emerald-700"
                            : player.fitness_status === "Injured"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {player.fitness_status}
                      </span>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        {player.ageGroup}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActionSheetPlayer(player)}
                    className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-2 rounded-xl transition-colors active:scale-95"
                  >
                    ดูรายละเอียด
                  </button>
                </div>

                {/* === DESKTOP: Vertical Card (visible >= sm) === */}
                <div className="hidden sm:block">
                  <div className="h-20 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-100 relative group-hover:from-blue-100 group-hover:to-indigo-100 transition-colors">
                    {isCoachOrAdmin && (
                      <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/50 backdrop-blur-sm p-1 rounded-lg">
                        <button
                          onClick={() => handleEditClick(player)}
                          className="p-1 hover:text-blue-600 hover:bg-white rounded-md transition-colors text-slate-600"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setPlayerToDelete(player.id)}
                          className="p-1 hover:text-rose-600 hover:bg-white rounded-md transition-colors text-slate-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                    <span className="absolute top-3 right-3 bg-white px-2 py-1 rounded-md text-[10px] font-bold tracking-widest text-blue-700 uppercase border border-blue-100 shadow-sm">
                      {player.ageGroup}
                    </span>
                  </div>

                  <div className="px-5 pb-5 relative -mt-10">
                    <div className="w-20 h-20 rounded-full border-4 border-white bg-slate-100 mx-auto mb-3 overflow-hidden shadow-sm">
                      <img
                        src={
                          player.avatar ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.firstName}`
                        }
                        alt={player.firstName}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="text-center mb-4">
                      <h3 className="font-bold text-slate-800 dark:text-cyan-300 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)] text-lg leading-tight">
                        {player.firstName}
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 text-sm">{player.lastName}</p>
                      
                      <div className="flex items-center justify-center gap-2 mt-2">
                        <div className="inline-flex items-center justify-center bg-slate-100 px-2.5 py-1 rounded-md text-xs font-bold text-slate-600">
                          {player.position}
                        </div>
                        <div
                          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-bold ${
                            player.fitness_status === "Fit"
                              ? "bg-emerald-100 text-emerald-700"
                              : player.fitness_status === "Injured"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {player.fitness_status}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => onSelectPlayer && onSelectPlayer(player)}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-2 py-2 rounded-lg transition-colors text-center dark:border dark:border-indigo-800"
                        >
                          โปรไฟล์ (CV)
                        </button>
                        <button
                          onClick={() => onNavigate && onNavigate("idp_manager")}
                          className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-2 py-2 rounded-lg transition-colors text-center dark:border dark:border-blue-800"
                        >
                          จัดการ IDP
                        </button>
                        <button
                          onClick={() => setReportPlayer(player)}
                          className="text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 px-2 py-2 rounded-lg transition-colors text-center dark:border dark:border-teal-800"
                        >
                          รายงานพัฒนาการ
                        </button>
                        <button
                          onClick={() => {
                            setFitnessUpdatePlayer(player);
                            setNewFitnessStatus(player.fitness_status || "Fit");
                          }}
                          className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 px-2 py-2 rounded-lg transition-colors text-center dark:border dark:border-emerald-800"
                        >
                          อัปเดตความฟิต
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* === Player Action Bottom Sheet (Mobile) === */}
          {actionSheetPlayer && (
            <div className="fixed inset-0 z-[80] sm:hidden" onClick={() => setActionSheetPlayer(null)}>
              <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" />
              <div
                className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85dvh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Handle bar */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 bg-slate-300 rounded-full" />
                </div>

                {/* Player Header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
                  <div className="w-14 h-14 rounded-full border-2 border-slate-100 bg-slate-100 shrink-0 overflow-hidden">
                    <img
                      src={
                        actionSheetPlayer.avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${actionSheetPlayer.firstName}`
                      }
                      alt={actionSheetPlayer.firstName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 text-base">
                      {actionSheetPlayer.firstName} {actionSheetPlayer.lastName}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-bold text-slate-600">
                        {actionSheetPlayer.position}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          actionSheetPlayer.fitness_status === "Fit"
                            ? "bg-emerald-100 text-emerald-700"
                            : actionSheetPlayer.fitness_status === "Injured"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {actionSheetPlayer.fitness_status}
                      </span>
                      <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        {actionSheetPlayer.ageGroup}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActionSheetPlayer(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Action List */}
                <div className="p-4 space-y-2">
                  <button
                    onClick={() => {
                      onSelectPlayer && onSelectPlayer(actionSheetPlayer);
                      setActionSheetPlayer(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors active:scale-[0.98]"
                  >
                    <span className="w-8 h-8 flex items-center justify-center bg-indigo-100 text-indigo-600 rounded-lg text-sm">📋</span>
                    <div className="text-left">
                      <div className="text-sm font-bold text-indigo-700">ดูโปรไฟล์นักเตะ (CV)</div>
                      <div className="text-[11px] text-indigo-500">ข้อมูลส่วนตัว ประวัติ และสถิติ</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onNavigate && onNavigate("idp_manager");
                      setActionSheetPlayer(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors active:scale-[0.98]"
                  >
                    <span className="w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-600 rounded-lg text-sm">🎯</span>
                    <div className="text-left">
                      <div className="text-sm font-bold text-blue-700">จัดการ IDP</div>
                      <div className="text-[11px] text-blue-500">แผนพัฒนารายบุคคล</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setReportPlayer(actionSheetPlayer);
                      setActionSheetPlayer(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors active:scale-[0.98]"
                  >
                    <span className="w-8 h-8 flex items-center justify-center bg-teal-100 text-teal-600 rounded-lg text-sm">📊</span>
                    <div className="text-left">
                      <div className="text-sm font-bold text-teal-700">รายงานพัฒนาการ</div>
                      <div className="text-[11px] text-teal-500">ดูรายงานและสถิติพัฒนาการ</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setFitnessUpdatePlayer(actionSheetPlayer);
                      setNewFitnessStatus(actionSheetPlayer.fitness_status || "Fit");
                      setActionSheetPlayer(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors active:scale-[0.98]"
                  >
                    <span className="w-8 h-8 flex items-center justify-center bg-emerald-100 text-emerald-600 rounded-lg text-sm">💪</span>
                    <div className="text-left">
                      <div className="text-sm font-bold text-emerald-700">อัปเดตความฟิต</div>
                      <div className="text-[11px] text-emerald-500">เปลี่ยนสถานะ Fit / Injured / Rehab</div>
                    </div>
                  </button>

                  <div className="border-t border-slate-100 pt-2 mt-2 flex gap-2">
                    <button
                      onClick={() => {
                        handleEditClick(actionSheetPlayer);
                        setActionSheetPlayer(null);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-sm font-bold text-slate-700 active:scale-[0.98]"
                    >
                      <Edit2 size={14} /> แก้ไขข้อมูล
                    </button>
                    <button
                      onClick={() => {
                        setPlayerToDelete(actionSheetPlayer.id);
                        setActionSheetPlayer(null);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors text-sm font-bold text-rose-600 active:scale-[0.98]"
                    >
                      <Trash2 size={14} /> ลบนักกีฬา
                    </button>
                  </div>
                </div>

                {/* Safe area for bottom */}
                <div className="h-6" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Fitness Update Modal */}
      {fitnessUpdatePlayer && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
                <Activity size={20} className="text-emerald-600" /> อัปเดตความฟิต
              </h3>
              <button
                onClick={() => setFitnessUpdatePlayer(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                อัปเดตสถานะความฟิตของ <span className="font-bold text-slate-800">{fitnessUpdatePlayer.firstName} {fitnessUpdatePlayer.lastName}</span>
              </p>
              <form id="fitnessForm" onSubmit={handleUpdateFitness} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Fitness Status</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                    value={newFitnessStatus}
                    onChange={(e) => setNewFitnessStatus(e.target.value)}
                  >
                    <option value="Fit">🟢 Fit (พร้อมลงสนาม)</option>
                    <option value="Injured">🔴 Injured (บาดเจ็บ)</option>
                    <option value="Rehab">🟡 Rehab (กำลังฟื้นฟู)</option>
                  </select>
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white shrink-0">
              <button
                type="button"
                onClick={() => setFitnessUpdatePlayer(null)}
                className="px-5 py-2.5 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                form="fitnessForm"
                disabled={isUpdatingFitness}
                className="px-6 py-2.5 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {isUpdatingFitness ? "กำลังบันทึก..." : "อัปเดตสถานะ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Player Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeModal}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[75svh] md:max-h-[90vh] my-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h2 className="text-lg font-bold text-slate-800">
                {editingPlayerId ? "Edit Youth Player" : "Add New Youth Player"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePlayer} className="flex flex-col overflow-hidden">
              <div className="p-6 overflow-y-auto flex-1">
              {/* Photo Upload */}
              <div className="flex flex-col items-center justify-center mb-6">
                <label htmlFor="youth-player-photo" className="w-24 h-24 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors group relative overflow-hidden">
                  {formData.avatarUrl ? (
                    <img
                      src={formData.avatarUrl}
                      alt="Preview"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  ) : (
                    <>
                      <Upload
                        size={24}
                        className="mb-1 group-hover:-translate-y-1 transition-transform pointer-events-none"
                      />
                      <span className="text-[10px] font-medium uppercase tracking-wider pointer-events-none">
                        Photo
                      </span>
                    </>
                  )}
                  <input
                    id="youth-player-photo"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      First Name
                    </label>
                    <input
                      required
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                      placeholder="Enter first name"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Last Name
                    </label>
                    <input
                      required
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                      placeholder="Enter last name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Date of Birth
                  </label>
                  <div className="relative">
                    <Calendar
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                    />
                    <ThaiDatePicker
                      required
                      name="dob"
                      value={formData.dob}
                      onChange={handleInputChange}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all text-slate-700"
                    />
                  </div>
                  {formData.dob && (
                    <p className="text-xs text-emerald-600 mt-1.5 font-medium ml-1">
                      Calculated Age: {calculateAge(formData.dob)} years old
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Fitness Status
                    </label>
                    <div className="relative flex items-center">
                      <select
                        name="fitness_status"
                        value={formData.fitness_status}
                        onChange={handleInputChange}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 font-medium"
                      >
                        <option value="Fit">Fit</option>
                        <option value="Injured">Injured</option>
                        <option value="Returning">Returning</option>
                      </select>
                      <ChevronDown
                        className="absolute right-3 text-slate-400 pointer-events-none"
                        size={18}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      เท้าข้างถนัด (Preferred Foot)
                    </label>
                    <div className="relative flex items-center">
                      <select
                        name="preferredFoot"
                        value={formData.preferredFoot}
                        onChange={handleInputChange}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 font-medium"
                      >
                        <option value="Right">เท้าขวา (Right)</option>
                        <option value="Left">เท้าซ้าย (Left)</option>
                        <option value="Both">สองเท้า (Both)</option>
                      </select>
                      <ChevronDown
                        className="absolute right-3 text-slate-400 pointer-events-none"
                        size={18}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Position
                    </label>
                    <div className="relative flex items-center">
                      <select
                        name="position"
                        value={formData.position}
                        onChange={handleInputChange}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 font-medium"
                      >
                        <option value="GK">GK - Goalkeeper</option>
                        <option value="CB">CB - Center Back</option>
                        <option value="LB">LB - Left Back</option>
                        <option value="RB">RB - Right Back</option>
                        <option value="CM">CM - Center Mid</option>
                        <option value="Winger">Winger</option>
                        <option value="Striker">Striker</option>
                      </select>
                      <ChevronDown
                        className="absolute right-3 text-slate-400 pointer-events-none"
                        size={18}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Squad / Age Group
                    </label>
                    <div className="relative flex items-center">
                      <select
                        name="ageGroup"
                        value={formData.ageGroup || "U11"}
                        onChange={handleInputChange}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 font-medium"
                      >
                        {(settings?.squads && settings.squads.length > 0) ? (
                          settings.squads.map((squad) => (
                            <option key={squad} value={squad}>
                              {squad} Squad
                            </option>
                          ))
                        ) : (
                          <option value="U11">U11 Squad</option>
                        )}
                      </select>
                      <ChevronDown
                        className="absolute right-3 text-slate-400 pointer-events-none"
                        size={18}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      วันที่เข้าร่วม (Joined Date) *
                    </label>
                    <ThaiDatePicker
                      required
                      name="joinedDate"
                      value={formData.joinedDate}
                      onChange={handleInputChange}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all text-slate-700 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      สถานะนักเตะ (Status)
                    </label>
                    <div className="relative flex items-center">
                      <select
                        name="status"
                        value={formData.status}
                        onChange={handleInputChange}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 font-medium"
                      >
                        <option value="ACTIVE">Active (กำลังอยู่)</option>
                        <option value="LEFT">Left (ย้ายออกแล้ว)</option>
                      </select>
                      <ChevronDown
                        className="absolute right-3 text-slate-400 pointer-events-none"
                        size={18}
                      />
                    </div>
                  </div>
                </div>

                {formData.status === "LEFT" && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      วันที่ย้ายออก (Left Date) *
                    </label>
                    <ThaiDatePicker
                      required
                      name="leftDate"
                      value={formData.leftDate}
                      onChange={handleInputChange}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all text-slate-700 font-medium"
                    />
                  </div>
                )}
              </div>

              {editingPlayerId && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-800 mb-3">เชื่อมโยงผู้ปกครอง (Direct Link)</h4>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="ใส่อีเมลผู้ปกครอง..."
                      value={parentEmailToLink}
                      onChange={(e) => setParentEmailToLink(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-700 font-medium"
                    />
                    <button
                      type="button"
                      onClick={handleLinkParent}
                      disabled={isLinkingParent || !parentEmailToLink.trim()}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white text-sm font-bold rounded-xl transition-colors"
                    >
                      {isLinkingParent ? "กำลังเชื่อม..." : "เชื่อมโยง"}
                    </button>
                  </div>
                  {linkParentMessage.text && (
                    <div className={`mt-2 text-xs font-bold ${linkParentMessage.type === "success" ? "text-emerald-600" : "text-rose-600"}`}>
                      {linkParentMessage.text}
                    </div>
                  )}
                </div>
              )}

              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0 flex gap-3 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
                >
                  {editingPlayerId ? "Save Changes" : "Save Player"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {isNotifModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsNotifModalOpen(false)}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Bell size={20} className="text-rose-500" />
                Send Alert
              </h2>
              <button
                onClick={() => setIsNotifModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSendNotification} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Recipient</label>
                <select
                  value={notifData.recipientId}
                  onChange={(e) => setNotifData({ ...notifData, recipientId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  required
                >
                  <option value="">Select Recipient...</option>
                  <option value="all_parents">All Parents</option>
                  <option value="all_players">All Players</option>
                  {players.map(p => (
                    p.linkedUserId ? <option key={p.id} value={p.linkedUserId}>{p.firstName} {p.lastName}</option> : null
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Type</label>
                <select
                  value={notifData.type}
                  onChange={(e) => setNotifData({ ...notifData, type: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="Coach">Coach</option>
                  <option value="Medical">Medical</option>
                  <option value="Operations">Operations</option>
                  <option value="Performance">Performance</option>
                  <option value="System">System</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Title</label>
                <input
                  type="text"
                  required
                  value={notifData.title}
                  onChange={(e) => setNotifData({ ...notifData, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="Alert title"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Message</label>
                <textarea
                  required
                  value={notifData.message}
                  onChange={(e) => setNotifData({ ...notifData, message: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[100px]"
                  placeholder="Alert message..."
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsNotifModalOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingNotif}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSendingNotif ? "Sending..." : <><Send size={16} /> Send Alert</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {playerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setPlayerToDelete(null)}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Trash2 size={20} className="text-rose-500" />
                ลบข้อมูลนักกีฬา
              </h2>
              <button
                onClick={() => setPlayerToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-slate-600 text-sm mb-4">
                คุณแน่ใจหรือไม่ว่าต้องการลบนักกีฬาท่านนี้? ข้อมูลทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้
              </p>
              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => setPlayerToDelete(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleDeletePlayer}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors"
                >
                  ยืนยันการลบ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsImportModalOpen(false)}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Upload size={20} className="text-amber-500" />
                Confirm Bulk Import
              </h2>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-slate-600 text-sm mb-4">
                You are about to import <span className="font-bold text-slate-800">{csvData.length}</span> players into the academy. Are you sure you want to proceed?
              </p>
              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  {loading ? "Importing..." : "Confirm Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rollover Modal */}
      {isRolloverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsRolloverModalOpen(false)}
          ></div>
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={20} className="text-indigo-600" />
                Season Rollover
              </h2>
              <button
                onClick={() => setIsRolloverModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-slate-600 text-sm mb-4">
                Copy all current active players to a new season. This allows you to manage next season's rosters without affecting the current season.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Target Season (e.g. 2027)</label>
                  <input
                    type="text"
                    value={rolloverTargetSeason}
                    onChange={(e) => setRolloverTargetSeason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="2027"
                  />
                </div>
              </div>
              <div className="pt-6 flex gap-3">
                <button
                  onClick={() => setIsRolloverModalOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRollover}
                  disabled={isRollingOver || !rolloverTargetSeason}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isRollingOver ? "Rolling over..." : "Confirm Rollover"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
