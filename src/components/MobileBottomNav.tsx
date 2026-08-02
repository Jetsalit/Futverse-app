import React from "react";
import { Home, Calendar, Users, Shield, Menu } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface MobileBottomNavProps {
  currentPage: string;
  navigateTo: (page: string) => void;
  openDrawer: () => void;
}

export default function MobileBottomNav({
  currentPage,
  navigateTo,
  openDrawer,
}: MobileBottomNavProps) {
  const { hasPermission } = useAuth();
  const isCoachOrAdmin = hasPermission(["ADMIN", "COACH", "SUPERADMIN"]);

  const navItems = isCoachOrAdmin ? [
    { id: "dashboard", label: "หน้าหลัก", icon: Home },
    { id: "periodization", label: "การฝึก", icon: Calendar },
    { id: "youth", label: "นักกีฬา", icon: Users },
    { id: "starting_xi", label: "การแข่งขัน", icon: Shield },
  ] : [
    { id: "dashboard", label: "หน้าหลัก", icon: Home },
    { id: "periodization", label: "ตารางฝึกซ้อม", icon: Calendar },
    { id: "starting_xi", label: "แผนการแข่ง", icon: Shield },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around items-center px-2 py-3 z-50 sm:hidden pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.05)]">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => navigateTo(item.id)}
            className={`flex flex-col items-center gap-1 min-w-[64px] px-2 py-1 rounded-xl transition-all ${
              isActive
                ? "text-emerald-600 scale-105"
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            }`}
          >
            <div className={`p-1.5 rounded-full ${isActive ? "bg-emerald-50" : ""}`}>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            </div>
            <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>
              {item.label}
            </span>
          </button>
        );
      })}
      
      {/* Drawer Toggle */}
      <button
        onClick={openDrawer}
        className="flex flex-col items-center gap-1 min-w-[64px] px-2 py-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
      >
        <div className="p-1.5 rounded-full">
          <Menu size={22} strokeWidth={2} />
        </div>
        <span className="text-[10px] font-medium">เพิ่มเติม</span>
      </button>
    </div>
  );
}
