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
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-academy-fitness-coach-specialty-v1";
const ACADEMY_A = "academy-a";
const ACADEMY_B = "academy-b";
const ADMIN_A = "admin-a";
const ADMIN_B = "admin-b";
const COACH_A = "coach-a";
const COACH_A2 = "coach-a2";
const COACH_B = "coach-b";

let testEnv: RulesTestEnvironment;

function userData(uid: string, role: "ADMIN" | "COACH" | "SUPERADMIN") {
  return {
    uid,
    name: uid,
    email: `${uid}@example.com`,
    role,
    status: "ACTIVE",
    academyId: role === "SUPERADMIN" ? null : ACADEMY_A,
    activeAcademyId: role === "SUPERADMIN" ? null : ACADEMY_A,
    tenantRole: role === "ADMIN" || role === "COACH" ? role : null,
  };
}

function membershipData(
  uid: string,
  academyId: string,
  role: "ADMIN" | "COACH",
  status: "ACTIVE" | "SUSPENDED" | "LEFT" | "REVOKED" = "ACTIVE",
) {
  return {
    userId: uid,
    academyId,
    role,
    status,
    source: "SUPERADMIN_ASSIGNMENT",
    joinedAt: new Date(),
    joinedBy: "superadmin",
    updatedAt: new Date(),
  };
}

function specialtyData(actorUid: string, status: "ACTIVE" | "INACTIVE" | "LEFT" = "ACTIVE") {
  return {
    schemaVersion: 1,
    specialty: "FITNESS_COACH",
    status,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

async function superAdminSpecialtyMutation(
  targetUid: string,
  nextStatus: "ACTIVE" | "INACTIVE",
  actionId: string,
) {
  const firestore = authedDb("superadmin");
  const member = await getDoc(doc(firestore, "academies", ACADEMY_A, "members", targetUid));
  const specialty = await getDoc(doc(firestore, "academies", ACADEMY_A, "staffSpecialties", targetUid));
  assert.ok(member.exists());
  const memberData = member.data();
  const membershipProjection = {
    role: memberData.role,
    status: memberData.status,
    source: memberData.source,
    joinedBy: memberData.joinedBy,
  };
  const previousSpecialty = specialty.exists()
    ? { specialty: specialty.data().specialty, status: specialty.data().status }
    : null;
  const newSpecialty = { specialty: "FITNESS_COACH", status: nextStatus };
  const actionType = nextStatus === "INACTIVE"
    ? "ACADEMY_SPECIALTY_DEACTIVATED"
    : specialty.exists() ? "ACADEMY_SPECIALTY_REACTIVATED" : "ACADEMY_SPECIALTY_ASSIGNED";
  const batch = writeBatch(firestore);
  const specialtyRef = doc(firestore, "academies", ACADEMY_A, "staffSpecialties", targetUid);
  if (specialty.exists()) {
    batch.update(specialtyRef, { status: nextStatus, updatedAt: serverTimestamp(), updatedBy: "superadmin" });
  } else {
    batch.set(specialtyRef, specialtyData("superadmin", nextStatus));
  }
  batch.set(doc(firestore, `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY_A}/targets/${targetUid}`), {
    schemaVersion: 1,
    organizationType: "ACADEMY",
    organizationId: ACADEMY_A,
    targetUid,
    lastActionId: actionId,
    updatedAt: serverTimestamp(),
    updatedBy: "superadmin",
  });
  batch.set(doc(firestore, `superAdminAccessControlAudits/${actionId}`), {
    schemaVersion: 1,
    actionId,
    actionType,
    actorUid: "superadmin",
    targetUid,
    organizationType: "ACADEMY",
    organizationId: ACADEMY_A,
    previousState: { membership: membershipProjection, specialty: previousSpecialty },
    newState: { membership: membershipProjection, specialty: newSpecialty },
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) =>
        setDoc(doc(context.firestore(), path), data),
      ),
    );
  });
}

