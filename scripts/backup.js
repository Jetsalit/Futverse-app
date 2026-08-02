import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// คำนวณ __dirname สำหรับ ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. ระบุตำแหน่งของไฟล์ Service Account Key
const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.error(
    "❌ Error: ไม่พบไฟล์ serviceAccountKey.json\nกรุณาดาวน์โหลดไฟล์ Service Account จาก Firebase Console และนำมาวางไว้ที่เดียวกับสคริปต์นี้"
  );
  process.exit(1);
}

// โหลดไฟล์ JSON
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

// 2. เริ่มต้นใช้งาน Firebase Admin SDK (ใช้ Modular API ของ Firebase-Admin)
initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// 3. ฟังก์ชันหลักสำหรับ Backup ข้อมูล
async function backupFirestore() {
  try {
    console.log("⏳ กำลังเริ่มทำการ Backup ข้อมูลจาก Firestore...");
    
    // ดึงรายชื่อ Collection ทั้งหมด (Root Collections)
    const collections = await db.listCollections();
    const backupData = {};

    for (const collection of collections) {
      console.log(`- กำลังอ่านข้อมูลจาก Collection: ${collection.id}...`);
      const snapshot = await collection.get();
      const docs = {};

      snapshot.forEach((doc) => {
        docs[doc.id] = doc.data();
      });

      backupData[collection.id] = docs;
    }

    // 4. สร้างชื่อไฟล์โดยใส่วันที่
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const filename = `futverse_backup_${year}-${month}-${day}.json`;
    const outputPath = path.join(__dirname, filename);

    // 5. บันทึกข้อมูลลงในไฟล์ .json
    fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2), "utf8");

    console.log(`✅ การ Backup เสร็จสมบูรณ์!`);
    console.log(`📁 ไฟล์ถูกบันทึกไว้ที่: ${outputPath}`);
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการ Backup ข้อมูล:", error);
  }
}

// รันฟังก์ชัน Backup
backupFirestore();
