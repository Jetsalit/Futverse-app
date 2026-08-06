import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectMembershipPlanningExport,
  type ExportAcademy,
  type ExportAcademyInvite,
  type ExportMembership,
  type ExportUser,
  type MembershipExportReadSource,
} from "../scripts/membershipExportReadOnlyCore";
import {
  executeReadOnlyExport,
  EXPORT_ARTIFACT_NAMES,
  parseArguments,
  READ_ONLY_CONFIRMATION,
  runCli,
  validateCredentialFile,
  validateOutputDirectory,
  type MembershipExportArguments,
} from "../scripts/membershipExportReadOnly";
import {
  parseOfflineExport,
  planDryRun,
} from "../scripts/membershipBackfillDryRunCore";
import {
  assertReadOnlyExecutableSource,
  ReadOnlySourceSafetyError,
} from "../scripts/membershipExportStaticGuard";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = "sample-project";
const DATABASE_ID = "membership-db";
const TEST_PRIVATE_KEY = "TEST_ONLY_NONFUNCTIONAL_PRIVATE_KEY";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function baseAcademies(): ExportAcademy[] {
  return [
    { documentId: "academy-b", data: { id: "academy-b", name: "Beta", inviteCode: "FUT-BETA", status: "ACTIVE", ignored: "drop" } },
    { documentId: "academy-a", data: { id: "academy-a", name: "Alpha", inviteCode: "FUT-ALPHA", status: "ACTIVE", ignored: "drop" } },
  ];
}

function baseUsers(): ExportUser[] {
  return [
    { documentId: "user-b", data: { uid: "user-b", email: "b@example.test", name: "B", role: "COACH", status: "ACTIVE", academyId: "academy-b", activeAcademyId: "academy-b", deleted: false, disabled: false, ignored: "drop" } },
    { documentId: "user-a", data: { uid: "user-a", id: "user-a", email: "a@example.test", name: "A", role: "ADMIN", requestedRole: "ADMIN", status: "ACTIVE", academyId: "academy-a", activeAcademyId: "academy-a", tenantRole: "ADMIN", academyName: "Alpha", requestedAcademyName: "Alpha", deleted: false, disabled: false, ignored: "drop" } },
  ];
}

function baseMemberships(): Record<string, ExportMembership[]> {
  return {
    "academy-a": [{ parentAcademyId: "academy-a", documentId: "user-a", data: { userId: "user-a", academyId: "academy-a", role: "ADMIN", status: "ACTIVE", source: "LEGACY_MIGRATION", ignored: "drop" } }],
    "academy-b": [{ parentAcademyId: "academy-b", documentId: "user-b", data: { userId: "user-b", academyId: "academy-b", role: "COACH", status: "ACTIVE", source: "CLAIM_APPROVAL", approvalClaimId: "claim-b", ignored: "drop" } }],
  };
}

function baseInvites(): ExportAcademyInvite[] {
  return [
    { documentId: "FUT-BETA", data: { inviteCode: "FUT-BETA", academyId: "academy-b", status: "ACTIVE", ignored: "drop" } },
    { documentId: "FUT-ALPHA", data: { inviteCode: "FUT-ALPHA", academyId: "academy-a", status: "ACTIVE", ignored: "drop" } },
  ];
}

class FakeSource implements MembershipExportReadSource {
  academies = baseAcademies();
  users = baseUsers();
  memberships = baseMemberships();
  invites = baseInvites();
  calls: string[] = [];
  closeCount = 0;
  failClose = false;

  async listAcademies(): Promise<ExportAcademy[]> {
    this.calls.push("academies");
    return clone(this.academies);
  }

  async listUsers(): Promise<ExportUser[]> {
    this.calls.push("users");
    return clone(this.users);
  }

  async listMembershipsForAcademy(academyId: string): Promise<ExportMembership[]> {
    this.calls.push(`academies/${academyId}/members`);
    return clone(this.memberships[academyId] ?? []);
  }

  async listAcademyInvites(): Promise<ExportAcademyInvite[]> {
    this.calls.push("academy_invites");
    return clone(this.invites);
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    if (this.failClose) throw new Error("synthetic close failure");
  }
}

interface Fixture {
  root: string;
  credentialPath: string;
  outputDirectory: string;
  options: MembershipExportArguments;
}

function writeSyntheticCredential(path: string, overrides: Record<string, unknown> = {}): void {
  writeFileSync(path, JSON.stringify({
    type: "service_account",
    project_id: PROJECT_ID,
    client_email: `reader@${PROJECT_ID}.iam.gserviceaccount.com`,
    private_key: TEST_PRIVATE_KEY,
    ...overrides,
  }), "utf8");
}