async function seedBase() {
  await seed([
    [`users/${ADMIN_A}`, userData(ADMIN_A, "ADMIN")],
    [`users/${ADMIN_B}`, { ...userData(ADMIN_B, "ADMIN"), academyId: ACADEMY_B, activeAcademyId: ACADEMY_B }],
    [`users/${COACH_A}`, userData(COACH_A, "COACH")],
    [`users/${COACH_A2}`, userData(COACH_A2, "COACH")],
    [`users/${COACH_B}`, { ...userData(COACH_B, "COACH"), academyId: ACADEMY_B, activeAcademyId: ACADEMY_B }],
    ["users/superadmin", userData("superadmin", "SUPERADMIN")],
    [`academies/${ACADEMY_A}`, { name: "Academy A" }],
    [`academies/${ACADEMY_B}`, { name: "Academy B" }],
    [`academies/${ACADEMY_A}/members/${ADMIN_A}`, membershipData(ADMIN_A, ACADEMY_A, "ADMIN")],
    [`academies/${ACADEMY_B}/members/${ADMIN_B}`, membershipData(ADMIN_B, ACADEMY_B, "ADMIN")],
    [`academies/${ACADEMY_A}/members/${COACH_A}`, membershipData(COACH_A, ACADEMY_A, "COACH")],
    [`academies/${ACADEMY_A}/members/${COACH_A2}`, membershipData(COACH_A2, ACADEMY_A, "COACH")],
    [`academies/${ACADEMY_B}/members/${COACH_B}`, membershipData(COACH_B, ACADEMY_B, "COACH")],
  ]);
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Rules tests must run through the Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  assert.ok(host && Number.isInteger(port), "Invalid FIRESTORE_EMULATOR_HOST.");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBase();
});

after(async () => {
  await testEnv.cleanup();
});

test("same-Academy active Admin can assign ACTIVE FITNESS_COACH to active Coach", async () => {
  await assertSucceeds(
    setDoc(
      doc(authedDb(ADMIN_A), "academies", ACADEMY_A, "staffSpecialties", COACH_A),
      specialtyData(ADMIN_A),
    ),
  );
});

test("Coach cannot assign specialty to self or another Coach", async () => {
  await assertFails(
    setDoc(
      doc(authedDb(COACH_A), "academies", ACADEMY_A, "staffSpecialties", COACH_A),
      specialtyData(COACH_A),
    ),
  );
  await assertFails(
    setDoc(
      doc(authedDb(COACH_A), "academies", ACADEMY_A, "staffSpecialties", COACH_A2),
      specialtyData(COACH_A),
    ),
  );
});

test("Admin cannot assign Fitness Coach specialty to Admin, missing, suspended, or cross-Academy target", async () => {
  await seed([
    [`academies/${ACADEMY_A}/members/suspended-coach`, membershipData("suspended-coach", ACADEMY_A, "COACH", "SUSPENDED")],
  ]);

  for (const target of [ADMIN_A, "missing-coach", "suspended-coach"]) {
    await assertFails(
      setDoc(
        doc(authedDb(ADMIN_A), "academies", ACADEMY_A, "staffSpecialties", target),
        specialtyData(ADMIN_A),
      ),
    );
  }

  await assertFails(
    setDoc(
      doc(authedDb(ADMIN_A), "academies", ACADEMY_B, "staffSpecialties", COACH_B),
      specialtyData(ADMIN_A),
    ),
  );
});

test("create schema rejects stored identity, unknown specialty, non-ACTIVE create, and extra fields", async () => {
  const ref = doc(
    authedDb(ADMIN_A),
    "academies",
    ACADEMY_A,
    "staffSpecialties",
    COACH_A,
  );

  await assertFails(setDoc(ref, { ...specialtyData(ADMIN_A), uid: COACH_A }));
  await assertFails(setDoc(ref, { ...specialtyData(ADMIN_A), specialty: "HEAD_COACH" }));
  await assertFails(setDoc(ref, specialtyData(ADMIN_A, "INACTIVE")));
  await assertFails(setDoc(ref, { ...specialtyData(ADMIN_A), note: "extra" }));
});

test("Coach can get own specialty but cannot get or list another Coach specialty", async () => {
  await assertSucceeds(
    setDoc(
      doc(authedDb(ADMIN_A), "academies", ACADEMY_A, "staffSpecialties", COACH_A),
      specialtyData(ADMIN_A),
    ),
  );
  await assertSucceeds(
    setDoc(
      doc(authedDb(ADMIN_A), "academies", ACADEMY_A, "staffSpecialties", COACH_A2),
      specialtyData(ADMIN_A),
    ),
  );

  await assertSucceeds(
    getDoc(doc(authedDb(COACH_A), "academies", ACADEMY_A, "staffSpecialties", COACH_A)),
  );
  await assertFails(
    getDoc(doc(authedDb(COACH_A), "academies", ACADEMY_A, "staffSpecialties", COACH_A2)),
  );
  await assertFails(
    getDocs(collection(authedDb(COACH_A), "academies", ACADEMY_A, "staffSpecialties")),
  );
});

