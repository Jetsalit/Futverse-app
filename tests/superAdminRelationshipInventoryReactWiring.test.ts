import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(
    path.join(repoRoot, relativePath),
    "utf8",
  );
}

const portalSource = readSource(
  "src/components/SuperadminPortal.tsx",
);

const relationshipsSource = readSource(
  "src/components/superadmin/SuperAdminUsersRelationships.tsx",
);

const parentLinkSource = readSource(
  "src/components/superadmin/SuperAdminParentLinkLauncher.tsx",
);

function assertSuccessfulMutationInvalidates(
  writeMarker: string,
): void {
  const writeIndex = portalSource.indexOf(writeMarker);

  assert.notEqual(
    writeIndex,
    -1,
    `expected mutation write missing: ${writeMarker}`,
  );

  const afterWrite = portalSource.slice(writeIndex);

  const invalidationIndex =
    afterWrite.indexOf(
      "void invalidateRelationshipInventory();",
    );

  const catchIndex =
    afterWrite.indexOf("} catch (error)");

  assert.ok(
    invalidationIndex > 0,
    `${writeMarker} must invalidate relationship authority after success`,
  );

  assert.ok(
    catchIndex > invalidationIndex,
    `${writeMarker} invalidation must remain inside the success path before catch`,
  );
}

