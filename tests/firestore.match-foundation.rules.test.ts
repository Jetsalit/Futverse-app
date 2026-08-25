import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-match-foundation";

const ACADEMY_A = "academy-a";
const ACADEMY_B = "academy-b";

const COACH_A = "coach-a";
const ADMIN_A = "admin-a";
const COACH_B = "coach-b";
const PARENT_A = "parent-a";
const SUPERADMIN = "superadmin";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function anonymousDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

function userData(
  uid: string,
  role: string,
  status = "Active",
) {
  return {
    uid,
    name: uid,
    email: `${uid}@example.com`,
    role,
    status,
    academyId: null,
    activeAcademyId: null,
    tenantRole: null,
    updatedAt: new Date(),
  };
}

function membershipData(
  uid: string,
  academyId: string,
  role: "ADMIN" | "COACH",
  status = "ACTIVE",
) {
  return {
    userId: uid,
    academyId,
    role,
    status,
    source: "INVITE",
    joinedAt: new Date(),
    joinedBy: ADMIN_A,
    updatedAt: new Date(),
  };
}

async function seed(
  entries: Array<[string, DocumentData]>,
) {
  await testEnv.withSecurityRulesDisabled(
    async (context) => {
      await Promise.all(
        entries.map(([path, data]) =>
          setDoc(
            doc(context.firestore(), path),
            data,
          ),
        ),
      );
    },
  );
}

async function seedTenantActors() {
  await seed([
    [
      `academies/${ACADEMY_A}`,
      {
        name: "Academy A",
        squads: ["U15"],
      },
    ],
    [
      `academies/${ACADEMY_B}`,
      {
        name: "Academy B",
        squads: ["U15"],
      },
    ],
    [
      `users/${COACH_A}`,
      userData(COACH_A, "COACH"),
    ],
    [
      `users/${ADMIN_A}`,
      userData(ADMIN_A, "ADMIN"),
    ],
    [
      `users/${COACH_B}`,
      userData(COACH_B, "COACH"),
    ],
    [
      `users/${PARENT_A}`,
      userData(PARENT_A, "PARENT"),
    ],
    [
      `users/${SUPERADMIN}`,
      userData(SUPERADMIN, "SUPERADMIN"),
    ],
    [
      `academies/${ACADEMY_A}/members/${COACH_A}`,
      membershipData(
        COACH_A,
        ACADEMY_A,
        "COACH",
      ),
    ],
    [
      `academies/${ACADEMY_A}/members/${ADMIN_A}`,
      membershipData(
        ADMIN_A,
        ACADEMY_A,
        "ADMIN",
      ),
    ],
    [
      `academies/${ACADEMY_B}/members/${COACH_B}`,
      membershipData(
        COACH_B,
        ACADEMY_B,
        "COACH",
      ),
    ],
  ]);
}

function schedulingFields(
  status: string,
) {
  if (
    status === "SCHEDULED" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETED"
  ) {
    return {
      opponentName: "Academy B",
      kickoffAt: new Date(
        "2026-09-01T10:00:00.000Z",
      ),
      venueType: "HOME",
    };
  }

  return {
    opponentName: null,
    kickoffAt: null,
    venueType: null,
  };
}