test("Admin and SuperAdmin can list specialty records", async () => {
  await assertSucceeds(
    setDoc(
      doc(authedDb(ADMIN_A), "academies", ACADEMY_A, "staffSpecialties", COACH_A),
      specialtyData(ADMIN_A),
    ),
  );

  await assertSucceeds(
    getDocs(collection(authedDb(ADMIN_A), "academies", ACADEMY_A, "staffSpecialties")),
  );
  await assertSucceeds(
    getDocs(collection(authedDb("superadmin"), "academies", ACADEMY_A, "staffSpecialties")),
  );
});

test("authorized lifecycle allows ACTIVE to INACTIVE, INACTIVE to ACTIVE, and terminal LEFT", async () => {
  const ref = doc(
    authedDb(ADMIN_A),
    "academies",
    ACADEMY_A,
    "staffSpecialties",
    COACH_A,
  );

  await assertSucceeds(setDoc(ref, specialtyData(ADMIN_A)));
  await assertSucceeds(updateDoc(ref, {
    status: "INACTIVE",
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN_A,
  }));
  await assertSucceeds(updateDoc(ref, {
    status: "ACTIVE",
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN_A,
  }));
  await assertSucceeds(updateDoc(ref, {
    status: "LEFT",
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN_A,
  }));
  await assertFails(updateDoc(ref, {
    status: "ACTIVE",
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN_A,
  }));
});

test("reactivation requires target membership to remain ACTIVE COACH, but deactivation remains possible", async () => {
  const ref = doc(
    authedDb(ADMIN_A),
    "academies",
    ACADEMY_A,
    "staffSpecialties",
    COACH_A,
  );

  await assertSucceeds(setDoc(ref, specialtyData(ADMIN_A)));

  await seed([
    [`academies/${ACADEMY_A}/members/${COACH_A}`, membershipData(COACH_A, ACADEMY_A, "COACH", "SUSPENDED")],
  ]);

  await assertSucceeds(updateDoc(ref, {
    status: "INACTIVE",
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN_A,
  }));
  await assertFails(updateDoc(ref, {
    status: "ACTIVE",
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN_A,
  }));
});

test("immutable fields cannot change and delete is forbidden", async () => {
  const ref = doc(
    authedDb(ADMIN_A),
    "academies",
    ACADEMY_A,
    "staffSpecialties",
    COACH_A,
  );
  await assertSucceeds(setDoc(ref, specialtyData(ADMIN_A)));

  await assertFails(updateDoc(ref, {
    specialty: "HEAD_COACH",
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN_A,
  }));
  await assertFails(updateDoc(ref, {
    createdBy: COACH_A,
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN_A,
  }));
  await assertFails(deleteDoc(ref));
});

test("SuperAdmin can assign and update exact active Coach specialty", async () => {
  await assertSucceeds(superAdminSpecialtyMutation(COACH_A, "ACTIVE", "superadmin-specialty-create"));
  await assertSucceeds(superAdminSpecialtyMutation(COACH_A, "INACTIVE", "superadmin-specialty-deactivate"));
});

test("SuperAdmin can deactivate an active specialty after the target account becomes inactive", async () => {
  await seed([
    [`users/${COACH_A}`, { ...userData(COACH_A, "COACH"), status: "INACTIVE" }],
    [`academies/${ACADEMY_A}/staffSpecialties/${COACH_A}`, specialtyData("superadmin")],
  ]);

  await assertSucceeds(
    superAdminSpecialtyMutation(COACH_A, "INACTIVE", "inactive-user-specialty-deactivate"),
  );
});

test("SuperAdmin can deactivate an active specialty for a suspended Coach membership", async () => {
  await seed([
    [`academies/${ACADEMY_A}/members/${COACH_A}`, membershipData(COACH_A, ACADEMY_A, "COACH", "SUSPENDED")],
    [`academies/${ACADEMY_A}/staffSpecialties/${COACH_A}`, specialtyData("superadmin")],
  ]);

  await assertSucceeds(
    superAdminSpecialtyMutation(COACH_A, "INACTIVE", "suspended-coach-specialty-deactivate"),
  );
});