describe("SuperAdmin shared relationship inventory React wiring", () => {
  it("1. Portal owns the shared authoritative runtime but does not read until owner activation", () => {
    assert.match(
      portalSource,
      /createSuperAdminRelationshipInventoryOwner/,
    );

    assert.match(
      portalSource,
      /loadSuperAdminRelationshipInventory/,
    );

    assert.match(
      portalSource,
      /firestoreSuperAdminRelationshipReadOps/,
    );

    assert.match(
      portalSource,
      /relationshipInventoryState/,
    );

    assert.match(
      portalSource,
      /createSuperAdminRelationshipInventoryLifecycleState/,
    );
  });

  it("2. Portal owner lifetime is scoped to the authenticated actor and cleanup disposes exactly that owner", () => {
    assert.match(
      portalSource,
      /useRef/,
    );

    assert.match(
      portalSource,
      /relationshipInventoryOwnerRef/,
    );

    assert.match(
      portalSource,
      /SuperAdminRelationshipInventoryOwner/,
    );

    assert.doesNotMatch(
      portalSource,
      /useState\([\s\S]{0,120}createSuperAdminRelationshipInventoryOwner/,
    );

    const createIndex =
      portalSource.indexOf(
        "const relationshipInventoryOwner =",
      );

    assert.notEqual(
      createIndex,
      -1,
      "owner must be created inside Portal lifecycle",
    );

    const effectStart =
      portalSource.lastIndexOf(
        "useEffect(() => {",
        createIndex,
      );

    const effectEnd =
      portalSource.indexOf(
        "}, [relationshipInventoryActorUid]);",
        createIndex,
      );

    const assignIndex =
      portalSource.indexOf(
        "relationshipInventoryOwnerRef.current = relationshipInventoryOwner;",
        createIndex,
      );

    const disposeIndex =
      portalSource.indexOf(
        "relationshipInventoryOwner.dispose();",
        createIndex,
      );

    const clearIndex =
      portalSource.indexOf(
        "relationshipInventoryOwnerRef.current = null;",
        createIndex,
      );

    assert.ok(
      effectStart >= 0 &&
        effectStart < createIndex &&
        effectEnd > createIndex,
      "owner creation must be enclosed by an authenticated-actor-scoped effect",
    );

    assert.ok(
      assignIndex > createIndex &&
        assignIndex < effectEnd,
      "created owner must become the active Portal ref",
    );

    assert.ok(
      disposeIndex > assignIndex &&
        disposeIndex < effectEnd,
      "mount cleanup must dispose exactly that owner",
    );

    assert.ok(
      clearIndex > disposeIndex &&
        clearIndex < effectEnd,
      "cleanup must clear the ref so effect replay can create a fresh owner",
    );
  });

  it("3. activeTab or authenticated actor changes activate the current live owner without render-time recreation", () => {
    assert.match(
      portalSource,
      /const relationshipInventoryOwner =\s*relationshipInventoryOwnerRef\.current;/,
    );

    assert.match(
      portalSource,
      /await relationshipInventoryOwner\.activate\(activeTab\);/,
    );

    assert.match(
      portalSource,
      /\[activeTab, relationshipInventoryActorUid\]/,
    );
  });

  it("4. Relationships becomes a controlled consumer with no direct authoritative Firestore loader", () => {
    assert.doesNotMatch(
      relationshipsSource,
      /loadSuperAdminRelationshipInventory/,
    );

    assert.doesNotMatch(
      relationshipsSource,
      /firestoreSuperAdminRelationshipReadOps/,
    );

    assert.doesNotMatch(
      relationshipsSource,
      /requestIdRef/,
    );

    assert.doesNotMatch(
      relationshipsSource,
      /const loadInventory/,
    );

    assert.match(
      relationshipsSource,
      /interface SuperAdminUsersRelationshipsProps/,
    );

    assert.match(
      relationshipsSource,
      /inventoryState: SuperAdminRelationshipInventoryLifecycleState/,
    );

    assert.match(
      relationshipsSource,
      /onRefresh/,
    );

    assert.match(
      relationshipsSource,
      /onInventoryInvalidated/,
    );
  });

  it("5. Relationships maps every non-READY authority state fail-closed", () => {
    assert.match(
      relationshipsSource,
      /inventoryState\.status === "READY"/,
    );

    assert.match(
      relationshipsSource,
      /inventoryState\.status === "UNAVAILABLE"/,
    );

    assert.match(
      relationshipsSource,
      /inventoryState\.inventory/,
    );

    assert.match(
      relationshipsSource,
      /inventoryState\.errorMessage/,
    );

    assert.match(
      relationshipsSource,
      /\? "ready"/,
    );

    assert.match(
      relationshipsSource,
      /: "loading"/,
    );
  });

  it("6. manual authoritative refresh delegates through the current Portal owner ref", () => {
    assert.match(
      portalSource,
      /refreshRelationshipInventory/,
    );

    assert.match(
      portalSource,
      /relationshipInventoryOwnerRef\.current\?\.refresh\(\)/,
    );

    assert.match(
      portalSource,
      /onRefresh=\{refreshRelationshipInventory\}/,
    );

    assert.match(
      relationshipsSource,
      /onClick=\{\(\) => void onRefresh\(\)\}/,
    );
  });

  it("7. approve reject role and status mutations invalidate only after their successful atomic writes", () => {
    assert.match(
      portalSource,
      /const invalidateRelationshipInventory/,
    );

    assert.match(
      portalSource,
      /relationshipInventoryOwnerRef\.current\?\.invalidate\(\)/,
    );

    assertSuccessfulMutationInvalidates(
      "await approveUserAtomically",
    );

    assertSuccessfulMutationInvalidates(
      "await rejectUserAtomically",
    );

    assertSuccessfulMutationInvalidates(
      "await updateUserRoleAtomically",
    );

    assertSuccessfulMutationInvalidates(
      "await updateUserStatusAtomically",
    );

    const invalidations =
      portalSource.match(
        /void invalidateRelationshipInventory\(\);/g,
      ) ?? [];

    assert.equal(
      invalidations.length,
      4,
      "only the four proven account mutation success paths should directly invalidate here",
    );
  });

  it("8. Parent Link exposes a success-only callback through Relationships without changing its canonical write engine", () => {
    assert.match(
      parentLinkSource,
      /interface SuperAdminParentLinkLauncherProps/,
    );

    assert.match(
      parentLinkSource,
      /onLinked\?: \(\) => void/,
    );

    assert.match(
      parentLinkSource,
      /export function SuperAdminParentLinkLauncher\(\{\s*onLinked,\s*\}: SuperAdminParentLinkLauncherProps\)/,
    );

    assert.match(
      relationshipsSource,
      /onLinked=\{onInventoryInvalidated\}/,
    );

    assert.match(
      portalSource,
      /onInventoryInvalidated=\{invalidateRelationshipInventory\}/,
    );
  });

  it("9. Parent Link callback is isolated after successful canonical commit and cannot enter the link failure catch", () => {
    const transactionIndex =
      parentLinkSource.indexOf("await runTransaction");

    const noticeIndex =
      parentLinkSource.indexOf(
        "setNotice(`Linked",
        transactionIndex,
      );

    const callbackIndex =
      parentLinkSource.indexOf(
        "onLinked?.()",
        noticeIndex,
      );

    const callbackTryIndex =
      parentLinkSource.lastIndexOf(
        "try {",
        callbackIndex,
      );

    const callbackCatchIndex =
      parentLinkSource.indexOf(
        "} catch (callbackError)",
        callbackIndex,
      );

    const linkCatchIndex =
      parentLinkSource.indexOf(
        "} catch (linkError)",
        callbackCatchIndex,
      );

    assert.ok(
      transactionIndex >= 0,
      "canonical transaction must remain present",
    );

    assert.ok(
      noticeIndex > transactionIndex,
      "success notice must still occur only after canonical transaction completion",
    );

    assert.ok(
      callbackTryIndex > noticeIndex,
      "callback must have its own nested isolation try after successful linking",
    );

    assert.ok(
      callbackIndex > callbackTryIndex,
      "callback invocation must be inside its nested isolation try",
    );

    assert.ok(
      callbackCatchIndex > callbackIndex,
      "callback must have its own callbackError catch",
    );

    assert.ok(
      linkCatchIndex > callbackCatchIndex,
      "linkError catch must remain outside callback isolation",
    );

    const callbackFailureBlock =
      parentLinkSource.slice(
        callbackCatchIndex,
        linkCatchIndex,
      );

    assert.doesNotMatch(
      callbackFailureBlock,
      /setError\(/,
      "callback failure must not present the completed canonical link as failed",
    );

    assert.doesNotMatch(
      callbackFailureBlock,
      /\bthrow\b/,
      "callback failure must not be rethrown into linkError handling",
    );
  });

  it("10. canonical Parent association schema and audit contract remain unchanged", () => {
    assert.match(
      parentLinkSource,
      /transaction\.set\(associationRef,\s*\{\s*userId: parentUid,\s*academyId,\s*playerId,\s*role: "PARENT",\s*status: "ACTIVE",\s*\}\);/,
    );

    assert.match(
      parentLinkSource,
      /action: "SUPERADMIN_PARENT_PLAYER_LINKED"/,
    );

    assert.match(
      parentLinkSource,
      /targetUid: parentUid/,
    );

    assert.match(
      parentLinkSource,
      /mode: "ASSISTED_SUPPORT"/,
    );

    assert.match(
      parentLinkSource,
      /NONSTAFF_ASSOCIATION_COLLECTION/,
    );
  });
  it("11. actor changes fail closed old READY state and every published snapshot is tagged to its actor", () => {
    assert.match(
      portalSource,
      /const relationshipInventoryActorUid =\s*isExactActiveSuperAdmin\(actualUser\)\s*\?\s*actualUser\?\.uid \|\| actualUser\?\.id \|\| null\s*:\s*null;/,
    );

    assert.match(
      portalSource,
      /relationshipInventoryScopedState/,
    );

    assert.match(
      portalSource,
      /actorUid: relationshipInventoryActorUid/,
    );

    assert.match(
      portalSource,
      /relationshipInventoryScopedState\.actorUid === relationshipInventoryActorUid/,
    );

    assert.match(
      portalSource,
      /relationshipInventoryScopedState\.inventoryState/,
    );

    assert.match(
      portalSource,
      /setRelationshipInventoryScopedState\(\{\s*actorUid: relationshipInventoryActorUid,\s*inventoryState,/,
    );
  });

  it("12. an unauthenticated actor cannot create or activate an authoritative relationship owner", () => {
    const actorGuardIndex =
      portalSource.indexOf(
        "if (!relationshipInventoryActorUid)",
      );

    const ownerCreateIndex =
      portalSource.indexOf(
        "const relationshipInventoryOwner =",
      );

    assert.ok(
      actorGuardIndex >= 0,
      "authenticated actor guard must exist",
    );

    assert.ok(
      ownerCreateIndex > actorGuardIndex,
      "owner creation must occur only after the authenticated actor guard",
    );

    assert.match(
      portalSource,
      /relationshipInventoryOwnerActorUidRef/,
    );
  });

  it("13. invalidation helper isolates sync and async failures after completed writes", () => {
    const helperIndex =
      portalSource.indexOf(
        "const invalidateRelationshipInventory = async () => {",
      );

    assert.notEqual(
      helperIndex,
      -1,
      "async invalidation isolation helper must exist",
    );

    const helperBlock =
      portalSource.slice(
        helperIndex,
        helperIndex + 1800,
      );

    assert.match(
      helperBlock,
      /relationshipInventoryOwnerActorUidRef\.current !== relationshipInventoryActorUid/,
    );

    assert.match(
      helperBlock,
      /try\s*\{/,
    );

    assert.match(
      helperBlock,
      /await relationshipInventoryOwnerRef\.current\?\.invalidate\(\)/,
    );

    assert.match(
      helperBlock,
      /catch \(error\)/,
    );

    assert.match(
      helperBlock,
      /console\.error/,
    );
  });

  it("14. manual refresh isolates rejection and never operates through a stale actor owner", () => {
    const helperIndex =
      portalSource.indexOf(
        "const refreshRelationshipInventory = async () => {",
      );

    assert.notEqual(
      helperIndex,
      -1,
      "async refresh isolation helper must exist",
    );

    const helperBlock =
      portalSource.slice(
        helperIndex,
        helperIndex + 1800,
      );

    assert.match(
      helperBlock,
      /relationshipInventoryOwnerActorUidRef\.current !== relationshipInventoryActorUid/,
    );

    assert.match(
      helperBlock,
      /try\s*\{/,
    );

    assert.match(
      helperBlock,
      /await relationshipInventoryOwnerRef\.current\?\.refresh\(\)/,
    );

    assert.match(
      helperBlock,
      /catch \(error\)/,
    );

    assert.match(
      helperBlock,
      /console\.error/,
    );
  });

  it("15. activation refuses a stale owner from a previous authenticated actor", () => {
    const activationIndex =
      portalSource.indexOf(
        "relationshipInventoryOwner.activate(activeTab)",
      );

    assert.notEqual(
      activationIndex,
      -1,
      "owner activation must remain present",
    );

    const effectStart =
      portalSource.lastIndexOf(
        "useEffect(() => {",
        activationIndex,
      );

    assert.ok(
      effectStart >= 0,
      "activation must remain effect-owned",
    );

    const activationBlock =
      portalSource.slice(
        effectStart,
        activationIndex + 200,
      );

    assert.match(
      activationBlock,
      /relationshipInventoryOwnerActorUidRef\.current !== relationshipInventoryActorUid/,
    );

    assert.match(
      activationBlock,
      /if \(!relationshipInventoryActorUid/,
    );
  });
});
