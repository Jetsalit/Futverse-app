import { ArrowLeft, CreditCard, LogOut, ShieldAlert } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface SubscriptionPaywallProps {
  onBack?: () => void;
}

export default function SubscriptionPaywall({ onBack }: SubscriptionPaywallProps) {
  const { logout } = useAuth();

  return (
    <div className="min-h-[70vh] w-full bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <ShieldAlert size={32} />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Billing is unavailable
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm font-medium leading-6 text-slate-600">
          FUTVERSE does not currently have a configured payment provider or payment-evidence
          upload service. No payment can be accepted or submitted from this screen.
        </p>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 shrink-0 text-slate-500" size={20} />
            <p className="text-sm text-slate-600">
              Contact your Academy administrator for billing information. Do not send money or
              payment evidence unless the administrator provides a verified payment channel
              outside this application.
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200"
            >
              <ArrowLeft size={18} /> Back
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            <LogOut size={18} /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}
