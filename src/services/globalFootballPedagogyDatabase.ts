/**
 * GLOBAL FOOTBALL PEDAGOGY MASTER DATABASE
 * Comprehensive elite coaching knowledge base incorporating:
 * - The 4 Moments of Football (In Possession, Defensive Transition, Out of Possession, Offensive Transition)
 * - FIFA Training Center (Player Action Model: Perception -> Decision -> Execution)
 * - The FA England (The FA DNA, Four Corner Model, Guided Discovery)
 * - DFB Germany (Gegenpressing, High Pressing Triggers & Transition)
 * - RFEF Spain / FC Barcelona (Positional Play / Juego de Posición, Third Man)
 * - Italian Coverciano (Zonal Defending, Tactical Compactness & Unit Shifting)
 * - KNVB Netherlands (4v4/5v5 Small-Sided Games & Total Football Structure)
 * - JFA Japan (JFA Japan Way, Scanning Frequency & First Touch)
 * - UEFA Pro License Standards (9v9/11v11 Full-Pitch Match Scenarios)
 */

export type FootballMoment = 
  | "In Possession (Attacking)"
  | "Defensive Transition (Attacking to Defending)"
  | "Out of Possession (Defending)"
  | "Offensive Transition (Defending to Attacking)";

export interface PedagogicalQuestion {
  question: string;
  category: "OBSERVATION" | "ANALYSIS" | "DECISION" | "REFLECTION";
  difficulty: "SIMPLE" | "INTERMEDIATE" | "ADVANCED";
  coachingMoment: "BEFORE" | "DURING" | "FREEZE" | "AFTER";
  coachingPurpose: string;
  fourCornerFocus?: "Technical/Tactical" | "Physical" | "Psychological" | "Social";
}

export interface TacticalCategoryKnowledge {
  id: string;
  titleTh: string;
  titleEn: string;
  footballMoment: FootballMoment;
  sourceStandard: string;
  keywords: string[];
  coachingPoints: string[];
  tacticalRules: string[];
  forbiddenTerms: string[];
  questions: PedagogicalQuestion[];
}

