import { AnimatePresence, motion } from "motion/react";
import { BellOff, X } from "lucide-react";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <h2 className="text-xl font-black text-slate-800">Notifications</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <BellOff size={30} />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-800">Notifications unavailable</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                No authoritative notification source is configured. No sample operational alerts
                are shown.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
