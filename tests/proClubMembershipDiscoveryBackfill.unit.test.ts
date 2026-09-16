import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface BackfillOptions {
  uid: string;
  clubId: string;
  dryRun?: boolean;
}

interface BackfillDependencies {
  app: { options?: { projectId?: unknown } };
  firestore: unknown;
  env: Record<string, string | undefined>;
}

interface BackfillModule {
  executeLocalProClubMembershipDiscoveryBackfill(
    options: BackfillOptions,
    dependencies: BackfillDependencies,
  ): Promise<{ dryRun: boolean }>;
}

async function loadBackfillModule(): Promise<BackfillModule> {
  const modulePath = "../scripts/backfillProClubMembershipDiscoveryLocal.ts";

  try {
    const loaded = await import(modulePath) as unknown as BackfillModule;
    assert.equal(
      typeof loaded.executeLocalProClubMembershipDiscoveryBackfill,
      "function",
      "Membership Discovery V1 backfill tool must export executeLocalProClubMembershipDiscoveryBackfill",
    );
    return loaded;
  } catch (error) {
    assert.fail(
      `Membership Discovery V1 backfill tool is not implemented yet: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

class FakeSnapshot {
  constructor(
    readonly id: string,
    private readonly value: unknown,
  ) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): unknown {
    return this.value;
  }
}

class FakeFirestore {
  readonly reads: string[] = [];
  readonly creates: Array<{ path: string; data: unknown }> = [];
  readonly forbiddenWrites: Array<{ method: string; path: string; data?: unknown }> = [];
  readonly docs = new Map<string, unknown>();

  constructor(readonly projectId = "futverse-d7872") {}

  collection(name: string) {
    return new FakeCollectionReference(this, name);
  }
}

class FakeCollectionReference {
  constructor(
    private readonly firestore: FakeFirestore,
    private readonly path: string,
  ) {}

  doc(id: string) {
    return new FakeDocumentReference(this.firestore, `${this.path}/${id}`);
  }
}

class FakeDocumentReference {
  readonly id: string;

  constructor(
    private readonly firestore: FakeFirestore,
    readonly path: string,
  ) {
    this.id = path.split("/").at(-1) ?? "";
  }

  collection(name: string) {
    return new FakeCollectionReference(this.firestore, `${this.path}/${name}`);
  }

  async get(): Promise<FakeSnapshot> {
    this.firestore.reads.push(this.path);
    return new FakeSnapshot(this.id, this.firestore.docs.get(this.path));
  }

  async create(data: unknown): Promise<void> {
    this.firestore.creates.push({ path: this.path, data });
    if (this.firestore.docs.has(this.path)) {
      throw new Error("ALREADY_EXISTS");
    }
    this.firestore.docs.set(this.path, data);
  }

  async set(data: unknown): Promise<void> {
    this.firestore.forbiddenWrites.push({ method: "set", path: this.path, data });
  }

  async update(data: unknown): Promise<void> {
    this.firestore.forbiddenWrites.push({ method: "update", path: this.path, data });
  }

  async delete(): Promise<void> {
    this.firestore.forbiddenWrites.push({ method: "delete", path: this.path });
  }
}

const UID = "user-backfill";
const CLUB = "club-alpha";
const POINTER_PATH = `users/${UID}/proClubMemberships/${CLUB}`;
const ENV = { FUTVERSE_LOCAL_OPERATOR_UID: "superadmin-local" };

function createCanonicalFirestore(): FakeFirestore {
  const firestore = new FakeFirestore();
  firestore.docs.set(`users/${UID}`, { status: "Active" });
  firestore.docs.set(`proClubs/${CLUB}`, {
    name: "Alpha United",
    level: "T3",
    status: "ACTIVE",
  });
  firestore.docs.set(`proClubs/${CLUB}/members/${UID}`, {
    authorizationRole: "MEMBER",
    status: "ACTIVE",
  });
  return firestore;
}

function dependencies(
  firestore: FakeFirestore,
  projectId = "futverse-d7872",
): BackfillDependencies {
  return {
    app: { options: { projectId } },
    firestore,
    env: ENV,
  };
}

test("Membership Discovery V1 backfill dry-run performs zero writes", async () => {
  const backfill = await loadBackfillModule();
  const firestore = createCanonicalFirestore();

  const result = await backfill.executeLocalProClubMembershipDiscoveryBackfill(
    { uid: UID, clubId: CLUB, dryRun: true },
    dependencies(firestore),
  );

  assert.equal(result.dryRun, true);
  assert.equal(firestore.creates.length, 0);
  assert.equal(firestore.forbiddenWrites.length, 0);
});

test("wrong project fails before any canonical read or write", async () => {
  const backfill = await loadBackfillModule();
  const firestore = createCanonicalFirestore();

  await assert.rejects(
    backfill.executeLocalProClubMembershipDiscoveryBackfill(
      { uid: UID, clubId: CLUB, dryRun: true },
      dependencies(firestore, "wrong-project"),
    ),
    /Project Pinning Violation/i,
  );

  assert.deepEqual(firestore.reads, []);
  assert.deepEqual(firestore.creates, []);
  assert.deepEqual(firestore.forbiddenWrites, []);
});

test("missing or inactive canonical user fails closed", async () => {
  const backfill = await loadBackfillModule();

  for (const userData of [undefined, { status: "Inactive" }]) {
    const firestore = createCanonicalFirestore();
    if (userData === undefined) firestore.docs.delete(`users/${UID}`);
    else firestore.docs.set(`users/${UID}`, userData);

    await assert.rejects(
      backfill.executeLocalProClubMembershipDiscoveryBackfill(
        { uid: UID, clubId: CLUB, dryRun: true },
        dependencies(firestore),
      ),
      /user|active|account/i,
    );

    assert.equal(firestore.creates.length, 0);
    assert.equal(firestore.forbiddenWrites.length, 0);
  }
});

test("missing canonical Pro Club membership fails closed", async () => {
  const backfill = await loadBackfillModule();
  const firestore = createCanonicalFirestore();
  firestore.docs.delete(`proClubs/${CLUB}/members/${UID}`);

  await assert.rejects(
    backfill.executeLocalProClubMembershipDiscoveryBackfill(
      { uid: UID, clubId: CLUB, dryRun: true },
      dependencies(firestore),
    ),
    /membership/i,
  );

  assert.equal(firestore.creates.length, 0);
  assert.equal(firestore.forbiddenWrites.length, 0);
});

test("mismatched or malformed existing discovery pointer fails closed", async () => {
  const backfill = await loadBackfillModule();

  for (const pointerData of [
    { schemaVersion: 1, clubId: "club-other" },
    { schemaVersion: 1, clubId: CLUB, status: "ACTIVE" },
  ]) {
    const firestore = createCanonicalFirestore();
    firestore.docs.set(POINTER_PATH, pointerData);

    await assert.rejects(
      backfill.executeLocalProClubMembershipDiscoveryBackfill(
        { uid: UID, clubId: CLUB, dryRun: true },
        dependencies(firestore),
      ),
      /pointer|discovery|malformed|integrity/i,
    );

    assert.equal(firestore.creates.length, 0);
    assert.equal(firestore.forbiddenWrites.length, 0);
  }
});

test("live backfill creates exactly one exact two-field pointer", async () => {
  const backfill = await loadBackfillModule();
  const firestore = createCanonicalFirestore();

  const result = await backfill.executeLocalProClubMembershipDiscoveryBackfill(
    { uid: UID, clubId: CLUB, dryRun: false },
    dependencies(firestore),
  );

  assert.equal(result.dryRun, false);
  assert.deepEqual(firestore.creates, [
    {
      path: POINTER_PATH,
      data: { schemaVersion: 1, clubId: CLUB },
    },
  ]);
  assert.deepEqual(firestore.forbiddenWrites, []);
});

test("backfill implementation is create-only with no update or delete write path", async () => {
  await loadBackfillModule();
  const source = readFileSync(
    "scripts/backfillProClubMembershipDiscoveryLocal.ts",
    "utf8",
  );

  assert.match(source, /\.create\s*\(/);
  assert.doesNotMatch(source, /\.set\s*\(/);
  assert.doesNotMatch(source, /\.update\s*\(/);
  assert.doesNotMatch(source, /\.delete\s*\(/);
  assert.doesNotMatch(source, /collectionGroup\s*\(/);
});
