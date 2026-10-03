import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch, type Firestore } from "firebase/firestore";

const PROJECT = "demo-superadmin-unified-access-control-v1";
const SUPERADMIN = "superadmin-a";
const USER = "coach-a";
const CLUB = "club-a";
const ACADEMY = "academy-a";
let environment: RulesTestEnvironment;

function db(uid: string): Firestore {
  return environment.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seedBase() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, `users/${SUPERADMIN}`), { uid: SUPERADMIN, role: "SUPERADMIN", status: "ACTIVE" }),
      setDoc(doc(firestore, `users/${USER}`), { uid: USER, role: "USER", status: "ACTIVE" }),
      setDoc(doc(firestore, `proClubs/${CLUB}`), { name: "TNSU Lampang", status: "ACTIVE" }),
      setDoc(doc(firestore, `academies/${ACADEMY}`), { name: "Talumball Academy" }),
    ]);
  });
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Rules tests must run through the Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  environment = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host: emulatorHost.slice(0, separator),
      port: Number(emulatorHost.slice(separator + 1)),
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seedBase();
});
after(async () => environment?.cleanup());

test("SuperAdmin client cannot directly create Pro Club membership, staff, or discovery pointer", async () => {
  const firestore = db(SUPERADMIN);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, `proClubs/${CLUB}/members/${USER}`), { authorizationRole: "MEMBER", status: "ACTIVE" });
  batch.set(doc(firestore, `proClubs/${CLUB}/staff/${USER}`), { staffRole: "HEAD_COACH", status: "ACTIVE" });
  batch.set(doc(firestore, `users/${USER}/proClubMemberships/${CLUB}`), { schemaVersion: 1, clubId: CLUB });
  await assertFails(batch.commit());
  assert.equal((await getDoc(doc(firestore, `proClubs/${CLUB}/members/${USER}`))).exists(), false);
  assert.equal((await getDoc(doc(firestore, `proClubs/${CLUB}/staff/${USER}`))).exists(), false);
  assert.equal((await getDoc(doc(firestore, `users/${USER}/proClubMemberships/${CLUB}`))).exists(), false);
});

test("SuperAdmin client cannot reactivate or change existing Pro Club relationships", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, `proClubs/${CLUB}/members/${USER}`), { authorizationRole: "MEMBER", status: "INACTIVE" });
    await setDoc(doc(firestore, `proClubs/${CLUB}/staff/${USER}`), { staffRole: "ANALYST", status: "INACTIVE" });
    await setDoc(doc(firestore, `users/${USER}/proClubMemberships/${CLUB}`), { schemaVersion: 1, clubId: CLUB });
  });
  const firestore = db(SUPERADMIN);
  await assertFails(updateDoc(doc(firestore, `proClubs/${CLUB}/members/${USER}`), { status: "ACTIVE" }));
  await assertFails(updateDoc(doc(firestore, `proClubs/${CLUB}/staff/${USER}`), { staffRole: "HEAD_COACH", status: "ACTIVE" }));
});

test("SuperAdmin client cannot directly create Academy access, specialty, audit, or state", async () => {
  const firestore = db(SUPERADMIN);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, `academies/${ACADEMY}/members/${USER}`), {
    userId: USER, academyId: ACADEMY, role: "COACH", status: "ACTIVE", source: "SUPERADMIN_ASSIGNMENT",
    joinedAt: new Date(), joinedBy: SUPERADMIN, updatedAt: new Date(),
  });
  batch.set(doc(firestore, `academies/${ACADEMY}/staffSpecialties/${USER}`), {
    schemaVersion: 1, specialty: "FITNESS_COACH", status: "ACTIVE", createdAt: new Date(),
    createdBy: SUPERADMIN, updatedAt: new Date(), updatedBy: SUPERADMIN,
  });
  batch.set(doc(firestore, `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY}/targets/${USER}`), {
    schemaVersion: 1, organizationType: "ACADEMY", organizationId: ACADEMY, targetUid: USER,
    lastActionId: "action-1", updatedAt: new Date(), updatedBy: SUPERADMIN,
  });
  batch.set(doc(firestore, "superAdminAccessControlAudits/action-1"), {
    schemaVersion: 1, actionId: "action-1", actionType: "ACADEMY_MEMBERSHIP_ASSIGNED", actorUid: SUPERADMIN,
    targetUid: USER, organizationType: "ACADEMY", organizationId: ACADEMY,
    previousState: { membership: null, specialty: null }, newState: {}, createdAt: new Date(),
  });
  await assertFails(batch.commit());
  assert.equal((await getDoc(doc(firestore, `academies/${ACADEMY}/members/${USER}`))).exists(), false);
  assert.equal((await getDoc(doc(firestore, `academies/${ACADEMY}/staffSpecialties/${USER}`))).exists(), false);
});

