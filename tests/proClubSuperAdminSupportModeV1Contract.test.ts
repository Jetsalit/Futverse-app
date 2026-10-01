import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contractPath =
  "docs/PRO_CLUB_SUPERADMIN_SUPPORT_MODE_V1_CONTRACT_FREEZE.md";
const contract = read(contractPath);
const normalized = contract.replace(/\s+/g, " ");

const authContext = read("src/contexts/AuthContext.tsx");
const runtimeContext = read("src/contexts/OrganizationRuntimeContext.tsx");
const proClubPortal = read("src/components/pro-club/ProClubPortal.tsx");
const technicalGovernance = read("src/lib/proClubTechnicalGovernance.ts");
const accountRolePolicy = read("src/lib/accountRolePolicy.ts");

test("contract pins exact baseline and merge dependency", () => {
  assert.match(
    contract,
    /Accepted baseline SHA: `a983681bc89e93eb8759f583158d314ed772fb7d`/,
  );
  assert.match(
    contract,
    /`MERGE_GATE=BLOCKED_BY_HEAD_COACH_PHASE_5E_2`/,
  );
  assert.match(contract, /`MERGE_AUTHORIZATION=NOT_GRANTED`/);
});

test("contract freezes docs/tests-only scope", () => {
  assert.match(contract, /`SCOPE=DOCS_TESTS_ONLY`/);
  assert.match(
    normalized,
    /Exactly two new files are authorized for this slice:/,
  );
  assert.match(
    contract,
    /docs\/PRO_CLUB_SUPERADMIN_SUPPORT_MODE_V1_CONTRACT_FREEZE\.md/,
  );
  assert.match(
    contract,
    /tests\/proClubSuperAdminSupportModeV1Contract\.test\.ts/,
  );
  assert.match(contract, /- `src\/\*\*`/);
  assert.match(contract, /- `functions\/\*\*`/);
  assert.match(contract, /- `firestore\.rules`/);
  assert.match(contract, /- `firebase\.spark\.json`/);
});

test("support mode is not impersonation or supportPresentation authority", () => {
  assert.match(contract, /`CURRENT_USER_IMPERSONATION=FORBIDDEN`/);
  assert.match(contract, /`FIREBASE_AUTH_IDENTITY_SWAP=FORBIDDEN`/);
  assert.match(
    contract,
    /`SUPPORT_PRESENTATION_AS_PRO_CLUB_AUTHORITY=FORBIDDEN`/,
  );
  assert.match(contract, /must not reuse `setSupportPresentedUser`/);

  assert.match(authContext, /supportPresentation\?: boolean/);
  assert.match(
    authContext,
    /Client-only marker\. Never persisted and never grants Firestore authority\./,
  );
  assert.match(authContext, /setSupportPresentedUser/);
});

test("current Pro Club portal rejects support presentation and preserves actual user identity", () => {
  assert.match(proClubPortal, /const uid = actualUser\?\.uid/);
  assert.match(
    proClubPortal,
    /currentUser\?\.uid === uid && !currentUser\.supportPresentation/,
  );
  assert.match(
    contract,
    /`src\/components\/pro-club\/ProClubPortal\.tsx` uses `actualUser` as the real UID/,
  );
});

test("organization runtime remains owned by actual authenticated user", () => {
  assert.match(runtimeContext, /const \{ actualUser \} = useAuth\(\)/);
  assert.match(runtimeContext, /const actorUid = actualUser\?\.uid \?\? null/);
  assert.match(
    contract,
    /`src\/contexts\/OrganizationRuntimeContext\.tsx` binds organization runtime ownership to `actualUser\?\.uid`/,
  );
});

test("platform SuperAdmin authority does not become tenant or football authority", () => {
  assert.match(contract, /`TENANT_MEMBERSHIP_AUTHORITY=NOT_GRANTED`/);
  assert.match(contract, /`FOOTBALL_STAFF_AUTHORITY=NOT_GRANTED`/);
  assert.match(contract, /`OWNER_AUTHORITY=NOT_GRANTED`/);
  assert.match(contract, /`ADMIN_AUTHORITY=NOT_GRANTED`/);
  assert.match(contract, /`HEAD_COACH_TECHNICAL_AUTHORITY=NOT_GRANTED`/);
  assert.match(contract, /`TECHNICAL_DIRECTOR_AUTHORITY=NOT_GRANTED`/);

  assert.match(
    accountRolePolicy,
    /PRIVILEGED_ACCOUNT_ROLES = \["SUPERADMIN", "DATA_ADMIN"\]/,
  );
  assert.match(
    accountRolePolicy,
    /TENANT_MEMBERSHIP_ROLES = \["ADMIN", "COACH"\]/,
  );
});

test("support actor cannot become Technical Authority Resolver candidate", () => {
  assert.match(
    technicalGovernance,
    /candidate\.staffRole === "TECHNICAL_DIRECTOR"/,
  );
  assert.match(
    technicalGovernance,
    /config\.authorityMode === "HEAD_COACH"/,
  );
  assert.match(
    technicalGovernance,
    /resolveSingleRole\(\s*"HEAD_COACH"/,
  );
  assert.match(
    contract,
    /A support actor must never become a candidate for `resolveProClubTechnicalAuthority`/,
  );
});

test("V1 is read-only and forbids work-on-behalf mutations", () => {
  assert.match(contract, /`DOMAIN_MUTATION_AUTHORITY=NONE`/);
  assert.match(contract, /`WORK_ON_BEHALF_TECHNICAL_ACTIONS=FORBIDDEN`/);
  for (const forbidden of [
    "create",
    "edit",
    "submit",
    "review",
    "approve",
    "publish",
    "archive",
    "delete",
    "rename",
    "provision",
    "invite",
    "claim",
    "activate",
    "deactivate",
    "assign",
    "revoke",
    "reconcile",
  ]) {
    assert.match(normalized, new RegExp(`\\b${forbidden}\\b`, "i"));
  }
});

test("support targeting is exact and fail-closed without tenant discovery", () => {
  assert.match(contract, /`GENERIC_PRO_CLUB_DISCOVERY=FORBIDDEN`/);
  assert.match(contract, /`CROSS_TENANT_FALLBACK=FORBIDDEN`/);
  assert.match(contract, /`clubId` must be a canonical exact document identifier/);
  assert.match(
    contract,
    /Switching support targets must invalidate the previous target before resolving the next target/,
  );
});

test("future support audit is append-only authority-neutral trusted evidence", () => {
  assert.match(contract, /append-only trusted control-plane support-session audit/);
  assert.match(contract, /immutable actor UID/);
  assert.match(contract, /exact target club ID/);
  assert.match(
    contract,
    /support mode identifier `PRO_CLUB_SUPERADMIN_SUPPORT_V1`/,
  );
  assert.match(contract, /`AUDIT_AS_AUTHORITY=FORBIDDEN`/);
});

test("contract does not authorize runtime, deploy, production reads or writes", () => {
  assert.match(contract, /`RUNTIME_IMPLEMENTATION=NOT_AUTHORIZED`/);
  assert.match(contract, /`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(contract, /`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(
    normalized,
    /does not authorize new production reads by itself/,
  );
});