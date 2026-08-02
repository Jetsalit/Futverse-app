import { addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { useAcademy } from "../contexts/AcademyContext";

export function useActivityLogger() {
  const { currentUser } = useAuth();
  const { getAcademyCollection } = useAcademy();

  const logActivity = async (action: string) => {
    if (!currentUser) return;
    
    try {
      const logsRef = getAcademyCollection("activity_logs");
      const u = currentUser as any;
      await addDoc(logsRef, {
        userName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || "Unknown User",
        userId: u.uid || u.id,
        action: action,
        avatarSeed: u.firstName || "User",
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error logging activity:", error);
    }
  };

  return { logActivity };
}
