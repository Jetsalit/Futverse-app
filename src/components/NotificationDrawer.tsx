import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, HeartPulse, AlertTriangle, TrendingUp } from 'lucide-react';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const INITIAL_NOTIFICATIONS = [
  { 
    id: 1, 
    type: 'Medical', 
    title: 'Injury Update', 
    message: 'Somchai reported knee pain after training. Requires assessment.', 
    isRead: false, 
    time: '2h ago',
    icon: HeartPulse,
    color: 'text-rose-500',
    bg: 'bg-rose-100',
    border: 'border-rose-200'
  },
  { 
    id: 2, 
    type: 'Operations', 
    title: 'Schedule Change', 
    message: 'U15 afternoon training session moved to Pitch B.', 
    isRead: false, 
    time: '4h ago',
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-100',
    border: 'border-amber-200'
  },
  { 
    id: 3, 
    type: 'Performance', 
    title: 'Fitness Benchmark', 
    message: 'Pro squad achieved 95% target in Yo-Yo test.', 
    isRead: true, 
    time: '1d ago',
    icon: TrendingUp,
    color: 'text-emerald-500',
    bg: 'bg-emerald-100',
    border: 'border-emerald-200'
  },
];

export default function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const markAsRead = (id: number) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

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
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-slate-800">Notifications</h2>
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
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => markAsRead(notification.id)}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer ${
                    notification.isRead 
                      ? 'bg-white border-slate-100 opacity-70' 
                      : `bg-slate-50 border-slate-200 shadow-sm hover:border-slate-300`
                  }`}
                >
                  {!notification.isRead && (
                    <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-rose-500"></div>
                  )}
                  <div className="flex items-start gap-4">
                    <div className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${notification.bg} ${notification.color} ${notification.border} border`}>
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
                      <h3 className={`text-sm font-bold mb-1 ${notification.isRead ? 'text-slate-600' : 'text-slate-800'}`}>
                        {notification.title}
                      </h3>
                      <p className={`text-xs font-medium leading-relaxed ${notification.isRead ? 'text-slate-400' : 'text-slate-500'}`}>
                        {notification.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {notifications.length === 0 && (
                <div className="py-10 text-center flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <CheckCircle2 size={32} className="text-emerald-500" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">You're all caught up!</h3>
                  <p className="text-xs text-slate-500 mt-1">No new notifications right now.</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
