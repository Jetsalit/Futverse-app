import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/Login.tsx", "utf8");

test("login redesign removes Command Center branding and uses Football Intelligence positioning", () => {
  assert.doesNotMatch(source, /Command Center/i);
  assert.match(source, /Football Intelligence Platform/);
  assert.match(source, /Football Intelligence/);
  assert.match(source, /FUTVERSE/);
});

test("login redesign keeps the required Thai production copy and account creation path", () => {
  assert.match(source, /เข้าสู่ระบบ/);
  assert.match(source, /กรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งานบัญชีของคุณ/);
  assert.match(source, /ลืมรหัสผ่าน\?/);
  assert.match(source, /ยังไม่มีบัญชี\?/);
  assert.match(source, /สมัครสมาชิก/);
  assert.match(source, /หรือเข้าสู่ระบบด้วย/);
});

test("login redesign preserves existing authentication handlers and boundaries", () => {
  for (const required of [
    "signInWithEmailAndPassword",
    "createUserWithEmailAndPassword",
    "signInWithPopup",
    "sendPasswordResetEmail",
    "createUserWithRegistrationLog",
    "handleGoogleSignIn",
    "handleForgotPassword",
    "handleSubmit",
  ]) {
    assert.match(source, new RegExp(required));
  }

  assert.match(source, /onClick=\{handleGoogleSignIn\}/);
  assert.match(source, /isForgotPasswordView \? handleForgotPassword : handleSubmit/);
});

test("password visibility control is wired and not presentation-only", () => {
  assert.match(source, /showPassword/);
  assert.match(source, /setShowPassword/);
  assert.match(source, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(source, /aria-label=\{showPassword \? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"\}/);
});

test("responsive login keeps a mobile brand surface and desktop football hero", () => {
  assert.match(source, /lg:hidden/);
  assert.match(source, /hidden min-h-screen[\s\S]*lg:flex/);
  assert.match(source, /Connecting players, coaches, academies and professional clubs/);
  assert.match(source, /FUTID/);
  assert.match(source, /Performance/);
  assert.match(source, /Pathway/);
});

test("login hero uses the owned photorealistic FutVerse footballer asset and no remote hero image", () => {
  assert.match(source, /import loginFootballerHero from "\.\.\/assets\/login-footballer-photo-hero\.webp"/);
  assert.match(source, /src={loginFootballerHero}/);
  assert.doesNotMatch(source, /images\.unsplash\.com/);
});