function matchWriteData(
  actorUid: string,
  status = "DRAFT",
) {
  return {
    schemaVersion: 1,
    status,
    squadLabel: "U15",
    competitionName: "League",
    ...schedulingFields(status),
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

function matchSeedData(
  actorUid: string,
  status = "DRAFT",
) {
  return {
    schemaVersion: 1,
    status,
    squadLabel: "U15",
    competitionName: "League",
    ...schedulingFields(status),
    createdAt: new Date(
      "2026-08-20T10:00:00.000Z",
    ),
    createdBy: actorUid,
    updatedAt: new Date(
      "2026-08-20T10:00:00.000Z",
    ),
    updatedBy: actorUid,
  };
}

function rosterWriteData(
  actorUid: string,
) {
  return {
    schemaVersion: 1,
    futId: null,
    firstName: "Player",
    lastName: "One",
    position: "CM",
    jerseyNumber: 8,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

function rosterSeedData(
  actorUid: string,
) {
  return {
    schemaVersion: 1,
    futId: null,
    firstName: "Player",
    lastName: "One",
    position: "CM",
    jerseyNumber: 8,
    createdAt: new Date(
      "2026-08-20T10:00:00.000Z",
    ),
    createdBy: actorUid,
    updatedAt: new Date(
      "2026-08-20T10:00:00.000Z",
    ),
    updatedBy: actorUid,
  };
}

before(async () => {
  const emulatorHost =
    process.env.FIRESTORE_EMULATOR_HOST;

  assert.ok(
    emulatorHost,
    "Rules tests must run through the Firestore Emulator.",
  );

  const separator =
    emulatorHost.lastIndexOf(":");

  const host =
    emulatorHost.slice(0, separator);

  const port = Number(
    emulatorHost.slice(separator + 1),
  );

  assert.ok(
    host && Number.isInteger(port),
    "Invalid FIRESTORE_EMULATOR_HOST.",
  );

  testEnv =
    await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host,
        port,
        rules: readFileSync(
          new URL(
            "../firestore.rules",
            import.meta.url,
          ),
          "utf8",
        ),
      },
    });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test(
  "1. ACTIVE COACH can create a valid DRAFT Match",
  async () => {
    await seedTenantActors();

    await assertSucceeds(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        matchWriteData(
          COACH_A,
          "DRAFT",
        ),
      ),
    );
  },
);

test(
  "2. ACTIVE ADMIN can create a valid SCHEDULED Match",
  async () => {
    await seedTenantActors();

    await assertSucceeds(
      setDoc(
        doc(
          authedDb(ADMIN_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        matchWriteData(
          ADMIN_A,
          "SCHEDULED",
        ),
      ),
    );
  },
);

test(
  "3. Match rejects unsupported fields and synthetic identity",
  async () => {
    await seedTenantActors();

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        {
          ...matchWriteData(
            COACH_A,
            "DRAFT",
          ),
          id: "match-1",
          academyId: ACADEMY_A,
          arbitrary: true,
        },
      ),
    );
  },
);

test(
  "4. SCHEDULED Match requires opponent and kickoff",
  async () => {
    await seedTenantActors();

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        {
          ...matchWriteData(
            COACH_A,
            "DRAFT",
          ),
          status: "SCHEDULED",
        },
      ),
    );
  },
);

test(
  "5. Match rejects unsupported lifecycle status and venue",
  async () => {
    await seedTenantActors();

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        {
          ...matchWriteData(
            COACH_A,
            "DRAFT",
          ),
          status: "POSTPONED",
          venueType: "LOCAL",
        },
      ),
    );
  },
);

test(
  "6. Match rejects untrimmed bounded text",
  async () => {
    await seedTenantActors();

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        {
          ...matchWriteData(
            COACH_A,
            "DRAFT",
          ),
          squadLabel: " U15 ",
        },
      ),
    );
  },
);

test(
  "7. non-terminal Match allows same-status metadata correction",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertSucceeds(
      updateDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        {
          opponentName: "Academy C",
          updatedAt: serverTimestamp(),
          updatedBy: COACH_A,
        },
      ),
    );
  },
);

test(
  "8. allowed lifecycle transitions succeed",
  async () => {
    await seedTenantActors();

    const cases = [
      ["DRAFT", "SCHEDULED"],
      ["DRAFT", "CANCELLED"],
      ["SCHEDULED", "IN_PROGRESS"],
      ["SCHEDULED", "CANCELLED"],
      ["IN_PROGRESS", "COMPLETED"],
      ["IN_PROGRESS", "CANCELLED"],
    ] as const;

    for (
      const [from, to] of cases
    ) {
      const matchId =
        `${from.toLowerCase()}-${to.toLowerCase()}`;

      await seed([
        [
          `academies/${ACADEMY_A}/matches/${matchId}`,
          matchSeedData(
            COACH_A,
            from,
          ),
        ],
      ]);

      await assertSucceeds(
        updateDoc(
          doc(
            authedDb(COACH_A),
            "academies",
            ACADEMY_A,
            "matches",
            matchId,
          ),
          {
            status: to,
            ...(
              to === "SCHEDULED"
                ? schedulingFields(
                    "SCHEDULED",
                  )
                : {}
            ),
            updatedAt:
              serverTimestamp(),
            updatedBy: COACH_A,
          },
        ),
      );
    }
  },
);

test(
  "9. lifecycle cannot skip authoritative states",
  async () => {
    await seedTenantActors();

    const cases = [
      ["DRAFT", "IN_PROGRESS"],
      ["DRAFT", "COMPLETED"],
      ["SCHEDULED", "COMPLETED"],
    ] as const;

    for (
      const [from, to] of cases
    ) {
      const matchId =
        `invalid-${from.toLowerCase()}-${to.toLowerCase()}`;

      await seed([
        [
          `academies/${ACADEMY_A}/matches/${matchId}`,
          matchSeedData(
            COACH_A,
            from,
          ),
        ],
      ]);

      await assertFails(
        updateDoc(
          doc(
            authedDb(COACH_A),
            "academies",
            ACADEMY_A,
            "matches",
            matchId,
          ),
          {
            status: to,
            ...schedulingFields(to),
            updatedAt:
              serverTimestamp(),
            updatedBy: COACH_A,
          },
        ),
      );
    }
  },
);

