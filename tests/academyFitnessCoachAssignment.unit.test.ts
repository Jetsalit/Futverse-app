import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase/firestore";
import {
  canManageFitnessCoachAssignments,
  resolveFitnessCoachAssignmentRows,
  validateFitnessCoachTransition,
} from "../src/lib/academyFitnessCoachAssignment.ts";

const academyId = "academy-a";
const coach = { userId: "coach-a", academyId, role: "COACH", status: "ACTIVE" };
const admin = { userId: "admin-a", academyId, role: "ADMIN", status: "ACTIVE" };
const specialty = {
  schemaVersion: 1, specialty: "FITNESS_COACH", status: "ACTIVE",
  createdAt: Timestamp.fromMillis(1000), createdBy: "admin-a",
  updatedAt: Timestamp.fromMillis(1000), updatedBy: "admin-a",
};

test("only actual SuperAdmin or exact active Academy Admin can manage", () => {
  const actor = { uid: "admin-a", role: "ADMIN", status: "ACTIVE" };
  assert.equal(canManageFitnessCoachAssignments(actor, admin, academyId), true);
  assert.equal(canManageFitnessCoachAssignments(actor, { ...admin, userId: "wrong" }, academyId), false);
  assert.equal(canManageFitnessCoachAssignments(actor, { ...admin, status: "SUSPENDED" }, academyId), false);
  assert.equal(canManageFitnessCoachAssignments({ ...actor, role: "COACH" }, coach, academyId), false);
  assert.equal(canManageFitnessCoachAssignments({ ...actor, role: "COACH" }, admin, academyId), true);
  assert.equal(canManageFitnessCoachAssignments({ uid: "super", role: "SUPERADMIN", status: "ACTIVE" }, null, academyId), true);
  assert.equal(canManageFitnessCoachAssignments({ uid: "super", role: "SUPERADMIN", status: "INACTIVE" }, null, academyId), false);
});

test("assignment rows bind to canonical member UID and keep cleanup targets visible", () => {
  const rows = resolveFitnessCoachAssignmentRows(academyId,
    [{ id: "coach-a", data: coach }, { id: "admin-a", data: admin }, { id: "wrong-id", data: { ...coach, userId: "other" } }],
    [{ id: "coach-a", data: specialty }, { id: "former-coach", data: specialty }],
  );
  assert.deepEqual(rows.map((row) => [row.uid, row.status, row.canActivate, row.canDeactivate]), [
    ["coach-a", "ACTIVE", false, true],
    ["former-coach", "ACTIVE", false, true],
  ]);
  assert.throws(() => resolveFitnessCoachAssignmentRows(academyId, [], [{ id: "coach-a", data: { ...specialty, uid: "coach-a" } }]), /invalid specialty/i);
});

test("only active Coaches may be assigned or reactivated; LEFT is terminal", () => {
  assert.equal(validateFitnessCoachTransition("ACTIVE", coach, "coach-a", academyId, null), "CREATE");
  assert.equal(validateFitnessCoachTransition("INACTIVE", coach, "coach-a", academyId, specialty), "UPDATE");
  assert.equal(validateFitnessCoachTransition("ACTIVE", coach, "coach-a", academyId, { ...specialty, status: "INACTIVE" }), "UPDATE");
  assert.throws(() => validateFitnessCoachTransition("ACTIVE", { ...coach, status: "LEFT" }, "coach-a", academyId, null), /active Coach/i);
  assert.throws(() => validateFitnessCoachTransition("ACTIVE", coach, "coach-a", academyId, { ...specialty, status: "LEFT" }), /terminal/i);
  assert.throws(() => validateFitnessCoachTransition("INACTIVE", coach, "coach-a", academyId, null), /existing/i);
});
