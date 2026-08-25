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
  sidebar_matches: { en: "Matches", th: "การแข่งขัน" },

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
  dashboard_item_matches_title: {
    en: "Matches",
    th: "การแข่งขัน",
  },
  dashboard_item_matches_desc: {
    en: "Fixtures, scheduling & Match lifecycle",
    th: "โปรแกรมแข่งขัน ตารางแข่ง และสถานะแมตช์",
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
  // Match Workspace
  match_workspace_title: { en: "Match Workspace", th: "ศูนย์จัดการการแข่งขัน" },
  match_workspace_desc: {
    en: "Create fixtures, maintain Match details and control the official lifecycle",
    th: "สร้างโปรแกรมแข่ง จัดการรายละเอียด และควบคุมสถานะแมตช์อย่างเป็นระบบ",
  },
  match_back_dashboard: { en: "Back to Dashboard", th: "กลับหน้าหลัก" },
  match_back: { en: "Go Back", th: "ย้อนกลับ" },
  match_create: { en: "New Match", th: "สร้างแมตช์" },
  match_create_title: { en: "Create Match", th: "สร้างการแข่งขัน" },
  match_create_desc: {
    en: "Every new Match starts as a Draft. Complete scheduling details before moving it to Scheduled.",
    th: "การแข่งขันใหม่จะเริ่มเป็นแบบร่าง กรุณากรอกข้อมูลให้ครบก่อนเปลี่ยนเป็นสถานะกำหนดแข่ง",
  },
  match_create_draft: { en: "Create Draft", th: "สร้างแบบร่าง" },
  match_refresh: { en: "Refresh", th: "รีเฟรช" },
  match_loading: { en: "Loading authoritative Match records...", th: "กำลังโหลดข้อมูลการแข่งขัน..." },
  match_fixture_list: { en: "Match Register", th: "รายการการแข่งขัน" },
  match_records: { en: "records", th: "รายการ" },
  match_filter_all: { en: "All statuses", th: "ทุกสถานะ" },
  match_filter_empty_title: { en: "No Matches in this filter", th: "ไม่มีการแข่งขันในสถานะนี้" },
  match_filter_empty_desc: { en: "Choose another status to view available Matches.", th: "เลือกสถานะอื่นเพื่อดูการแข่งขันที่มีอยู่" },
  match_empty_title: { en: "No Matches yet", th: "ยังไม่มีการแข่งขัน" },
  match_empty_desc: { en: "Create the first Draft Match for this Academy workspace.", th: "สร้างการแข่งขันแบบร่างรายการแรกสำหรับอคาเดมีนี้" },
  match_no_academy_title: { en: "Academy workspace required", th: "ต้องเลือกอคาเดมีก่อน" },
  match_no_academy_desc: {
    en: "Match data cannot be accessed without an authoritative Academy workspace.",
    th: "ไม่สามารถเข้าถึงข้อมูลการแข่งขันได้หากยังไม่มีอคาเดมีที่ได้รับสิทธิ์อย่างถูกต้อง",
  },
  match_read_error_title: { en: "Matches unavailable", th: "ไม่สามารถโหลดการแข่งขันได้" },
  match_read_error_desc: {
    en: "Authoritative Match records could not be loaded. No local or fallback data has been substituted.",
    th: "ไม่สามารถโหลดข้อมูลการแข่งขันจากแหล่งข้อมูลหลักได้ ระบบไม่ได้ใช้ข้อมูลสำรองที่ไม่ผ่านการยืนยัน",
  },
  match_retry: { en: "Retry", th: "ลองอีกครั้ง" },
  match_mutation_failed: {
    en: "The Match change was not saved. Refresh the workspace and try again.",
    th: "ไม่สามารถบันทึกการเปลี่ยนแปลงได้ กรุณารีเฟรชและลองอีกครั้ง",
  },
  match_validation_title: { en: "Match information needs attention", th: "กรุณาตรวจสอบข้อมูลการแข่งขัน" },
  match_field_squad: { en: "Squad", th: "ทีม / รุ่น" },
  match_field_competition: { en: "Competition", th: "รายการแข่งขัน" },
  match_field_opponent: { en: "Opponent", th: "คู่แข่งขัน" },
  match_field_kickoff: { en: "Kickoff", th: "วันและเวลาแข่งขัน" },
  match_field_venue: { en: "Venue", th: "สถานที่แข่งขัน" },
  match_optional: { en: "Optional while Draft", th: "เว้นว่างได้ขณะเป็นแบบร่าง" },
  match_no_opponent: { en: "Opponent not set", th: "ยังไม่ได้ระบุคู่แข่งขัน" },
  match_no_kickoff: { en: "Kickoff not set", th: "ยังไม่ได้กำหนดเวลาแข่ง" },
  match_not_set: { en: "Not set", th: "ยังไม่ได้กำหนด" },
  match_venue_home: { en: "Home", th: "เหย้า" },
  match_venue_away: { en: "Away", th: "เยือน" },
  match_venue_neutral: { en: "Neutral", th: "สนามกลาง" },
  match_status_draft: { en: "Draft", th: "แบบร่าง" },
  match_status_scheduled: { en: "Scheduled", th: "กำหนดแข่ง" },
  match_status_in_progress: { en: "In Progress", th: "กำลังแข่งขัน" },
  match_status_completed: { en: "Completed", th: "แข่งขันเสร็จแล้ว" },
  match_status_cancelled: { en: "Cancelled", th: "ยกเลิก" },
  match_edit: { en: "Edit", th: "แก้ไข" },
  match_edit_title: { en: "Edit Match Details", th: "แก้ไขรายละเอียดการแข่งขัน" },
  match_save: { en: "Save Changes", th: "บันทึกการแก้ไข" },
  match_discard: { en: "Discard", th: "ยกเลิกการแก้ไข" },
  match_lifecycle_actions: { en: "Match Lifecycle", th: "จัดการสถานะแมตช์" },
  match_action_schedule: { en: "Schedule Match", th: "ยืนยันกำหนดแข่ง" },
  match_action_start: { en: "Start Match", th: "เริ่มการแข่งขัน" },
  match_action_complete: { en: "Complete Match", th: "จบการแข่งขัน" },
  match_action_cancel: { en: "Cancel Match", th: "ยกเลิกการแข่งขัน" },
  match_cancel_confirm: {
    en: "Cancel this Match? A cancelled Match becomes immutable historical evidence.",
    th: "ยืนยันยกเลิกการแข่งขันนี้หรือไม่ เมื่อยกเลิกแล้วข้อมูลแมตช์จะถูกล็อกเป็นประวัติถาวร",
  },
  match_terminal_note: {
    en: "This Match is terminal historical evidence and can no longer be edited.",
    th: "การแข่งขันนี้เป็นหลักฐานประวัติที่สิ้นสุดแล้วและไม่สามารถแก้ไขได้อีก",
  },
  match_created: { en: "Created", th: "สร้างเมื่อ" },
  match_updated: { en: "Updated", th: "แก้ไขล่าสุด" },
  match_created_by: { en: "Created by", th: "สร้างโดย" },
  match_updated_by: { en: "Updated by", th: "แก้ไขโดย" },

  // Post-Match placeholder
  post_match_title: { en: "Post-Match Entry", th: "ข้อมูลหลังการแข่งขัน" },
  post_match_desc: {
    en: "Statistics, player ratings and coach awards",
    th: "สถิติ คะแนนผู้เล่น และรางวัลจากโค้ช",
  },
  post_match_unavailable_title: {
    en: "Post-Match statistics are not active yet",
    th: "ระบบสถิติหลังการแข่งขันยังไม่เปิดใช้งาน",
  },
  post_match_unavailable_desc: {
    en: "Authoritative Match records are now available in Matches. Statistics, player ratings and coach awards remain unavailable in this phase.",
    th: "ข้อมูลการแข่งขันหลักมีอยู่แล้วในเมนูการแข่งขัน แต่สถิติ คะแนนผู้เล่น และรางวัลจากโค้ชยังไม่เปิดใช้งานในระยะนี้",
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