test(
  "10. COMPLETED Match evidence is immutable",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "COMPLETED",
        ),
      ],
    ]);

    await assertFails(
      updateDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        {
          opponentName:
            "Rewritten Opponent",
          updatedAt:
            serverTimestamp(),
          updatedBy: COACH_A,
        },
      ),
    );
  },
);

test(
  "11. CANCELLED Match evidence is immutable",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "CANCELLED",
        ),
      ],
    ]);

    await assertFails(
      updateDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        {
          squadLabel: "U16",
          updatedAt:
            serverTimestamp(),
          updatedBy: COACH_A,
        },
      ),
    );
  },
);

test(
  "12. Match history cannot be deleted",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      deleteDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
      ),
    );
  },
);

test(
  "13. Tenant A cannot read or write Tenant B Match",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_B}/matches/match-b`,
        matchSeedData(
          COACH_B,
          "DRAFT",
        ),
      ],
    ]);

    const db =
      authedDb(COACH_A);

    await assertFails(
      getDoc(
        doc(
          db,
          "academies",
          ACADEMY_B,
          "matches",
          "match-b",
        ),
      ),
    );

    await assertFails(
      setDoc(
        doc(
          db,
          "academies",
          ACADEMY_B,
          "matches",
          "match-new",
        ),
        matchWriteData(
          COACH_A,
          "DRAFT",
        ),
      ),
    );
  },
);

test(
  "14. suspended Coach cannot access Match data",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `users/suspended-coach`,
        userData(
          "suspended-coach",
          "COACH",
        ),
      ],
      [
        `academies/${ACADEMY_A}/members/suspended-coach`,
        membershipData(
          "suspended-coach",
          ACADEMY_A,
          "COACH",
          "SUSPENDED",
        ),
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      getDoc(
        doc(
          authedDb(
            "suspended-coach",
          ),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
      ),
    );
  },
);

test(
  "15. Parent global role does not grant Match access",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      getDoc(
        doc(
          authedDb(PARENT_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
      ),
    );
  },
);

test(
  "16. anonymous user cannot access Match",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      getDoc(
        doc(
          anonymousDb(),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
      ),
    );
  },
);

test(
  "17. SuperAdmin preserves existing valid Match authority",
  async () => {
    await seedTenantActors();

    await assertSucceeds(
      setDoc(
        doc(
          authedDb(SUPERADMIN),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        matchWriteData(
          SUPERADMIN,
          "DRAFT",
        ),
      ),
    );
  },
);

test(
  "18. roster accepts a real Academy player on non-terminal Match",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertSucceeds(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        rosterWriteData(
          COACH_A,
        ),
      ),
    );
  },
);

test(
  "19. roster rejects a player that does not exist in Academy",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "missing-player",
        ),
        rosterWriteData(
          COACH_A,
        ),
      ),
    );
  },
);

test(
  "20. roster payload rejects duplicated identity and unknown fields",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        {
          ...rosterWriteData(
            COACH_A,
          ),
          playerId: "player-1",
          arbitrary: true,
        },
      ),
    );
  },
);

test(
  "21. malformed roster snapshot fails closed",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        {
          ...rosterWriteData(
            COACH_A,
          ),
          futId: "",
          firstName: " Player ",
          position: "",
          jerseyNumber: 8.5,
        },
      ),
    );
  },
);

test(
  "22. roster may be corrected while Match is non-terminal",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1/roster/player-1`,
        rosterSeedData(
          COACH_A,
        ),
      ],
    ]);

    await assertSucceeds(
      updateDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        {
          jerseyNumber: 10,
          updatedAt:
            serverTimestamp(),
          updatedBy: COACH_A,
        },
      ),
    );
  },
);

test(
  "23. roster may be removed while Match is non-terminal",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1/roster/player-1`,
        rosterSeedData(
          COACH_A,
        ),
      ],
    ]);

    await assertSucceeds(
      deleteDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
      ),
    );
  },
);

test(
  "24. COMPLETED roster snapshot is immutable",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "COMPLETED",
        ),
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1/roster/player-1`,
        rosterSeedData(
          COACH_A,
        ),
      ],
    ]);

    const rosterRef =
      doc(
        authedDb(COACH_A),
        "academies",
        ACADEMY_A,
        "matches",
        "match-1",
        "roster",
        "player-1",
      );

    await assertFails(
      updateDoc(
        rosterRef,
        {
          jerseyNumber: 99,
          updatedAt:
            serverTimestamp(),
          updatedBy: COACH_A,
        },
      ),
    );

    await assertFails(
      deleteDoc(rosterRef),
    );
  },
);

