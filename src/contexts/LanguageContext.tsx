import React, { createContext, useContext, useState, ReactNode } from "react";

export type Language = "th" | "en";

type Translations = Record<string, { en: string; th: string }>;

export const translations: Translations = {
  // Sidebar
  sidebar_main_op: { en: "Main Operations", th: "เมนูหลัก" },
  sidebar_dashboard: { en: "Dashboard", th: "หน้าหลัก" },
  sidebar_pro: { en: "Pro Players", th: "นักเตะอาชีพ" },
  sidebar_fitness: { en: "Fitness Testing", th: "ทดสอบสมรรถภาพ" },
  sidebar_recovery: { en: "Recovery & Medical", th: "ฟื้นฟูและพยาบาล" },
  sidebar_coaches: { en: "Coaches", th: "ผู้ฝึกสอน" },
  sidebar_scout: { en: "Scouting Portal", th: "ระบบแมวมอง" },
  sidebar_drills: { en: "Drill Library", th: "คลังแบบฝึกซ้อม" },
  sidebar_periodization: { en: "Periodization", th: "การวางแผนระยะยาว" },

  // Dashboard Menu Items
  dash_quick_op: { en: "Quick Operations", th: "เมนูด่วน" },
  dash_quick_op_desc: {
    en: "Core management modules",
    th: "ระบบจัดการหลักของแพลตฟอร์ม",
  },

  youth_title: { en: "Youth", th: "เยาวชน" },
  youth_desc: { en: "Academy Players", th: "นักกีฬาอคาเดมี" },

  pro_title: { en: "Pro", th: "อาชีพ" },
  pro_desc: { en: "Senior Squad", th: "ทีมชุดใหญ่" },

  stats_title: { en: "Match Stats", th: "สถิติแข่งขัน" },
  stats_desc: { en: "Post-game Data", th: "ข้อมูลหลังเกม" },

  analysis_title: { en: "Analysis", th: "วิเคราะห์เกม" },
  analysis_desc: { en: "Video & Tactics", th: "วิดีโอและแทคติก" },

  recovery_title: { en: "Recovery", th: "ฟื้นฟูร่างกาย" },
  recovery_desc: { en: "Physio & Medical", th: "กายภาพและการแพทย์" },

  drills_title: { en: "Drills", th: "แบบฝึกซ้อม" },
  drills_desc: { en: "Practice Library", th: "คลังแบบฝึกซ้อม" },

  coaches_title: { en: "Coaches", th: "ผู้ฝึกสอน" },
  coaches_desc: { en: "Staff Management", th: "จัดการสตาฟโค้ช" },

  scout_title: { en: "Scout Report", th: "แมวมอง" },
  scout_desc: { en: "Talent Finding", th: "ค้นหาดาวรุ่ง" },

  periodization_week_title: { en: "Weekly Plan", th: "แผนซ้อมประจำสัปดาห์" },
  periodization_week_desc: { en: "Microcycle", th: "คาบการฝึกซ้อมสัปดาห์" },

  // Command Center (Dashboard)
  dashboard_title: { en: "Command Center", th: "แผงควบคุม" },
  dashboard_desc: {
    en: "Overview of your club operations and management modules",
    th: "ภาพรวมการดำเนินงานและระบบจัดการสโมสร",
  },
  dashboard_section_daily: { en: "Daily Operations", th: "ปฏิบัติการรายวัน" },
  dashboard_item_period_title: {
    en: "Weekly Periodization",
    th: "ตารางซ้อมรายสัปดาห์",
  },
  dashboard_item_period_desc: {
    en: "Training plans (Microcycle)",
    th: "แผนการฝึกซ้อม (Microcycle)",
  },
  dashboard_item_youth_title: {
    en: "Youth Academy Roster",
    th: "รายชื่อนักเตะเยาวชน",
  },
  dashboard_item_youth_desc: {
    en: "Manage youth players",
    th: "จัดการนักเตะเยาวชน",
  },
  dashboard_item_xi_title: {
    en: "Starting XI & Tactics",
    th: "จัดตัวผู้เล่นและแทคติก",
  },
  dashboard_item_xi_desc: {
    en: "Match tactics & lineup builder",
    th: "จำลอง 11 ตัวจริงก่อนแข่ง",
  },

  dashboard_section_academy: {
    en: "Academy Management",
    th: "การจัดการอคาเดมี",
  },
  dashboard_item_pro_title: { en: "Professional Players", th: "นักเตะอาชีพ" },
  dashboard_item_pro_desc: {
    en: "Elite squad management",
    th: "จัดการทีมชุดใหญ่",
  },
  dashboard_item_coaches_title: { en: "Coaching Staff", th: "ทีมงานผู้ฝึกสอน" },
  dashboard_item_coaches_desc: {
    en: "Coach profiles & assignments",
    th: "โปรไฟล์และงานของโค้ช",
  },
  dashboard_item_recovery_title: {
    en: "Recovery & Medical",
    th: "ฟื้นฟูและพยาบาล",
  },
  dashboard_item_recovery_desc: {
    en: "Player health & fitness",
    th: "สุขภาพและความฟิต",
  },

  dashboard_section_resources: {
    en: "Resources & Recruitment",
    th: "ทรัพยากรและการสรรหา",
  },
  dashboard_item_drills_title: { en: "Drill Library", th: "คลังแบบฝึกซ้อม" },
  dashboard_item_drills_desc: {
    en: "Training exercises repository",
    th: "รวบรวมแบบฝึกซ้อม",
  },
  dashboard_item_scout_title: { en: "Scouting Portal", th: "ระบบแมวมอง" },
  dashboard_item_scout_desc: {
    en: "Talent identification",
    th: "ค้นหานักเตะดาวรุ่ง",
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations | string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("app_language");
    if (saved === "en" || saved === "th") {
      return saved as Language;
    }
    return "en"; // default to en
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app_language", lang);
  };

  const t = (key: keyof typeof translations | string) => {
    if (translations[key]) {
      return translations[key][language] || key;
    }
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