test("SuperAdmin can deactivate a stale specialty after the target membership role changes", async () => {
  await seed([
    [`academies/${ACADEMY_A}/members/${COACH_A}`, membershipData(COACH_A, ACADEMY_A, "ADMIN")],
    [`academies/${ACADEMY_A}/staffSpecialties/${COACH_A}`, specialtyData("superadmin")],
  ]);

  await assertSucceeds(
    superAdminSpecialtyMutation(COACH_A, "INACTIVE", "admin-membership-specialty-deactivate"),
  );
});

test("ineligible targets cannot receive an assigned or reactivated specialty", async () => {
  await seed([
    [`users/${COACH_A}`, { ...userData(COACH_A, "COACH"), status: "INACTIVE" }],
  ]);

  await assertFails(
    superAdminSpecialtyMutation(COACH_A, "ACTIVE", "inactive-user-specialty-assign"),
  );

  await seed([
    [`users/${COACH_A}`, userData(COACH_A, "COACH")],
    [`academies/${ACADEMY_A}/members/${COACH_A}`, membershipData(COACH_A, ACADEMY_A, "COACH", "SUSPENDED")],
    [`academies/${ACADEMY_A}/staffSpecialties/${COACH_A}`, specialtyData("superadmin", "INACTIVE")],
  ]);

  await assertFails(
    superAdminSpecialtyMutation(COACH_A, "ACTIVE", "suspended-coach-specialty-reactivate"),
  );
});

test("specialty deactivation cannot bundle an Academy role change under a specialty-only audit", async () => {
  await seed([
    [`academies/${ACADEMY_A}/staffSpecialties/${COACH_A}`, specialtyData("superadmin")],
  ]);
  const firestore = authedDb("superadmin");
  const member = await getDoc(doc(firestore, "academies", ACADEMY_A, "members", COACH_A));
  const specialty = await getDoc(doc(firestore, "academies", ACADEMY_A, "staffSpecialties", COACH_A));
  assert.ok(member.exists());
  assert.ok(specialty.exists());
  const previousMembership = member.data() as {
    role: string;
    status: string;
    source: string;
    joinedBy: string;
    [key: string]: unknown;
  };
  const previousSpecialty = specialty.data();
  const nextMembership = { ...previousMembership, role: "ADMIN" };
  const actionId = "specialty-deactivation-with-role-change";
  const previousState = {
    membership: {
      role: previousMembership.role,
      status: previousMembership.status,
      source: previousMembership.source,
      joinedBy: previousMembership.joinedBy,
    },
    specialty: { specialty: previousSpecialty.specialty, status: previousSpecialty.status },
  };
  const newState = {
    membership: {
      role: nextMembership.role,
      status: nextMembership.status,
      source: nextMembership.source,
      joinedBy: nextMembership.joinedBy,
    },
    specialty: { specialty: "FITNESS_COACH", status: "INACTIVE" },
  };
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "academies", ACADEMY_A, "members", COACH_A), {
    role: "ADMIN",
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(firestore, "academies", ACADEMY_A, "staffSpecialties", COACH_A), {
    status: "INACTIVE",
    updatedAt: serverTimestamp(),
    updatedBy: "superadmin",
  });
  batch.set(doc(firestore, `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY_A}/targets/${COACH_A}`), {
    schemaVersion: 1,
    organizationType: "ACADEMY",
    organizationId: ACADEMY_A,
    targetUid: COACH_A,
    lastActionId: actionId,
    updatedAt: serverTimestamp(),
    updatedBy: "superadmin",
  });
  batch.set(doc(firestore, `superAdminAccessControlAudits/${actionId}`), {
    schemaVersion: 1,
    actionId,
    actionType: "ACADEMY_SPECIALTY_DEACTIVATED",
    actorUid: "superadmin",
    targetUid: COACH_A,
    organizationType: "ACADEMY",
    organizationId: ACADEMY_A,
    previousState,
    newState,
    createdAt: serverTimestamp(),
  });
  await assertFails(batch.commit());
});
