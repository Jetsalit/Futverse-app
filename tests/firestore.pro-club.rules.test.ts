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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-rules-v1";

const CLUB_A = "club-a";
const CLUB_B = "club-b";
const CLUB_INACTIVE = "club-inactive";
const CLUB_MALFORMED = "club-malformed";

const OWNER = "owner-a";
const ADMIN = "admin-a";
const MEMBER = "member-a";

const INACTIVE_MEMBER = "inactive-member";
const LEFT_MEMBER = "left-member";
const REVOKED_MEMBER = "revoked-member";
const INACTIVE_CLUB_MEMBER = "inactive-club-member";

const STAFF_ACTIVE = "staff-active";
const STAFF_INACTIVE = "staff-inactive";
const STAFF_LEFT = "staff-left";
const STAFF_ONLY = "staff-only";

const OUTSIDER = "outsider";
const GLOBAL_SUPERADMIN = "global-superadmin";
const ACADEMY_ADMIN = "academy-admin";

const MALFORMED_CLUB_READER = "malformed-club-reader";
const MALFORMED_MEMBER = "malformed-member";
const MALFORMED_STAFF = "malformed-staff";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv
    .authenticatedContext(uid)
    .firestore() as unknown as Firestore;
}

function anonymousDb(): Firestore {
  return testEnv
    .unauthenticatedContext()
    .firestore() as unknown as Firestore;
}

function clubData(
  name: string,
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): DocumentData {
  return {
    name,
    level: "T3",
    status,
  };
}

function membershipData(
  authorizationRole: "OWNER" | "ADMIN" | "MEMBER",
  status: "ACTIVE" | "INACTIVE" | "LEFT" | "REVOKED",
): DocumentData {
  return {
    authorizationRole,
    status,
  };
}

function staffData(
  staffRole:
    | "HEAD_COACH"
    | "ASSISTANT_COACH"
    | "FITNESS_COACH"
    | "ANALYST"
    | "PHYSIO"
    | "TEAM_MANAGER"
    | "STAFF",
  status: "ACTIVE" | "INACTIVE" | "LEFT",
): DocumentData {
  return {
    staffRole,
    status,
  };
}

