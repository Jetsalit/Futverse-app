import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiPath = new URL(
  "../src/lib/proClubProvisioningControlPlaneApi.ts",
  import.meta.url,
);
const componentPath = new URL(
  "../src/components/superadmin/ProClubProvisioningControlPlane.tsx",
  import.meta.url,
);
const navigationPath = new URL(
  "../src/components/superadmin/SuperAdminPortalNavigation.tsx",
  import.meta.url,
);
const appPath = new URL("../src/App.tsx", import.meta.url);
const functionsIndexPath = new URL("../functions/src/index.ts", import.meta.url);
const firebaseJsonPath = new URL("../firebase.json", import.meta.url);

const FORBIDDEN_CLIENT_WRITE_TOKENS = [
  "setDoc(",
  "addDoc(",
  "updateDoc(",
  "deleteDoc(",
  "writeBatch(",
  "runTransaction(",
  "collection(db, \"proClubs\"",
  "doc(db, \"proClubs\"",
  "proClubProvisioningAudits",
] as const;

test("control-plane client uses Firebase session token and same-origin HTTP only", async () => {
  const source = await readFile(apiPath, "utf8");

  assert.match(source, /auth\.currentUser/);
  assert.match(source, /getIdToken\(\)/);
  assert.match(source, /Authorization: `Bearer \$\{idToken\}`/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /fetch\(path,/);
  assert.doesNotMatch(source, /cloudfunctions\.net/);
  assert.doesNotMatch(source, /firebase\/firestore/);

  for (const token of FORBIDDEN_CLIENT_WRITE_TOKENS) {
    assert.equal(source.includes(token), false, `forbidden client token: ${token}`);
  }
});

test("control-plane UI contains no direct Firestore mutation surface", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.doesNotMatch(source, /firebase\/firestore/);
  assert.match(source, /provisionProClubFromControlPlane/);
  assert.match(source, /verifyProClubProvisioningAuditFromControlPlane/);
  assert.match(source, /never writes Pro Club/i);

  for (const token of FORBIDDEN_CLIENT_WRITE_TOKENS) {
    assert.equal(source.includes(token), false, `forbidden UI token: ${token}`);
  }
});

test("SuperAdmin Organizations owns the privileged launch surface", async () => {
  const source = await readFile(navigationPath, "utf8");

  assert.match(source, /activeSection\.id === "organizations"/);
  assert.match(source, /Pro Club Control Plane/);
  assert.match(source, /ProClubProvisioningControlPlane/);
});

test("app shell preserves actual ACTIVE SUPERADMIN gate before SuperAdmin portal", async () => {
  const source = await readFile(appPath, "utf8");

  assert.match(source, /isActivePrivilegedActor\(actualUser, \["SUPERADMIN"\]\)/);
  assert.match(source, /currentPage === "superadmin"/);
  assert.match(source, /requiredPrivilegedRole/);
});

test("Hosting rewrites route exact control-plane paths before SPA fallback", async () => {
  const raw = await readFile(firebaseJsonPath, "utf8");
  const config = JSON.parse(raw) as {
    hosting?: {
      rewrites?: Array<Record<string, unknown>>;
    };
  };

  const rewrites = config.hosting?.rewrites ?? [];
  assert.equal(rewrites.length >= 3, true);

  assert.deepEqual(rewrites[0], {
    source: "/api/pro-club/provision-v1",
    function: {
      functionId: "provisionProClubV1",
      region: "asia-southeast1",
    },
  });

  assert.deepEqual(rewrites[1], {
    source: "/api/pro-club/verify-audit-v1",
    function: {
      functionId: "verifyProClubProvisioningAuditV1",
      region: "asia-southeast1",
    },
  });

  assert.deepEqual(rewrites[rewrites.length - 1], {
    source: "**",
    destination: "/index.html",
  });
});

test("trusted Functions remain exact POST endpoints with CORS disabled", async () => {
  const source = await readFile(functionsIndexPath, "utf8");

  assert.match(source, /export const provisionProClubV1 = onRequest/);
  assert.match(source, /export const verifyProClubProvisioningAuditV1 = onRequest/);

  const provisioningStart = source.indexOf("export const provisionProClubV1 = onRequest");
  const verificationStart = source.indexOf("export const verifyProClubProvisioningAuditV1 = onRequest");
  assert.notEqual(provisioningStart, -1);
  assert.notEqual(verificationStart, -1);

  const provisioningSlice = source.slice(provisioningStart, verificationStart);
  const verificationSlice = source.slice(verificationStart, verificationStart + 900);
  assert.match(provisioningSlice, /cors: false/);
  assert.match(verificationSlice, /cors: false/);
});
