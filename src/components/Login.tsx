import React, { useState } from "react";
import loginFootballerHero from "../assets/login-footballer-photo-hero.webp";
import { auth, db } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  deleteField,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { createUserWithRegistrationLog } from "../lib/firestore/registration";
import {
  REGISTRATION_INTENT_OPTIONS,
  isRegistrationIntent,
  type RegistrationIntent,
} from "../lib/accountRolePolicy";
import {
  Mail,
  Lock,
  User,
  ChevronRight,
  Loader2,
  Globe,
  Phone,
  Building2,
  Briefcase,
  Eye,
  EyeOff,
  UsersRound,
  BarChart3,
  ShieldCheck,
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
  const [isLoginView, setIsLoginView] = useState(true);
  const [isForgotPasswordView, setIsForgotPasswordView] = useState(false);
  const [isResetEmailSent, setIsResetEmailSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [country, setCountry] = useState("");
  const [requestedAcademyName, setRequestedAcademyName] = useState("");
  const [phone, setPhone] = useState("");
  const [requestedRole, setRequestedRole] = useState<RegistrationIntent>("PLAYER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
    setIsSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        let assignedRole = "USER";
        let status = "Inactive";

        if (requestedRole === "PLAYER") {
          assignedRole = "PLAYER";
          status = "Active";
        }

        const newData: any = {
          name: user.displayName || name || "User",
          displayName: user.displayName || name || "User",
          photoURL: user.photoURL || null,
          role: assignedRole,
          status: status,
          academyId: null,
          activeAcademyId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: new Date(),
        };

        newData.requestedRole = requestedRole; // always set to default/selected
        newData.country = country || null;
        const trimmedName = requestedAcademyName?.trim();
        if (trimmedName && requestedRole === "COACH") {
          newData.requestedAcademyName = trimmedName;
        }
        newData.phone = phone || null;

        await createUserWithRegistrationLog(user, newData);
      } else {
        await setDoc(
          userRef,
          {
            uid: user.uid,
            lastLogin: serverTimestamp(),
            updatedAt: serverTimestamp(),
            id: deleteField(),
          },
          { merge: true },
        );
      }
    } catch (err: any) {
      console.error(err);
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
        let assignedRole = "USER";
        let status = "Inactive";

        if (requestedRole === "PLAYER") {
          assignedRole = "PLAYER";
          status = "Active";
        }

        const trimmedName = requestedAcademyName?.trim();

        await createUserWithRegistrationLog(
          user,
          {
            name: name || "User",
            displayName: name || "User",
            photoURL: user.photoURL || null,
            role: assignedRole,
            status: status,
            academyId: null,
            activeAcademyId: null,
            requestedRole,
            country: country || null,
            phone: phone || null,
            ...(trimmedName && requestedRole === "COACH"
              ? { requestedAcademyName: trimmedName }
              : {}),
            createdAt: new Date(),
            updatedAt: new Date(),
            lastLogin: new Date(),
          },
        );
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
            uid: userCredential.user.uid,
            lastLogin: serverTimestamp(),
            updatedAt: serverTimestamp(),
            id: deleteField(),
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

  return (
    <div className="min-h-screen w-full bg-slate-950 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(460px,0.85fr)]">
      {/* Football Intelligence hero */}
      <section className="relative hidden min-h-screen overflow-hidden bg-slate-950 lg:flex lg:items-stretch">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_70%_34%,rgba(14,165,233,0.20),transparent_28%),radial-gradient(circle_at_82%_78%,rgba(34,197,94,0.14),transparent_24%),linear-gradient(135deg,#020617_0%,#071426_55%,#020617_100%)]" />
        <div className="absolute inset-y-0 right-0 z-[1] w-[66%] overflow-hidden">
          <img
            src={loginFootballerHero}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-[58%_center] opacity-100"
          />
        </div>
        <div className="absolute inset-0 z-[2] bg-[linear-gradient(90deg,rgba(2,6,23,0.98)_0%,rgba(2,6,23,0.88)_34%,rgba(2,6,23,0.30)_56%,rgba(2,6,23,0.04)_100%)]" />

        <div className="relative z-10 flex w-full flex-col justify-between px-10 py-9 xl:px-16 xl:py-12">
          <div className="flex items-start justify-between gap-8">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/55 p-2.5 shadow-2xl backdrop-blur-xl">
                <FutVerseLogo className="h-full w-full" />
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight text-white">FUTVERSE</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.32em] text-slate-400">
                  Football Intelligence
                </p>
              </div>
            </div>

            <div className="hidden text-right 2xl:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.30em] text-slate-400">
                Data · Talent · Performance
              </p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.30em] text-cyan-300">
                A brighter tomorrow
              </p>
            </div>
          </div>

          <div className="max-w-2xl py-10">
            <p className="text-sm font-bold uppercase tracking-[0.42em] text-slate-300">
              Welcome to
            </p>
            <h1 className="mt-5 text-6xl font-black leading-[0.92] tracking-[-0.04em] text-white xl:text-7xl 2xl:text-8xl">
              <span className="bg-gradient-to-r from-lime-300 via-emerald-300 to-sky-400 bg-clip-text text-transparent">
                FUTVERSE
              </span>
            </h1>
            <h2 className="mt-4 max-w-xl text-4xl font-black leading-tight tracking-[-0.035em] text-white xl:text-5xl">
              Football Intelligence Platform
            </h2>
            <div className="mt-7 h-1.5 w-24 rounded-full bg-gradient-to-r from-lime-300 via-emerald-400 to-cyan-400" />
            <p className="mt-7 max-w-xl text-lg font-medium leading-8 text-slate-300">
              Connecting players, coaches, academies and professional clubs
              through one football ecosystem.
            </p>

            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-4">
              {[
                {
                  icon: UsersRound,
                  title: "FUTID",
                  text: "Your football identity",
                  tone: "text-emerald-300 border-emerald-400/25 bg-emerald-400/8",
                },
                {
                  icon: BarChart3,
                  title: "Performance",
                  text: "Training & development",
                  tone: "text-sky-300 border-sky-400/25 bg-sky-400/8",
                },
                {
                  icon: ShieldCheck,
                  title: "Pathway",
                  text: "Academy to Pro Club",
                  tone: "text-violet-300 border-violet-400/25 bg-violet-400/8",
                },
              ].map(({ icon: Icon, title, text, tone }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 backdrop-blur-xl"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${tone}`}>
                    <Icon size={20} />
                  </div>
                  <p className="mt-4 text-sm font-black text-white">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.30em] text-slate-500">
            <span className="h-px w-12 bg-cyan-400" />
            More than football · A brighter tomorrow
          </div>
        </div>
      </section>

      {/* Authentication panel */}
      <section className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.09),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-5 py-8 sm:px-8 lg:px-10">
        <div className="w-full max-w-[470px]">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 p-2 shadow-lg">
              <FutVerseLogo className="h-full w-full" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-950">FUTVERSE</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.26em] text-slate-500">
                Football Intelligence
              </p>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-8 lg:p-9">
            <div className="mb-8 hidden items-center gap-3 lg:flex">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 p-2.5 shadow-lg">
                <FutVerseLogo className="h-full w-full" />
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight text-slate-950">FUTVERSE</p>
                <p className="text-[9px] font-bold uppercase tracking-[0.30em] text-slate-500">
                  Football Intelligence
                </p>
              </div>
            </div>

            <h3 className="text-4xl font-black tracking-[-0.035em] text-slate-950">
              {isForgotPasswordView
                ? "รีเซ็ตรหัสผ่าน"
                : isLoginView
                  ? "เข้าสู่ระบบ"
                  : "สร้างบัญชี"}
            </h3>
            <p className="mt-3 max-w-sm text-sm font-medium leading-6 text-slate-500">
              {isForgotPasswordView
                ? "กรอกอีเมลของคุณ แล้วเราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่"
                : isLoginView
                  ? "กรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งานบัญชีของคุณ"
                  : "สร้างบัญชี FutVerse ใหม่ด้วยอีเมลของคุณ"}
            </p>

            {isResetEmailSent ? (
              <div className="mt-8 space-y-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Mail size={30} />
                </div>
                <div>
                  <h4 className="text-xl font-black text-slate-900">ตรวจสอบอีเมลของคุณ</h4>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                    เราส่งลิงก์รีเซ็ตรหัสผ่านไปที่
                    <br />
                    <span className="font-bold text-slate-900">{email}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPasswordView(false);
                    setIsResetEmailSent(false);
                    setIsLoginView(true);
                    setError("");
                  }}
                  className="w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-black text-lime-300 shadow-lg transition hover:bg-slate-900"
                >
                  กลับเข้าสู่ระบบ
                </button>
              </div>
            ) : (
              <form
                onSubmit={
                  isForgotPasswordView ? handleForgotPassword : handleSubmit
                }
                className="mt-8 space-y-4"
              >
                {error && (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {error}
                  </div>
                )}

                {!isLoginView && !isForgotPasswordView && (
                  <div>
                    <label className="mb-2 block text-xs font-black text-slate-700">
                      ชื่อ (Name)
                    </label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 py-3.5 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                        required={!isLoginView && !isForgotPasswordView}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-xs font-black text-slate-700">
                    อีเมล (Email)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="coach@futverse.com"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 py-3.5 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                      required
                    />
                  </div>
                </div>

                {!isForgotPasswordView && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-black text-slate-700">
                        รหัสผ่าน (Password)
                      </label>
                      {isLoginView && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPasswordView(true);
                            setError("");
                          }}
                          className="text-xs font-bold text-sky-600 transition hover:text-sky-700"
                        >
                          ลืมรหัสผ่าน?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 py-3.5 pl-11 pr-12 text-sm font-semibold tracking-widest text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                        required={!isForgotPasswordView}
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                )}

                {!isLoginView && !isForgotPasswordView && (
                  <>
                    <div>
                      <label className="mb-2 block text-xs font-black text-slate-700">
                        ยืนยันรหัสผ่าน (Confirm Password)
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 py-3.5 pl-11 pr-4 text-sm font-semibold tracking-widest text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                          required={!isLoginView && !isForgotPasswordView}
                          minLength={6}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black text-slate-700">
                        ประเทศ (Country)
                      </label>
                      <div className="relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="text"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          placeholder="Thailand"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 py-3.5 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                          required={!isLoginView && !isForgotPasswordView}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black text-slate-700">
                        Academy (ถ้ามี)
                      </label>
                      <div className="relative">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="text"
                          value={requestedAcademyName}
                          onChange={(e) => setRequestedAcademyName(e.target.value)}
                          placeholder="ชื่อ Academy"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 py-3.5 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black text-slate-700">
                        สมัครเป็น (Role)
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {REGISTRATION_INTENT_OPTIONS.map((role) => (
                          <label
                            key={role.value}
                            className={`flex cursor-pointer items-center gap-2 rounded-2xl border p-3 transition ${requestedRole === role.value ? "border-slate-950 bg-slate-950 text-lime-300" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`}
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${requestedRole === role.value ? "border-lime-300" : "border-slate-300"}`}>
                              {requestedRole === role.value && (
                                <span className="h-2 w-2 rounded-full bg-lime-300" />
                              )}
                            </span>
                            <input
                              type="radio"
                              name="requestedRole"
                              value={role.value}
                              checked={requestedRole === role.value}
                              onChange={(e) => {
                                if (isRegistrationIntent(e.target.value)) {
                                  setRequestedRole(e.target.value);
                                }
                              }}
                              className="sr-only"
                            />
                            <span className="text-sm font-bold">{role.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-4 text-sm font-black text-lime-300 shadow-[0_14px_36px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:shadow-[0_18px_40px_rgba(15,23,42,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      {isForgotPasswordView
                        ? "ส่งลิงก์รีเซ็ตรหัสผ่าน"
                        : isLoginView
                          ? "เข้าสู่ระบบ"
                          : "สร้างบัญชี"}
                      <ChevronRight size={17} />
                    </>
                  )}
                </button>

                {isForgotPasswordView ? (
                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPasswordView(false);
                        setError("");
                      }}
                      className="text-sm font-bold text-slate-500 transition hover:text-slate-900"
                    >
                      กลับไปหน้าเข้าสู่ระบบ
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-slate-200" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-white px-3 text-xs font-bold text-slate-400">
                          หรือเข้าสู่ระบบด้วย
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isSubmitting}
                      className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-black text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      Google
                    </button>
                  </>
                )}
              </form>
            )}

            {!isForgotPasswordView && (
              <div className="mt-7 text-center">
                <p className="text-sm font-medium text-slate-500">
                  {isLoginView ? "ยังไม่มีบัญชี?" : "มีบัญชีอยู่แล้ว?"}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoginView(!isLoginView);
                      setError("");
                    }}
                    className="font-black text-sky-600 underline decoration-2 underline-offset-4 transition hover:text-sky-700"
                  >
                    {isLoginView ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
                  </button>
                </p>
              </div>
            )}

            <div className="mt-8 flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-400">
              <span>ปลอดภัย</span>
              <span>•</span>
              <span>เชื่อถือได้</span>
              <span>•</span>
              <span>เพื่ออนาคตของวงการฟุตบอล</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
