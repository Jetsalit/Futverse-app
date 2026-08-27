import test from "node:test";
import assert from "node:assert/strict";

import {
  FUTID_REGISTRY_COLLECTION,
  ISSUED_FUTID_MAX_LENGTH,
  PLAYER_IDENTITY_COLLECTION,
  PLAYER_IDENTITY_SCHEMA_VERSION,
  isExactPlayerKey,
  isIssuedFutIdV1,
  isPlayerIdentitySource,
  validatePlayerIdentityIssuance,
} from "../src/lib/playerIdentityFoundation";

test(
  "1. foundation exposes frozen collection and schema constants",
  () => {
    assert.equal(
      PLAYER_IDENTITY_SCHEMA_VERSION,
      1,
    );

    assert.equal(
      PLAYER_IDENTITY_COLLECTION,
      "playerIdentities",
    );

    assert.equal(
      FUTID_REGISTRY_COLLECTION,
      "futIdRegistry",
    );

    assert.equal(
      ISSUED_FUTID_MAX_LENGTH,
      64,
    );
  },
);

test(
  "2. canonical issued FUTID is accepted",
  () => {
    assert.equal(
      isIssuedFutIdV1("FUT-26-AAA001"),
      true,
    );

    assert.equal(
      isIssuedFutIdV1("FUT-000001"),
      true,
    );
  },
);

test(
  "3. lowercase FUTID is rejected without normalization",
  () => {
    assert.equal(
      isIssuedFutIdV1("fut-26-aaa001"),
      false,
    );
  },
);

test(
  "4. malformed FUTID separators are rejected",
  () => {
    assert.equal(
      isIssuedFutIdV1("FUT--AAA001"),
      false,
    );

    assert.equal(
      isIssuedFutIdV1("FUT-AAA001-"),
      false,
    );
  },
);

test(
  "5. FUTID whitespace and slash are rejected",
  () => {
    assert.equal(
      isIssuedFutIdV1(" FUT-26-AAA001"),
      false,
    );

    assert.equal(
      isIssuedFutIdV1("FUT-26/AAA001"),
      false,
    );
  },
);

test(
  "6. FUTID exactly 64 characters may be valid",
  () => {
    const value =
      "FUT-" + "A".repeat(60);

    assert.equal(
      value.length,
      64,
    );

    assert.equal(
      isIssuedFutIdV1(value),
      true,
    );
  },
);

test(
  "7. FUTID over 64 characters is rejected",
  () => {
    const value =
      "FUT-" + "A".repeat(61);

    assert.equal(
      value.length,
      65,
    );

    assert.equal(
      isIssuedFutIdV1(value),
      false,
    );
  },
);

test(
  "8. exact playerKey is accepted",
  () => {
    assert.equal(
      isExactPlayerKey("player-key-a"),
      true,
    );
  },
);

test(
  "9. blank or whitespace playerKey is rejected",
  () => {
    assert.equal(
      isExactPlayerKey(""),
      false,
    );

    assert.equal(
      isExactPlayerKey(" player-key-a "),
      false,
    );
  },
);

test(
  "10. slash-containing playerKey is rejected",
  () => {
    assert.equal(
      isExactPlayerKey("player/key"),
      false,
    );
  },
);

test(
  "11. valid issuance sources are accepted",
  () => {
    assert.equal(
      isPlayerIdentitySource(
        "SUPERADMIN_ISSUANCE",
      ),
      true,
    );

    assert.equal(
      isPlayerIdentitySource(
        "LEGACY_MIGRATION",
      ),
      true,
    );
  },
);

test(
  "12. unknown issuance source is rejected",
  () => {
    assert.equal(
      isPlayerIdentitySource(
        "ADMIN_IMPORT",
      ),
      false,
    );
  },
);

test(
  "13. valid issuance input produces exact canonical contract",
  () => {
    const result =
      validatePlayerIdentityIssuance({
        playerKey: "player-key-a",
        futId: "FUT-26-AAA001",
        source: "SUPERADMIN_ISSUANCE",
      });

    assert.deepEqual(
      result,
      {
        ok: true,
        value: {
          schemaVersion: 1,
          playerKey: "player-key-a",
          futId: "FUT-26-AAA001",
          source: "SUPERADMIN_ISSUANCE",
        },
      },
    );
  },
);

test(
  "14. issuance validation performs no normalization",
  () => {
    const result =
      validatePlayerIdentityIssuance({
        playerKey: "player-key-a",
        futId: "fut-26-aaa001",
        source: "SUPERADMIN_ISSUANCE",
      });

    assert.equal(
      result.ok,
      false,
    );
  },
);

test(
  "15. issuance input rejects unknown fields",
  () => {
    const result =
      validatePlayerIdentityIssuance({
        playerKey: "player-key-a",
        futId: "FUT-26-AAA001",
        source: "SUPERADMIN_ISSUANCE",
        unexpected: true,
      });

    assert.equal(
      result.ok,
      false,
    );

    if (!result.ok) {
      assert.ok(
        result.errors.includes(
          "Issuance input must contain exactly playerKey, futId and source.",
        ),
      );
    }
  },
);

test(
  "16. non-object issuance input fails closed",
  () => {
    for (
      const value of
      [
        null,
        undefined,
        "",
        [],
        123,
      ]
    ) {
      const result =
        validatePlayerIdentityIssuance(value);

      assert.equal(
        result.ok,
        false,
      );
    }
  },
);

test(
  "17. invalid playerKey is reported",
  () => {
    const result =
      validatePlayerIdentityIssuance({
        playerKey: " bad-key ",
        futId: "FUT-26-AAA001",
        source: "SUPERADMIN_ISSUANCE",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (!result.ok) {
      assert.ok(
        result.errors.includes(
          "Invalid playerKey.",
        ),
      );
    }
  },
);

test(
  "18. invalid FUTID is reported",
  () => {
    const result =
      validatePlayerIdentityIssuance({
        playerKey: "player-key-a",
        futId: "FUT--BAD",
        source: "SUPERADMIN_ISSUANCE",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (!result.ok) {
      assert.ok(
        result.errors.includes(
          "Invalid issued FUTID.",
        ),
      );
    }
  },
);

test(
  "19. invalid source is reported",
  () => {
    const result =
      validatePlayerIdentityIssuance({
        playerKey: "player-key-a",
        futId: "FUT-26-AAA001",
        source: "ADMIN_IMPORT",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (!result.ok) {
      assert.ok(
        result.errors.includes(
          "Invalid Player identity source.",
        ),
      );
    }
  },
);

test(
  "20. multiple invalid fields are all reported",
  () => {
    const result =
      validatePlayerIdentityIssuance({
        playerKey: " bad/key ",
        futId: "bad",
        source: "BAD_SOURCE",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (!result.ok) {
      assert.ok(
        result.errors.includes(
          "Invalid playerKey.",
        ),
      );

      assert.ok(
        result.errors.includes(
          "Invalid issued FUTID.",
        ),
      );

      assert.ok(
        result.errors.includes(
          "Invalid Player identity source.",
        ),
      );
    }
  },
);