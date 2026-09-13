import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  executeLocalTechnicalGovernanceBootstrap,
  parseTechnicalGovernanceBootstrapArgs,
  TechnicalGovernanceBootstrapError,
  type LocalTechnicalGovernanceBootstrapOptions,
} from "../scripts/bootstrapProClubTechnicalGovernanceLocal.ts";
import {
  EXPECTED_PROJECT_ID,
  LOCAL_OPERATOR_ENV_KEY,
} from "../scripts/lib/localTrustedOperatorVerifier.ts";

type StoredDocument = Record<string, unknown>;

class FakeCollectionReference {
  readonly kind = "collection";

  constructor(readonly path: string) {}

  doc(id: string): FakeDocumentReference {
    return new FakeDocumentReference(`${this.path}/${id}`, id);
  }
}

class FakeDocumentReference {
  readonly kind = "document";

  constructor(
    readonly path: string,
    readonly id: string,
  ) {}

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(`${this.path}/${name}`);
  }
}

class FakeDocumentSnapshot {
  readonly exists: boolean;

  constructor(
    readonly id: string,
    private readonly value: StoredDocument | undefined,
  ) {
    this.exists = value !== undefined;
  }

  data(): StoredDocument | undefined {
    return this.value === undefined ? undefined : clone(this.value);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class InMemoryFirestore {
  readonly documents: Map<string, StoredDocument>;
  transactionCalls = 0;
  readonly committedCreatePaths: string[] = [];

  constructor(
    readonly projectId = EXPECTED_PROJECT_ID,
    initialData: Record<string, StoredDocument> = {},
  ) {
    this.documents = new Map(
      Object.entries(initialData).map(([path, value]) => [path, clone(value)]),
    );
  }

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(name);
  }

  async runTransaction<T>(
    callback: (transaction: {
      get(
        target: FakeDocumentReference | FakeCollectionReference,
      ): Promise<
        | FakeDocumentSnapshot
        | { docs: readonly FakeDocumentSnapshot[] }
      >;
      create(ref: FakeDocumentReference, data: StoredDocument): void;
    }) => Promise<T>,
  ): Promise<T> {
    this.transactionCalls += 1;
    const stagedCreates = new Map<string, StoredDocument>();
    const transaction = {
      get: async (
        target: FakeDocumentReference | FakeCollectionReference,
      ): Promise<
        FakeDocumentSnapshot | { docs: readonly FakeDocumentSnapshot[] }
      > => {
        if (target.kind === "document") {
          const staged = stagedCreates.get(target.path);
          return new FakeDocumentSnapshot(
            target.id,
            staged ?? this.documents.get(target.path),
          );
        }

        const prefix = `${target.path}/`;
        const docs = Array.from(this.documents.entries())
          .filter(([path]) => {
            if (!path.startsWith(prefix)) return false;
            return !path.slice(prefix.length).includes("/");
          })
          .sort(([left], [right]) => left.localeCompare(right))
          .map(
            ([path, value]) =>
              new FakeDocumentSnapshot(path.slice(prefix.length), value),
          );
        return { docs };
      },
      create: (ref: FakeDocumentReference, data: StoredDocument): void => {
        if (this.documents.has(ref.path) || stagedCreates.has(ref.path)) {
          throw new Error(`Document already exists: ${ref.path}`);
        }
        stagedCreates.set(ref.path, clone(data));
      },
    };

    const result = await callback(transaction);
    for (const [path, data] of stagedCreates) {
      this.documents.set(path, clone(data));
      this.committedCreatePaths.push(path);
    }
    return result;
  }
}

const OPERATOR_UID = "operator-admin";
const CLUB_ID = "club-alpha";
const CURRENT_PATH =
  `proClubs/${CLUB_ID}/technicalGovernance/current` as const;

const defaultOptions: LocalTechnicalGovernanceBootstrapOptions = {
  clubId: CLUB_ID,
  dryRun: false,
  jsonOutput: false,
};

function baseDocuments(): Record<string, StoredDocument> {
  return {
    [`users/${OPERATOR_UID}`]: {
      role: "SUPERADMIN",
      status: "ACTIVE",
    },
    [`proClubs/${CLUB_ID}`]: {
      name: "Club Alpha",
      level: "T1",
      status: "ACTIVE",
    },
  };
}

function addStaff(
  documents: Record<string, StoredDocument>,
  uid: string,
  staffRole: "TECHNICAL_DIRECTOR" | "HEAD_COACH",
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  membershipStatus: "ACTIVE" | "INACTIVE" | null = "ACTIVE",
): void {
  documents[`proClubs/${CLUB_ID}/staff/${uid}`] = { staffRole, status };
  if (membershipStatus !== null) {
    documents[`proClubs/${CLUB_ID}/members/${uid}`] = {
      authorizationRole: "MEMBER",
      status: membershipStatus,
    };
  }
}

function createStore(
  customize?: (documents: Record<string, StoredDocument>) => void,
  projectId = EXPECTED_PROJECT_ID,
): InMemoryFirestore {
  const documents = baseDocuments();
  customize?.(documents);
  return new InMemoryFirestore(projectId, documents);
}

function execute(
  store: InMemoryFirestore,
  options: Partial<LocalTechnicalGovernanceBootstrapOptions> = {},
  env: Record<string, string | undefined> = {
    [LOCAL_OPERATOR_ENV_KEY]: OPERATOR_UID,
  },
  appProjectId = EXPECTED_PROJECT_ID,
) {
  return executeLocalTechnicalGovernanceBootstrap(
    { ...defaultOptions, ...options },
    {
      app: { options: { projectId: appProjectId } },
      firestore: store as unknown as Firestore,
      env,
    },
  );
}

async function rejectsWithCode(
  operation: Promise<unknown>,
  code: TechnicalGovernanceBootstrapError["code"],
): Promise<void> {
  await assert.rejects(
    operation,
    (error) =>
      error instanceof TechnicalGovernanceBootstrapError &&
      error.code === code,
  );
}

test("project mismatch fails before any database work", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  await assert.rejects(execute(store, {}, undefined, "wrong-project"), {
    message: /Project Pinning Violation/,
  });
  assert.equal(store.transactionCalls, 0);
  assert.deepEqual(store.committedCreatePaths, []);
});