test("SuperAdmin client cannot change an Academy role or Fitness Coach specialty", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, `academies/${ACADEMY}/members/${USER}`), {
      userId: USER, academyId: ACADEMY, role: "COACH", status: "ACTIVE", source: "LEGACY_MIGRATION",
      joinedAt: new Date(), joinedBy: SUPERADMIN, updatedAt: new Date(),
    });
    await setDoc(doc(firestore, `academies/${ACADEMY}/staffSpecialties/${USER}`), {
      schemaVersion: 1, specialty: "FITNESS_COACH", status: "ACTIVE", createdAt: new Date(),
      createdBy: SUPERADMIN, updatedAt: new Date(), updatedBy: SUPERADMIN,
    });
  });
  const firestore = db(SUPERADMIN);
  await assertFails(updateDoc(doc(firestore, `academies/${ACADEMY}/members/${USER}`), {
    role: "ADMIN", updatedAt: new Date(),
  }));
  await assertFails(updateDoc(doc(firestore, `academies/${ACADEMY}/staffSpecialties/${USER}`), {
    status: "INACTIVE", updatedAt: new Date(), updatedBy: SUPERADMIN,
  }));
});

test("SuperAdmin retains audit and access-state reads; other users do not", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "superAdminAccessControlAudits/action-1"), { actionId: "action-1" });
    await setDoc(doc(firestore, `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY}/targets/${USER}`), {
      organizationType: "ACADEMY", organizationId: ACADEMY, targetUid: USER,
    });
  });
  const firestore = db(SUPERADMIN);
  await assertSucceeds(getDoc(doc(firestore, "superAdminAccessControlAudits/action-1")));
  await assertSucceeds(getDoc(doc(firestore, `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY}/targets/${USER}`)));
  await assertFails(getDoc(doc(db(USER), "superAdminAccessControlAudits/action-1")));
  await assertFails(getDoc(doc(db(USER), `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY}/targets/${USER}`)));
  await assertFails(setDoc(doc(firestore, "superAdminAccessControlAudits/client-write"), { actionId: "client-write" }));
  await assertFails(setDoc(doc(firestore, `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY}/targets/${USER}`), { targetUid: USER }));
});

test("SuperAdmin retains selected Pro Club relationship reads without a root get bypass", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, `proClubs/${CLUB}/members/${USER}`), { authorizationRole: "MEMBER", status: "ACTIVE" });
    await setDoc(doc(firestore, `proClubs/${CLUB}/staff/${USER}`), { staffRole: "HEAD_COACH", status: "ACTIVE" });
    await setDoc(doc(firestore, `users/${USER}/proClubMemberships/${CLUB}`), { schemaVersion: 1, clubId: CLUB });
  });
  const firestore = db(SUPERADMIN);
  await assertFails(getDoc(doc(firestore, `proClubs/${CLUB}`)));
  await assertSucceeds(getDoc(doc(firestore, `proClubs/${CLUB}/members/${USER}`)));
  await assertSucceeds(getDoc(doc(firestore, `proClubs/${CLUB}/staff/${USER}`)));
  await assertSucceeds(getDoc(doc(firestore, `users/${USER}/proClubMemberships/${CLUB}`)));
});

test("SuperAdmin cannot create a Pro Club MEMBER document directly", async () => {
  await assertFails(setDoc(doc(db(SUPERADMIN), `proClubs/${CLUB}/members/${USER}`), {
    authorizationRole: "MEMBER", status: "ACTIVE",
  }));
});

test("SuperAdmin cannot create a Pro Club staff document directly", async () => {
  await assertFails(setDoc(doc(db(SUPERADMIN), `proClubs/${CLUB}/staff/${USER}`), {
    staffRole: "HEAD_COACH", status: "ACTIVE",
  }));
});

test("SuperAdmin cannot create a Pro Club discovery pointer directly", async () => {
  await assertFails(setDoc(doc(db(SUPERADMIN), `users/${USER}/proClubMemberships/${CLUB}`), {
    schemaVersion: 1, clubId: CLUB,
  }));
});

test("SuperAdmin cannot create an access audit directly", async () => {
  await assertFails(setDoc(doc(db(SUPERADMIN), "superAdminAccessControlAudits/client-action"), {
    actionId: "client-action",
  }));
});

test("SuperAdmin cannot update an existing access audit", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "superAdminAccessControlAudits/server-action"), { actionId: "server-action" });
  });
  await assertFails(updateDoc(doc(db(SUPERADMIN), "superAdminAccessControlAudits/server-action"), { actionType: "FORGED" }));
});

test("SuperAdmin cannot delete an access audit", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "superAdminAccessControlAudits/server-action"), { actionId: "server-action" });
  });
  await assertFails(deleteDoc(doc(db(SUPERADMIN), "superAdminAccessControlAudits/server-action")));
});

test("SuperAdmin cannot create access-control state directly", async () => {
  await assertFails(setDoc(doc(db(SUPERADMIN), `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY}/targets/${USER}`), {
    schemaVersion: 1, organizationType: "ACADEMY", organizationId: ACADEMY, targetUid: USER,
    lastActionId: "client-action", updatedBy: SUPERADMIN,
  }));
});

test("SuperAdmin cannot update existing access-control state", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY}/targets/${USER}`), {
      organizationType: "ACADEMY", organizationId: ACADEMY, targetUid: USER,
    });
  });
  await assertFails(updateDoc(doc(db(SUPERADMIN), `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY}/targets/${USER}`), {
    lastActionId: "client-action",
  }));
});

test("SuperAdmin cannot delete access-control state", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY}/targets/${USER}`), {
      organizationType: "ACADEMY", organizationId: ACADEMY, targetUid: USER,
    });
  });
  await assertFails(deleteDoc(doc(db(SUPERADMIN), `superAdminAccessControlState/ACADEMY/organizations/${ACADEMY}/targets/${USER}`)));
});
