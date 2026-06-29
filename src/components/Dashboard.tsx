import { useState, useEffect } from "react";
import {
  Calendar,
  Users,
  Shield,
  Star,
  UserCheck,
  Heart,
  ClipboardList,
  Search,
  Activity,
  Settings,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth, UserRole } from "../contexts/AuthContext";

type DashboardItem = {
  id: string;
  titleKey?: string;
  descKey?: string;
  defaultTitle?: string;
  defaultDesc?: string;
  icon: any;
  color: string;
  route: string;
  allowedRoles?: UserRole[];
};

type DashboardSection = {
  titleKey: string;
  items: DashboardItem[];
};

const SECTIONS: DashboardSection[] = [
  {
    titleKey: "dashboard_section_daily",
    items: [
      {
        id: "periodization",
        titleKey: "dashboard_item_period_title",
        descKey: "dashboard_item_period_desc",
        icon: Calendar,
        color: "bg-indigo-500 text-indigo-50",
        route: "periodization",
        allowedRoles: ["ADMIN", "COACH", "SUPERADMIN"],
      },
      {
        id: "xi",
        titleKey: "dashboard_item_xi_title",
        descKey: "dashboard_item_xi_desc",
        icon: Shield,
        color: "bg-emerald-500 text-emerald-50",
        route: "starting_xi",
        allowedRoles: ["ADMIN", "COACH", "SUPERADMIN"],
      },
      {
        id: "youth",
        titleKey: "dashboard_item_youth_title",
        descKey: "dashboard_item_youth_desc",
        icon: Users,
        color: "bg-blue-500 text-blue-50",
        route: "youth",
        allowedRoles: ["ADMIN", "COACH", "SUPERADMIN"],
      },
    ],
  },
  {
    titleKey: "dashboard_section_academy",
    items: [
      {
        id: "pro",
        titleKey: "dashboard_item_pro_title",
        descKey: "dashboard_item_pro_desc",
        icon: Star,
        color: "bg-violet-500 text-violet-50",
        route: "pro",
        allowedRoles: ["ADMIN", "COACH", "SCOUT", "SUPERADMIN", "PLAYER"],
      },
      {
        id: "coaches",
        titleKey: "dashboard_item_coaches_title",
        descKey: "dashboard_item_coaches_desc",
        icon: UserCheck,
        color: "bg-purple-500 text-purple-50",
        route: "coaches",
        allowedRoles: ["ADMIN", "SUPERADMIN"],
      },
      {
        id: "recovery",
        titleKey: "dashboard_item_recovery_title",
        descKey: "dashboard_item_recovery_desc",
        icon: Heart,
        color: "bg-rose-500 text-rose-50",
        route: "recovery",
        allowedRoles: ["ADMIN", "COACH", "SUPERADMIN"],
      },
      {
        id: "fitness",
        defaultTitle: "Performance Benchmarks",
        defaultDesc: "Track player fitness testing data",
        icon: Activity,
        color: "bg-orange-500 text-orange-50",
        route: "fitness",
        allowedRoles: ["ADMIN", "COACH", "SUPERADMIN"],
      },
    ],
  },
  {
    titleKey: "dashboard_section_resources",
    items: [
      {
        id: "drills",
        titleKey: "dashboard_item_drills_title",
        descKey: "dashboard_item_drills_desc",
        icon: ClipboardList,
        color: "bg-cyan-500 text-cyan-50",
        route: "drills",
        allowedRoles: ["ADMIN", "COACH", "SUPERADMIN", "PLAYER"],
      },
      {
        id: "scout",
        titleKey: "dashboard_item_scout_title",
        descKey: "dashboard_item_scout_desc",
        icon: Search,
        color: "bg-amber-500 text-amber-50",
        route: "scout",
        allowedRoles: ["ADMIN", "SCOUT", "SUPERADMIN"],
      },
      {
        id: "settings",
        defaultTitle: "Academy Settings",
        defaultDesc: "Manage platform configuration",
        icon: Settings,
        color: "bg-slate-700 text-slate-50",
        route: "settings",
        allowedRoles: ["ADMIN", "SUPERADMIN"],
      },
      {
        id: "superadmin",
        defaultTitle: "Superadmin Portal",
        defaultDesc: "Global System Management",
        icon: Shield,
        color: "bg-violet-600 text-violet-50",
        route: "superadmin",
        allowedRoles: ["SUPERADMIN"],
      },
      {
        id: "concierge",
        defaultTitle: "Data Entry Concierge",
        defaultDesc: "Manage your assigned clients",
        icon: Settings,
        color: "bg-cyan-600 text-cyan-50",
        route: "concierge",
        allowedRoles: ["DATA_ADMIN"],
      },
    ],
  },
];

export default function Dashboard({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { t, language } = useLanguage();
  const { hasPermission, currentUser } = useAuth();

  return (
    <div className="w-full max-w-6xl mx-auto pb-10">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">
          {t("dashboard_title")}
        </h1>
        <p className="text-sm font-medium text-slate-500 mt-1">
          {t("dashboard_desc")}
        </p>
      </div>

      <div className="space-y-8">
        {SECTIONS.map((section, idx) => {
          const visibleItems = section.items.filter(
            (item) => !item.allowedRoles || hasPermission(item.allowedRoles),
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={idx}>
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                {t(section.titleKey)}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.route)}
                    className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md cursor-pointer flex items-center gap-4 transition-all text-left group"
                  >
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${item.color} group-hover:scale-105 transition-transform shadow-sm`}
                    >
                      <item.icon size={24} strokeWidth={2} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                        {item.titleKey ? t(item.titleKey) : item.defaultTitle}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                        {item.descKey ? t(item.descKey) : item.defaultDesc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