function fixture(t: TestContext): Fixture {
  const root = mkdtempSync(join(tmpdir(), "membership-export-offline-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const credentialPath = join(root, "synthetic-service-account.json");
  const outputDirectory = join(root, "published-output");
  writeSyntheticCredential(credentialPath);
  return {
    root,
    credentialPath,
    outputDirectory,
    options: {
      projectId: PROJECT_ID,
      databaseId: DATABASE_ID,
      credentialsPath: credentialPath,
      outputDirectory,
      confirmation: READ_ONLY_CONFIRMATION,
    },
  };
}

async function collect(source = new FakeSource()) {
  return collectMembershipPlanningExport(source, "2026-08-06T01:02:03.000Z");
}

test("01 core emits the exact Sprint 1E top-level JSON shape", async () => {
  const result = await collect();
  assert.deepEqual(Object.keys(result.exportData), ["exportedAt", "academies", "users", "memberships", "academyInvites"]);
});

test("02 Academies are sorted by exact document ID", async () => {
  assert.deepEqual((await collect()).exportData.academies.map((item) => item.id), ["academy-a", "academy-b"]);
});

test("03 Users are sorted by exact UID", async () => {
  assert.deepEqual((await collect()).exportData.users.map((item) => item.uid), ["user-a", "user-b"]);
});

test("04 Memberships are sorted by Academy, role, then UID", async () => {
  assert.deepEqual((await collect()).exportData.memberships.map((item) => `${item.academyId}/${item.role}/${item.userId}`), [
    "academy-a/ADMIN/user-a",
    "academy-b/COACH/user-b",
  ]);
});

test("05 Academy Invites are sorted by canonical code", async () => {
  assert.deepEqual((await collect()).exportData.academyInvites.map((item) => item.inviteCode), ["FUT-ALPHA", "FUT-BETA"]);
});

test("06 core records only the four allowed query families", async () => {
  assert.deepEqual((await collect()).queriedPaths, [
    "academies",
    "users",
    "academies/academy-a/members",
    "academies/academy-b/members",
    "academy_invites",
  ]);
});

test("07 Academy output excludes unapproved fields", async () => {
  const academy = (await collect()).exportData.academies[0];
  assert.deepEqual(Object.keys(academy), ["id", "name", "inviteCode", "status"]);
});

test("08 User output excludes unapproved fields", async () => {
  const user = (await collect()).exportData.users[0] as Record<string, unknown>;
  assert.equal("ignored" in user, false);
});

test("09 Membership output excludes unapproved fields", async () => {
  const membership = (await collect()).exportData.memberships[0] as Record<string, unknown>;
  assert.equal("ignored" in membership, false);
});

test("10 Academy Invite output excludes unapproved fields", async () => {
  const invite = (await collect()).exportData.academyInvites[0] as Record<string, unknown>;
  assert.equal("ignored" in invite, false);
});

test("11 conflicting Academy id is rejected", async () => {
  const source = new FakeSource();
  source.academies[0].data.id = "another-academy";
  await assert.rejects(() => collect(source), /Academy id field conflicts/);
});

test("12 invalid Academy document ID is rejected without normalization", async () => {
  const source = new FakeSource();
  source.academies[0].documentId = " academy-b";
  await assert.rejects(() => collect(source), /Academy document ID/);
});

test("13 duplicate Academy document IDs are rejected", async () => {
  const source = new FakeSource();
  source.academies = [clone(source.academies[0]), clone(source.academies[0])];
  await assert.rejects(() => collect(source), /Duplicate Academy document ID/);
});

test("14 conflicting User uid is rejected", async () => {
  const source = new FakeSource();
  source.users[0].data.uid = "other-user";
  await assert.rejects(() => collect(source), /User uid field conflicts/);
});

test("15 conflicting User id is rejected", async () => {
  const source = new FakeSource();
  source.users[0].data.id = "other-user";
  await assert.rejects(() => collect(source), /User id field conflicts/);
});

test("16 invalid User document ID is rejected without normalization", async () => {
  const source = new FakeSource();
  source.users[0].documentId = "USER/ONE";
  await assert.rejects(() => collect(source), /User document ID/);
});

test("17 invalid User academyId is rejected", async () => {
  const source = new FakeSource();
  source.users[0].data.academyId = "academy/b";
  await assert.rejects(() => collect(source), /User academyId/);
});

test("18 invalid User activeAcademyId is rejected", async () => {
  const source = new FakeSource();
  source.users[0].data.activeAcademyId = " academy-b";
  await assert.rejects(() => collect(source), /User activeAcademyId/);
});

test("19 duplicate User document IDs are rejected", async () => {
  const source = new FakeSource();
  source.users = [clone(source.users[0]), clone(source.users[0])];
  await assert.rejects(() => collect(source), /Duplicate User document ID/);
});

test("20 Membership returned for a different Academy is rejected", async () => {
  const source = new FakeSource();
  source.memberships["academy-a"][0].parentAcademyId = "academy-b";
  await assert.rejects(() => collect(source), /wrong Academy/);
});

test("21 Membership academyId conflict is rejected", async () => {
  const source = new FakeSource();
  source.memberships["academy-a"][0].data.academyId = "academy-b";
  await assert.rejects(() => collect(source), /academyId conflicts/);
});

test("22 Membership userId conflict is rejected", async () => {
  const source = new FakeSource();
  source.memberships["academy-a"][0].data.userId = "user-b";
  await assert.rejects(() => collect(source), /userId conflicts/);
});

test("23 duplicate Membership paths are rejected", async () => {
  const source = new FakeSource();
  source.memberships["academy-a"].push(clone(source.memberships["academy-a"][0]));
  await assert.rejects(() => collect(source), /Duplicate Membership document path/);
});

test("24 invalid Membership document ID is rejected", async () => {
  const source = new FakeSource();
  source.memberships["academy-a"][0].documentId = " user-a";
  await assert.rejects(() => collect(source), /Membership document ID/);
});

test("25 noncanonical Academy Invite document ID is rejected", async () => {
  const source = new FakeSource();
  source.invites[0].documentId = "fut-beta";
  source.invites[0].data.inviteCode = "fut-beta";
  await assert.rejects(() => collect(source), /canonical invite code/);
});

test("26 Academy Invite field conflict is rejected", async () => {
  const source = new FakeSource();
  source.invites[0].data.inviteCode = "FUT-OTHER";
  await assert.rejects(() => collect(source), /inviteCode conflicts/);
});

test("27 invalid Academy Invite academyId is rejected", async () => {
  const source = new FakeSource();
  source.invites[0].data.academyId = "academy/b";
  await assert.rejects(() => collect(source), /Academy Invite academyId/);
});

test("28 duplicate Academy Invite IDs are rejected", async () => {
  const source = new FakeSource();
  source.invites = [clone(source.invites[0]), clone(source.invites[0])];
  await assert.rejects(() => collect(source), /Duplicate Academy Invite document ID/);
});

test("29 invalid exportedAt is rejected", async () => {
  await assert.rejects(() => collectMembershipPlanningExport(new FakeSource(), "not-a-time"), /exportedAt/);
});

test("30 generated JSON is accepted by Sprint 1E parseOfflineExport", async () => {
  const data = (await collect()).exportData;
  assert.equal(parseOfflineExport(JSON.stringify(data)).academies.length, 2);
});

test("31 generated JSON is accepted by Sprint 1E planDryRun", async () => {
  const data = (await collect()).exportData;
  const result = planDryRun(parseOfflineExport(JSON.stringify(data)), "0".repeat(64), data.exportedAt);
  assert.equal(result.summary.academyCount, 2);
});

test("31b invalid Membership parent Academy identifier fails", async () => {
  const source = new FakeSource();
  source.memberships["academy-a"][0].parentAcademyId = " academy-a";
  await assert.rejects(() => collect(source), /wrong Academy|parent Academy ID/);
});

test("31c stored User id presence is preserved only when it matches the document ID", async () => {
  const users = (await collect()).exportData.users;
  assert.equal(users.find((user) => user.uid === "user-a")?.id, "user-a");
  assert.equal(Object.hasOwn(users.find((user) => user.uid === "user-b") ?? {}, "id"), false);
});

function validArgv(): string[] {
  return [
    "--project-id", PROJECT_ID,
    "--database-id", DATABASE_ID,
    "--credentials", join(tmpdir(), "credential.json"),
    "--output", join(tmpdir(), "new-output"),
    "--confirm-read-only", READ_ONLY_CONFIRMATION,
  ];
}

const argumentFailures: Array<[string, (argv: string[]) => string[]]> = [
  ["32 unknown CLI option", (argv) => [...argv, "--unexpected", "value"]],
  ["33 duplicate project option", (argv) => [...argv, "--project-id", PROJECT_ID]],
  ["34 missing project option", (argv) => argv.slice(2)],
  ["35 missing database option", (argv) => argv.filter((_, index) => index !== 2 && index !== 3)],
  ["36 missing credential option", (argv) => argv.filter((_, index) => index !== 4 && index !== 5)],
  ["37 missing output option", (argv) => argv.filter((_, index) => index !== 6 && index !== 7)],
  ["38 missing confirmation option", (argv) => argv.slice(0, -2)],
  ["39 incomplete option", () => ["--project-id"]],
  ["40 wrong confirmation phrase", (argv) => argv.map((value) => value === READ_ONLY_CONFIRMATION ? "YES" : value)],
  ["41 relative credential path", (argv) => argv.map((value) => value === join(tmpdir(), "credential.json") ? "credential.json" : value)],
  ["42 relative output path", (argv) => argv.map((value) => value === join(tmpdir(), "new-output") ? "output" : value)],
  ["43 project ID with whitespace", (argv) => argv.map((value) => value === PROJECT_ID ? ` ${PROJECT_ID}` : value)],
  ["44 project ID containing slash", (argv) => argv.map((value) => value === PROJECT_ID ? "project/id" : value)],
  ["45 database ID with whitespace", (argv) => argv.map((value) => value === DATABASE_ID ? `${DATABASE_ID} ` : value)],
];

for (const [name, mutate] of argumentFailures) {
  test(name, () => assert.throws(() => parseArguments(mutate(validArgv()))));
}

test("46 valid CLI contract preserves all exact values", () => {
  const parsed = parseArguments(validArgv());
  assert.equal(parsed.projectId, PROJECT_ID);
  assert.equal(parsed.databaseId, DATABASE_ID);
  assert.equal(parsed.confirmation, READ_ONLY_CONFIRMATION);
});

test("47 explicit (default) database ID is accepted without implicit defaulting", () => {
  const argv = validArgv().map((value) => value === DATABASE_ID ? "(default)" : value);
  assert.equal(parseArguments(argv).databaseId, "(default)");
});

test("48 valid synthetic service-account credential is accepted", (t) => {
  const item = fixture(t);
  const credential = validateCredentialFile(item.credentialPath, PROJECT_ID);
  assert.equal(credential.clientEmail, `reader@${PROJECT_ID}.iam.gserviceaccount.com`);
});

test("49 missing credential file is rejected", (t) => {
  const item = fixture(t);
  assert.throws(() => validateCredentialFile(join(item.root, "missing.json"), PROJECT_ID), /does not exist/);
});

test("50 credential directory is rejected", (t) => {
  const item = fixture(t);
  const directory = join(item.root, "credential-directory");
  mkdirSync(directory);
  assert.throws(() => validateCredentialFile(directory, PROJECT_ID), /regular file/);
});

test("51 malformed credential JSON is rejected", (t) => {
  const item = fixture(t);
  writeFileSync(item.credentialPath, "{", "utf8");
  assert.throws(() => validateCredentialFile(item.credentialPath, PROJECT_ID), /valid JSON/);
});

test("52 non-service-account credential is rejected", (t) => {
  const item = fixture(t);
  writeSyntheticCredential(item.credentialPath, { type: "authorized_user" });
  assert.throws(() => validateCredentialFile(item.credentialPath, PROJECT_ID), /service_account/);
});

test("53 credential project mismatch is rejected", (t) => {
  const item = fixture(t);
  writeSyntheticCredential(item.credentialPath, { project_id: "other-project" });
  assert.throws(() => validateCredentialFile(item.credentialPath, PROJECT_ID), /does not match/);
});

test("54 credential service-account domain mismatch is rejected", (t) => {
  const item = fixture(t);
  writeSyntheticCredential(item.credentialPath, { client_email: "reader@other-project.iam.gserviceaccount.com" });
  assert.throws(() => validateCredentialFile(item.credentialPath, PROJECT_ID), /service account/);
});

test("55 missing credential private key is rejected without echoing credential data", (t) => {
  const item = fixture(t);
  writeSyntheticCredential(item.credentialPath, { private_key: "" });
  assert.throws(() => validateCredentialFile(item.credentialPath, PROJECT_ID), (error: Error) => {
    assert.doesNotMatch(error.message, /TEST_ONLY/);
    assert.doesNotMatch(error.message, new RegExp(item.credentialPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    return true;
  });
});

test("56 credential inside repository is rejected", (t) => {
  const item = fixture(t);
  const path = join(REPOSITORY_ROOT, ".membership-export-synthetic-test.json");
  writeSyntheticCredential(path);
  t.after(() => rmSync(path, { force: true }));
  assert.throws(() => validateCredentialFile(path, PROJECT_ID), /outside the repository/);
});

test("57 credential path through a junction is rejected", (t) => {
  const item = fixture(t);
  const realDirectory = join(item.root, "real-credential-parent");
  const linkedDirectory = join(item.root, "linked-credential-parent");
  mkdirSync(realDirectory);
  const realCredential = join(realDirectory, "credential.json");
  writeSyntheticCredential(realCredential);
  symlinkSync(realDirectory, linkedDirectory, "junction");
  assert.throws(
    () => validateCredentialFile(join(linkedDirectory, "credential.json"), PROJECT_ID),
    /symbolic link|junction/,
  );
});

test("58 absent output with normal external parent is accepted", (t) => {
  const item = fixture(t);
  assert.doesNotThrow(() => validateOutputDirectory(item.outputDirectory));
});

test("59 existing output is rejected", (t) => {
  const item = fixture(t);
  mkdirSync(item.outputDirectory);
  assert.throws(() => validateOutputDirectory(item.outputDirectory), /already exists/);
});

test("60 output inside repository is rejected", (t) => {
  const item = fixture(t);
  void item;
  assert.throws(() => validateOutputDirectory(join(REPOSITORY_ROOT, "new-membership-export")), /outside the repository/);
});

test("61 output with missing parent is rejected", (t) => {
  const item = fixture(t);
  assert.throws(() => validateOutputDirectory(join(item.root, "missing-parent", "output")), /existing normal directory/);
});

test("62 output parent junction is rejected", (t) => {
  const item = fixture(t);
  const realParent = join(item.root, "real-parent");
  const linkedParent = join(item.root, "linked-parent");
  mkdirSync(realParent);
  symlinkSync(realParent, linkedParent, "junction");
  assert.throws(() => validateOutputDirectory(join(linkedParent, "output")), /symbolic link|junction/);
});

function offlineDependencies(source: FakeSource, times = ["2026-08-06T01:00:00.000Z", "2026-08-06T01:00:01.000Z"]) {
  return {
    createSource: async () => source,
    now: () => times.shift() ?? "2026-08-06T01:00:01.000Z",
    sourceCommit: () => "f".repeat(40),
  };
}

test("63 offline export publishes exactly four artifacts", async (t) => {
  const item = fixture(t);
  await executeReadOnlyExport(item.options, offlineDependencies(new FakeSource()));
  assert.deepEqual(readdirSync(item.outputDirectory).sort(), [...EXPORT_ARTIFACT_NAMES].sort());
});

test("64 export hash covers the exact JSON bytes", async (t) => {
  const item = fixture(t);
  await executeReadOnlyExport(item.options, offlineDependencies(new FakeSource()));
  const bytes = readFileSync(join(item.outputDirectory, "membership-planning-export.json"));
  const expected = createHash("sha256").update(bytes).digest("hex");
  assert.equal(readFileSync(join(item.outputDirectory, "membership-planning-export.sha256"), "utf8"), `${expected}  membership-planning-export.json\n`);
});

test("65 manifest contains exactly the required top-level fields", async (t) => {
  const item = fixture(t);
  await executeReadOnlyExport(item.options, offlineDependencies(new FakeSource()));
  const manifest = JSON.parse(readFileSync(join(item.outputDirectory, "export-manifest.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest), [
    "sensitive", "notice", "generatedAt", "completedAt", "projectId", "databaseId",
    "serviceAccountEmail", "sourceCommit", "exporterVersion", "counts", "queriedPaths",
    "exportSha256", "transactionalSnapshot", "writeCapabilityUsed", "productionWritesPerformed",
  ]);
});

test("66 manifest declares non-transactional and no-write behavior", async (t) => {
  const item = fixture(t);
  const manifest = await executeReadOnlyExport(item.options, offlineDependencies(new FakeSource()));
  assert.equal(manifest.transactionalSnapshot, false);
  assert.equal(manifest.writeCapabilityUsed, false);
  assert.equal(manifest.productionWritesPerformed, false);
});

test("67 manifest excludes credential path and private key", async (t) => {
  const item = fixture(t);
  await executeReadOnlyExport(item.options, offlineDependencies(new FakeSource()));
  const manifest = readFileSync(join(item.outputDirectory, "export-manifest.json"), "utf8");
  assert.doesNotMatch(manifest, /private_key|privateKey|TEST_ONLY_NONFUNCTIONAL/);
  assert.equal(manifest.includes(item.credentialPath), false);
});

const credentialSecretCases: Array<[string, string]> = [
  ["private_key", "TEST_ONLY_NONFUNCTIONAL_PRIVATE_KEY_SPRINT_1G"],
  ["private_key_id", "TEST_ONLY_NONFUNCTIONAL_PRIVATE_KEY_ID"],
  ["token_uri", "https://invalid.example.test/nonfunctional-token-uri"],
  ["auth_uri", "https://invalid.example.test/nonfunctional-auth-uri"],
  ["client_x509_cert_url", "https://invalid.example.test/nonfunctional-cert-url"],
];

for (const [field, syntheticValue] of credentialSecretCases) {
  test(`67 secret exclusion: all four artifacts exclude ${field}`, async (t) => {
    const item = fixture(t);
    writeSyntheticCredential(item.credentialPath, { [field]: syntheticValue });
    await executeReadOnlyExport(item.options, offlineDependencies(new FakeSource()));
    for (const artifactName of EXPORT_ARTIFACT_NAMES) {
      const artifact = readFileSync(join(item.outputDirectory, artifactName), "utf8");
      assert.equal(artifact.includes(field), false, `${artifactName} contains ${field}`);
      assert.equal(artifact.includes(syntheticValue), false, `${artifactName} contains synthetic ${field}`);
    }
  });
}

test("68 sensitive README states handling and authorization limits", async (t) => {
  const item = fixture(t);
  await executeReadOnlyExport(item.options, offlineDependencies(new FakeSource()));
  const readme = readFileSync(join(item.outputDirectory, "README-SENSITIVE.txt"), "utf8");
  assert.match(readme, /SENSITIVE/);
  assert.match(readme, /non-transactional/);
  assert.match(readme, /does not authorize writes/);
});

test("69 adapter close is called after successful reads", async (t) => {
  const item = fixture(t);
  const source = new FakeSource();
  await executeReadOnlyExport(item.options, offlineDependencies(source));
  assert.equal(source.closeCount, 1);
});

test("70 adapter close is called after a read failure", async (t) => {
  const item = fixture(t);
  const source = new FakeSource();
  source.listUsers = async () => { source.calls.push("users"); throw new Error("synthetic read failure"); };
  await assert.rejects(() => executeReadOnlyExport(item.options, offlineDependencies(source)), /synthetic read failure/);
  assert.equal(source.closeCount, 1);
  assert.equal(readdirSync(item.root).some((name) => name.startsWith("published-output.tmp-")), false);
});

test("71 close failure prevents publication", async (t) => {
  const item = fixture(t);
  const source = new FakeSource();
  source.failClose = true;
  await assert.rejects(() => executeReadOnlyExport(item.options, offlineDependencies(source)), /synthetic close failure/);
  assert.equal(readdirSync(item.root).includes("published-output"), false);
});

test("72 source factory failure prevents publication", async (t) => {
  const item = fixture(t);
  await assert.rejects(() => executeReadOnlyExport(item.options, {
    createSource: async () => { throw new Error("synthetic source failure"); },
  }), /synthetic source failure/);
  assert.equal(readdirSync(item.root).includes("published-output"), false);
});

test("73 artifact write failure cleans temporary output", async (t) => {
  const item = fixture(t);
  const source = new FakeSource();
  await assert.rejects(() => executeReadOnlyExport(item.options, {
    ...offlineDependencies(source),
    writeArtifact: (path, data) => {
      if (path.endsWith("export-manifest.json")) throw new Error("synthetic write failure");
      writeFileSync(path, data);
    },
  }), /synthetic write failure/);
  assert.equal(readdirSync(item.root).some((name) => name.startsWith("published-output.tmp-")), false);
});

test("74 destination race never overwrites the appearing destination", async (t) => {
  const item = fixture(t);
  await assert.rejects(() => executeReadOnlyExport(item.options, {
    ...offlineDependencies(new FakeSource()),
    beforePublish: (output) => mkdirSync(output),
  }), /appeared during export/);
  assert.deepEqual(readdirSync(item.outputDirectory), []);
  assert.equal(readdirSync(item.root).some((name) => name.startsWith("published-output.tmp-")), false);
});

test("75 publish rename failure cleans temporary output", async (t) => {
  const item = fixture(t);
  await assert.rejects(() => executeReadOnlyExport(item.options, {
    ...offlineDependencies(new FakeSource()),
    publishDirectory: () => { throw new Error("synthetic rename failure"); },
  }), /synthetic rename failure/);
  assert.equal(readdirSync(item.root).some((name) => name.startsWith("published-output.tmp-")), false);
});

test("75b explicit export hash mismatch publishes nothing and cleans temporary output", async (t) => {
  const item = fixture(t);
  await assert.rejects(() => executeReadOnlyExport(item.options, {
    ...offlineDependencies(new FakeSource()),
    writeArtifact: (path, data) => {
      if (path.endsWith("membership-planning-export.json")) {
        const altered = Buffer.from(data).toString("utf8")
          .replace("2026-08-06T01:00:00.000Z", "2026-08-07T01:00:00.000Z");
        writeFileSync(path, altered);
        return;
      }
      writeFileSync(path, data);
    },
  }), /SHA-256 verification failed/);
  assert.equal(readdirSync(item.root).includes("published-output"), false);
  assert.equal(readdirSync(item.root).some((name) => name.startsWith("published-output.tmp-")), false);
});

test("76 invalid credential is rejected before source creation", async (t) => {
  const item = fixture(t);
  writeSyntheticCredential(item.credentialPath, { project_id: "wrong-project" });
  let sourceCreated = false;
  await assert.rejects(() => executeReadOnlyExport(item.options, {
    createSource: async () => { sourceCreated = true; return new FakeSource(); },
  }), /does not match/);
  assert.equal(sourceCreated, false);
});

test("77 invalid confirmation is rejected before credential loading and source creation", async (t) => {
  const item = fixture(t);
  rmSync(item.credentialPath);
  let sourceCreated = false;
  await assert.rejects(() => executeReadOnlyExport({ ...item.options, confirmation: "NO" }, {
    createSource: async () => { sourceCreated = true; return new FakeSource(); },
  }), /confirmation phrase/);
  assert.equal(sourceCreated, false);
});

test("77b source initialization remains uncalled for every pre-source validation family", async (t) => {
  const scenarios: Array<{
    name: string;
    prepare: (item: Fixture) => MembershipExportArguments;
  }> = [
    { name: "invalid project ID", prepare: (item) => ({ ...item.options, projectId: " project" }) },
    { name: "invalid database ID", prepare: (item) => ({ ...item.options, databaseId: "database/id" }) },
    { name: "relative credential path", prepare: (item) => ({ ...item.options, credentialsPath: "credential.json" }) },
    { name: "relative output path", prepare: (item) => ({ ...item.options, outputDirectory: "output" }) },
    { name: "wrong confirmation", prepare: (item) => ({ ...item.options, confirmation: "NO" }) },
    {
      name: "existing output",
      prepare: (item) => {
        mkdirSync(item.outputDirectory);
        return item.options;
      },
    },
    {
      name: "missing output parent",
      prepare: (item) => ({ ...item.options, outputDirectory: join(item.root, "missing", "output") }),
    },
    {
      name: "output inside repository",
      prepare: (item) => ({ ...item.options, outputDirectory: join(REPOSITORY_ROOT, ".synthetic-output-never-created") }),
    },
    {
      name: "missing credential",
      prepare: (item) => {
        rmSync(item.credentialPath);
        return item.options;
      },
    },
    {
      name: "credential directory",
      prepare: (item) => {
        rmSync(item.credentialPath);
        mkdirSync(item.credentialPath);
        return item.options;
      },
    },
    {
      name: "malformed credential JSON",
      prepare: (item) => {
        writeFileSync(item.credentialPath, "{", "utf8");
        return item.options;
      },
    },
    {
      name: "wrong credential type",
      prepare: (item) => {
        writeSyntheticCredential(item.credentialPath, { type: "authorized_user" });
        return item.options;
      },
    },
    {
      name: "credential project mismatch",
      prepare: (item) => {
        writeSyntheticCredential(item.credentialPath, { project_id: "other-project" });
        return item.options;
      },
    },
    {
      name: "credential email mismatch",
      prepare: (item) => {
        writeSyntheticCredential(item.credentialPath, {
          client_email: "reader@other-project.iam.gserviceaccount.com",
        });
        return item.options;
      },
    },
    {
      name: "missing credential private key",
      prepare: (item) => {
        writeSyntheticCredential(item.credentialPath, { private_key: "" });
        return item.options;
      },
    },
  ];

  for (const scenario of scenarios) {
    const item = fixture(t);
    const options = scenario.prepare(item);
    let sourceInitializationCalls = 0;
    await assert.rejects(
      () => executeReadOnlyExport(options, {
        createSource: async () => {
          sourceInitializationCalls += 1;
          return new FakeSource();
        },
      }),
      undefined,
      scenario.name,
    );
    assert.equal(sourceInitializationCalls, 0, scenario.name);
  }
});

test("78 fake adapter receives exact explicit project and database IDs", async (t) => {
  const item = fixture(t);
  let received: string[] = [];
  await executeReadOnlyExport(item.options, {
    ...offlineDependencies(new FakeSource()),
    createSource: async (projectId, databaseId) => {
      received = [projectId, databaseId];
      return new FakeSource();
    },
  });
  assert.deepEqual(received, [PROJECT_ID, DATABASE_ID]);
});

test("79 fake adapter performs only deterministic allowed calls", async (t) => {
  const item = fixture(t);
  const source = new FakeSource();
  await executeReadOnlyExport(item.options, offlineDependencies(source));
  assert.deepEqual(source.calls, ["academies", "users", "academies/academy-a/members", "academies/academy-b/members", "academy_invites"]);
});

test("80 CLI validation failure returns exit code 1 without initialization", async () => {
  const messages: string[] = [];
  assert.equal(await runCli(["--unknown"], (message) => messages.push(message)), 1);
  assert.match(messages.join(""), /Unknown argument/);
});

const executablePaths = [
  join(REPOSITORY_ROOT, "scripts", "membershipExportReadOnlyCore.ts"),
  join(REPOSITORY_ROOT, "scripts", "membershipExportReadOnly.ts"),
  join(REPOSITORY_ROOT, "scripts", "firestoreMembershipReadSource.ts"),
  join(REPOSITORY_ROOT, "scripts", "membershipExportStaticGuard.ts"),
];

test("81 static guard rejects every prohibited Firestore write-capable identifier", () => {
  for (const path of executablePaths) {
    const source = readFileSync(path, "utf8");
    assert.doesNotThrow(() => assertReadOnlyExecutableSource(path, source), path);
  }
});

test("82 static guard allows createHash while still prohibiting write APIs", () => {
  const source = readFileSync(join(REPOSITORY_ROOT, "scripts", "membershipBackfillDryRunCore.ts"), "utf8");
  assert.match(source, /createHash/);
  assert.doesNotMatch(readFileSync(executablePaths[0], "utf8"), /\bWriteBatch\b/);
});

function assertSyntheticGuardFailure(source: string, expectedToken: string): void {
  const filename = `synthetic-${expectedToken.replace(/[^A-Za-z0-9]+/g, "-")}.ts`;
  assert.throws(
    () => assertReadOnlyExecutableSource(filename, source),
    (error: unknown) => {
      assert.ok(error instanceof ReadOnlySourceSafetyError);
      assert.equal(error.filename, filename);
      assert.equal(error.token, expectedToken);
      assert.match(error.message, /Read-only safety error/);
      assert.ok(error.message.includes(filename));
      assert.ok(error.message.includes(expectedToken));
      return true;
    },
  );
}

const guardMutationCases: Array<[string, string, string]> = [
  ["DocumentReference.set", 'const ref = database.doc("x/y"); ref.set(data);', ".set()"],
  ["DocumentReference.create", 'const ref = database.doc("x/y"); ref.create(data);', ".create()"],
  ["DocumentReference.update", 'const ref = database.doc("x/y"); ref.update(data);', ".update()"],
  ["DocumentReference.delete", 'const ref = database.doc("x/y"); ref.delete();', ".delete()"],
  ["CollectionReference.add", 'const collectionRef = database.collection("x"); collectionRef.add(data);', ".add()"],
  ["Firestore.batch", "const writer = database.batch();", ".batch()"],
  ["batch.commit", "const writer = makeWriter(); writer.commit();", ".commit()"],
  ["general transaction", "const tx = database.transaction(callback);", ".transaction()"],
  ["runTransaction", "runTransaction(database, callback);", "runTransaction"],
  ["recursiveDelete", "database.recursiveDelete(ref);", "recursiveDelete"],
  ["collectionGroup", 'database.collectionGroup("members");', "collectionGroup"],
  ["WriteBatch", "let writer: WriteBatch;", "WriteBatch"],
  ["BulkWriter", "let writer: BulkWriter;", "BulkWriter"],
  ["Transaction", "let transaction: Transaction;", "Transaction"],
  ["FieldValue", "const timestamp = FieldValue.serverTimestamp();", "FieldValue"],
  ["setDoc", "setDoc(ref, data);", "setDoc"],
  ["addDoc", "addDoc(ref, data);", "addDoc"],
  ["updateDoc", "updateDoc(ref, data);", "updateDoc"],
  ["deleteDoc", "deleteDoc(ref);", "deleteDoc"],
  ["writeBatch", "writeBatch(database);", "writeBatch"],
  ["managed importDocuments", "admin.importDocuments(request);", "importDocuments"],
  ["managed exportDocuments", "admin.exportDocuments(request);", "exportDocuments"],
  ["Firebase Auth createUser", "auth.createUser(user);", "createUser"],
  ["Firebase Auth custom claims", "auth.setCustomUserClaims(uid, claims);", "setCustomUserClaims"],
  ["Firebase client Auth module", 'import "firebase/auth";', "firebase/auth"],
  ["Cloud Storage upload", 'bucket.upload("local-file");', "upload"],
  ["Cloud Storage write stream", "file.createWriteStream();", "createWriteStream"],
  ["Cloud Storage metadata write", "file.setMetadata(metadata);", "setMetadata"],
  ["Cloud Storage file save", "file.save(data);", ".save()"],
  ["Cloud Storage object copy", "file.copy(destination);", ".copy()"],
  ["Cloud Storage object move", "file.move(destination);", ".move()"],
  ["Cloud Storage object compose", "file.compose(parts);", ".compose()"],
  ["Cloud Storage public access mutation", "file.makePublic();", ".makePublic()"],
  ["Firebase client Storage module", 'import "firebase/storage";', "firebase/storage"],
  ["Google Cloud Storage module", 'import "@google-cloud/storage";', "@google-cloud/storage"],
  ["write after division expression", "const ratio = total / count; ref.set(data);", ".set()"],
  ["write inside template expression", "const value = `result: ${ref.update(data)}`;", ".update()"],
];

for (const [name, source, token] of guardMutationCases) {
  test(`81 mutation guard rejects ${name}`, () => assertSyntheticGuardFailure(source, token));
}

const safeGuardCases: Array<[string, string]> = [
  ["createHash", 'const digest = createHash("sha256");'],
  ["createSource", "const source = createSource(options);"],
  ["createFirestoreMembershipReadSource", "const source = createFirestoreMembershipReadSource(options);"],
  ["deleteApp", "await deleteApp(app);"],
  ["native Map.set", 'const values = new Map<string, string>(); values.set("key", "value");'],
  ["native Set.add", 'const seen = new Set<string>(); seen.add("value");'],
];

for (const [name, source] of safeGuardCases) {
  test(`82 safe-name regression permits ${name}`, () => {
    assert.doesNotThrow(() => assertReadOnlyExecutableSource(`safe-${name}.ts`, source));
  });
}

test("83 real adapter contains only the approved collection names", () => {
  const source = readFileSync(executablePaths[2], "utf8");
  const names = [...source.matchAll(/\.collection\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(names)].sort(), ["academies", "academy_invites", "members", "users"]);
});

test("83b real adapter applies exact field projections to every query", () => {
  const source = readFileSync(executablePaths[2], "utf8");
  for (const field of [
    "uid", "email", "requestedRole", "activeAcademyId", "approvalClaimId", "inviteCode",
  ]) assert.match(source, new RegExp(`"${field}"`));
  assert.equal([...source.matchAll(/\.select\(/g)].length, 4);
});

test("84 real adapter never uses a collection-group query", () => {
  assert.doesNotMatch(readFileSync(executablePaths[2], "utf8"), /collectionGroup/);
});

test("85 executable exporter has no Firebase Auth or Storage imports", () => {
  for (const path of executablePaths) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /from\s+["']firebase-admin\/(?:auth|storage)["']/);
    assert.doesNotThrow(() => assertReadOnlyExecutableSource(path, source));
  }
});

test("86 pure exporter core imports no Firebase module", () => {
  assert.doesNotMatch(readFileSync(executablePaths[0], "utf8"), /firebase(?:-admin)?\//);
});

test("87 CLI has no ADC environment or .firebaserc fallback", () => {
  const source = readFileSync(executablePaths[1], "utf8");
  assert.doesNotMatch(source, /applicationDefault|GOOGLE_APPLICATION_CREDENTIALS|\.firebaserc|process\.env/);
});

test("88 package scripts are offline-safe and contain no configured project", () => {
  const packageJson = JSON.parse(readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["test:membership-export"], "node --import tsx --test tests/membershipExportReadOnly.test.ts");
  assert.equal(packageJson.scripts["export:membership-planning"], "node --import tsx scripts/membershipExportReadOnly.ts");
  assert.doesNotMatch(packageJson.scripts["export:membership-planning"], /--project-id|--credentials|--output/);
});

test("89 IAM documentation requires viewer only and lists prohibited roles", () => {
  const documentation = readFileSync(join(REPOSITORY_ROOT, "docs", "READ_ONLY_MEMBERSHIP_EXPORT.md"), "utf8");
  for (const role of [
    "roles/datastore.viewer", "roles/datastore.user", "roles/datastore.owner",
    "roles/datastore.importExportAdmin", "roles/firebase.admin", "roles/firebase.developAdmin",
  ]) assert.match(documentation, new RegExp(role.replace(".", "\\.")));
  assert.match(documentation, /get.*list/s);
  assert.match(documentation, /create.*update.*delete.*import.*export/s);
});

test("90 documentation labels all future commands non-executed placeholders", () => {
  const documentation = readFileSync(join(REPOSITORY_ROOT, "docs", "READ_ONLY_MEMBERSHIP_EXPORT.md"), "utf8");
  const commandLines = documentation.split(/\r?\n/).filter((line) => /create service account|grant only|npm\.cmd run export/.test(line));
  assert.ok(commandLines.length >= 3);
  for (const line of commandLines) assert.match(line, /NON-EXECUTED PLACEHOLDER/);
});
