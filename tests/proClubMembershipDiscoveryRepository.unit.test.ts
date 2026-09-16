import assert from "node:assert/strict";
import test from "node:test";

interface DiscoveryDocument {
  id: string;
  data: unknown;
}

interface DiscoveryReadOps {
  getCurrentUid(): string | null;
  readOwnMembershipDiscoveries(uid: string): Promise<readonly DiscoveryDocument[]>;
}

interface DiscoveryRepositoryModule {
  loadOwnProClubMembershipDiscoveries(
    uid: string,
    ops?: DiscoveryReadOps,
  ): Promise<Array<{ clubId: string }>>;
}

async function loadRepositoryModule(): Promise<DiscoveryRepositoryModule> {
  const modulePath = "../src/lib/firestore/proClubMembershipDiscoveryRepository.ts";

  try {
    const loaded = await import(modulePath) as unknown as DiscoveryRepositoryModule;
    assert.equal(
      typeof loaded.loadOwnProClubMembershipDiscoveries,
      "function",
      "Membership Discovery V1 repository must export loadOwnProClubMembershipDiscoveries",
    );
    return loaded;
  } catch (error) {
    assert.fail(
      `Membership Discovery V1 repository is not implemented yet: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function makeOps(options?: {
  currentUid?: string | null;
  documents?: readonly DiscoveryDocument[];
  onRead?: () => void;
}): DiscoveryReadOps {
  let currentUid = options?.currentUid ?? "user-discovery";

  return {
    getCurrentUid() {
      return currentUid;
    },
    async readOwnMembershipDiscoveries() {
      options?.onRead?.();
      return options?.documents ?? [];
    },
  };
}

test("Membership Discovery V1 repository contract", async (t) => {
  const repository = await loadRepositoryModule();

  await t.test("accepts exact schemaVersion 1 pointer with matching document id", async () => {
    const result = await repository.loadOwnProClubMembershipDiscoveries(
      "user-discovery",
      makeOps({
        documents: [
          {
            id: "club-alpha",
            data: { schemaVersion: 1, clubId: "club-alpha" },
          },
        ],
      }),
    );

    assert.deepEqual(result, [{ clubId: "club-alpha" }]);
  });

  await t.test("fails closed when pointer document id and clubId disagree", async () => {
    await assert.rejects(
      repository.loadOwnProClubMembershipDiscoveries(
        "user-discovery",
        makeOps({
          documents: [
            {
              id: "club-alpha",
              data: { schemaVersion: 1, clubId: "club-beta" },
            },
          ],
        }),
      ),
    );
  });

  await t.test("never exposes extra authorization fields as discovery authority", async () => {
    const result = await repository.loadOwnProClubMembershipDiscoveries(
      "user-discovery",
      makeOps({
        documents: [
          {
            id: "club-alpha",
            data: {
              schemaVersion: 1,
              clubId: "club-alpha",
              authorizationRole: "OWNER",
              staffRole: "HEAD_COACH",
              status: "ACTIVE",
            },
          },
        ],
      }),
    );

    assert.deepEqual(result, [{ clubId: "club-alpha" }]);
    assert.deepEqual(Object.keys(result[0] ?? {}).sort(), ["clubId"]);
  });

  await t.test("fails closed for malformed uid or malformed discovery document id", async () => {
    await assert.rejects(
      repository.loadOwnProClubMembershipDiscoveries(
        "bad/uid",
        makeOps(),
      ),
    );

    await assert.rejects(
      repository.loadOwnProClubMembershipDiscoveries(
        "user-discovery",
        makeOps({
          documents: [
            {
              id: "bad/club",
              data: { schemaVersion: 1, clubId: "bad/club" },
            },
          ],
        }),
      ),
    );
  });

  await t.test("fails safely when authenticated uid changes during the read", async () => {
    let currentUid: string | null = "user-discovery";

    const ops: DiscoveryReadOps = {
      getCurrentUid() {
        return currentUid;
      },
      async readOwnMembershipDiscoveries() {
        currentUid = "other-user";
        return [
          {
            id: "club-alpha",
            data: { schemaVersion: 1, clubId: "club-alpha" },
          },
        ];
      },
    };

    await assert.rejects(
      repository.loadOwnProClubMembershipDiscoveries(
        "user-discovery",
        ops,
      ),
    );
  });
});