test("CLI accepts only club-id, dry-run, and json and rejects identity overrides", async () => {
  assert.deepEqual(
    parseTechnicalGovernanceBootstrapArgs([
      "--club-id",
      CLUB_ID,
      "--dry-run",
      "--json",
    ]),
    { clubId: CLUB_ID, dryRun: true, jsonOutput: true },
  );

  for (const flag of [
    "--operator",
    "--operator-uid",
    "--requester",
    "--requester-uid",
    "--superadmin",
    "--superadmin-uid",
    "--authority-uid",
    "--authority-role",
  ]) {
    assert.throws(
      () =>
        parseTechnicalGovernanceBootstrapArgs([
          "--club-id",
          CLUB_ID,
          flag,
          "injected-value",
        ]),
      /Security Violation/,
    );
  }

  const store = createStore((documents) => {
    addStaff(documents, "coach-one", "HEAD_COACH");
  });
  await assert.rejects(execute(store, {}, {}), /FUTVERSE_LOCAL_OPERATOR_UID/);
  assert.equal(store.transactionCalls, 0);
});

test("inactive and non-SUPERADMIN operators are denied with zero writes", async () => {
  for (const operatorData of [
    { role: "SUPERADMIN", status: "INACTIVE" },
    { role: "COACH", status: "ACTIVE" },
  ]) {
    const store = createStore((documents) => {
      documents[`users/${OPERATOR_UID}`] = operatorData;
      addStaff(documents, "coach-one", "HEAD_COACH");
    });
    await rejectsWithCode(execute(store), "UNAUTHORIZED_OPERATOR");
    assert.deepEqual(store.committedCreatePaths, []);
  }
});

