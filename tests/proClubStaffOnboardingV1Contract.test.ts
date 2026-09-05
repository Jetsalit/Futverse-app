import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contract = read(
  "docs/PRO_CLUB_STAFF_ONBOARDING_V1_CONTRACT_FREEZE.md",
);
const normalizedContract = contract.replace(/\s+/g, " ");
const loginSource = read("src/components/Login.tsx");
const registrationSource = read("src/lib/firestore/registration.ts");
const accountRolePolicy = read("src/lib/accountRolePolicy.ts");
const appSource = read("src/App.tsx");
const authSource = read("src/contexts/AuthContext.tsx");
const academyAccessModel = read("src/contexts/academyAccessModel.ts");
const joinAcademySource = read("src/components/JoinAcademy.tsx");
const membershipTypes = read("src/types/Membership.ts");
const proClubTypes = read("src/types/ProClub.ts");
const proClubAdapter = read(
  "src/lib/firestore/proClubOrganizationAdapter.ts",
);
const runtimeContext = read(
  "src/contexts/OrganizationRuntimeContext.tsx",
);
const firestoreRules = read("firestore.rules");

function proClubRulesBlock(): string {
  const start = firestoreRules.indexOf("match /proClubs/{clubId}");
  const end = firestoreRules.indexOf("match /proPlayers/{proPlayerId}", start);
  assert.ok(start >= 0, "Pro Club Rules block is missing");
  assert.ok(end > start, "Pro Club Rules block boundary is missing");
  return firestoreRules.slice(start, end);
}

