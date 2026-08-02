import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read service account key
const serviceAccountPath = join(__dirname, 'serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const criteriaList = [
  // Attacking Techniques
  { criteria_name: "สัมผัสแรก (First Touch)", category: "Attacking Techniques", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การส่งบอล (Passing)", category: "Attacking Techniques", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การเลี้ยงบอล (Dribbling)", category: "Attacking Techniques", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การจบสกอร์ (Finishing)", category: "Attacking Techniques", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การเปิดบอล (Crossing)", category: "Attacking Techniques", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การบังบอล (Shielding)", category: "Attacking Techniques", academy_id: "global", status: "active", created_by: "system" },

  // Defending Techniques
  { criteria_name: "การชะลอเกม (Jockeying)", category: "Defending Techniques", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การสกัดบอล (Tackling)", category: "Defending Techniques", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การประกบตัว (Marking)", category: "Defending Techniques", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การตัดบอล (Interception)", category: "Defending Techniques", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การกดดัน (Pressing)", category: "Defending Techniques", academy_id: "global", status: "active", created_by: "system" },

  // Tactical Awareness
  { criteria_name: "การมองรอบตัว (Scanning)", category: "Tactical Awareness", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การหาช่องว่าง (Movement Off the Ball)", category: "Tactical Awareness", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การเปลี่ยนผ่านเกม (Transitions)", category: "Tactical Awareness", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การรักษารูปแบบทีม (Team Shape)", category: "Tactical Awareness", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การตัดสินใจ (Decision Making)", category: "Tactical Awareness", academy_id: "global", status: "active", created_by: "system" },

  // Physical Attributes
  { criteria_name: "ความเร็วและความเร่ง (Speed & Acceleration)", category: "Physical Attributes", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "ความคล่องตัว (Agility & Balance)", category: "Physical Attributes", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "ความแข็งแกร่ง (Strength)", category: "Physical Attributes", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "ความฟิต (Stamina)", category: "Physical Attributes", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การประสานงาน (Coordination)", category: "Physical Attributes", academy_id: "global", status: "active", created_by: "system" },

  // Mental Attributes
  { criteria_name: "สมาธิ (Focus)", category: "Mental Attributes", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "ความมั่นใจ (Confidence)", category: "Mental Attributes", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "รับมือความกดดัน (Resilience)", category: "Mental Attributes", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "ความกระหายชัยชนะ (Competitiveness)", category: "Mental Attributes", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "ความเป็นผู้นำ (Leadership)", category: "Mental Attributes", academy_id: "global", status: "active", created_by: "system" },

  // Social Skills
  { criteria_name: "การทำงานเป็นทีม (Teamwork)", category: "Social Skills", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "การรับฟัง (Coachability)", category: "Social Skills", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "น้ำใจนักกีฬา (Sportsmanship)", category: "Social Skills", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "ระเบียบวินัย (Discipline)", category: "Social Skills", academy_id: "global", status: "active", created_by: "system" },
  { criteria_name: "พฤติกรรมโซเชียล (Social Media Awareness)", category: "Social Skills", academy_id: "global", status: "active", created_by: "system" }
];

async function seedData() {
  console.log("⏳ Starting seed...");
  try {
    const batch = db.batch();
    const criteriaRef = db.collection("evaluation_criteria");
    
    // First clear existing global criteria to avoid duplicates
    const snapshot = await criteriaRef.where("academy_id", "==", "global").get();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Add new ones
    criteriaList.forEach(criteria => {
      const docRef = criteriaRef.doc();
      batch.set(docRef, criteria);
    });
    
    await batch.commit();
    console.log(`✅ Successfully seeded ${criteriaList.length} criteria into Firestore!`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seedData();
