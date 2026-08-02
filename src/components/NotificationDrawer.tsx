import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  CheckCircle2,
  HeartPulse,
  AlertTriangle,
  TrendingUp,
  Info,
  User
} from "lucide-react";
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { AppNotification } from "../lib/notifications";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications?: AppNotification[];
  onNavigate?: (page: string) => void;
}

const getNotificationStyle = (type: string) => {
  switch (type) {
    case "Medical":
      return { icon: HeartPulse, color: "text-rose-500", bg: "bg-rose-100", border: "border-rose-200" };
    case "Operations":
      return { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-100", border: "border-amber-200" };
    case "Performance":
      return { icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-100", border: "border-emerald-200" };
    case "Coach":
      return { icon: User, color: "text-blue-500", bg: "bg-blue-100", border: "border-blue-200" };
    case "System":
    default:
      return { icon: Info, color: "text-indigo-500", bg: "bg-indigo-100", border: "border-indigo-200" };
  }
};

const formatTimeAgo = (timestamp: any) => {
  if (!timestamp) return "Just now";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
};

export default function NotificationDrawer({
  isOpen,
  onClose,
  notifications: propNotifications,
  onNavigate,
}: NotificationDrawerProps) {
  const { currentUser } = useAuth();
  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (propNotifications !== undefined) return;
    if (!currentUser) return;

    const userId = (currentUser as any).uid || (currentUser as any).id;
    if (!userId) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: AppNotification[] = [];
      snapshot.forEach((doc) => {
        notifs.push({ id: doc.id, ...doc.data() } as AppNotification);
      });
      notifs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : Date.now());
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : Date.now());
        return timeB - timeA;
      });
      setLocalNotifications(notifs);
    });

    return () => unsubscribe();
  }, [currentUser, propNotifications]);

  const notifications = propNotifications !== undefined ? propNotifications : localNotifications;

  const markAllAsRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.filter(n => !n.isRead).forEach((n) => {
        if (n.id) {
          const ref = doc(db, "notifications", n.id);
          batch.update(ref, { isRead: true });
        }
      });
      await batch.commit();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const ref = doc(db, "notifications", id);
      await updateDoc(ref, { isRead: true });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const handleNotificationClick = (notification: AppNotification) => {
    if (notification.id && !notification.isRead) {
      markAsRead(notification.id);
    }
    if (notification.actionUrl && onNavigate) {
      onNavigate(notification.actionUrl);
      onClose();
    }
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
            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-slate-800 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800/80 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-slate-800 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-indigo-400 dark:to-emerald-400 dark:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">
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
                className="p-2 -mr-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors focus:outline-none cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>

            {/* Actions */}
            {unreadCount > 0 && (
              <div className="px-4 md:px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700/50 flex justify-end">
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1.5 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors py-1 cursor-pointer"
                >
                  <CheckCircle2 size={16} /> Mark all as read
                </button>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {notifications.map((notification) => {
                const style = getNotificationStyle(notification.type);
                const Icon = style.icon;
                
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`relative p-4 rounded-2xl border transition-all ${
                      notification.isRead
                        ? "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700/30 opacity-70"
                        : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-600 shadow-sm hover:border-slate-300 dark:hover:border-slate-500 cursor-pointer"
                    }`}
                  >
                    {!notification.isRead && (
                      <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-rose-500"></div>
                    )}
                    <div className="flex items-start gap-4">
                      <div
                        className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.bg} ${style.color} ${style.border} border dark:bg-slate-700 dark:border-slate-600`}
                      >
                        <Icon size={20} strokeWidth={2.5} />
                      </div>
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {notification.type}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                            • {formatTimeAgo(notification.createdAt)}
                          </span>
                        </div>
                        <h3
                          className={`text-sm font-bold mb-1 ${notification.isRead ? "text-slate-600 dark:text-slate-400" : "text-slate-800 dark:text-slate-200"}`}
                        >
                          {notification.title}
                        </h3>
                        <p
                          className={`text-xs font-medium leading-relaxed ${notification.isRead ? "text-slate-400 dark:text-slate-500" : "text-slate-500 dark:text-slate-400"}`}
                        >
                          {notification.message}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {notifications.length === 0 && (
                <div className="py-10 text-center flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mb-3 border border-transparent dark:border-slate-700/50">
                    <CheckCircle2 size={32} className="text-emerald-500 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-300">
                    You're all caught up!
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    No new notifications right now.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