export const GLOBAL_FOOTBALL_PEDAGOGY_DATABASE: TacticalCategoryKnowledge[] = [
  // =========================================================================
  // 1. 2v2 & 3v3 SMALL-SIDED COMBINATIONS (In Possession / Attacking)
  // =========================================================================
  {
    id: "2v2_3v3_games",
    titleTh: "การซ้อมเกม 2 ต่อ 2 และ 3 ต่อ 3 (2v2 & 3v3 Small-Sided Games)",
    titleEn: "2v2 & 3v3 Small-Sided Combination Games",
    footballMoment: "In Possession (Attacking)",
    sourceStandard: "KNVB Netherlands & UEFA Youth Standards",
    keywords: ["2v2", "2vs2", "2ต่อ2", "3v3", "3vs3", "3ต่อ3", "1-2", "ชิ่ง"],
    coachingPoints: [
      "Use Wall Pass / Give-and-Go (การทำทางชิ่ง 1-2 เล่นกับเพื่อน)",
      "In 3v3: Create a triangle shape for maximum passing options (สร้างรูปสามเหลี่ยมเพื่อเพิ่มมุมทางส่ง)",
      "Switch positions fluidly after passing (การสลับตำแหน่งอย่างยืดหยุ่นหลังจ่ายบอล)"
    ],
    tacticalRules: [
      "Focus on 1-2 combination passes, third-player movement off ball, and pair defending"
    ],
    forbiddenTerms: [],
    questions: [
      {
        question: "ในเกม 2v2 / 3v3 นี้ จังหวะไหนที่คุณควรเลือกเล่นบอลชิ่ง 1-2 กับเพื่อนแทนการพาบอลหลบเอง?",
        category: "ANALYSIS",
        difficulty: "SIMPLE",
        coachingMoment: "BEFORE",
        coachingPurpose: "ประเมินจังหวะการเล่นบอลชิ่ง 1-2 ในเกมขนาดเล็ก",
        fourCornerFocus: "Technical/Tactical"
      },
      {
        question: "เมื่อกี้หลังจากที่คุณจ่ายบอลให้เพื่อนไปแล้ว คุณได้วิ่งขยับไปทำทางจังหวะถัดไปทันทีหรือไม่?",
        category: "OBSERVATION",
        difficulty: "SIMPLE",
        coachingMoment: "DURING",
        coachingPurpose: "กระตุ้นการเคลื่อนที่ต่อเนื่องหลังจ่ายบอล (Give-and-Go)",
        fourCornerFocus: "Physical"
      },
      {
        question: "หยุดเกม! ณ จังหวะ 3v3 นี้ ผู้เล่นคนที่สาม (Third Player) อยู่ในมุมที่เพื่อนมองเห็นและส่งบอลได้หรือไม่?",
        category: "ANALYSIS",
        difficulty: "INTERMEDIATE",
        coachingMoment: "FREEZE",
        coachingPurpose: "เช็กตำแหน่งของผู้เล่นคนที่สามในเกม 3v3",
        fourCornerFocus: "Technical/Tactical"
      },
      {
        question: "วันนี้ในเกม 2v2/3v3 จังหวะเข้าทำชิ่ง 1-2 จังหวะไหนที่คุณและเพื่อนเล่นได้เข้าขากันที่สุด?",
        category: "REFLECTION",
        difficulty: "SIMPLE",
        coachingMoment: "AFTER",
        coachingPurpose: "สร้างความมั่นใจในการเล่นเข้าคู่กันในเกมขนาดเล็ก",
        fourCornerFocus: "Social"
      }
    ]
  },

  // =========================================================================
  // 2. 4v4 & 5v5 DIAMOND GAMES (In Possession & Position Play)
  // =========================================================================
  {
    id: "4v4_5v5_games",
    titleTh: "การซ้อมเกม 4 ต่อ 4 และ 5 ต่อ 5 (4v4 & 5v5 Diamond Core Games)",
    titleEn: "4v4 & 5v5 Diamond Shape Core Games",
    footballMoment: "In Possession (Attacking)",
    sourceStandard: "KNVB Netherlands & FIFA Core Standards",
    keywords: ["4v4", "4vs4", "4ต่อ4", "5v5", "5vs5", "5ต่อ5", "ทรงเพชร", "diamond"],
    coachingPoints: [
      "Maintain Diamond Shape (1-2-1 / 1-3-1): Height, Width & Depth (รักษารูปทรงเพชรเพื่อความกว้างและความลึก)",
      "Fix opponents in central zone then switch to free wide player (ดึงคู่แข่งตรงกลางแล้วเปลี่ยนแกนออกข้าง)"
    ],
    tacticalRules: [
      "Focus on diamond shape (width and depth), switching play, and fast transitions"
    ],
    forbiddenTerms: [],
    questions: [
      {
        question: "ในเกม 4v4/5v5 นี้ การรักษารูปทรงเพชร (Diamond Shape) ช่วยเปิดทางส่งบอล 4 ทิศทางอย่างไร?",
        category: "OBSERVATION",
        difficulty: "SIMPLE",
        coachingMoment: "BEFORE",
        coachingPurpose: "เข้าใจการสร้างรูปทรงเพชรเพื่อกระจายพื้นที่การเล่น",
        fourCornerFocus: "Technical/Tactical"
      },
      {
        question: "เมื่อกี้จังหวะที่เราครองบอลอยู่ มีใครยืดความกว้าง (Width) ออกติดเส้นขอบสนามเพื่อขยายพื้นที่หรือไม่?",
        category: "OBSERVATION",
        difficulty: "INTERMEDIATE",
        coachingMoment: "DURING",
        coachingPurpose: "เช็กการรักษารูปทรงความกว้างของทีม",
        fourCornerFocus: "Technical/Tactical"
      },
      {
        question: "วันนี้จากเกม 4v4/5v5 จังหวะไหนที่คุณรู้สึกว่าทีมครองบอลหมุนเวียนเปลี่ยนแกนได้ไหลลื่นที่สุด?",
        category: "REFLECTION",
        difficulty: "SIMPLE",
        coachingMoment: "AFTER",
        coachingPurpose: "ตอกย้ำความแม่นยำในการหมุนเวียนบอลในเกม 4v4/5v5",
        fourCornerFocus: "Social"
      }
    ]
  },

  // =========================================================================
  // 3. GEGENPRESSING & DEFENSIVE TRANSITION (Defensive Transition)
  // =========================================================================
  {
    id: "defensive_transition_pressing",
    titleTh: "การเปลี่ยนจากรุกเป็นรับ - การบีบเร็วหลังเสียบอล (Defensive Transition)",
    titleEn: "Defensive Transition & Counter-Pressing",
    footballMoment: "Defensive Transition (Attacking to Defending)",
    sourceStandard: "DFB Germany & UEFA Pro Standards",
    keywords: ["defensive transition", "เสียบอล", "บีบเร็ว", "gegenpress", "ตัดบอล", "แย่งบอลคืน"],
    coachingPoints: [
      "5-second rule: Immediate counter-press upon ball loss (เข้าบีบเอาบอลคืนทันทีภายใน 5 วินาทีหลังเสียบอล)",
      "Delay & Recover: If counter-press fails, fall back to compact block (ถ้าเพรสไม่成功 ให้ถอยกลับมาตั้งบล็อกรับ)"
    ],
    tacticalRules: ["Focus on immediate mental switch within 1 second of losing possession"],
    forbiddenTerms: [],
    questions: [
      {
        question: "หลังเสียบอล วินาทีแรกคุณต้องสลับสวิตช์ความคิดไปทำอะไรทันทีในสนาม?",
        category: "DECISION",
        difficulty: "INTERMEDIATE",
        coachingMoment: "BEFORE",
        coachingPurpose: "เน้นย้ำความเร็วในการสลับความคิด (Mental Transition)",
        fourCornerFocus: "Psychological"
      },
      {
        question: "หยุดเกม! ณ จังหวะเสียบอลเมื่อกี้ ใครคือคนที่อยู่ใกล้บอลที่สุดที่ต้องวิ่งเข้าบีบชะลอคู่แข่ง?",
        category: "OBSERVATION",
        difficulty: "INTERMEDIATE",
        coachingMoment: "FREEZE",
        coachingPurpose: "ระบุผู้เล่นเข้าบีบคนแรกในการเปลี่ยนเป็นเกมรับ",
        fourCornerFocus: "Technical/Tactical"
      },
      {
        question: "วันนี้ในจังหวะเปลี่ยนจากรุกเป็นรับ คุณรู้สึกว่าทีมเข้าบีบแย่งบอลคืนได้เร็วแค่ไหน?",
        category: "REFLECTION",
        difficulty: "SIMPLE",
        coachingMoment: "AFTER",
        coachingPurpose: "ถอดบทเรียนทัศนคติการตอบสนองหลังเสียบอล",
        fourCornerFocus: "Psychological"
      }
    ]
  },

  // =========================================================================
  // 4. ZONAL DEFENDING (Out of Possession / Defending)
  // =========================================================================
  {
    id: "zonal_defending",
    titleTh: "การยืนเกมรับแบบคุมพื้นที่ (Out of Possession - Zonal Defending)",
    titleEn: "Out of Possession & Zonal Compactness",
    footballMoment: "Out of Possession (Defending)",
    sourceStandard: "Italian Coverciano & UEFA Pro Standards",
    keywords: ["out of possession", "zone", "คุมพื้นที่", "เกมรับ", "ยืนซอน", "โซน", "compactness", "zonal"],
    coachingPoints: [
      "Maintain line compactness vertically and horizontally (รักษาระยะห่างระหว่างไลน์แนวรับ)",
      "Slide and shift as a unit towards ball side (ขยับซ้อนตำแหน่งทั้งแผงตามทิศทางบอล)",
      "Screen central passing lines (ปิดช่องทางส่งบอลตรงกลางสนาม)"
    ],
    tacticalRules: ["Focus on line compactness, shifting direction, and screening central passes"],
    forbiddenTerms: [],
    questions: [
      {
        question: "ก่อนเริ่มซ้อมเกมรับ Zone นี้ คุณสังเกตเห็นระยะห่างระหว่างไลน์แนวรับของเรากับกองกลางกี่เมตร?",
        category: "OBSERVATION",
        difficulty: "INTERMEDIATE",
        coachingMoment: "BEFORE",
        coachingPurpose: "เช็กการสังเกตระยะห่างระหว่างไลน์ (Compactness) ก่อนเริ่มซ้อม",
        fourCornerFocus: "Technical/Tactical"
      },
      {
        question: "เมื่อกี้จังหวะที่บอลโดนเปลี่ยนแกน มีใครในแผงแนวรับที่เทน้ำหนักขยับช้ากว่าเพื่อนหรือไม่?",
        category: "OBSERVATION",
        difficulty: "INTERMEDIATE",
        coachingMoment: "DURING",
        coachingPurpose: "เช็กความพร้อมและการสปีดขยับแผงแนวรับร่วมกัน",
        fourCornerFocus: "Physical"
      },
      {
        question: "หยุดเกม! ณ จังหวะนี้ ระยะห่างระหว่างตัวเข้าบีบกับตัวซ้อนเปิดช่องกว้างเกินไปหรือไม่?",
        category: "OBSERVATION",
        difficulty: "INTERMEDIATE",
        coachingMoment: "FREEZE",
        coachingPurpose: "จับภาพระยะห่างจริงในสนามของแผงแนวรับ",
        fourCornerFocus: "Technical/Tactical"
      },
      {
        question: "วันนี้ในการยืนรับแบบ Zone จังหวะไหนที่คุณรู้สึกว่าแผงแนวรับขยับรักษาระยะห่างได้แน่นหนาที่สุด?",
        category: "REFLECTION",
        difficulty: "SIMPLE",
        coachingMoment: "AFTER",
        coachingPurpose: "ตอกย้ำวินัยการรักษาระยะห่างในแผงแนวรับ",
        fourCornerFocus: "Psychological"
      }
    ]
  },

  // =========================================================================
  // 5. OFFENSIVE TRANSITION / COUNTER-ATTACK (Offensive Transition)
  // =========================================================================
  {
    id: "offensive_transition_counter",
    titleTh: "การเปลี่ยนจากรับเป็นรุก - การสวนกลับเร็ว (Offensive Transition)",
    titleEn: "Offensive Transition & Fast Counter-Attack",
    footballMoment: "Offensive Transition (Defending to Attacking)",
    sourceStandard: "UEFA Pro & DFB Germany Standards",
    keywords: ["offensive transition", "สวนกลับ", "counter attack", "ตัดบอลได้", "โต้กลับ", "สวนเร็ว"],
    coachingPoints: [
      "First pass forward out of pressure (การจ่ายบอลแรกออกจากโซนกดดัน)",
      "Immediate vertical sprint by forwards into open space (การวิ่งสปีดแนวลึกของกองหน้าเข้าโจมตีพื้นที่ว่าง)",
      "Decision: Direct counter-attack vs Secure possession (สวนกลับเร็วเด็ดขาด หรือ ดึงบอลเซ็ตเพื่อบิ้วอัพ)"
    ],
    tacticalRules: ["Focus on immediate forward awareness right after winning the ball"],
    forbiddenTerms: [],
    questions: [
      {
        question: "เมื่อกี้จังหวะที่เราตัดบอลได้ คุณเห็นช่องทางส่งบอลแนวลึก (Vertical Pass) ตรงไหนที่จะเข้าทำได้เร็วที่สุด?",
        category: "ANALYSIS",
        difficulty: "ADVANCED",
        coachingMoment: "DURING",
        coachingPurpose: "ฝึกการเปลี่ยนจากรับเป็นรุกด้วยการส่งบอลแนวลึก",
        fourCornerFocus: "Technical/Tactical"
      },
      {
        question: "หยุดเกม! ณ จังหวะตัดบอลได้ พื้นที่ด้านหลังแนวรับคู่แข่งเปิดกว้าง เหมาะกับการสวนกลับเร็วหรือดึงบอลรอเพื่อน?",
        category: "DECISION",
        difficulty: "ADVANCED",
        coachingMoment: "FREEZE",
        coachingPurpose: "ตัดสินใจทางเลือกจังหวะเปลี่ยนจากรับเป็นรุก",
        fourCornerFocus: "Technical/Tactical"
      },
      {
        question: "วันนี้ในจังหวะสวนกลับเร็ว เพลย์ไหนที่คุณรู้สึกว่าทีมเคลื่อนที่เปลี่ยนเกมรุกได้เฉียบขาดที่สุด?",
        category: "REFLECTION",
        difficulty: "SIMPLE",
        coachingMoment: "AFTER",
        coachingPurpose: "ตอกย้ำประสิทธิภาพการเปลี่ยนจากรับเป็นรุก",
        fourCornerFocus: "Psychological"
      }
    ]
  }
];

/**
 * Match a drill to the best matching global pedagogy category
 */
export function matchDrillToGlobalPedagogy(drill: any): TacticalCategoryKnowledge {
  const text = `${drill.title || ""} ${drill.category || ""} ${drill.trainingMethod || ""} ${drill.coachingPoints || ""}`.toLowerCase();

  for (const knowledge of GLOBAL_FOOTBALL_PEDAGOGY_DATABASE) {
    for (const keyword of knowledge.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        return knowledge;
      }
    }
  }

  // Default Fallback Category
  return GLOBAL_FOOTBALL_PEDAGOGY_DATABASE[0];
}