test(
  "25. CANCELLED roster snapshot is immutable",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "CANCELLED",
        ),
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1/roster/player-1`,
        rosterSeedData(
          COACH_A,
        ),
      ],
    ]);

    await assertFails(
      updateDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        {
          position: "ST",
          updatedAt:
            serverTimestamp(),
          updatedBy: COACH_A,
        },
      ),
    );
  },
);

test(
  "26. unknown Match descendant collections are denied",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "notes",
          "note-1",
        ),
        {
          arbitrary: true,
        },
      ),
    );
  },
);
test(
  "27. Match create rejects forged creator identity",
  async () => {
    await seedTenantActors();

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "forged-creator",
        ),
        matchWriteData(
          ADMIN_A,
          "DRAFT",
        ),
      ),
    );
  },
);

test(
  "28. Match create rejects client-forged timestamps",
  async () => {
    await seedTenantActors();

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "forged-time",
        ),
        {
          ...matchWriteData(
            COACH_A,
            "DRAFT",
          ),
          createdAt: new Date(
            "2020-01-01T00:00:00.000Z",
          ),
          updatedAt: new Date(
            "2020-01-01T00:00:00.000Z",
          ),
        },
      ),
    );
  },
);

test(
  "29. Match update cannot rewrite creation identity or forge updater",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      updateDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
        ),
        {
          createdBy: ADMIN_A,
          createdAt: new Date(
            "2020-01-01T00:00:00.000Z",
          ),
          updatedBy: ADMIN_A,
          updatedAt:
            serverTimestamp(),
        },
      ),
    );
  },
);

test(
  "30. Roster create rejects forged creator identity",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        rosterWriteData(
          ADMIN_A,
        ),
      ),
    );
  },
);

test(
  "31. Roster create rejects client-forged timestamps",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        {
          ...rosterWriteData(
            COACH_A,
          ),
          createdAt: new Date(
            "2020-01-01T00:00:00.000Z",
          ),
          updatedAt: new Date(
            "2020-01-01T00:00:00.000Z",
          ),
        },
      ),
    );
  },
);

test(
  "32. Roster update cannot rewrite creation identity or forge updater",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1/roster/player-1`,
        rosterSeedData(
          COACH_A,
        ),
      ],
    ]);

    await assertFails(
      updateDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        {
          createdBy: ADMIN_A,
          createdAt: new Date(
            "2020-01-01T00:00:00.000Z",
          ),
          updatedBy: ADMIN_A,
          updatedAt:
            serverTimestamp(),
        },
      ),
    );
  },
);
test(
  "33. roster preserves FUTID only when it matches the Academy player",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
          futId: "FUT-000001",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertSucceeds(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        {
          ...rosterWriteData(
            COACH_A,
          ),
          futId: "FUT-000001",
        },
      ),
    );
  },
);

test(
  "34. roster rejects a FUTID that does not match the Academy player",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
          futId: "FUT-000001",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        {
          ...rosterWriteData(
            COACH_A,
          ),
          futId: "FUT-999999",
        },
      ),
    );
  },
);
test(
  "35. roster supports legacy futID player identity without migration",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
          futID: "FUT-LEGACY-001",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertSucceeds(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        {
          ...rosterWriteData(
            COACH_A,
          ),
          futId: "FUT-LEGACY-001",
        },
      ),
    );
  },
);

test(
  "36. roster fails closed when canonical and legacy FUTID conflict",
  async () => {
    await seedTenantActors();

    await seed([
      [
        `academies/${ACADEMY_A}/players/player-1`,
        {
          firstName: "Player",
          lastName: "One",
          futId: "FUT-CANONICAL-001",
          futID: "FUT-CONFLICT-999",
        },
      ],
      [
        `academies/${ACADEMY_A}/matches/match-1`,
        matchSeedData(
          COACH_A,
          "DRAFT",
        ),
      ],
    ]);

    await assertFails(
      setDoc(
        doc(
          authedDb(COACH_A),
          "academies",
          ACADEMY_A,
          "matches",
          "match-1",
          "roster",
          "player-1",
        ),
        {
          ...rosterWriteData(
            COACH_A,
          ),
          futId: "FUT-CANONICAL-001",
        },
      ),
    );
  },
);
