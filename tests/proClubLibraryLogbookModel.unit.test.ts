import assert from "node:assert/strict";
import test from "node:test";

import type { Drill } from "../src/lib/drillDataModel";
import {
  PRO_CLUB_LIBRARY_LOGBOOK_ROLES,
  PRO_CLUB_LIBRARY_LOGBOOK_VIEWS,
  composeProClubLibraryLogbookEntries,
  isProClubLibraryLogbookRole,
  proClubLibraryLogbookEntryKey,
} from "../src/lib/proClubLibraryLogbook";
import type { ProClubStaffSubmissionRecord } from "../src/lib/proClubStaffSubmissions";

function drill(overrides: Partial<Drill> = {}): Drill {
  return {
    id: "drill-1",
    title: "Build-up 6v4",
    category: "Tactical",
    canvas_data: null,
    created_by: "coach-a",
    is_shared: false,
    date: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

function submission(
  overrides: Partial<ProClubStaffSubmissionRecord> = {},
): ProClubStaffSubmissionRecord {
  return {
    submissionId: "submission-1",
    schemaVersion: 1,
    authorUid: "assistant-a",
    authorRole: "ASSISTANT_COACH",
    workType: "TRAINING_SUPPORT",
    title: "Pressing support",
    summary: "Support detail for the weekly plan",
    module: "TRAINING",
    targetPlanId: "plan-1",
    targetSessionDate: "2026-09-21",
    status: "SUBMITTED",
    reviewerUid: null,
    reviewerRole: null,
    reviewNote: null,
    createdAt: { seconds: 100 },
    createdBy: "assistant-a",
    updatedAt: { seconds: 200 },
    updatedBy: "assistant-a",
    submittedAt: { seconds: 200 },
    submittedBy: "assistant-a",
    reviewStartedAt: null,
    reviewStartedBy: null,
    revisionRequestedAt: null,
    revisionRequestedBy: null,
    approvedAt: null,
    approvedBy: null,
    ...overrides,
  };
}

test("freezes requested Pro Club Library roles and views", () => {
  assert.deepEqual(PRO_CLUB_LIBRARY_LOGBOOK_ROLES, [
    "TECHNICAL_DIRECTOR",
    "HEAD_COACH",
    "ASSISTANT_COACH",
    "GK_COACH",
    "FITNESS_COACH",
    "ANALYST",
    "PHYSIO",
  ]);
  assert.deepEqual(PRO_CLUB_LIBRARY_LOGBOOK_VIEWS, [
    "MY_LOGBOOK",
    "TEAM_SHARED",
    "CLUB_LIBRARY",
    "FAVOURITES",
    "RECENT",
  ]);
});

test("role gate accepts only the seven requested football roles", () => {
  for (const role of PRO_CLUB_LIBRARY_LOGBOOK_ROLES) {
    assert.equal(isProClubLibraryLogbookRole(role), true, role);
  }
  for (const role of ["MANAGER", "TEAM_MANAGER", "STAFF", null] as const) {
    assert.equal(isProClubLibraryLogbookRole(role), false, String(role));
  }
});

test("My Logbook composes the actor's existing drills and submissions only", () => {
  const entries = composeProClubLibraryLogbookEntries({
    actorUid: "coach-a",
    view: "MY_LOGBOOK",
    drills: [
      drill(),
      drill({ id: "drill-b", created_by: "coach-b", title: "Other drill" }),
    ],
    submissions: [
      submission({ authorUid: "coach-a", submissionId: "submission-own" }),
      submission({ authorUid: "coach-b", submissionId: "submission-other" }),
    ],
  });

  assert.deepEqual(
    new Set(entries.map((entry) => entry.referenceId)),
    new Set(["drill-1", "submission-own"]),
  );
});

test("Team Shared and Club Library project existing visibility without inventing persistence", () => {
  const drills = [
    drill({ id: "private-drill", is_shared: false }),
    drill({ id: "shared-drill", is_shared: true }),
  ];
  const submissions = [
    submission({ submissionId: "draft", status: "DRAFT" }),
    submission({ submissionId: "submitted", status: "SUBMITTED" }),
    submission({
      submissionId: "approved",
      status: "APPROVED",
      reviewerUid: "head-a",
      reviewerRole: "HEAD_COACH",
      reviewStartedAt: { seconds: 210 },
      reviewStartedBy: "head-a",
      approvedAt: { seconds: 220 },
      approvedBy: "head-a",
    }),
  ];

  const teamShared = composeProClubLibraryLogbookEntries({
    actorUid: "head-a",
    view: "TEAM_SHARED",
    drills,
    submissions,
  });
  assert.deepEqual(
    new Set(teamShared.map((entry) => entry.referenceId)),
    new Set(["shared-drill", "submitted", "approved"]),
  );

  const clubLibrary = composeProClubLibraryLogbookEntries({
    actorUid: "head-a",
    view: "CLUB_LIBRARY",
    drills,
    submissions,
  });
  assert.deepEqual(
    new Set(clubLibrary.map((entry) => entry.referenceId)),
    new Set(["shared-drill", "approved"]),
  );
});

test("role filters narrow role-tagged submissions while keeping legacy drills role-neutral", () => {
  const entries = composeProClubLibraryLogbookEntries({
    actorUid: "head-a",
    view: "RECENT",
    roleFilter: "GK_COACH",
    drills: [drill({ id: "role-neutral-drill", is_shared: true })],
    submissions: [
      submission({
        submissionId: "gk-work",
        authorRole: "GK_COACH",
        workType: "GK_TRAINING",
      }),
      submission({
        submissionId: "fitness-work",
        authorRole: "FITNESS_COACH",
        workType: "FITNESS",
      }),
    ],
  });

  assert.deepEqual(
    new Set(entries.map((entry) => entry.referenceId)),
    new Set(["role-neutral-drill", "gk-work"]),
  );
});

test("Favourites are supplied as session keys and create no persisted field", () => {
  const key = proClubLibraryLogbookEntryKey("DRILL", "drill-1");
  const entries = composeProClubLibraryLogbookEntries({
    actorUid: "coach-a",
    view: "FAVOURITES",
    drills: [drill()],
    submissions: [],
    favouriteKeys: [key],
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, key);
  assert.equal(entries[0].isFavourite, true);
  assert.equal(Object.hasOwn(drill(), "favourite"), false);
});


test("Recent and Favourites never expose another user's private drill", () => {
  const foreignPrivate = drill({
    id: "foreign-private",
    created_by: "coach-b",
    is_shared: false,
    title: "Private other-user drill",
  });
  const sharedOther = drill({
    id: "shared-other",
    created_by: "coach-b",
    is_shared: true,
    title: "Shared other-user drill",
  });

  const recent = composeProClubLibraryLogbookEntries({
    actorUid: "coach-a",
    view: "RECENT",
    drills: [drill(), foreignPrivate, sharedOther],
    submissions: [],
  });

  assert.deepEqual(
    new Set(recent.map((entry) => entry.referenceId)),
    new Set(["drill-1", "shared-other"]),
  );

  const favouriteForeignKey = proClubLibraryLogbookEntryKey(
    "DRILL",
    "foreign-private",
  );
  const favourites = composeProClubLibraryLogbookEntries({
    actorUid: "coach-a",
    view: "FAVOURITES",
    drills: [foreignPrivate, sharedOther],
    submissions: [],
    favouriteKeys: [
      favouriteForeignKey,
      proClubLibraryLogbookEntryKey("DRILL", "shared-other"),
    ],
  });

  assert.deepEqual(
    favourites.map((entry) => entry.referenceId),
    ["shared-other"],
  );
});
