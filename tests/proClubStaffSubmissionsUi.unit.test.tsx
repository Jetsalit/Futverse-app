import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canOpenProClubStaffSubmissions } from "../src/components/pro-club/operations/ProClubStaffSubmissions";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";

function authority(
  overrides: Partial<ProClubOrganizationAuthority> = {},
): ProClubOrganizationAuthority {
  return {
    organizationId: "club-lampang",
    organizationType: "PRO_CLUB",
    organizationName: "Lampang United",
    organizationLevel: "T1",
    organizationStatus: "ACTIVE",
    userId: "actor-1",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole: "HEAD_COACH",
    ...overrides,
  };
}

const submissionsSource = readFileSync(
  "src/components/pro-club/operations/ProClubStaffSubmissions.tsx",
  "utf8",
);
const dashboardSource = readFileSync(
  "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
  "utf8",
);
const trainingSource = readFileSync(
  "src/components/pro-club/operations/ProClubHeadCoachWeeklyProductionWorkspace.tsx",
  "utf8",
);

test("opens the production submissions surface only for reviewed V1 authors and technical roles", () => {
  for (const staffRole of [
    "ASSISTANT_COACH",
    "GK_COACH",
    "FITNESS_COACH",
    "ANALYST",
    "PHYSIO",
    "HEAD_COACH",
    "TECHNICAL_DIRECTOR",
  ] as const) {
    assert.equal(
      canOpenProClubStaffSubmissions(authority({ staffRole })),
      true,
      staffRole,
    );
  }

  for (const staffRole of ["MANAGER", "TEAM_MANAGER", "STAFF", null] as const) {
    assert.equal(
      canOpenProClubStaffSubmissions(authority({ staffRole })),
      false,
      String(staffRole),
    );
  }

  assert.equal(
    canOpenProClubStaffSubmissions(
      authority({
        staffRole: null,
        membershipAuthorizationRole: "OWNER",
      }),
    ),
    false,
  );
});

test("fails closed when tenant or membership authority is inactive", () => {
  assert.equal(
    canOpenProClubStaffSubmissions(authority({ organizationStatus: "INACTIVE" })),
    false,
  );
  assert.equal(
    canOpenProClubStaffSubmissions(authority({ membershipStatus: "INACTIVE" })),
    false,
  );
  assert.equal(
    canOpenProClubStaffSubmissions(authority({ hasMembershipAuthority: false })),
    false,
  );
});

