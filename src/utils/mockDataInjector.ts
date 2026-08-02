import { collection, doc, getDocs, setDoc, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

export const injectMockData = async (academyId: string) => {
  if (!academyId) return alert("No academy ID found");

  try {
    // 1. Fetch all players
    const playersRef = collection(db, `academies/${academyId}/players`);
    const q = query(playersRef);
    const playerSnap = await getDocs(q);
    
    if (playerSnap.empty) {
      alert("No active players found to generate mock data for.");
      return;
    }

    const players = playerSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    
    // Dates relative to today
    const daysAgo = (d: number) => {
      const date = new Date(now);
      date.setDate(now.getDate() - d);
      return date;
    };
    const getFormatted = (date: Date) => date.toISOString().split("T")[0];

    // 2. Generate a Match 3 days ago
    const matchDate = daysAgo(3);
    const matchId = `mock_match_${matchDate.getTime()}`;
    const matchRef = doc(db, `academies/${academyId}/matches`, matchId);
    
    const matchPlayersData: Record<string, any> = {};
    players.forEach(p => {
      matchPlayersData[p.id] = {
        minutesPlayed: Math.floor(Math.random() * 45) + 45, // 45 to 90 mins
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0
      };
    });

    await setDoc(matchRef, {
      id: matchId,
      opponentName: "Mock United FC",
      matchDate: getFormatted(matchDate),
      kickoffTime: "16:00",
      location: "Home Stadium",
      matchType: "Friendly",
      homeScore: 2,
      awayScore: 1,
      playersData: matchPlayersData,
      status: "Completed",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    // 3. Generate Training Logs for 1, 2, 4 days ago
    for (const d of [1, 2, 4]) {
      const tDate = daysAgo(d);
      const tDateStr = getFormatted(tDate);
      
      const dateObj = new Date(tDate);
      const day = dateObj.getDay();
      const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(dateObj.setDate(diff));
      const weekStartStr = monday.toISOString().split("T")[0];

      const weekRef = doc(db, `academies/${academyId}/training_weeks`, weekStartStr);
      const dayId = `mock_train_${tDateStr}`;

      const tLogs: Record<string, any> = {};
      const tAtt: Record<string, any> = {};
      
      players.forEach(p => {
        tAtt[p.id] = "Present";
        tLogs[p.id] = {
          rpe: Math.floor(Math.random() * 4) + 6, // 6 to 9
          minutes: 90,
          notes: "Mock data"
        };
      });

      await setDoc(weekRef, {
        id: weekStartStr,
        days: [
          { id: dayId, date: new Date(tDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), dayOfWeek: "Mon", theme: "Tactical & Fitness (Mock)", intensity: "High" }
        ],
        attendanceDB: {
          [dayId]: tAtt
        },
        trainingLogsDB: {
          [dayId]: tLogs
        },
        updatedAt: now.toISOString()
      }, { merge: true });
    }

    // 4. Generate Wellness for today
    for (const p of players) {
      const wellRef = doc(db, `academies/${academyId}/players/${p.id}/daily_wellness`, todayStr);
      await setDoc(wellRef, {
        date: todayStr,
        sleepHours: Math.floor(Math.random() * 3) + 6, // 6 to 8
        fatigue: Math.floor(Math.random() * 3) + 2, // 2 to 4
        pain: Math.floor(Math.random() * 2) + 1, // 1 to 2
        stress: Math.floor(Math.random() * 2) + 1,
        hydration: 4,
        timestamp: now.toISOString()
      });
    }

    alert("สร้างข้อมูลจำลองการฝึกซ้อม แมตช์ และสภาพร่างกาย ย้อนหลังเรียบร้อยแล้วครับ! กรุณารีเฟรชหน้าเว็บ");
  } catch (error) {
    console.error("Error generating mock data:", error);
    alert("เกิดข้อผิดพลาดในการสร้างข้อมูลจำลอง ลองดูใน Console ครับ");
  }
};
