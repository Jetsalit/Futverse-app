import React, { useState, useEffect } from "react";
import { useAuth, UserRole } from "../contexts/AuthContext";
import { auth, db } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
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
  Globe,
  Phone,
  Building2,
  Briefcase,
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
  const [isForgotPasswordView, setIsForgotPasswordView] = useState(false);
  const [isResetEmailSent, setIsResetEmailSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [country, setCountry] = useState("");
  const [academyId, setAcademyId] = useState("");
  const [phone, setPhone] = useState("");
  const [requestedRole, setRequestedRole] = useState("PLAYER");
  const [academySize, setAcademySize] = useState("30");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inAppBrowserWarning, setInAppBrowserWarning] = useState(false);

  // Detect in-app browser
  const isInAppBrowser = () => {
    const ua = navigator.userAgent || navigator.vendor || "";
    return /FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|Snapchat/i.test(ua);
  };

  // Handle Google redirect result when user returns
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          const user = result.user;
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            const isSuperAdmin = user.email === "jetsalween@gmail.com";
            const assignedRole = isSuperAdmin ? "SUPERADMIN" : "USER";
            const status = isSuperAdmin ? "Active" : "Inactive";
            const newData: any = {
              uid: user.uid,
              email: user.email,
              name: user.displayName || "User",
              displayName: user.displayName || "User",
              photoURL: user.photoURL || null,
              role: assignedRole,
              status: status,
              subscriptionPlan: "FREE",
              createdAt: new Date(),
              updatedAt: new Date(),
              lastLogin: new Date(),
            };
            if (!isSuperAdmin) {
              newData.requestedRole = "COACH";
              newData.country = null;
              newData.academyId = null;
              newData.phone = null;
            } else {
              newData.requestedRole = null;
              newData.academyId = null;
            }
            await setDoc(userRef, newData, { merge: true });
            await addDoc(collection(db, "logs"), {
              action: "USER_REGISTERED",
              userId: user.uid,
              email: user.email,
              requestedRole: isSuperAdmin ? "SUPERADMIN" : "COACH",
              timestamp: serverTimestamp(),
            });
          } else {
            await setDoc(userRef, { lastLogin: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
          }
        }
      } catch (err: any) {
        console.error("Redirect result error:", err);
        if (
          err.code !== "auth/popup-blocked" &&
          err.code !== "auth/popup-closed-by-user" &&
          err.code !== "auth/cancelled-popup-request"
        ) {
          setError(err.message || "Google Sign-In failed.");
        }
      }
    };
    handleRedirectResult();
  }, []);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setIsResetEmailSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send password reset email.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");

    // Detect in-app browser and warn user
    if (isInAppBrowser()) {
      setInAppBrowserWarning(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      // Try popup first, fall back to redirect
      try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          const isSuperAdmin = user.email === "jetsalween@gmail.com";
          const isPlayer = requestedRole === "PLAYER";
          const assignedRole = isSuperAdmin ? "SUPERADMIN" : (isPlayer ? "PLAYER" : "USER");
          const status = isSuperAdmin ? "Active" : (isPlayer ? "Active" : "Inactive");

          const newData: any = {
            uid: user.uid,
            email: user.email,
            name: user.displayName || name || "User",
            displayName: user.displayName || name || "User",
            photoURL: user.photoURL || null,
            role: assignedRole,
            status: status,
            subscriptionPlan: "FREE",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastLogin: new Date(),
          };

          if (!isSuperAdmin) {
            newData.requestedRole = requestedRole;
            newData.country = country || null;
            newData.academyId = academyId || null;
            newData.phone = phone || null;
          } else {
            newData.requestedRole = null;
            newData.academyId = null;
          }

          await setDoc(userRef, newData, { merge: true });

          await addDoc(collection(db, "logs"), {
            action: "USER_REGISTERED",
            userId: user.uid,
            email: user.email,
            requestedRole: isSuperAdmin ? "SUPERADMIN" : requestedRole,
            timestamp: serverTimestamp(),
          });
        } else {
          await setDoc(
            userRef,
            { lastLogin: serverTimestamp(), updatedAt: serverTimestamp() },
            { merge: true },
          );
        }
      } catch (popupErr: any) {
        // If popup is blocked or disallowed, fall back to redirect
        if (popupErr.code === "auth/popup-blocked" || popupErr.code === "auth/unauthorized-domain" || popupErr.code === "auth/operation-not-allowed" || popupErr.message?.includes("disallowed_useragent")) {
          const provider = new GoogleAuthProvider();
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }
    } catch (err: any) {
      console.error(err);
      
      // Ignore user cancellations, don't show scary errors
      if (
        err.code === "auth/popup-closed-by-user" || 
        err.code === "auth/cancelled-popup-request"
      ) {
        // Do nothing, just let them try again if they want
        return;
      }
      
      setError(err.message || "Google Sign-In failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isForgotPasswordView) {
        if (!email) {
          setError("Please enter your email address.");
          setIsSubmitting(false);
          return;
        }
        await sendPasswordResetEmail(auth, email);
        alert("Password reset email sent! Please check your inbox.");
        setIsForgotPasswordView(false);
        setIsSubmitting(false);
        return;
      }

      if (!isLoginView) {
        if (password !== confirmPassword) {
          setError("Passwords do not match!");
          setIsSubmitting(false);
          return;
        }

        if (!country) {
          setError("Country is required!");
          setIsSubmitting(false);
          return;
        }

        // Register new user
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const user = userCredential.user;

        await updateProfile(user, { displayName: name });

        // Save user data to Firestore
        const isSuperAdmin = email === "jetsalween@gmail.com";
        const isPlayer = requestedRole === "PLAYER";
        const assignedRole = isSuperAdmin ? "SUPERADMIN" : (isPlayer ? "PLAYER" : "USER");
        const status = isSuperAdmin ? "Active" : (isPlayer ? "Active" : "Inactive");
        
        let finalAcademyId = academyId || null;
        if (!isSuperAdmin && requestedRole === "COACH" && academyId) {
          const academyRef = doc(collection(db, "academies"));
          await setDoc(academyRef, {
            name: academyId,
            max_players: parseInt(academySize) || 30,
            current_players_count: 0,
            ownerId: user.uid,
            createdAt: serverTimestamp(),
          });
          finalAcademyId = academyRef.id;
        }

        await setDoc(
          doc(db, "users", user.uid),
          {
            uid: user.uid,
            email: email,
            name: name || "User",
            displayName: name || "User",
            photoURL: user.photoURL || null,
            role: assignedRole,
            status: status,
            requestedRole: isSuperAdmin ? null : requestedRole,
            country: country || null,
            academyId: finalAcademyId,
            phone: phone || null,
            subscriptionPlan: "FREE",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastLogin: new Date(),
          },
          { merge: true },
        );

        await addDoc(collection(db, "logs"), {
          action: "USER_REGISTERED",
          userId: user.uid,
          email: user.email,
          requestedRole: isSuperAdmin ? "SUPERADMIN" : requestedRole,
          timestamp: serverTimestamp(),
        });
      } else {
        // Sign in existing user
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
        await setDoc(
          doc(db, "users", userCredential.user.uid),
          {
            lastLogin: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
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
            className="w-24 h-24 mb-8 bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-3xl mx-auto flex items-center justify-center overflow-hidden p-3"
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
            className="lg:hidden w-16 h-16 mb-8 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center shadow-lg p-2"
          >
            <FutVerseLogo className="w-full h-full" />
          </div>
          <h2 className="lg:hidden text-2xl font-black text-slate-900 mb-2 leading-tight">
            FUTVERSE
          </h2>

          <h3 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
            {isForgotPasswordView
              ? "Reset Password"
              : isLoginView
                ? "Sign In"
                : "Create Account"}
          </h3>
          <p className="text-slate-500 font-medium mb-8">
            {isForgotPasswordView
              ? "Enter your email address and we'll send you a link to reset your password."
              : isLoginView
                ? "Enter your email and password to access your account."
                : "Set up a new user account with your email."}
          </p>

          {isResetEmailSent ? (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-800">
                Check Your Email
              </h3>
              <p className="text-slate-500 font-medium">
                We've sent a password reset link to <br />
                <span className="text-slate-800 font-bold">{email}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsForgotPasswordView(false);
                  setIsResetEmailSent(false);
                  setIsLoginView(true);
                  setError("");
                }}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-[#E1FF01] font-black rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 mt-4 uppercase tracking-wide text-sm"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form
              onSubmit={
                isForgotPasswordView ? handleForgotPassword : handleSubmit
              }
              className="space-y-4"
            >
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-xl border border-red-100 flex flex-col">
                  <span>{error}</span>
                </div>
              )}

              {!isLoginView && !isForgotPasswordView && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 pl-1">
                    ชื่อ (Name)
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
                      required={!isLoginView && !isForgotPasswordView}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 pl-1">
                  อีเมล (Email)
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

              {!isForgotPasswordView && (
                <div>
                  <div className="flex justify-between items-center mb-1.5 pl-1">
                    <label className="block text-xs font-bold text-slate-700">
                      รหัสผ่าน (Password)
                    </label>
                    {isLoginView && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsForgotPasswordView(true);
                          setError("");
                        }}
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
                      required={!isForgotPasswordView}
                      minLength={6}
                    />
                  </div>
                </div>
              )}

              {!isLoginView && !isForgotPasswordView && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 pl-1">
                      ยืนยันรหัสผ่าน (Confirm Password)
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
                        required={!isLoginView && !isForgotPasswordView}
                        minLength={6}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 pl-1">
                      ประเทศ (Country)
                    </label>
                    <div className="relative">
                      <Globe
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                        size={18}
                      />
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="Your Country"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-[#E1FF01] focus:border-[#E1FF01] outline-none transition-all placeholder:text-slate-400"
                        required={!isLoginView && !isForgotPasswordView}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 pl-1">
                      Academy (ถ้ามี)
                    </label>
                    <div className="relative">
                      <Building2
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                        size={18}
                      />
                      <input
                        type="text"
                        value={academyId}
                        onChange={(e) => setAcademyId(e.target.value)}
                        placeholder="e.g. Elite Football Academy"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-[#E1FF01] focus:border-[#E1FF01] outline-none transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2 pl-1">
                      สมัครเป็น (Role)
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: "COACH", label: "Coach" },
                        { id: "PLAYER", label: "Player" },
                        { id: "SCOUT", label: "Scout" },
                        { id: "PARENT", label: "Parent" },
                      ].map((role) => (
                        <label
                          key={role.id}
                          className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                            requestedRole === role.id
                              ? "bg-slate-900 border-slate-900 text-[#E1FF01]"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              requestedRole === role.id
                                ? "border-[#E1FF01]"
                                : "border-slate-300"
                            }`}
                          >
                            {requestedRole === role.id && (
                              <div className="w-2 h-2 rounded-full bg-[#E1FF01]" />
                            )}
                          </div>
                          <input
                            type="radio"
                            name="requestedRole"
                            value={role.id}
                            checked={requestedRole === role.id}
                            onChange={(e) => setRequestedRole(e.target.value)}
                            className="sr-only"
                          />
                          <span className="text-sm font-bold">
                            {role.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {!isLoginView && requestedRole === "COACH" && (
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                      <label className="block text-xs font-bold text-slate-700 mb-2 pl-1">
                        ขนาดอคาเดมี่ (Academy Size)
                      </label>
                      <select
                        value={academySize}
                        onChange={(e) => setAcademySize(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-xl focus:ring-2 focus:ring-[#E1FF01] focus:border-[#E1FF01] outline-none transition-all"
                      >
                        <option value="30">สูงสุด 30 คน (Max 30 Players)</option>
                        <option value="50">สูงสุด 50 คน (Max 50 Players)</option>
                        <option value="100">สูงสุด 100 คน (Max 100 Players)</option>
                        <option value="150">สูงสุด 150 คน (Max 150 Players)</option>
                      </select>
                    </div>
                  )}
                </>
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
                    {isForgotPasswordView
                      ? "Reset Password"
                      : isLoginView
                        ? "Sign In"
                        : "Create Account"}{" "}
                    <ChevronRight size={16} className="text-[#E1FF01]" />
                  </>
                )}
              </button>

              {isForgotPasswordView ? (
                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPasswordView(false);
                      setError("");
                    }}
                    className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-slate-500 font-medium">
                        Or continue with
                      </span>
                    </div>
                  </div>

                  {inAppBrowserWarning && (
                    <div className="mb-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm font-bold text-amber-800 mb-1">⚠️ ไม่สามารถล็อกอินผ่านแอปแชทได้</p>
                      <p className="text-xs text-amber-700">กรุณาเปิดลิงค์นี้ในเบราว์เซอร์ Safari หรือ Chrome แทน</p>
                      <p className="text-xs text-amber-600 mt-1">กดจุด 3 จุด (⋯) แล้วเลือก "เปิดใน Safari" หรือ "Open in Chrome"</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50 disabled:bg-slate-50 disabled:cursor-not-allowed text-slate-700 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-3 text-sm"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Google
                  </button>
                </>
              )}
            </form>
          )}

          {!isForgotPasswordView && (
            <div className="mt-8 text-center">
              <p className="text-sm text-slate-500 font-medium">
                {isLoginView
                  ? "Don't have an account?"
                  : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => setIsLoginView(!isLoginView)}
                  className="text-indigo-600 font-bold hover:text-indigo-700 underline underline-offset-2"
                >
                  {isLoginView ? "Sign up" : "Sign in"}
                </button>
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