async function seed(
  entries: Array<[string, DocumentData]>,
): Promise<void> {
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

async function seedBaseline(): Promise<void> {
  await seed([
    [
      `proClubs/${CLUB_A}`,
      clubData("Club A"),
    ],
    [
      `proClubs/${CLUB_B}`,
      clubData("Club B"),
    ],
    [
      `proClubs/${CLUB_INACTIVE}`,
      clubData("Inactive Club", "INACTIVE"),
    ],

    [
      `proClubs/${CLUB_A}/members/${OWNER}`,
      membershipData("OWNER", "ACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/members/${ADMIN}`,
      membershipData("ADMIN", "ACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/members/${MEMBER}`,
      membershipData("MEMBER", "ACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/members/${INACTIVE_MEMBER}`,
      membershipData("MEMBER", "INACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/members/${LEFT_MEMBER}`,
      membershipData("MEMBER", "LEFT"),
    ],
    [
      `proClubs/${CLUB_A}/members/${REVOKED_MEMBER}`,
      membershipData("MEMBER", "REVOKED"),
    ],
    [
      `proClubs/${CLUB_INACTIVE}/members/${INACTIVE_CLUB_MEMBER}`,
      membershipData("MEMBER", "ACTIVE"),
    ],

    [
      `proClubs/${CLUB_A}/members/${STAFF_ACTIVE}`,
      membershipData("MEMBER", "ACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/members/${STAFF_INACTIVE}`,
      membershipData("MEMBER", "ACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/members/${STAFF_LEFT}`,
      membershipData("MEMBER", "ACTIVE"),
    ],

    [
      `proClubs/${CLUB_A}/staff/${STAFF_ACTIVE}`,
      staffData("HEAD_COACH", "ACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/staff/${STAFF_INACTIVE}`,
      staffData("FITNESS_COACH", "INACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/staff/${STAFF_LEFT}`,
      staffData("ANALYST", "LEFT"),
    ],

    // Staff assignment alone deliberately has no membership authority.
    [
      `proClubs/${CLUB_A}/staff/${STAFF_ONLY}`,
      staffData("PHYSIO", "ACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/nameHistory/change-1`,
      {
        schemaVersion: 1,
        clubId: CLUB_A,
        previousName: "Old Club A",
        previousShortName: null,
        newName: "Club A",
        newShortName: null,
        reason: "REBRAND",
        reasonNote: null,
        effectiveAt: "2026-09-01T00:00:00.000Z",
        changedAt: "2026-09-01T00:00:01.000Z",
        changedBy: GLOBAL_SUPERADMIN,
      },
    ],

    // Existing global/Acedemy authority must never become Pro Club authority.
    [
      `users/${GLOBAL_SUPERADMIN}`,
      {
        role: "SUPERADMIN",
        status: "ACTIVE",
      },
    ],
    [
      `users/${OWNER}`,
      { role: "USER", status: "ACTIVE" },
    ],
    [
      `users/${ADMIN}`,
      { role: "USER", status: "ACTIVE" },
    ],
    [
      `users/${MEMBER}`,
      { role: "USER", status: "ACTIVE" },
    ],
    [
      `users/${ACADEMY_ADMIN}`,
      {
        role: "ADMIN",
        status: "ACTIVE",
      },
    ],
    [
      "academies/academy-a",
      {
        name: "Academy A",
      },
    ],
    [
      `academies/academy-a/members/${ACADEMY_ADMIN}`,
      {
        userId: ACADEMY_ADMIN,
        academyId: "academy-a",
        role: "ADMIN",
        status: "ACTIVE",
      },
    ],

    // Malformed stored records remain readable only to the relevant
    // path-scoped actor so the application adapter can classify INVALID_DATA.
    [
      `proClubs/${CLUB_MALFORMED}`,
      {
        name: "Malformed Club",
        level: "T3",
        status: "ACTIVE",
        clubId: CLUB_MALFORMED,
      },
    ],
    [
      `proClubs/${CLUB_MALFORMED}/members/${MALFORMED_CLUB_READER}`,
      membershipData("MEMBER", "ACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/members/${MALFORMED_MEMBER}`,
      {
        authorizationRole: "MEMBER",
        status: "ACTIVE",
        userId: MALFORMED_MEMBER,
      },
    ],
    [
      `proClubs/${CLUB_A}/members/${MALFORMED_STAFF}`,
      membershipData("MEMBER", "ACTIVE"),
    ],
    [
      `proClubs/${CLUB_A}/staff/${MALFORMED_STAFF}`,
      {
        staffRole: "HEAD_COACH",
        status: "ACTIVE",
        userId: MALFORMED_STAFF,
      },
    ],

    [
      `proClubs/${CLUB_A}/private/secret`,
      {
        secret: true,
      },
    ],
  ]);
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

  const port =
    Number(emulatorHost.slice(separator + 1));

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
  await seedBaseline();
});

after(async () => {
  await testEnv.cleanup();
});


test(
  "1. anonymous user cannot read a Pro Club",
  async () => {
    await assertFails(
      getDoc(
        doc(
          anonymousDb(),
          "proClubs",
          CLUB_A,
        ),
      ),
    );
  },
);


test(
  "2. signed-in outsider without Pro Club relationship cannot read club",
  async () => {
    await assertFails(
      getDoc(
        doc(
          authedDb(OUTSIDER),
          "proClubs",
          CLUB_A,
        ),
      ),
    );
  },
);


test(
  "3. ACTIVE global SUPERADMIN gets exact Pro Club support read without tenant discovery",
  async () => {
    const db = authedDb(GLOBAL_SUPERADMIN);

    const clubSnapshot = await assertSucceeds(
      getDoc(
        doc(
          db,
          "proClubs",
          CLUB_A,
        ),
      ),
    );

    assert.equal(clubSnapshot.data()?.name, "Club A");

    await assertFails(
      getDocs(
        collection(
          db,
          "proClubs",
        ),
      ),
    );
  },
);

test(
  "4. Academy ADMIN without Pro Club membership gets no fallback",
  async () => {
    await assertFails(
      getDoc(
        doc(
          authedDb(ACADEMY_ADMIN),
          "proClubs",
          CLUB_A,
        ),
      ),
    );
  },
);


test(
  "5. staff assignment alone does not allow club read",
  async () => {
    await assertFails(
      getDoc(
        doc(
          authedDb(STAFF_ONLY),
          "proClubs",
          CLUB_A,
        ),
      ),
    );

    const staffSnapshot =
      await assertSucceeds(
        getDoc(
          doc(
            authedDb(STAFF_ONLY),
            "proClubs",
            CLUB_A,
            "staff",
            STAFF_ONLY,
          ),
        ),
      );

    assert.equal(
      staffSnapshot.data()?.staffRole,
      "PHYSIO",
    );
  },
);


test(
  "6. ACTIVE OWNER ADMIN and MEMBER can read club and own membership",
  async () => {
    for (const uid of [
      OWNER,
      ADMIN,
      MEMBER,
    ]) {
      const db = authedDb(uid);

      await assertSucceeds(
        getDoc(
          doc(
            db,
            "proClubs",
            CLUB_A,
          ),
        ),
      );

      const membershipSnapshot =
        await assertSucceeds(
          getDoc(
            doc(
              db,
              "proClubs",
              CLUB_A,
              "members",
              uid,
            ),
          ),
        );

      assert.equal(
        membershipSnapshot.exists(),
        true,
      );
    }
  },
);


test(
  "7. INACTIVE LEFT and REVOKED membership remain readable as relationship evidence",
  async () => {
    const cases = [
      [INACTIVE_MEMBER, "INACTIVE"],
      [LEFT_MEMBER, "LEFT"],
      [REVOKED_MEMBER, "REVOKED"],
    ] as const;

    for (const [uid, expectedStatus] of cases) {
      const db = authedDb(uid);

      await assertSucceeds(
        getDoc(
          doc(
            db,
            "proClubs",
            CLUB_A,
          ),
        ),
      );

      const membershipSnapshot =
        await assertSucceeds(
          getDoc(
            doc(
              db,
              "proClubs",
              CLUB_A,
              "members",
              uid,
            ),
          ),
        );

      assert.equal(
        membershipSnapshot.data()?.status,
        expectedStatus,
      );
    }
  },
);


test(
  "8. INACTIVE club remains readable to its relationship holder as status evidence",
  async () => {
    const db =
      authedDb(INACTIVE_CLUB_MEMBER);

    const clubSnapshot =
      await assertSucceeds(
        getDoc(
          doc(
            db,
            "proClubs",
            CLUB_INACTIVE,
          ),
        ),
      );

    assert.equal(
      clubSnapshot.data()?.status,
      "INACTIVE",
    );
  },
);


test(
  "9. user can inspect own missing membership and staff without reading another user",
  async () => {
    const db =
      authedDb(OUTSIDER);

    const membershipSnapshot =
      await assertSucceeds(
        getDoc(
          doc(
            db,
            "proClubs",
            CLUB_A,
            "members",
            OUTSIDER,
          ),
        ),
      );

    assert.equal(
      membershipSnapshot.exists(),
      false,
    );

    const staffSnapshot =
      await assertSucceeds(
        getDoc(
          doc(
            db,
            "proClubs",
            CLUB_A,
            "staff",
            OUTSIDER,
          ),
        ),
      );

    assert.equal(
      staffSnapshot.exists(),
      false,
    );

    await assertFails(
      getDoc(
        doc(
          db,
          "proClubs",
          CLUB_A,
          "members",
          MEMBER,
        ),
      ),
    );
  },
);


test(
  "10. ACTIVE member cannot read another member or another staff assignment",
  async () => {
    const db =
      authedDb(MEMBER);

    await assertFails(
      getDoc(
        doc(
          db,
          "proClubs",
          CLUB_A,
          "members",
          OWNER,
        ),
      ),
    );

    await assertFails(
      getDoc(
        doc(
          db,
          "proClubs",
          CLUB_A,
          "staff",
          STAFF_ACTIVE,
        ),
      ),
    );
  },
);


test(
  "11. Pro Club collections cannot be listed in V1",
  async () => {
    const db =
      authedDb(OWNER);

    await assertFails(
      getDocs(
        collection(
          db,
          "proClubs",
        ),
      ),
    );

    await assertFails(
      getDocs(
        collection(
          db,
          "proClubs",
          CLUB_A,
          "members",
        ),
      ),
    );

    await assertFails(
      getDocs(
        collection(
          db,
          "proClubs",
          CLUB_A,
          "staff",
        ),
      ),
    );
  },
);


test(
  "12. own ACTIVE INACTIVE and LEFT staff evidence can be read",
  async () => {
    const cases = [
      [STAFF_ACTIVE, "ACTIVE"],
      [STAFF_INACTIVE, "INACTIVE"],
      [STAFF_LEFT, "LEFT"],
    ] as const;

    for (const [uid, expectedStatus] of cases) {
      const snapshot =
        await assertSucceeds(
          getDoc(
            doc(
              authedDb(uid),
              "proClubs",
              CLUB_A,
              "staff",
              uid,
            ),
          ),
        );

      assert.equal(
        snapshot.data()?.status,
        expectedStatus,
      );
    }
  },
);


test(
  "13. cross-club access fails without exact relationship in target club",
  async () => {
    const db =
      authedDb(MEMBER);

    await assertFails(
      getDoc(
        doc(
          db,
          "proClubs",
          CLUB_B,
        ),
      ),
    );

    await assertFails(
      getDoc(
        doc(
          db,
          "proClubs",
          CLUB_B,
          "members",
          OWNER,
        ),
      ),
    );
  },
);


test(
  "14. malformed relationship-scoped records remain reachable for adapter INVALID_DATA classification",
  async () => {
    const malformedClub =
      await assertSucceeds(
        getDoc(
          doc(
            authedDb(MALFORMED_CLUB_READER),
            "proClubs",
            CLUB_MALFORMED,
          ),
        ),
      );

    assert.equal(
      malformedClub.exists(),
      true,
    );

    const malformedMembership =
      await assertSucceeds(
        getDoc(
          doc(
            authedDb(MALFORMED_MEMBER),
            "proClubs",
            CLUB_A,
            "members",
            MALFORMED_MEMBER,
          ),
        ),
      );

    assert.equal(
      malformedMembership.exists(),
      true,
    );

    const malformedStaff =
      await assertSucceeds(
        getDoc(
          doc(
            authedDb(MALFORMED_STAFF),
            "proClubs",
            CLUB_A,
            "staff",
            MALFORMED_STAFF,
          ),
        ),
      );

    assert.equal(
      malformedStaff.exists(),
      true,
    );
  },
);


test(
  "15. all Pro Club writes remain denied in V1",
  async () => {
    const db =
      authedDb(OWNER);

    await assertFails(
      setDoc(
        doc(
          db,
          "proClubs",
          "new-club",
        ),
        clubData("New Club"),
      ),
    );

    await assertFails(
      updateDoc(
        doc(
          db,
          "proClubs",
          CLUB_A,
        ),
        {
          name: "Changed",
        },
      ),
    );

    await assertFails(
      deleteDoc(
        doc(
          db,
          "proClubs",
          CLUB_A,
        ),
      ),
    );

    await assertFails(
      setDoc(
        doc(
          db,
          "proClubs",
          CLUB_A,
          "members",
          "new-member",
        ),
        membershipData(
          "MEMBER",
          "ACTIVE",
        ),
      ),
    );

    await assertFails(
      updateDoc(
        doc(
          db,
          "proClubs",
          CLUB_A,
          "members",
          OWNER,
        ),
        {
          status: "INACTIVE",
        },
      ),
    );

    await assertFails(
      deleteDoc(
        doc(
          db,
          "proClubs",
          CLUB_A,
          "members",
          OWNER,
        ),
      ),
    );

    await assertFails(
      setDoc(
        doc(
          db,
          "proClubs",
          CLUB_A,
          "staff",
          OWNER,
        ),
        staffData(
          "TEAM_MANAGER",
          "ACTIVE",
        ),
      ),
    );
  },
);


test(
  "16. unknown Pro Club nested collections fail closed",
  async () => {
    await assertFails(
      getDoc(
        doc(
          authedDb(OWNER),
          "proClubs",
          CLUB_A,
          "private",
          "secret",
        ),
      ),
    );
  },
);

test("17. ACTIVE OWNER and ADMIN may read exact name history", async () => {
  for (const uid of [OWNER, ADMIN]) {
    const snapshot = await assertSucceeds(getDoc(doc(
      authedDb(uid), "proClubs", CLUB_A, "nameHistory", "change-1",
    )));
    assert.equal(snapshot.data()?.clubId, CLUB_A);
    const listing = await assertSucceeds(getDocs(collection(
      authedDb(uid), "proClubs", CLUB_A, "nameHistory",
    )));
    assert.equal(listing.size, 1);
  }
});

test("18. unauthorized, inactive, and ordinary members cannot read name history", async () => {
  for (const uid of [OUTSIDER, MEMBER, INACTIVE_MEMBER, GLOBAL_SUPERADMIN]) {
    await assertFails(getDoc(doc(
      authedDb(uid), "proClubs", CLUB_A, "nameHistory", "change-1",
    )));
  }
  await assertFails(getDoc(doc(
    anonymousDb(), "proClubs", CLUB_A, "nameHistory", "change-1",
  )));
});

test("19. all client name-history mutations fail closed", async () => {
  const historyRef = doc(
    authedDb(OWNER), "proClubs", CLUB_A, "nameHistory", "change-1",
  );
  await assertFails(setDoc(doc(
    authedDb(OWNER), "proClubs", CLUB_A, "nameHistory", "change-2",
  ), {
    schemaVersion: 1,
    clubId: CLUB_A,
    previousName: "Club A",
    previousShortName: null,
    newName: "Injected Name",
    newShortName: null,
    reason: "REBRAND",
    reasonNote: null,
    effectiveAt: "2026-09-02T00:00:00.000Z",
    changedAt: "2026-09-02T00:00:01.000Z",
    changedBy: OWNER,
  }));
  await assertFails(updateDoc(historyRef, { newName: "Overwritten" }));
  await assertFails(deleteDoc(historyRef));
});

test("20. direct client root rename remains denied", async () => {
  await assertFails(updateDoc(doc(authedDb(OWNER), "proClubs", CLUB_A), {
    name: "Direct Client Rename",
    updatedAt: "2026-09-07T00:00:00.000Z",
  }));
});