test("missing operator document is denied with zero writes", async () => {
  const store = createStore((documents) => {
    delete documents[`users/${OPERATOR_UID}`];
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  await rejectsWithCode(execute(store), "UNAUTHORIZED_OPERATOR");
  assert.deepEqual(store.committedCreatePaths, []);
});

test("malformed club IDs are denied before database work", async () => {
  for (const clubId of ["", " club-alpha", "club-alpha ", "club/alpha"] ) {
    const store = createStore();
    await rejectsWithCode(execute(store, { clubId }), "INVALID_CLUB_ID");
    assert.equal(store.transactionCalls, 0);
  }
});

test("missing and inactive clubs fail closed", async () => {
  const missingStore = new InMemoryFirestore(EXPECTED_PROJECT_ID, {
    [`users/${OPERATOR_UID}`]: { role: "SUPERADMIN", status: "ACTIVE" },
  });
  await rejectsWithCode(execute(missingStore), "CLUB_MISSING");
  assert.deepEqual(missingStore.committedCreatePaths, []);

  const inactiveStore = createStore((documents) => {
    documents[`proClubs/${CLUB_ID}`].status = "INACTIVE";
  });
  await rejectsWithCode(execute(inactiveStore), "CLUB_INACTIVE");
  assert.deepEqual(inactiveStore.committedCreatePaths, []);
});

test("noncanonical Pro Club document fails closed with zero writes", async () => {
  const store = createStore((documents) => {
    documents[`proClubs/${CLUB_ID}`].unexpectedField = true;
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  await rejectsWithCode(execute(store), "CLUB_INVALID");
  assert.deepEqual(store.committedCreatePaths, []);
});

test("malformed staff fails closed before Head Coach fallback", async () => {
  const store = createStore((documents) => {
    documents[`proClubs/${CLUB_ID}/staff/director-malformed`] = {
      staffRole: "TECHNICAL_DIRECTOR",
      status: "ACTIVE",
      unexpectedField: true,
    };
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  await rejectsWithCode(execute(store), "STAFF_INVALID");
  assert.deepEqual(store.committedCreatePaths, []);
  assert.equal(store.documents.has(CURRENT_PATH), false);
});

test("malformed technical-looking role cannot be filtered out before canonical validation", async () => {
  const store = createStore((documents) => {
    documents[`proClubs/${CLUB_ID}/staff/director-malformed-role`] = {
      staffRole: "TECHNICAL_DIRECTOR ",
      status: "ACTIVE",
    };
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  await rejectsWithCode(execute(store), "STAFF_INVALID");
  assert.deepEqual(store.committedCreatePaths, []);
  assert.equal(store.documents.has(CURRENT_PATH), false);
});

test("malformed ACTIVE technical membership fails closed with zero writes", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "director-one", "TECHNICAL_DIRECTOR");
    documents[`proClubs/${CLUB_ID}/members/director-one`].unexpectedField =
      true;
  });

  await rejectsWithCode(execute(store), "MEMBERSHIP_INVALID");
  assert.deepEqual(store.committedCreatePaths, []);
});

test("exactly one ACTIVE Technical Director takes AUTO precedence", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "director-one", "TECHNICAL_DIRECTOR");
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  const result = await execute(store);
  assert.equal(result.status, "CREATED");
  assert.equal(result.authorityUid, "director-one");
  assert.equal(result.authorityRole, "TECHNICAL_DIRECTOR");
});

test("exactly one ACTIVE Head Coach wins when no Technical Director is active", async () => {
  const store = createStore((documents) => {
    addStaff(
      documents,
      "director-inactive",
      "TECHNICAL_DIRECTOR",
      "INACTIVE",
    );
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  const result = await execute(store);
  assert.equal(result.status, "CREATED");
  assert.equal(result.authorityUid, "coach-one");
  assert.equal(result.authorityRole, "HEAD_COACH");
});

test("inactive Technical Director without membership does not block Head Coach", async () => {
  const store = createStore((documents) => {
    addStaff(
      documents,
      "director-inactive",
      "TECHNICAL_DIRECTOR",
      "INACTIVE",
      null,
    );
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  const result = await execute(store);
  assert.equal(result.status, "CREATED");
  assert.equal(result.authorityUid, "coach-one");
  assert.equal(result.authorityRole, "HEAD_COACH");
});

test("inactive Technical Director with inactive membership does not block Head Coach", async () => {
  const store = createStore((documents) => {
    addStaff(
      documents,
      "director-inactive",
      "TECHNICAL_DIRECTOR",
      "INACTIVE",
      "INACTIVE",
    );
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  const result = await execute(store);
  assert.equal(result.status, "CREATED");
  assert.equal(result.authorityUid, "coach-one");
  assert.equal(result.authorityRole, "HEAD_COACH");
});

test("multiple ACTIVE Technical Directors fail AMBIGUOUS with zero writes", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "director-one", "TECHNICAL_DIRECTOR");
    addStaff(documents, "director-two", "TECHNICAL_DIRECTOR");
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  await rejectsWithCode(execute(store), "AUTHORITY_AMBIGUOUS");
  assert.deepEqual(store.committedCreatePaths, []);
});

test("multiple ACTIVE Head Coaches without a Technical Director fail AMBIGUOUS", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "coach-one", "HEAD_COACH");
    addStaff(documents, "coach-two", "HEAD_COACH");
  });

  await rejectsWithCode(execute(store), "AUTHORITY_AMBIGUOUS");
  assert.deepEqual(store.committedCreatePaths, []);
});

test("technical staff without a canonical ACTIVE membership fail closed", async () => {
  for (const membershipStatus of [null, "INACTIVE"] as const) {
    const store = createStore((documents) => {
      addStaff(
        documents,
        "director-one",
        "TECHNICAL_DIRECTOR",
        "ACTIVE",
        membershipStatus,
      );
      addStaff(documents, "coach-one", "HEAD_COACH");
    });

    await rejectsWithCode(execute(store), "MEMBERSHIP_INVALID");
    assert.deepEqual(store.committedCreatePaths, []);
  }
});

test("missing technical authority fails closed with zero writes", async () => {
  const store = createStore();
  await rejectsWithCode(execute(store), "AUTHORITY_MISSING");
  assert.deepEqual(store.committedCreatePaths, []);
});

test("absent current document creates exactly the canonical four-field value", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  const result = await execute(store);
  assert.equal(result.status, "CREATED");
  assert.deepEqual(store.committedCreatePaths, [CURRENT_PATH]);
  assert.deepEqual(store.documents.get(CURRENT_PATH), {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: "coach-one",
    authorityRole: "HEAD_COACH",
  });
  assert.deepEqual(
    Object.keys(store.documents.get(CURRENT_PATH) ?? {}).sort(),
    ["authorityRole", "authorityUid", "schemaVersion", "status"],
  );
});

test("identical valid current document returns NOOP with zero writes", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "coach-one", "HEAD_COACH");
    documents[CURRENT_PATH] = {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: "coach-one",
      authorityRole: "HEAD_COACH",
    };
  });

  const before = clone(store.documents.get(CURRENT_PATH));
  const result = await execute(store);
  assert.equal(result.status, "NOOP");
  assert.deepEqual(store.committedCreatePaths, []);
  assert.deepEqual(store.documents.get(CURRENT_PATH), before);
});

