import React from 'react';
import { ShieldAlert } from 'lucide-react';

export default function AccessDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full py-20 px-4 text-center">
      <div className="w-24 h-24 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-6">
        <ShieldAlert size={48} strokeWidth={1.5} />
      </div>
      <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">Access Denied</h1>
      <p className="text-slate-500 font-medium max-w-md mx-auto mb-8">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (You do not have permission to view this page).
      </p>
      <button 
        onClick={onBack}
        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-colors"
      >
        กลับหน้า Dashboard
      </button>
    </div>
  );
}
