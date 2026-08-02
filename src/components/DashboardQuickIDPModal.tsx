import React, { useState, useEffect } from "react";
import IDPTrainingModal from "./common/IDPTrainingModal";
import { IDPTraining } from "../hooks/useTrainingLog";
import { saveQuickIDPTrainingLog } from "../services/trainingLogService";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

interface DashboardQuickIDPModalProps {
  academyId: string;
  onClose: () => void;
}

export default function DashboardQuickIDPModal({ academyId, onClose }: DashboardQuickIDPModalProps) {
  const [players, setPlayers] = useState<any[]>([]);
  const [idps, setIdps] = useState<any[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  
  // Default to today
  const todayStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  })();
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!academyId) return;

    // Fetch active players
    const fetchPlayers = async () => {
      const playersRef = collection(db, `academies/${academyId}/players`);
      // Removed where("status", "==", "Active") because players might not have this field explicitly set in this project
      const snap = await getDocs(playersRef);
      let playersData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Filter out explicitly inactive or archived players if the project uses those flags
      playersData = playersData.filter((p: any) => p.status !== "Inactive" && p.status !== "Archived");

      setPlayers(playersData.sort((a: any, b: any) => (a.firstName || "").localeCompare(b.firstName || "")));
    };

    // Fetch all IDPs (so IDPTrainingModal has them ready for any player)
    const fetchIDPs = async () => {
      const idpsRef = collection(db, `academies/${academyId}/idps`);
      const snap = await getDocs(idpsRef);
      setIdps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    fetchPlayers();
    fetchIDPs();
  }, [academyId]);

  const handleSave = async (idpTraining: IDPTraining | undefined) => {
    if (!idpTraining) {
      onClose(); // Just close if disabled
      return;
    }
    if (!selectedPlayer || !selectedDateStr) return;

    try {
      setIsSaving(true);
      await saveQuickIDPTrainingLog(academyId, selectedPlayer.id, selectedDateStr, idpTraining);
      alert("บันทึกการฝึกซ้อมพิเศษสำเร็จ! (Quick IDP Saved)");
      onClose();
    } catch (err) {
      console.error("Error saving Quick IDP:", err);
      alert("เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <IDPTrainingModal
        player={selectedPlayer}
        academyId={academyId}
        idps={idps}
        availablePlayers={players}
        onPlayerChange={setSelectedPlayer}
        selectedDateStr={selectedDateStr}
        onDateChange={setSelectedDateStr}
        onSave={handleSave}
        onClose={onClose}
      />
      {isSaving && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="font-bold text-slate-700 dark:text-slate-200">กำลังบันทึก...</span>
          </div>
        </div>
      )}
    </>
  );
}
