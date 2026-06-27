import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { LogOut } from "lucide-react";

export default function PendingApproval() {
  const { logout, currentUser } = useAuth();
  const isRejected = currentUser?.status === "REJECTED";

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-6">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isRejected ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}>
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isRejected ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
        </div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">
          {isRejected ? "Account Rejected" : "Account Pending"}
        </h2>
        <p className="text-slate-500 font-medium">
          {isRejected 
            ? "Your account registration has been rejected. Please contact support for more information."
            : "Your account is waiting for approval. Please contact an administrator or wait until your account is reviewed."}
        </p>
        <button
          onClick={logout}
          className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
