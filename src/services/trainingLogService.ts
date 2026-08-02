import { doc, getDoc, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { IDPTraining } from "../hooks/useTrainingLog";

// Reusing the same date parsing logic from TrainingLogManager
export const parseDateLocal = (dateStr: string) => {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date(dateStr);
};

export const getWeekStartStr = (dateStr: string) => {
  const dateObj = parseDateLocal(dateStr);
  const day = dateObj.getDay();
  const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(dateObj.setDate(diff));
  
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getFormattedDateShort = (dateStr: string) => {
  const dateObj = parseDateLocal(dateStr);
  return dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const saveQuickIDPTrainingLog = async (
  academyId: string,
  playerId: string,
  dateStr: string,
  idpTraining: IDPTraining
) => {
  if (!academyId || !playerId || !dateStr || !idpTraining) {
    throw new Error("Missing required parameters for saving Quick IDP Training.");
  }

  const weekStartStr = getWeekStartStr(dateStr);
  const docRef = doc(db, `academies/${academyId}/training_weeks`, weekStartStr);
  
  const docSnap = await getDoc(docRef);
  let data = docSnap.exists() ? docSnap.data() : { 
    id: weekStartStr, 
    days: [], 
    attendanceDB: {}, 
    trainingLogsDB: {} 
  };

  const newAttendanceDB = data.attendanceDB || {};
  const newTrainingLogsDB = data.trainingLogsDB || {};
  const newDays = data.days || [];

  // 1. Identify or Create the Day (ID is 1-7 where 1=Mon, 7=Sun)
  const localDate = parseDateLocal(dateStr);
  const jsDay = localDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const dayId = jsDay === 0 ? "7" : jsDay.toString();
  
  let dayExists = newDays.find((d: any) => d.id === dayId);
  
  if (!dayExists) {
    dayExists = {
      id: dayId,
      date: getFormattedDateShort(dateStr),
      dayOfWeek: parseDateLocal(dateStr).toLocaleDateString("en-US", { weekday: 'short' }),
      theme: "IDP",
      intensity: "Medium",
      systemGenerated: true,
      trainingType: "IDP",
      drills: [],
      objective: "",
      notes: ""
    };
    newDays.push(dayExists);
  }

  // 2. Ensure Day maps exist
  if (!newAttendanceDB[dateStr]) newAttendanceDB[dateStr] = {};
  if (!newTrainingLogsDB[dateStr]) newTrainingLogsDB[dateStr] = {};

  // 3. Set the specific player's attendance & log
  // If system auto-generated or the player wasn't marked, mark them present for their IDP
  if (!newAttendanceDB[dateStr][playerId]) {
    newAttendanceDB[dateStr][playerId] = "Present";
  }

  const currentLog = newTrainingLogsDB[dateStr][playerId] || { rpe: 0, minutes: 0, notes: "" };
  newTrainingLogsDB[dateStr][playerId] = {
    ...currentLog,
    idpTraining: idpTraining
  };

  // 4. Save to training_weeks
  await setDoc(docRef, {
    ...data,
    days: newDays,
    attendanceDB: newAttendanceDB,
    trainingLogsDB: newTrainingLogsDB,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  // 5. Sync to player's personal subcollections (just like TrainingLogManager)
  const batch = writeBatch(db);
  const status = newAttendanceDB[dateStr][playerId];
  const normalizedStatus = 
    status === "Present" ? "PRESENT" :
    status === "Late" ? "LATE" :
    status === "Sick" ? "SICK" :
    status === "Injured" ? "INJURED" : "ABSENT";

  const attRef = doc(db, `academies/${academyId}/players/${playerId}/attendance`, dateStr);
  batch.set(attRef, {
    status: normalizedStatus,
    attendanceStatus: status,
    date: dateStr,
    dayOfWeek: dayExists.dayOfWeek,
    checkedInAt: serverTimestamp(),
    source: "TRAINING_LOG",
  }, { merge: true });

  const logRef = doc(db, `academies/${academyId}/players/${playerId}/daily_logs`, dateStr);
  batch.set(logRef, {
    id: dateStr,
    date: dateStr,
    dayOfWeek: dayExists.dayOfWeek,
    theme: dayExists.theme,
    intensity: dayExists.intensity,
    attendanceStatus: status,
    isAttended: status === "Present" || status === "Late",
    rpe: currentLog.rpe || 0,
    minutes: currentLog.minutes || 0,
    idpTraining: idpTraining,
    updatedAt: serverTimestamp(),
    source: "TRAINING_LOG",
  }, { merge: true });

  await batch.commit();
};