test("mismatched current document fails CONFLICT and is never overwritten", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "coach-one", "HEAD_COACH");
    addStaff(documents, "coach-two", "HEAD_COACH", "INACTIVE");
    documents[CURRENT_PATH] = {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: "coach-two",
      authorityRole: "HEAD_COACH",
    };
  });
  const before = clone(store.documents.get(CURRENT_PATH));

  await rejectsWithCode(execute(store), "CURRENT_CONFLICT");
  assert.deepEqual(store.committedCreatePaths, []);
  assert.deepEqual(store.documents.get(CURRENT_PATH), before);
});

test("malformed current document fails CONFLICT and is never repaired", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "coach-one", "HEAD_COACH");
    documents[CURRENT_PATH] = {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: "coach-one",
      authorityRole: "HEAD_COACH",
      updatedAt: "forbidden-extra-field",
    };
  });
  const before = clone(store.documents.get(CURRENT_PATH));

  await rejectsWithCode(execute(store), "CURRENT_CONFLICT");
  assert.deepEqual(store.committedCreatePaths, []);
  assert.deepEqual(store.documents.get(CURRENT_PATH), before);
});

test("dry-run traverses canonical gates and performs zero writes", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "coach-one", "HEAD_COACH");
  });

  const result = await execute(store, { dryRun: true });
  assert.equal(result.status, "DRY_RUN");
  if (result.dryRun) assert.equal(result.wouldStatus, "CREATED");
  assert.equal(store.transactionCalls, 1);
  assert.deepEqual(store.committedCreatePaths, []);
  assert.equal(store.documents.has(CURRENT_PATH), false);
});

test("unknown CLI flags fail closed", () => {
  assert.throws(
    () =>
      parseTechnicalGovernanceBootstrapArgs([
        "--club-id",
        CLUB_ID,
        "--unknown-option",
      ]),
    /Unknown or unrecognized flag/,
  );
});

test("dry-run reports NOOP for an identical current document without writing", async () => {
  const store = createStore((documents) => {
    addStaff(documents, "coach-one", "HEAD_COACH");
    documents[CURRENT_PATH] = {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: "coach-one",
      authorityRole: "HEAD_COACH",
    };
  });
  const before = clone(store.documents.get(CURRENT_PATH));

  const result = await execute(store, { dryRun: true });
  assert.equal(result.status, "DRY_RUN");
  if (result.dryRun) assert.equal(result.wouldStatus, "NOOP");
  assert.deepEqual(store.committedCreatePaths, []);
  assert.deepEqual(store.documents.get(CURRENT_PATH), before);
});