test("production UI reuses repository and role-to-worktype contract without direct Firestore writes", () => {
  assert.ok(
    submissionsSource.includes(
      'from "../../../lib/firestore/proClubStaffSubmissionsRepository"',
    ),
  );
  assert.match(submissionsSource, /expectedProClubStaffSubmissionWorkType/);
  assert.match(submissionsSource, /createProClubStaffSubmissionDraft/);
  assert.match(submissionsSource, /updateProClubStaffSubmissionDraftContent/);
  assert.match(submissionsSource, /submitProClubStaffSubmission/);
  assert.match(submissionsSource, /beginProClubStaffSubmissionReview/);
  assert.match(submissionsSource, /requestProClubStaffSubmissionRevision/);
  assert.match(submissionsSource, /approveProClubStaffSubmission/);

  for (const forbidden of [
    /from\s+["'][^"']*firebase\/firestore[^"']*["']/,
    /\bsetDoc\b/,
    /\bupdateDoc\b/,
    /\bdeleteDoc\b/,
    /\bwriteBatch\b/,
    /\brunTransaction\b/,
  ]) {
    assert.doesNotMatch(submissionsSource, forbidden);
  }
});

test("author UI fixes the work type from active role and exposes Draft edit/resubmit flow", () => {
  assert.match(submissionsSource, /authorWorkType = expectedProClubStaffSubmissionWorkType/);
  assert.match(submissionsSource, /สร้างงานใหม่/);
  assert.match(submissionsSource, /บันทึก Draft/);
  assert.match(submissionsSource, /record.status === "DRAFT"/);
  assert.match(submissionsSource, /record.status === "NEEDS_REVISION"/);
  assert.match(submissionsSource, /ส่งงาน/);
  assert.doesNotMatch(submissionsSource, /<select[^>]*workType/i);
});

test("reviewer redesign adds KPI summary, filters, search and stable staff identity without changing persistence", () => {
  for (const label of [
    "งานทั้งหมด",
    "รอตรวจ (Submitted)",
    "ขอแก้ไข (Revision)",
    "อนุมัติแล้ว (Approved)",
  ]) {
    assert.ok(submissionsSource.includes(label), label);
  }
  assert.match(submissionsSource, /reviewerFilter/);
  assert.match(submissionsSource, /reviewerQuery/);
  assert.match(submissionsSource, /ค้นหาชื่องาน หรือสตาฟฟ์/);
  assert.match(submissionsSource, /record\.authorUid\.slice\(0, 8\)/);
  assert.doesNotMatch(submissionsSource, /authorDisplayName/);
});

test("reviewer V2 connects KPI cards to filters and uses shared themed surfaces", () => {
  for (const filter of ["ALL", "PENDING", "REVISION", "APPROVED"]) {
    assert.match(
      submissionsSource,
      new RegExp(`filter="${filter}"[\\s\\S]*onSelect=\\{setReviewerFilter\\}`),
      filter,
    );
  }

  assert.match(submissionsSource, /aria-pressed=\{active\}/);
  assert.match(submissionsSource, /data-reviewer-filter=\{filter\}/);
  assert.match(submissionsSource, /bg-\[var\(--pc-surface\)\]/);
  assert.match(submissionsSource, /shadow-\[var\(--pc-glow\)\]/);
  assert.match(submissionsSource, /reviewerFilter === value/);
  assert.match(submissionsSource, /reviewerQuery\.trim\(\)/);
});

test("reviewer V2 remains presentation-only and preserves frozen persistence boundaries", () => {
  for (const forbidden of [
    /authorDisplayName/,
    /from\s+["'][^"']*firebase\/firestore[^"']*["']/,
    /\bsetDoc\b/,
    /\bupdateDoc\b/,
    /\bdeleteDoc\b/,
    /\bwriteBatch\b/,
    /\brunTransaction\b/,
  ]) {
    assert.doesNotMatch(submissionsSource, forbidden);
  }

  assert.match(submissionsSource, /beginProClubStaffSubmissionReview/);
  assert.match(submissionsSource, /requestProClubStaffSubmissionRevision/);
  assert.match(submissionsSource, /approveProClubStaffSubmission/);
});

test("review UI exposes only the frozen technical review transitions", () => {
  assert.match(submissionsSource, /record.status === "SUBMITTED"/);
  assert.match(submissionsSource, /เริ่มตรวจ/);
  assert.match(submissionsSource, /record.status === "IN_REVIEW"/);
  assert.match(submissionsSource, /ขอแก้ไข/);
  assert.match(submissionsSource, /อนุมัติ/);
  assert.match(
    submissionsSource,
    /Review inbox ใช้งานได้เฉพาะ Technical Authority ปัจจุบันของทีม/,
  );
});

test("Training connection is reference-based and wired through existing dashboard tabs", () => {
  assert.match(submissionsSource, /targetPlanId/);
  assert.match(submissionsSource, /targetSessionDate/);
  assert.match(submissionsSource, /เปิด Training/);
  assert.match(dashboardSource, /"SUBMISSIONS"/);
  assert.match(
    dashboardSource,
    /onOpenTraining=[\s\S]*selectActiveTab\("TRAINING"\)/,
  );
  assert.match(
    trainingSource,
    /งานที่ส่งมา \/ Staff Submissions/,
  );
  assert.match(
    dashboardSource,
    /onOpenSubmissions=[\s\S]*selectActiveTab\("SUBMISSIONS"\)/,
  );
});

test("OWNER is never translated into a technical approval control in the UI", () => {
  assert.doesNotMatch(submissionsSource, /membershipAuthorizationRole\s*===\s*"OWNER"/);
  assert.doesNotMatch(submissionsSource, /membershipAuthorizationRole\s*===\s*"ADMIN"/);
  assert.match(
    submissionsSource,
    /authority\.staffRole === "HEAD_COACH"[\s\S]*authority\.staffRole === "TECHNICAL_DIRECTOR"/,
  );
});

test("reviewer light and neon text colors follow targeted UI contract", () => {
  // REFRESH_THEME_COLOR
  assert.match(
    submissionsSource,
    /border-\[color:var\(--pc-border\)\].*bg-\[var\(--pc-surface-soft\)\].*text-\[color:var\(--pc-text\)\]/,
  );

  // STATUS_SEMANTIC_COLORS
  assert.match(submissionsSource, /case "APPROVED":[\s\S]*text-emerald-500/);
  assert.match(submissionsSource, /case "NEEDS_REVISION":[\s\S]*text-amber-500/);
  assert.match(submissionsSource, /case "IN_REVIEW":[\s\S]*text-cyan-500/);
  assert.match(submissionsSource, /case "SUBMITTED":[\s\S]*text-blue-500/);
  assert.match(submissionsSource, /default:[\s\S]*text-\[color:var\(--pc-muted\)\]/);

  // AUTHOR_ROLE_GREEN & AUTHOR_UID_CYAN
  assert.match(
    submissionsSource,
    /<strong className="font-semibold text-emerald-500">[\s\S]*record\.authorRole/,
  );
  assert.match(
    submissionsSource,
    /text-cyan-400">[\s\S]*record\.authorUid\.slice\(0, 8\)/,
  );

  // UNLINKED_PLAN_RED & LINKED_VALUES_GREEN
  assert.match(
    submissionsSource,
    /record\.targetPlanId[\s\S]*\? "font-semibold text-emerald-500"[\s\S]*: "font-semibold text-rose-500"/,
  );

  // UNLINKED_SESSION_AMBER & LINKED_VALUES_GREEN
  assert.match(
    submissionsSource,
    /record\.targetSessionDate[\s\S]*\? "font-semibold text-emerald-500"[\s\S]*: "font-semibold text-amber-500"/,
  );
});
