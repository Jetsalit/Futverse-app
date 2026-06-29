import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  CheckCircle2,
  HeartPulse,
  AlertTriangle,
  TrendingUp,
  Bell
} from "lucide-react";
import { EmptyState } from "./common/EmptyState";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationDrawer({
  isOpen,
  onClose,
}: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<any[]>([]);

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
  };

  const markAsRead = (id: number) => {
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 transition-opacity"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-slate-800">
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors focus:outline-none"
              >
                <X size={24} />
              </button>
            </div>

            {/* Actions */}
            {unreadCount > 0 && (
              <div className="px-4 md:px-6 py-3 bg-slate-50 border-b border-slate-100 flex justify-end">
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors py-1"
                >
                  <CheckCircle2 size={16} /> Mark all as read
                </button>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col h-full">
              {notifications.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center pb-20">
                  <EmptyState
                    icon={Bell}
                    title="No Notifications"
                    description="You're all caught up! There are no new alerts or messages at this time."
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => markAsRead(notification.id)}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer ${
                    notification.isRead
                      ? "bg-white border-slate-100 opacity-70"
                      : `bg-slate-50 border-slate-200 shadow-sm hover:border-slate-300`
                  }`}
                >
                  {!notification.isRead && (
                    <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-rose-500"></div>
                  )}
                  <div className="flex items-start gap-4">
                    <div
                      className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${notification.bg} ${notification.color} ${notification.border} border`}
                    >
                      <notification.icon size={20} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                          {notification.type}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          • {notification.time}
                        </span>
                      </div>
                      <h3
                        className={`text-sm font-bold mb-1 ${notification.isRead ? "text-slate-600" : "text-slate-800"}`}
                      >
                        {notification.title}
                      </h3>
                      <p
                        className={`text-xs font-medium leading-relaxed ${notification.isRead ? "text-slate-400" : "text-slate-500"}`}
                      >
                        {notification.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              </div>
             )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