function stripRulesComments(source: string): string {
  let result = "";
  let i = 0;
  const len = source.length;

  while (i < len) {
    const char = source[i];

    // Preserve quoted strings (both single and double quotes)
    if (char === '"' || char === "'") {
      const quote = char;
      result += quote;
      i++;
      while (i < len) {
        const c = source[i];
        result += c;
        if (c === "\\") {
          i++;
          if (i < len) {
            result += source[i];
          }
        } else if (c === quote) {
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    // Line comments: // ... to end of line
    if (char === "/" && i + 1 < len && source[i + 1] === "/") {
      i += 2;
      while (i < len && source[i] !== "\n" && source[i] !== "\r") {
        i++;
      }
      // Preserve newline to keep statement separation intact
      if (i < len) {
        if (source[i] === "\r" && i + 1 < len && source[i + 1] === "\n") {
          result += "\r\n";
          i += 2;
        } else {
          result += source[i];
          i++;
        }
      }
      continue;
    }

    // Block comments: /* ... */
    if (char === "/" && i + 1 < len && source[i + 1] === "*") {
      i += 2;
      let closed = false;
      while (i + 1 < len) {
        if (source[i] === "*" && source[i + 1] === "/") {
          i += 2;
          closed = true;
          break;
        }
        if (source[i] === "\n") {
          result += "\n";
        }
        i++;
      }
      if (!closed) {
        throw new Error("Unterminated block comment in Rules source");
      }
      result += " ";
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

function extractMatchBlock(source: string, header: string): string {
  const index = source.indexOf(header);
  assert.ok(index >= 0, `Match header not found: ${header}`);
  const openBrace = source.indexOf("{", index + header.length);
  assert.ok(openBrace >= index + header.length, `Opening brace not found for ${header}`);
  let depth = 1;
  let pos = openBrace + 1;
  while (pos < source.length && depth > 0) {
    const c = source[pos];
    if (c === '"' || c === "'") {
      const quote = c;
      pos++;
      while (pos < source.length) {
        if (source[pos] === "\\") {
          pos += 2;
          continue;
        }
        if (source[pos] === quote) {
          pos++;
          break;
        }
        pos++;
      }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    pos++;
  }
  assert.equal(depth, 0, `Unterminated match block for ${header}`);
  return source.slice(openBrace + 1, pos - 1);
}

interface ParsedAllowStatement {
  operations: string[];
  canonicalOperations: string;
  condition: string;
}

function parseAllowStatements(blockText: string): ParsedAllowStatement[] {
  const sanitized = stripRulesComments(blockText);
  const matches = [...sanitized.matchAll(/allow\s+([^:]+):\s*if\s+([^;]+);/g)];
  return matches.map((match) => {
    const rawOps = match[1].split(",").map((op) => op.trim());
    const sortedOps = [...rawOps].sort().join(",");
    return {
      operations: rawOps,
      canonicalOperations: sortedOps,
      condition: match[2].trim(),
    };
  });
}

function assertExactLocalAllowOperations(
  blockText: string,
  expectedOperationSets: (string[] | string)[],
  contextName: string,
): ParsedAllowStatement[] {
  const statements = parseAllowStatements(blockText);
  const actualCanonical = statements.map((s) => s.canonicalOperations);
  const expectedCanonical = expectedOperationSets.map((ops) => {
    const list = Array.isArray(ops) ? ops : ops.split(",").map((s) => s.trim());
    return [...list].sort().join(",");
  });

  assert.equal(
    statements.length,
    expectedCanonical.length,
    `Unexpected allow statement count in ${contextName}: expected ${expectedCanonical.length}, found ${statements.length} (${actualCanonical.join(" | ")})`,
  );

  const remainingExpected = [...expectedCanonical];
  for (const actual of actualCanonical) {
    const idx = remainingExpected.indexOf(actual);
    assert.ok(
      idx >= 0,
      `Unexpected allow operations [${actual}] in ${contextName}. Expected only: ${expectedCanonical.join(" | ")}`,
    );
    remainingExpected.splice(idx, 1);
  }

  assert.equal(
    remainingExpected.length,
    0,
    `Missing expected allow statements in ${contextName}: ${remainingExpected.join(" | ")}`,
  );

  return statements;
}

interface DirectChildMatch {
  header: string;
  path: string;
  body: string;
}

interface DirectBlockStructure {
  directRootText: string;
  directChildren: DirectChildMatch[];
}

const EXPECTED_PRO_CLUB_DIRECT_CHILD_MATCHES = [
  "match /members/{uid}",
  "match /staff/{uid}",
  "match /onboardingClaims/{claimId}",
  "match /onboardingApprovals/{uid}",
  "match /{document=**}",
];

function extractDirectBlockStructure(blockText: string): DirectBlockStructure {
  const sanitized = stripRulesComments(blockText);
  const directChildren: DirectChildMatch[] = [];
  let directRootText = "";
  let pos = 0;
  const len = sanitized.length;
  const matchRegex = /^match\s+((?:[^{:;\s]|\{[^\s:;(){}]+\})+)\s*\{/;

  while (pos < len) {
    // Consume leading whitespace at root level
    if (/\s/.test(sanitized[pos])) {
      directRootText += sanitized[pos];
      pos++;
      continue;
    }

    const remaining = sanitized.slice(pos);

    if (/^match\b/.test(remaining)) {
      const matchResult = remaining.match(matchRegex);
      if (!matchResult) {
        throw new Error(
          `Malformed match declaration at position ${pos}: ${remaining.slice(0, 40)}`,
        );
      }

      const fullMatch = matchResult[0];
      const path = matchResult[1].trim();
      const header = `match ${path}`;
      const openBracePos = pos + fullMatch.length - 1;

      let childDepth = 1;
      let childPos = openBracePos + 1;

      while (childPos < len && childDepth > 0) {
        const c = sanitized[childPos];

        // Handle strings safely inside child blocks
        if (c === '"' || c === "'") {
          const quote = c;
          childPos++;
          while (childPos < len) {
            const innerC = sanitized[childPos];
            if (innerC === "\\") {
              childPos += 2;
              continue;
            }
            if (innerC === quote) {
              childPos++;
              break;
            }
            childPos++;
          }
          continue;
        }

        if (c === "{") {
          childDepth++;
        } else if (c === "}") {
          childDepth--;
        }
        childPos++;
      }

      assert.equal(
        childDepth,
        0,
        `Malformed or unterminated child match block for ${header}`,
      );

      directChildren.push({
        header,
        path,
        body: sanitized.slice(openBracePos + 1, childPos - 1),
      });

      pos = childPos;
      continue;
    }

    const char = sanitized[pos];

    // Handle strings safely in root text
    if (char === '"' || char === "'") {
      const quote = char;
      directRootText += quote;
      pos++;
      while (pos < len) {
        const c = sanitized[pos];
        directRootText += c;
        if (c === "\\") {
          pos++;
          if (pos < len) {
            directRootText += sanitized[pos];
          }
        } else if (c === quote) {
          break;
        }
        pos++;
      }
      pos++;
      continue;
    }

    if (char === "{") {
      throw new Error(
        `Unexpected unassociated opening brace '{' at position ${pos}`,
      );
    }
    if (char === "}") {
      throw new Error(
        `Unexpected unassociated closing brace '}' at position ${pos}`,
      );
    }

    directRootText += char;
    pos++;
  }

  return { directRootText, directChildren };
}

function enumerateDirectChildMatches(blockText: string): DirectChildMatch[] {
  return extractDirectBlockStructure(blockText).directChildren;
}

function assertExactDirectChildMatches(
  blockText: string,
  expectedHeaders: string[],
  contextName: string,
): DirectChildMatch[] {
  const structure = extractDirectBlockStructure(blockText);
  const children = structure.directChildren;
  const actualHeaders = children.map((c) => c.header);

  // Check duplicates
  const seen = new Set<string>();
  for (const header of actualHeaders) {
    assert.ok(
      !seen.has(header),
      `Duplicate child match block [${header}] found in ${contextName}`,
    );
    seen.add(header);
  }

  // Check unexpected siblings
  const remainingExpected = [...expectedHeaders];
  for (const actual of actualHeaders) {
    const idx = remainingExpected.indexOf(actual);
    assert.ok(
      idx >= 0,
      `Unexpected child match block [${actual}] in ${contextName}. Expected only: [${expectedHeaders.join(", ")}]`,
    );
    remainingExpected.splice(idx, 1);
  }

  // Check missing expected children
  assert.equal(
    remainingExpected.length,
    0,
    `Missing expected child match blocks in ${contextName}: [${remainingExpected.join(", ")}]`,
  );

  return children;
}


test("Pro Club Staff Onboarding V1 Contract Freeze", async (t) => {
  await t.test("freezes exact baseline branch scope and source boundaries", () => {
    assert.ok(contract.includes("9ca605de968914c1bac3edc9ced53cebd607c2fb"));
    assert.ok(contract.includes("feat/pro-club-staff-onboarding-v1-contract"));
    assert.ok(contract.includes("https://github.com/Jetsalit/Futverse-app.git"));

    for (const path of [
      "src/App.tsx",
      "src/contexts/AuthContext.tsx",
      "src/contexts/academyAccessModel.ts",
      "src/components/JoinAcademy.tsx",
      "src/lib/accountRolePolicy.ts",
      "src/types/Membership.ts",
      "src/types/ProClub.ts",
      "src/lib/firestore/proClubOrganizationAdapter.ts",
      "firestore.rules",
    ]) {
      assert.ok(contract.includes(`\`${path}\``), `missing frozen path: ${path}`);
    }

    assert.ok(contract.includes("may add exactly"));
    assert.ok(contract.includes("must not modify production source"));
  });

  await t.test("freezes all four architecture invariants", () => {
    for (const invariant of [
      "`REGISTRATION INTENT != ACCOUNT AUTHORITY`",
      "`ACCOUNT ROLE != TENANT AUTHORITY`",
      "`MEMBERSHIP AUTHORITY != FOOTBALL STAFF ROLE`",
      "`SELECTION != AUTHORITY`",
    ]) {
      assert.ok(contract.includes(invariant), `missing invariant: ${invariant}`);
    }
  });

  await t.test("proves COACH is registration Membership intent only", () => {
    assert.match(
      accountRolePolicy,
      /\{ value: "COACH", label: "Coach", authority: "MEMBERSHIP" \}/,
    );
    assert.match(loginSource, /REGISTRATION_INTENT_OPTIONS\.map/);
    assert.match(loginSource, /newData\.requestedRole = requestedRole/);
    assert.match(loginSource, /\brequestedRole,\s*country:/s);
    assert.ok(contract.includes("Selecting `COACH` during registration does not grant tenant authority"));
  });

  await t.test("proves non-player registration starts generic and inactive", () => {
    const defaultLifecycle =
      /let assignedRole = "USER";\s*let status = "Inactive";\s*if \(requestedRole === "PLAYER"\) \{\s*assignedRole = "PLAYER";\s*status = "Active";/s;
    assert.match(loginSource, defaultLifecycle);
    assert.ok(contract.includes("Non-`PLAYER` registration starts as a generic `USER`"));
    assert.ok(normalizedContract.includes("pending/inactive account state"));
  });

  await t.test("proves public registration creates no tenant relationship", () => {
    assert.match(
      registrationSource,
      /batch\.set\(doc\(db, "users", user\.uid\), canonicalUserData\)/,
    );
    assert.match(
      registrationSource,
      /batch\.set\(doc\(db, "logs", registrationLogId\(user\.uid\)\)/,
    );
    assert.doesNotMatch(loginSource, /doc\(db,\s*"proClubs"|collection\(db,\s*"proClubs"/);
    assert.doesNotMatch(registrationSource, /"proClubs"|"academies"|"members"|"staff"/);
    assert.ok(contract.includes("must not create an Academy Membership"));
    assert.match(
      normalizedContract,
      /Public registration creates only the canonical user and its registration audit log\.[^]*must not create[^.]*a Pro Club/,
    );
  });

  await t.test("preserves Academy-specific onboarding", () => {
    assert.match(joinAcademySource, /doc\(db, "profile_claims", claimId\)/);
    assert.match(joinAcademySource, /doc\(db, "academy_invites", normalizedInviteCode\)/);
    assert.match(joinAcademySource, /type: "ACADEMY_JOIN"/);
    assert.match(joinAcademySource, /activateApprovedMembership/);
    assert.doesNotMatch(joinAcademySource, /proClubs|selectProClub/);
    assert.match(appSource, /return <JoinAcademy \/>/);
    assert.match(academyAccessModel, /resolveExactMembershipSnapshot/);
    assert.match(membershipTypes, /type: "ACADEMY_JOIN" \| "COACH_JOIN"/);
    assert.ok(contract.includes("Academy `profile_claims`"));
    assert.ok(contract.includes("Academy Match authority"));
  });

  await t.test("separates Pro Club Membership authority and football staff roles", () => {
    assert.match(
      proClubTypes,
      /export type ProClubAuthorizationRole = "OWNER" \| "ADMIN" \| "MEMBER"/,
    );
    assert.match(
      proClubTypes,
      /export interface ProClubMembership \{\s*authorizationRole: ProClubAuthorizationRole;\s*status: ProClubMembershipStatus;\s*\}/s,
    );
    assert.match(
      proClubTypes,
      /export interface ProClubStaffAssignment \{\s*staffRole: ProClubStaffRole;\s*status: ProClubStaffStatus;\s*\}/s,
    );
    for (const role of [
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "FITNESS_COACH",
      "ANALYST",
      "PHYSIO",
      "TEAM_MANAGER",
      "STAFF",
    ]) {
      assert.ok(proClubTypes.includes(`"${role}"`), `missing staff role: ${role}`);
    }
    assert.ok(contract.includes("`STAFF DOCUMENT ALONE != TENANT AUTHORITY`"));
    assert.ok(contract.includes("`staffRole != authorizationRole`"));
  });

  await t.test("keeps adapter Membership authority separate from staff presentation", () => {
    assert.match(proClubAdapter, /membershipAuthorizationRole: ProClubAuthorizationRole/);
    assert.match(proClubAdapter, /hasMembershipAuthority: boolean/);
    assert.match(proClubAdapter, /staffRole: ProClubStaffRole \| null/);
    assert.match(
      proClubAdapter,
      /membershipAuthorizationRole:\s*snapshot\.membership\.authorizationRole/s,
    );
    assert.match(
      proClubAdapter,
      /hasMembershipAuthority:\s*snapshot\.hasMembershipAuthority/s,
    );
    assert.match(proClubAdapter, /staffRole:\s*snapshot\.staffRole/s);
  });

  await t.test("proves exact own-document gets and closes every broad operation", () => {
    const rules = proClubRulesBlock();
    const proClubBlock = extractMatchBlock(rules, "match /proClubs/{clubId}");

    // Validate complete direct child match set under /proClubs/{clubId}
    const directChildren = assertExactDirectChildMatches(
      proClubBlock,
      EXPECTED_PRO_CLUB_DIRECT_CHILD_MATCHES,
      "/proClubs/{clubId}",
    );
    assert.equal(directChildren.length, 5);

    // Validate complete root-direct allow declarations (no pollution from children, no extra allows)
    const proClubStructure = extractDirectBlockStructure(proClubBlock);
    assertExactLocalAllowOperations(
      proClubStructure.directRootText,
      [["get"], ["list", "create", "update", "delete"]],
      "/proClubs/{clubId} direct root allow set",
    );

    // 1. /proClubs/{clubId} root boundary
    const rootDirectRules = rules.slice(0, rules.indexOf("match /members/{uid}"));
    assertExactLocalAllowOperations(
      rootDirectRules,
      [["get"], ["list", "create", "update", "delete"]],
      "/proClubs/{clubId} root direct segment",
    );
    assert.match(
      rootDirectRules,
      /allow\s+get:\s*if\s+isSignedIn\(\)\s*&&\s*exists\(\s*\/databases\/\$\(database\)\/documents\/proClubs\/\$\(clubId\)\/members\/\$\(request\.auth\.uid\)\s*\);/,
      "club get must require the authenticated actor's Membership document",
    );
    assert.match(
      rootDirectRules,
      /allow\s+list,\s*create,\s*update,\s*delete:\s*if\s+false;/,
      "proClubs root must fail-close list, create, update, delete",
    );

    // 2. /members/{uid} boundary
    const membersBlock = extractMatchBlock(rules, "match /members/{uid}");
    assertExactLocalAllowOperations(
      membersBlock,
      [["get"], ["list"], ["create"], ["update", "delete"]],
      "/members/{uid}",
    );
    assert.match(
      membersBlock,
      /allow\s+get:\s*if\s+isSignedIn\(\)\s*&&\s*request\.auth\.uid\s*==\s*uid;/,
      "member get must bind exact authenticated UID",
    );
    assert.match(
      membersBlock,
      /allow\s+list:\s*if\s+false;/,
      "members list must be false",
    );
    assert.match(
      membersBlock,
      /allow\s+create:\s*if\s+validProClubMembershipCreateV1\(clubId,\s*uid\);/,
      "members create must use validProClubMembershipCreateV1",
    );
    assert.match(
      membersBlock,
      /allow\s+update,\s*delete:\s*if\s+false;/,
      "members update/delete must be false",
    );

    // 3. /staff/{uid} boundary
    const staffBlock = extractMatchBlock(rules, "match /staff/{uid}");
    assertExactLocalAllowOperations(
      staffBlock,
      [["get"], ["list"], ["create"], ["update", "delete"]],
      "/staff/{uid}",
    );
    assert.match(
      staffBlock,
      /allow\s+get:\s*if\s+isSignedIn\(\)\s*&&\s*request\.auth\.uid\s*==\s*uid;/,
      "staff get must bind exact authenticated UID",
    );
    assert.match(
      staffBlock,
      /allow\s+list:\s*if\s+false;/,
      "staff list must be false",
    );
    assert.match(
      staffBlock,
      /allow\s+create:\s*if\s+validProClubStaffCreateV1\(clubId,\s*uid\);/,
      "staff create must use validProClubStaffCreateV1",
    );
    assert.match(
      staffBlock,
      /allow\s+update,\s*delete:\s*if\s+false;/,
      "staff update/delete must be false",
    );

    // 4. /onboardingClaims/{claimId} boundary
    const claimsBlock = extractMatchBlock(rules, "match /onboardingClaims/{claimId}");
    assertExactLocalAllowOperations(
      claimsBlock,
      [["get"], ["list"], ["create"], ["update"], ["delete"]],
      "/onboardingClaims/{claimId}",
    );
    assert.match(
      claimsBlock,
      /allow\s+get:\s*if\s+isSignedIn\(\)\s*&&\s*\(\s*resource\.data\.get\('userId',\s*''\)\s*==\s*request\.auth\.uid\s*\|\|\s*isActiveProClubReviewerV1\(clubId\)\s*\);/,
      "claims get must be restricted to own claimant or active reviewer",
    );
    assert.match(
      claimsBlock,
      /allow\s+list:\s*if\s+isActiveProClubReviewerV1\(clubId\)\s*&&\s*resource\.data\.clubId\s*==\s*clubId\s*&&\s*resource\.data\.status\s*==\s*'PENDING';/,
      "claims list must be reviewer-controlled and tenant/status constrained",
    );
    assert.match(
      claimsBlock,
      /allow\s+create:\s*if\s+validProClubClaimCreateV1\(clubId,\s*claimId\);/,
      "claims create must use validProClubClaimCreateV1",
    );
    assert.match(
      claimsBlock,
      /allow\s+update:\s*if\s+resource\s*!=\s*null\s*&&\s*\(\s*request\.resource\.data\.get\('status',\s*''\)\s*==\s*'APPROVED'\s*\?\s*validProClubClaimApprovalV1\(clubId,\s*claimId\)\s*:\s*\(\s*request\.resource\.data\.get\('status',\s*''\)\s*==\s*'REJECTED'\s*&&\s*validProClubClaimRejectionV1\(clubId,\s*claimId\)\s*\)\s*\);/,
      "claims update must bind resource != null to APPROVED and REJECTED validator branches",
    );
    assert.match(
      claimsBlock,
      /allow\s+delete:\s*if\s+false;/,
      "claims delete must be false",
    );

    // 5. /onboardingApprovals/{uid} boundary
    const approvalsBlock = extractMatchBlock(rules, "match /onboardingApprovals/{uid}");
    assertExactLocalAllowOperations(
      approvalsBlock,
      [["get"], ["list"], ["create"], ["update", "delete"]],
      "/onboardingApprovals/{uid}",
    );
    assert.match(
      approvalsBlock,
      /allow\s+get:\s*if\s+isSignedIn\(\)\s*&&\s*\(\s*request\.auth\.uid\s*==\s*uid\s*\|\|\s*isActiveProClubReviewerV1\(clubId\)\s*\);/,
      "approvals get must be restricted to own uid or active reviewer",
    );
    assert.match(
      approvalsBlock,
      /allow\s+list:\s*if\s+false;/,
      "approvals list must be false",
    );
    assert.match(
      approvalsBlock,
      /allow\s+create:\s*if\s+validProClubApprovalProofCreateV1\(clubId,\s*uid\);/,
      "approvals create must use validProClubApprovalProofCreateV1",
    );
    assert.match(
      approvalsBlock,
      /allow\s+update,\s*delete:\s*if\s+false;/,
      "approvals update/delete must be false",
    );

    // 6. Pro Club catch-all boundary
    const catchAllBlock = extractMatchBlock(rules, "match /{document=**}");
    assertExactLocalAllowOperations(
      catchAllBlock,
      [["read", "write"]],
      "Pro Club catch-all",
    );
    assert.match(
      catchAllBlock,
      /allow\s+read,\s*write:\s*if\s+false;/,
      "proClubs catch-all must fail-close read, write",
    );

    // 7. Regression proofs: local allow-set validator detects unexpected/permissive declarations (Firestore OR-semantics bypass)
    const poisonedSample = `
      allow get: if isSignedIn() && request.auth.uid == uid;
      allow list: if false;
      allow create: if validProClubStaffCreateV1(clubId, uid);
      allow update, delete: if false;
      allow write: if true;
    `;
    assert.throws(
      () =>
        assertExactLocalAllowOperations(
          poisonedSample,
          [["get"], ["list"], ["create"], ["update", "delete"]],
          "poisoned sample block",
        ),
      /Unexpected allow statement count in poisoned sample block/,
      "must detect and reject extra allow write declaration",
    );

    const mutatedSample = `
      allow get: if isSignedIn() && request.auth.uid == uid;
      allow write: if true;
    `;
    assert.throws(
      () =>
        assertExactLocalAllowOperations(
          mutatedSample,
          [["get"], ["list"]],
          "mutated sample block",
        ),
      /Unexpected allow operations \[write\]/,
      "must detect and reject unexpected operation sets even if count matches",
    );

    // 8. Regression proof: comment-hiding allow parser detection (Section A)
    const lineCommentPoisonedSample = `
      allow get: if isSignedIn() && request.auth.uid == uid;
      allow list: if false;
      allow create: if validProClubStaffCreateV1(clubId, uid);
      allow update, delete: if false;
      allow write:
        // accidental debug grant
        if true;
    `;
    assert.throws(
      () =>
        assertExactLocalAllowOperations(
          lineCommentPoisonedSample,
          [["get"], ["list"], ["create"], ["update", "delete"]],
          "line-comment poisoned sample block",
        ),
      /Unexpected allow statement count in line-comment poisoned sample block/,
      "must detect allow declaration hidden by line comment",
    );

    const blockCommentPoisonedSample = `
      allow get: if isSignedIn() && request.auth.uid == uid;
      allow list: if false;
      allow create: if validProClubStaffCreateV1(clubId, uid);
      allow update, delete: if false;
      allow write:
        /* accidental debug grant */
        if true;
    `;
    assert.throws(
      () =>
        assertExactLocalAllowOperations(
          blockCommentPoisonedSample,
          [["get"], ["list"], ["create"], ["update", "delete"]],
          "block-comment poisoned sample block",
        ),
      /Unexpected allow statement count in block-comment poisoned sample block/,
      "must detect allow declaration hidden by block comment",
    );

    // Regression proof: string literal comment markers are preserved safely
    const stringCommentSample = `
      allow get: if resource.data.tag == "// not a comment" && resource.data.note == "/* not a comment */";
    `;
    const parsedStringStatements = parseAllowStatements(stringCommentSample);
    assert.equal(parsedStringStatements.length, 1);
    assert.equal(parsedStringStatements[0].canonicalOperations, "get");
    assert.ok(parsedStringStatements[0].condition.includes("// not a comment"));
    assert.ok(parsedStringStatements[0].condition.includes("/* not a comment */"));

    // 9. Regression proof: unknown sibling match block rejection under /proClubs/{clubId} (Section B)
    const unknownSiblingSample = `
      match /members/{uid} {
        allow get: if true;
      }

      match /reviewBypass/{docId} {
        allow write: if true;
      }
    `;
    assert.throws(
      () =>
        assertExactDirectChildMatches(
          unknownSiblingSample,
          EXPECTED_PRO_CLUB_DIRECT_CHILD_MATCHES,
          "unknown sibling sample block",
        ),
      /Unexpected child match block \[match \/reviewBypass\/\{docId\}\]/,
      "must detect and reject unexpected sibling match block /reviewBypass/{docId}",
    );

    // Regression proof: duplicate direct child match block rejection
    const duplicateChildSample = `
      match /members/{uid} {
        allow get: if true;
      }
      match /members/{uid} {
        allow get: if true;
      }
    `;
    assert.throws(
      () =>
        assertExactDirectChildMatches(
          duplicateChildSample,
          ["match /members/{uid}"],
          "duplicate child sample block",
        ),
      /Duplicate child match block \[match \/members\/\{uid\}\]/,
      "must reject duplicate child match block",
    );

    // Regression proof: missing expected direct child match block rejection
    const missingChildSample = `
      match /members/{uid} {
        allow get: if true;
      }
    `;
    assert.throws(
      () =>
        assertExactDirectChildMatches(
          missingChildSample,
          ["match /members/{uid}", "match /staff/{uid}"],
          "missing child sample block",
        ),
      /Missing expected child match blocks/,
      "must reject missing expected child match block",
    );

    // Regression proof: malformed child match block braces fail closed
    const malformedBraceSample = `
      match /members/{uid} {
        allow get: if true;
    `;
    assert.throws(
      () =>
        assertExactDirectChildMatches(
          malformedBraceSample,
          ["match /members/{uid}"],
          "malformed brace sample block",
        ),
      /Malformed or unterminated child match block/,
      "must fail closed on malformed braces",
    );

    // 10. Regression proof: unaccounted direct root allow between child blocks rejected (Section C)
    const unaccountedRootAllowSample = `
      match /members/{uid} {
        allow get: if true;
      }
      allow write: if true;
      match /staff/{uid} {
        allow get: if true;
      }
    `;
    const unaccountedStructure = extractDirectBlockStructure(unaccountedRootAllowSample);
    assert.throws(
      () =>
        assertExactLocalAllowOperations(
          unaccountedStructure.directRootText,
          [],
          "unaccounted root allow sample block",
        ),
      /Unexpected allow statement count in unaccounted root allow sample block/,
      "must reject unaccounted direct root allow between child blocks",
    );

    assert.ok(normalizedContract.includes("no client create, update, or delete path"));
    assert.ok(contract.includes("dedicated Rules and Data Contract is required"));
  });

  await t.test("freezes public signup privilege and organization-creation ceilings", () => {
    for (const role of [
      "OWNER",
      "ADMIN",
      "MEMBER",
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "FITNESS_COACH",
      "ANALYST",
      "PHYSIO",
      "TEAM_MANAGER",
      "STAFF",
    ]) {
      assert.ok(contract.includes(`\`${role}\``), `missing forbidden role: ${role}`);
    }
    assert.ok(contract.includes("`PUBLIC REGISTRATION != ORGANIZATION CREATION`"));
    assert.ok(contract.includes("select an arbitrary club and become authorized"));
    assert.ok(contract.includes("self-approve"));
  });

  await t.test("freezes reviewed invite claim and canonical join flow", () => {
    for (const step of [
      "`Account registration`",
      "`Pro Club join/invite intent`",
      "`approved canonical Membership`",
      "`Organization Runtime selection`",
      "canonical authority resolution",
    ]) {
      assert.ok(contract.includes(step), `missing join step: ${step}`);
    }
    for (const safety of [
      "exact UID and exact Pro Club identity",
      "deterministic, replay-safe claim identity",
      "active, non-revoked invitation",
      "no self-approval",
      "immutable claimant identity",
      "duplicate-safe behavior",
      "auditable created, approved, and rejected actors and timestamps",
      "fail-closed handling for malformed or missing evidence",
    ]) {
      assert.ok(contract.includes(safety), `missing claim safety: ${safety}`);
    }
    assert.ok(contract.includes("does not name a new collection"));
    assert.ok(contract.includes("must not be copied and renamed"));
  });

  await t.test("freezes account role activation and privilege separation", () => {
    assert.ok(contract.includes("Global `users.role` is not a Pro Club authorization source"));
    assert.ok(contract.includes("`ACTIVE ACCOUNT != ACTIVE PRO CLUB MEMBERSHIP`"));
    assert.ok(contract.includes("`ACTIVE PRO CLUB MEMBERSHIP != FOOTBALL STAFF ROLE`"));
    assert.ok(contract.includes("authorizes no `OWNER` or `ADMIN`"));
    assert.ok(contract.includes("`HEAD_COACH != tenant admin`"));
    assert.ok(contract.includes("`staffRole != membershipAuthorizationRole`"));
  });

  await t.test("freezes Pro Club account lifecycle compatibility ownership", () => {
    assert.ok(contract.includes("`ACCOUNT ACTIVATION != TENANT AUTHORIZATION`"));
    for (const boundary of [
      "must not create Membership authority",
      "must not fabricate `AUTHORIZED`",
      "must not use `users.role` as Pro Club authorization proof",
      "must not use `activeAcademyId`",
      "must not require an Academy Membership",
      "must not route a Pro Club Coach through `JoinAcademy`",
      "must not create or persist `activeProClubId` as authority",
      "must remain subordinate to canonical",
      "must preserve exact `actualUser.uid` actor ownership",
    ]) {
      assert.ok(normalizedContract.includes(boundary), `missing activation boundary: ${boundary}`);
    }
    assert.ok(
      normalizedContract.includes(
        "Successful Pro Club Membership approval cannot use global account role or account status as tenant authority",
      ),
    );
    assert.ok(
      normalizedContract.includes(
        "current generic `USER` and inactive account lifecycle compatibility must receive explicit review before real Pro Club workspace entry",
      ),
    );
  });

  await t.test("freezes existing Organization Runtime authority chain", () => {
    assert.match(runtimeContext, /const \{ actualUser \} = useAuth\(\)/);
    assert.match(runtimeContext, /const actorUid = actualUser\?\.uid \?\? null/);
    assert.doesNotMatch(runtimeContext, /currentUser\?*\.uid|currentUser\.uid/);
    assert.match(runtimeContext, /selectProClub/);
    assert.match(runtimeContext, /getOrganizationResolutionRequest\(runtimeState\)/);
    assert.match(runtimeContext, /resolveProClubRuntimeAuthority\(request\)/);
    assert.match(
      runtimeContext,
      /setRuntimeState\(\(current\) =>\s*applyOrganizationResolution\(current, bridgeResult\.runtimeResult\)/s,
    );
    assert.ok(contract.includes("trusted runtime request"));
    assert.ok(contract.includes("stale-generation protection"));
    assert.ok(contract.includes("must not create an `AUTHORIZED` state"));
  });

  await t.test("preserves authenticated actor and SuperAdmin presentation boundaries", () => {
    assert.match(authSource, /const currentUser = supportPresentedUser \?\? actualUser/);
    assert.match(authSource, /actualUser\.role !== "SUPERADMIN"/);
    assert.ok(contract.includes("`PRESENTED USER != AUTHENTICATED ACTOR`"));
    assert.ok(contract.includes("Work As Staff"));
    assert.ok(contract.includes("support target to become the authenticated actor"));
    assert.ok(contract.includes("dedicated audited contract"));
  });

  await t.test("freezes Rules default-deny and future mutation proof", () => {
    for (const boundary of [
      "unauthenticated access is denied",
      "arbitrary club mutation is denied",
      "self-Membership grant is denied",
      "self-`OWNER`/`ADMIN` escalation is denied",
      "staff-only authority is denied",
      "forged claims are denied",
      "mismatched UID and mismatched club are denied",
      "replay and duplicate behavior is safe",
      "identity fields are immutable",
      "only an approved transition can mutate authority",
      "reviewer authority is exact",
      "Academy Rules remain unchanged",
      "production default deny remains intact",
    ]) {
      assert.ok(contract.includes(boundary), `missing Rules proof: ${boundary}`);
    }
  });

  await t.test("freezes no-discovery and no-persistence boundaries", () => {
    for (const forbidden of [
      "listing or searching all Pro Clubs",
      "account-wide organization enumeration",
      "client-side membership scanning",
      "collection-group discovery",
      "guessing club IDs",
      "`localStorage`",
      "`sessionStorage`",
      "cookies",
      "`IndexedDB`",
      "URL state",
      "`activeProClubId`",
      "`activeOrganizationId`",
      "client authority cache",
    ]) {
      assert.ok(contract.includes(forbidden), `missing closed boundary: ${forbidden}`);
    }
  });

  await t.test("freezes six separately reviewed implementation slices", () => {
    for (const slice of [
      "Pro Club Staff Onboarding Contract Freeze",
      "Pro Club Invite / Claim / Membership Rules & Data Contract",
      "Pro Club Onboarding Service Implementation",
      "Registration Organization Intent / Routing Contract",
      "Organization-aware Onboarding UI",
      "Pro Club Workspace Entry",
    ]) {
      assert.ok(contract.includes(`**${slice}**`), `missing slice: ${slice}`);
    }
    assert.ok(contract.includes("Each slice requires separate tests, review, commit, and pull request"));
    assert.ok(
      normalizedContract.includes(
        "Registration Organization Intent / Routing Contract** — safely distinguish Academy and Pro Club intent without authority in account metadata. This slice owns reviewed Pro Club account/application lifecycle compatibility",
      ),
    );
    assert.ok(
      normalizedContract.includes(
        "must be split into a separate dedicated reviewed slice before UI or workspace work",
      ),
    );
  });

  await t.test("freezes the complete future user journey", () => {
    for (const step of [
      "`Coach creates FutVerse account`",
      "supplies reviewed invite evidence",
      "approved canonical Membership exists",
      "optional reviewed staff assignment exists",
      "Organization Runtime returns `AUTHORIZED`",
      "Coach enters Pro Club workspace",
      "operational capability derives from reviewed Membership plus staff",
    ]) {
      assert.ok(contract.includes(step), `missing journey step: ${step}`);
    }
    assert.ok(contract.includes("No step may skip canonical Membership authority"));
  });

  await t.test("keeps implementation UI mutation routing and deployment out of scope", () => {
    for (const item of [
      "Login UI changes",
      "`JoinAcademy` changes",
      "Join Pro Club UI",
      "organization selector",
      "Pro Club dashboard wiring",
      "Firestore Rules changes",
      "invite, claim, Membership, or staff writes",
      "user activation or global role changes",
      "navigation or route changes",
      "persistence",
      "deployment",
    ]) {
      assert.ok(contract.includes(item), `missing out-of-scope item: ${item}`);
    }
  });

  await t.test("freezes all required future regression scenarios", () => {
    const scenarios = [
      "signup intent cannot authorize",
      "invite intent cannot authorize",
      "missing Membership cannot authorize",
      "inactive Membership cannot authorize",
      "active Membership can reach runtime authority",
      "staff without Membership cannot authorize",
      "`HEAD_COACH` cannot self-elevate",
      "`MEMBER` cannot become `ADMIN` through public onboarding",
      "`OWNER` cannot be self-granted",
      "exact UID mismatch fails",
      "exact club mismatch fails",
      "malformed invite fails closed",
      "revoked invite fails",
      "duplicate or replayed claim is safe",
      "claimant cannot self-approve",
      "unauthorized reviewer cannot approve",
      "approved Membership identity is exact",
      "staff assignment does not create authority",
      "authenticated actor remains `actualUser.uid`",
      "support-presented identity cannot authorize",
      "Academy onboarding remains unchanged",
      "Academy Rules remain unchanged",
      "Pro Club current read adapter remains unchanged",
      "no club-wide discovery exists",
      "no persistence shortcut exists",
      "no global-role bypass exists",
      "no direct signup Membership write exists",
      "no direct signup staff write exists",
      "stale runtime selection cannot authorize the wrong club",
      "production default-deny boundary remains intact",
      "account activation alone cannot authorize Pro Club",
      "Pro Club Coach onboarding cannot require Academy Membership or",
      "changing global `users.role` cannot substitute for canonical Pro Club",
    ];
    assert.equal(scenarios.length, 33);
    for (const scenario of scenarios) {
      assert.ok(contract.includes(scenario), `missing scenario: ${scenario}`);
    }
  });

  await t.test("requires independent Team 2 review before commit", () => {
    assert.ok(normalizedContract.includes("independent Team 2 architecture and security review"));
    assert.ok(contract.includes("Team 1 must not approve its own work"));
    assert.ok(contract.includes("No implementation"));
    assert.ok(contract.includes("deployment is authorized"));
  });
});
