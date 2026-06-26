import React, { useState } from "react";
import { useAuth, UserRole } from "../contexts/AuthContext";
import { auth, db } from "../lib/firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import {
  Shield,
  Mail,
  Lock,
  User,
  Crown,
  Navigation,
  ChevronRight,
  Database,
  Loader2,
} from "lucide-react";

const FutVerseLogo = ({ className = "" }: { className?: string }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="futTop" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#D4FF00" />
        <stop offset="100%" stopColor="#FAFF00" />
      </linearGradient>
      <linearGradient id="futBot" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00E659" />
        <stop offset="100%" stopColor="#A8FF00" />
      </linearGradient>
    </defs>
    <path
      d="M 22 55 C 32 30 46 22 72 22 L 98 22 L 85 36 L 68 36 C 55 36 46 42 41 55 Z"
      fill="url(#futTop)"
    />
    <path
      d="M 12 85 C 24 64 36 48 60 48 L 90 48 L 77 62 L 55 62 C 45 62 36 72 30 85 Z"
      fill="url(#futBot)"
    />
  </svg>
);

export default function Login() {
  const { login } = useAuth();
  const [isLoginView, setIsLoginView] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [showDemo, setShowDemo] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const handleLogoClick = () => {
    setClickCount((prev) => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        setShowDemo(true);
        return 0;
      }
      return newCount;
    });

    // Reset click count after a delay
    setTimeout(() => {
      setClickCount((current) => Math.max(0, current - 1));
    }, 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    
    try {
      if (!isLoginView) {
        if (password !== confirmPassword) {
          setError("Passwords do not match!");
          setIsSubmitting(false);
          return;
        }
        
        // Register new user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: name });
        
        // Save user data to Firestore
        await setDoc(doc(db, "users", user.uid), {
          name: name,
          email: email,
          role: "USER", // Default role
          createdAt: new Date()
        });
        
      } else {
        // Sign in existing user
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleLogin = (role: UserRole, loginName: string) => {
    login({ name: loginName, role });
  };

  return (
    <div className="flex h-screen w-full bg-white relative">
      {/* Left Hero Section (Hidden on Mobile) */}
      <div className="hidden lg:flex flex-1 relative bg-slate-900 overflow-hidden items-center justify-center flex-col">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-overlay"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1518605368461-1ee71abfbeb4?auto=format&fit=crop&q=80&w=2400')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />

        <div className="relative z-10 px-16 text-center max-w-3xl">
          <div
            onClick={handleLogoClick}
            className="w-24 h-24 mb-8 bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-3xl mx-auto flex items-center justify-center cursor-pointer overflow-hidden p-3"
          >
            <FutVerseLogo className="w-full h-full" />
          </div>
          <h1 className="text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight leading-tight">
            Welcome to <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400">
              FUTVERSE Command Center
            </span>
          </h1>
          <p className="text-lg text-slate-300 font-medium max-w-xl mx-auto leading-relaxed">
            The next-generation intelligence platform for elite football
            academies. Manage your talents, analyze performance, and dominate
            the game.
          </p>
        </div>
      </div>

      {/* Right Form Section */}
      <div className="w-full lg:w-[600px] flex flex-col justify-center px-8 sm:px-16 overflow-y-auto bg-white/50 backdrop-blur-3xl relative z-10">
        <div className="max-w-sm w-full mx-auto py-12 flex-1 flex flex-col justify-center">
          {/* Logo Context for Mobile */}
          <div
            onClick={handleLogoClick}
            className="lg:hidden w-16 h-16 mb-8 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center cursor-pointer shadow-lg p-2"
          >
            <FutVerseLogo className="w-full h-full" />
          </div>
          <h2 className="lg:hidden text-2xl font-black text-slate-900 mb-2 leading-tight">
            FUTVERSE
          </h2>

          <h3 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
            {isLoginView ? "Sign In" : "Create Account"}
          </h3>
          <p className="text-slate-500 font-medium mb-8">
            {isLoginView
              ? "Enter your email and password to access your account."
              : "Set up a new user account with your email."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-xl border border-red-100 flex flex-col">
                <span>{error}</span>
              </div>
            )}
            
            {!isLoginView && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 pl-1">
                  Full Name
                </label>
                <div className="relative">
                  <User
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-[#E1FF01] focus:border-[#E1FF01] outline-none transition-all placeholder:text-slate-400"
                    required={!isLoginView}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 pl-1">
                Email Address
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="coach@futverse.com"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-[#E1FF01] focus:border-[#E1FF01] outline-none transition-all placeholder:text-slate-400"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5 pl-1">
                <label className="block text-xs font-bold text-slate-700">
                  Password
                </label>
                {isLoginView && (
                  <button
                    type="button"
                    onClick={(e) => e.preventDefault()}
                    className="text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-transparent border-none p-0 cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-[#E1FF01] focus:border-[#E1FF01] outline-none transition-all placeholder:text-slate-400 tracking-widest"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {!isLoginView && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 pl-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-[#E1FF01] focus:border-[#E1FF01] outline-none transition-all placeholder:text-slate-400 tracking-widest"
                    required={!isLoginView}
                    minLength={6}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-[#E1FF01] font-black rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.15)] transition-all flex items-center justify-center gap-2 mt-4 uppercase tracking-wide text-sm"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  {isLoginView ? "Sign In" : "Create Account"} <ChevronRight size={16} className="text-[#E1FF01]" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-slate-500 font-medium">
              {isLoginView ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => setIsLoginView(!isLoginView)}
                className="text-indigo-600 font-bold hover:text-indigo-700 underline underline-offset-2"
              >
                {isLoginView ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>

          {/* Demo Roles Section */}
          {showDemo && (
            <div className="mt-12 pt-8 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-6">
                <span className="h-px bg-slate-200 flex-1"></span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2 group">
                  Fast Login for Testing (Demo Mode)
                </span>
                <span className="h-px bg-slate-200 flex-1"></span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => handleRoleLogin("ADMIN", "Director J")}
                  className="flex items-center gap-3 p-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 group transition-colors"
                  title="Full Access"
                >
                  <div className="w-10 h-10 rounded-lg bg-rose-100/50 flex items-center justify-center shrink-0">
                    <Crown
                      size={20}
                      className="group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">
                      Login as Director
                    </div>
                    <div className="text-[10px] uppercase font-bold text-rose-400/80 tracking-wider">
                      ADMIN Role
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleRoleLogin("COACH", "Coach Pep")}
                  className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 group transition-colors"
                  title="Management Access"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-100/50 flex items-center justify-center shrink-0">
                    <Navigation
                      size={20}
                      className="group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">
                      Login as Head Coach
                    </div>
                    <div className="text-[10px] uppercase font-bold text-emerald-400/80 tracking-wider">
                      COACH Role
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleRoleLogin("SCOUT", "Chief Scout")}
                  className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 group transition-colors"
                  title="Scouting Access"
                >
                  <div className="w-10 h-10 rounded-lg bg-amber-100/50 flex items-center justify-center shrink-0">
                    <span className="text-lg group-hover:scale-110 transition-transform block">
                      🕵️
                    </span>
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">
                      Login as Scout
                    </div>
                    <div className="text-[10px] uppercase font-bold text-amber-500/80 tracking-wider">
                      SCOUT Role
                    </div>
                  </div>
                </button>

                <button
                  onClick={() =>
                    login({
                      name: "Parent Dan",
                      role: "USER",
                      status: "Inactive",
                    })
                  }
                  className="flex items-center gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 group transition-colors"
                  title="Read-only Access"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-100/50 flex items-center justify-center shrink-0">
                    <User
                      size={20}
                      className="group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">
                      Login as Parent
                    </div>
                    <div className="text-[10px] uppercase font-bold text-blue-400/80 tracking-wider">
                      USER Role (Inactive)
                    </div>
                  </div>
                </button>

                <button
                  onClick={() =>
                    handleRoleLogin("DATA_ADMIN", "Data Entry Pro")
                  }
                  className="flex items-center gap-3 p-3 rounded-xl border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 group transition-colors"
                  title="Data Entry Access"
                >
                  <div className="w-10 h-10 rounded-lg bg-cyan-100/50 flex items-center justify-center shrink-0">
                    <Database
                      size={20}
                      className="group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">
                      Login as Concierge
                    </div>
                    <div className="text-[10px] uppercase font-bold text-cyan-500/80 tracking-wider">
                      DATA_ADMIN Role
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleRoleLogin("PLAYER", "Suphanat M.")}
                  className="flex items-center gap-3 p-3 rounded-xl border border-lime-200 bg-lime-50 hover:bg-lime-100 text-lime-700 group transition-colors"
                  title="Player Access"
                >
                  <div className="w-10 h-10 rounded-lg bg-lime-100/50 flex items-center justify-center shrink-0">
                    <User
                      size={20}
                      className="group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">
                      Login as Youth Player
                    </div>
                    <div className="text-[10px] uppercase font-bold text-lime-500/80 tracking-wider">
                      PLAYER Role
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleRoleLogin("SUPERADMIN", "System Admin")}
                  className="flex items-center gap-3 p-3 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 group transition-colors sm:col-span-2"
                  title="System Access"
                >
                  <div className="w-10 h-10 rounded-lg bg-violet-100/50 flex items-center justify-center shrink-0">
                    <Shield
                      size={20}
                      className="group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">
                      Login as Superadmin
                    </div>
                    <div className="text-[10px] uppercase font-bold text-violet-400/80 tracking-wider">
                      SUPERADMIN Role (Bypass all)
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
