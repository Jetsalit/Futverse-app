import assert from "node:assert/strict";
import test from "node:test";

import { PLAYER_POSITION_CODES } from "../src/lib/playerPositionSelection";

import {
  MAX_ROLE_SUMMARY_LENGTH,
  MAX_SECONDARY_ROLES,
  MAX_STYLE_TRAITS,
  PLAYER_ROLE_ASSESSMENT_TYPES,
  PLAYER_ROLE_CODES,
  PLAYER_ROLE_REASONS,
  PLAYER_ROLE_SCHEMA_VERSION,
  PLAYER_STYLE_TRAIT_CODES,
  isPlayerRoleCode,
  isPlayerStyleTraitCode,
  isRoleCompatibleWithPosition,
  validatePlayerRoleAssessmentInput,
} from "../src/lib/playerRoleStyleFoundation";

test(
  "1. V1 schema and assessment authority are exact",
  () => {
    assert.equal(
      PLAYER_ROLE_SCHEMA_VERSION,
      1,
    );

    assert.deepEqual(
      PLAYER_ROLE_ASSESSMENT_TYPES,
      [
        "ORGANIZATION",
      ],
    );

    assert.deepEqual(
      PLAYER_ROLE_REASONS,
      [
        "INITIAL",
        "PERIODIC_REVIEW",
        "ROLE_CHANGE",
        "CORRECTION",
      ],
    );
  },
);

test(
  "2. canonical Role vocabulary is exact",
  () => {
    assert.deepEqual(
      PLAYER_ROLE_CODES,
      [
        "SHOT_STOPPER",
        "SWEEPER_KEEPER",
        "BUILD_UP_KEEPER",

        "FULL_BACK",
        "INVERTED_FULL_BACK",
        "WING_BACK",

        "STOPPER",
        "COVER_DEFENDER",
        "BALL_PLAYING_DEFENDER",
        "NO_NONSENSE_DEFENDER",

        "ANCHOR",
        "BALL_WINNING_MIDFIELDER",
        "DEEP_LYING_PLAYMAKER",
        "BOX_TO_BOX_MIDFIELDER",
        "CENTRAL_PLAYMAKER",
        "ADVANCED_PLAYMAKER",
        "WIDE_MIDFIELDER",

        "TOUCHLINE_WINGER",
        "INVERTED_WINGER",
        "INSIDE_FORWARD",

        "SHADOW_STRIKER",
        "FALSE_NINE",
        "TARGET_FORWARD",
        "PRESSING_FORWARD",
        "POACHER",
        "COMPLETE_FORWARD",
      ],
    );
  },
);

test(
  "3. Role recognition is exact and never normalizes aliases",
  () => {
    for (const role of PLAYER_ROLE_CODES) {
      assert.equal(
        isPlayerRoleCode(role),
        true,
      );
    }

    assert.equal(
      isPlayerRoleCode(
        "ball_playing_defender",
      ),
      false,
    );

    assert.equal(
      isPlayerRoleCode(
        " BALL_PLAYING_DEFENDER ",
      ),
      false,
    );

    assert.equal(
      isPlayerRoleCode(
        "Ball Playing Defender",
      ),
      false,
    );

    assert.equal(
      isPlayerRoleCode(
        "Striker",
      ),
      false,
    );
  },
);

test(
  "4. canonical Style Trait vocabulary is exact",
  () => {
    assert.deepEqual(
      PLAYER_STYLE_TRAIT_CODES,
      [
        "BUILD_UP_INVOLVEMENT",
        "PROGRESSIVE_PASSING",
        "LINE_BREAKING_PASSING",
        "SWITCHING_PLAY",
        "BALL_CARRYING",
        "TEMPO_CONTROL",
        "LINK_PLAY",
        "FINAL_THIRD_CREATION",
        "ONE_V_ONE_ATTACKING",
        "RUNNING_IN_BEHIND",
        "BOX_PRESENCE",
        "WIDTH_HOLDING",
        "INVERTED_MOVEMENT",
        "FRONT_FOOT_DEFENDING",
        "POSITIONAL_COVER",
        "INTERCEPTION_FOCUS",
        "PRESSING",
        "COUNTER_PRESSING",
        "DUEL_ENGAGEMENT",
        "AERIAL_DUEL_FOCUS",
        "BOX_DEFENDING",
        "RECOVERY_RUNNING",
        "TRANSITION_ATTACKING",
        "TRANSITION_RECOVERY",
      ],
    );

    for (
      const trait of
      PLAYER_STYLE_TRAIT_CODES
    ) {
      assert.equal(
        isPlayerStyleTraitCode(trait),
        true,
      );
    }

    assert.equal(
      isPlayerStyleTraitCode(
        "progressive_passing",
      ),
      false,
    );

    assert.equal(
      isPlayerStyleTraitCode(
        "Good Passing",
      ),
      false,
    );
  },
);

test(
  "5. V1 limits are frozen",
  () => {
    assert.equal(
      MAX_SECONDARY_ROLES,
      2,
    );

    assert.equal(
      MAX_STYLE_TRAITS,
      6,
    );

    assert.equal(
      MAX_ROLE_SUMMARY_LENGTH,
      500,
    );
  },
);

test(
  "6. representative Position-to-Role compatibility is explicit",
  () => {
    assert.equal(
      isRoleCompatibleWithPosition(
        "GK",
        "SWEEPER_KEEPER",
      ),
      true,
    );

    assert.equal(
      isRoleCompatibleWithPosition(
        "GK",
        "BALL_PLAYING_DEFENDER",
      ),
      false,
    );

    assert.equal(
      isRoleCompatibleWithPosition(
        "CB",
        "BALL_PLAYING_DEFENDER",
      ),
      true,
    );

    assert.equal(
      isRoleCompatibleWithPosition(
        "CB",
        "DEEP_LYING_PLAYMAKER",
      ),
      false,
    );

    assert.equal(
      isRoleCompatibleWithPosition(
        "DM",
        "DEEP_LYING_PLAYMAKER",
      ),
      true,
    );

    assert.equal(
      isRoleCompatibleWithPosition(
        "CM",
        "BOX_TO_BOX_MIDFIELDER",
      ),
      true,
    );

    assert.equal(
      isRoleCompatibleWithPosition(
        "AM",
        "ADVANCED_PLAYMAKER",
      ),
      true,
    );

    assert.equal(
      isRoleCompatibleWithPosition(
        "LM",
        "WIDE_MIDFIELDER",
      ),
      true,
    );

    assert.equal(
      isRoleCompatibleWithPosition(
        "LW",
        "INSIDE_FORWARD",
      ),
      true,
    );

    assert.equal(
      isRoleCompatibleWithPosition(
        "ST",
        "COMPLETE_FORWARD",
      ),
      true,
    );

    assert.equal(
      isRoleCompatibleWithPosition(
        "ST",
        "SWEEPER_KEEPER",
      ),
      false,
    );
  },
);

test(
  "7. one canonical Organization assessment is valid",
  () => {
    const result =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",

        positionContext:
          "CB",

        primaryRole:
          "BALL_PLAYING_DEFENDER",

        secondaryRoles: [
          "COVER_DEFENDER",
        ],

        styleTraits: [
          "BUILD_UP_INVOLVEMENT",
          "PROGRESSIVE_PASSING",
          "FRONT_FOOT_DEFENDING",
        ],

        summary:
          "Builds possession from the back and steps forward defensively.",

        effectiveDate:
          "2026-08-29",

        reason:
          "INITIAL",
      });

    assert.equal(
      result.ok,
      true,
    );

    if (!result.ok) {
      return;
    }

    assert.deepEqual(
      result.value,
      {
        schemaVersion: 1,

        assessmentType:
          "ORGANIZATION",

        positionContext:
          "CB",

        primaryRole:
          "BALL_PLAYING_DEFENDER",

        secondaryRoles: [
          "COVER_DEFENDER",
        ],

        styleTraits: [
          "BUILD_UP_INVOLVEMENT",
          "PROGRESSIVE_PASSING",
          "FRONT_FOOT_DEFENDING",
        ],

        summary:
          "Builds possession from the back and steps forward defensively.",

        effectiveDate:
          "2026-08-29",

        reason:
          "INITIAL",
      },
    );
  },
);

test(
  "8. no Role may be inferred from Position",
  () => {
    const result =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",

        positionContext:
          "CB",

        primaryRole:
          "",

        secondaryRoles:
          [],

        styleTraits:
          [],

        summary:
          "",

        effectiveDate:
          "2026-08-29",

        reason:
          "INITIAL",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (result.ok) {
      return;
    }

    assert.equal(
      result.errors.includes(
        "PRIMARY_ROLE_REQUIRED",
      ),
      true,
    );
  },
);

test(
  "9. unknown or malformed Position and Role values fail closed",
  () => {
    const result =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",

        positionContext:
          "Centre Back",

        primaryRole:
          "Ball Playing Defender",

        secondaryRoles:
          [],

        styleTraits:
          [],

        summary:
          "",

        effectiveDate:
          "2026-08-29",

        reason:
          "INITIAL",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (result.ok) {
      return;
    }

    assert.equal(
      result.errors.includes(
        "POSITION_CONTEXT_INVALID",
      ),
      true,
    );

    assert.equal(
      result.errors.includes(
        "PRIMARY_ROLE_INVALID",
      ),
      true,
    );
  },
);

test(
  "10. incompatible primary Role is rejected rather than replaced",
  () => {
    const result =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",

        positionContext:
          "GK",

        primaryRole:
          "POACHER",

        secondaryRoles:
          [],

        styleTraits:
          [],

        summary:
          "",

        effectiveDate:
          "2026-08-29",

        reason:
          "INITIAL",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (result.ok) {
      return;
    }

    assert.equal(
      result.errors.includes(
        "PRIMARY_ROLE_POSITION_INCOMPATIBLE",
      ),
      true,
    );
  },
);

test(
  "11. secondary Roles are bounded, distinct and cannot repeat primary Role",
  () => {
    const repeatedPrimary =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "CB",
        primaryRole:
          "BALL_PLAYING_DEFENDER",
        secondaryRoles: [
          "BALL_PLAYING_DEFENDER",
        ],
        styleTraits:
          [],
        summary:
          "",
        effectiveDate:
          "2026-08-29",
        reason:
          "INITIAL",
      });

    assert.equal(
      repeatedPrimary.ok,
      false,
    );

    if (!repeatedPrimary.ok) {
      assert.equal(
        repeatedPrimary.errors.includes(
          "PRIMARY_ROLE_DUPLICATED_IN_SECONDARY",
        ),
        true,
      );
    }


    const duplicatedSecondary =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "CB",
        primaryRole:
          "BALL_PLAYING_DEFENDER",
        secondaryRoles: [
          "STOPPER",
          "STOPPER",
        ],
        styleTraits:
          [],
        summary:
          "",
        effectiveDate:
          "2026-08-29",
        reason:
          "INITIAL",
      });

    assert.equal(
      duplicatedSecondary.ok,
      false,
    );

    if (!duplicatedSecondary.ok) {
      assert.equal(
        duplicatedSecondary.errors.includes(
          "DUPLICATE_SECONDARY_ROLE",
        ),
        true,
      );
    }


    const tooMany =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "CB",
        primaryRole:
          "BALL_PLAYING_DEFENDER",
        secondaryRoles: [
          "STOPPER",
          "COVER_DEFENDER",
          "NO_NONSENSE_DEFENDER",
        ],
        styleTraits:
          [],
        summary:
          "",
        effectiveDate:
          "2026-08-29",
        reason:
          "INITIAL",
      });

    assert.equal(
      tooMany.ok,
      false,
    );

    if (!tooMany.ok) {
      assert.equal(
        tooMany.errors.includes(
          "TOO_MANY_SECONDARY_ROLES",
        ),
        true,
      );
    }
  },
);

test(
  "12. incompatible secondary Roles fail closed",
  () => {
    const result =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",

        positionContext:
          "CB",

        primaryRole:
          "BALL_PLAYING_DEFENDER",

        secondaryRoles: [
          "POACHER",
        ],

        styleTraits:
          [],

        summary:
          "",

        effectiveDate:
          "2026-08-29",

        reason:
          "INITIAL",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (result.ok) {
      return;
    }

    assert.equal(
      result.errors.includes(
        "SECONDARY_ROLE_POSITION_INCOMPATIBLE",
      ),
      true,
    );
  },
);

test(
  "13. Style Traits are bounded, canonical and distinct",
  () => {
    const duplicate =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "LW",
        primaryRole:
          "INSIDE_FORWARD",
        secondaryRoles:
          [],
        styleTraits: [
          "ONE_V_ONE_ATTACKING",
          "ONE_V_ONE_ATTACKING",
        ],
        summary:
          "",
        effectiveDate:
          "2026-08-29",
        reason:
          "INITIAL",
      });

    assert.equal(
      duplicate.ok,
      false,
    );

    if (!duplicate.ok) {
      assert.equal(
        duplicate.errors.includes(
          "DUPLICATE_STYLE_TRAIT",
        ),
        true,
      );
    }


    const unknown =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "LW",
        primaryRole:
          "INSIDE_FORWARD",
        secondaryRoles:
          [],
        styleTraits: [
          "GOOD_DRIBBLER",
        ],
        summary:
          "",
        effectiveDate:
          "2026-08-29",
        reason:
          "INITIAL",
      });

    assert.equal(
      unknown.ok,
      false,
    );

    if (!unknown.ok) {
      assert.equal(
        unknown.errors.includes(
          "STYLE_TRAIT_INVALID",
        ),
        true,
      );
    }


    const tooMany =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "LW",
        primaryRole:
          "INSIDE_FORWARD",
        secondaryRoles:
          [],
        styleTraits: [
          "BUILD_UP_INVOLVEMENT",
          "PROGRESSIVE_PASSING",
          "BALL_CARRYING",
          "FINAL_THIRD_CREATION",
          "ONE_V_ONE_ATTACKING",
          "RUNNING_IN_BEHIND",
          "BOX_PRESENCE",
        ],
        summary:
          "",
        effectiveDate:
          "2026-08-29",
        reason:
          "INITIAL",
      });

    assert.equal(
      tooMany.ok,
      false,
    );

    if (!tooMany.ok) {
      assert.equal(
        tooMany.errors.includes(
          "TOO_MANY_STYLE_TRAITS",
        ),
        true,
      );
    }
  },
);

test(
  "14. assessment type and reason are strict canonical values",
  () => {
    const result =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "PLAYER_SELF",

        positionContext:
          "ST",

        primaryRole:
          "PRESSING_FORWARD",

        secondaryRoles:
          [],

        styleTraits:
          [],

        summary:
          "",

        effectiveDate:
          "2026-08-29",

        reason:
          "EDIT",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (result.ok) {
      return;
    }

    assert.equal(
      result.errors.includes(
        "ASSESSMENT_TYPE_INVALID",
      ),
      true,
    );

    assert.equal(
      result.errors.includes(
        "REASON_INVALID",
      ),
      true,
    );
  },
);

test(
  "15. effectiveDate is strict valid YYYY-MM-DD",
  () => {
    for (
      const effectiveDate of [
        "29/08/2026",
        "2026-8-29",
        "2026-02-30",
        " 2026-08-29 ",
      ]
    ) {
      const result =
        validatePlayerRoleAssessmentInput({
          assessmentType:
            "ORGANIZATION",
          positionContext:
            "ST",
          primaryRole:
            "PRESSING_FORWARD",
          secondaryRoles:
            [],
          styleTraits:
            [],
          summary:
            "",
          effectiveDate,
          reason:
            "INITIAL",
        });

      assert.equal(
        result.ok,
        false,
      );

      if (!result.ok) {
        assert.equal(
          result.errors.includes(
            "EFFECTIVE_DATE_INVALID",
          ),
          true,
        );
      }
    }
  },
);

test(
  "16. summary is bounded and is never silently trimmed",
  () => {
    const leadingWhitespace =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "CM",
        primaryRole:
          "CENTRAL_PLAYMAKER",
        secondaryRoles:
          [],
        styleTraits:
          [],
        summary:
          " summary",
        effectiveDate:
          "2026-08-29",
        reason:
          "INITIAL",
      });

    assert.equal(
      leadingWhitespace.ok,
      false,
    );

    if (!leadingWhitespace.ok) {
      assert.equal(
        leadingWhitespace.errors.includes(
          "SUMMARY_INVALID",
        ),
        true,
      );
    }


    const oversized =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "CM",
        primaryRole:
          "CENTRAL_PLAYMAKER",
        secondaryRoles:
          [],
        styleTraits:
          [],
        summary:
          "x".repeat(
            MAX_ROLE_SUMMARY_LENGTH + 1,
          ),
        effectiveDate:
          "2026-08-29",
        reason:
          "INITIAL",
      });

    assert.equal(
      oversized.ok,
      false,
    );

    if (!oversized.ok) {
      assert.equal(
        oversized.errors.includes(
          "SUMMARY_INVALID",
        ),
        true,
      );
    }
  },
);

test(
  "17. exact input shape rejects unknown fields",
  () => {
    const result =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",

        positionContext:
          "ST",

        primaryRole:
          "PRESSING_FORWARD",

        secondaryRoles:
          [],

        styleTraits:
          [],

        summary:
          "",

        effectiveDate:
          "2026-08-29",

        reason:
          "INITIAL",

        score:
          99,
      });

    assert.equal(
      result.ok,
      false,
    );

    if (result.ok) {
      return;
    }

    assert.equal(
      result.errors.includes(
        "UNKNOWN_FIELDS",
      ),
      true,
    );
  },
);

test(
  "18. non-object input and malformed collection fields fail closed",
  () => {
    const notObject =
      validatePlayerRoleAssessmentInput(
        null,
      );

    assert.equal(
      notObject.ok,
      false,
    );

    if (!notObject.ok) {
      assert.equal(
        notObject.errors.includes(
          "INPUT_NOT_OBJECT",
        ),
        true,
      );
    }


    const malformedCollections =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "CB",
        primaryRole:
          "BALL_PLAYING_DEFENDER",
        secondaryRoles:
          "STOPPER",
        styleTraits:
          "PROGRESSIVE_PASSING",
        summary:
          "",
        effectiveDate:
          "2026-08-29",
        reason:
          "INITIAL",
      });

    assert.equal(
      malformedCollections.ok,
      false,
    );

    if (!malformedCollections.ok) {
      assert.equal(
        malformedCollections.errors.includes(
          "SECONDARY_ROLES_NOT_ARRAY",
        ),
        true,
      );

      assert.equal(
        malformedCollections.errors.includes(
          "STYLE_TRAITS_NOT_ARRAY",
        ),
        true,
      );
    }
  },
);

test("19. complete Role Position compatibility matrix is frozen", () => {
  const expectedCompatibility: Record<string, readonly string[]> = {
    SHOT_STOPPER: ["GK"],
    SWEEPER_KEEPER: ["GK"],
    BUILD_UP_KEEPER: ["GK"],

    FULL_BACK: ["LB", "RB"],
    INVERTED_FULL_BACK: ["LB", "LWB", "RB", "RWB"],
    WING_BACK: ["LB", "LWB", "RB", "RWB"],

    STOPPER: ["CB"],
    COVER_DEFENDER: ["CB"],
    BALL_PLAYING_DEFENDER: ["CB"],
    NO_NONSENSE_DEFENDER: ["CB"],

    ANCHOR: ["DM"],
    BALL_WINNING_MIDFIELDER: ["DM", "CM"],
    DEEP_LYING_PLAYMAKER: ["DM", "CM"],
    BOX_TO_BOX_MIDFIELDER: ["CM"],
    CENTRAL_PLAYMAKER: ["CM", "AM"],
    ADVANCED_PLAYMAKER: ["CM", "AM"],
    WIDE_MIDFIELDER: ["LM", "RM"],

    TOUCHLINE_WINGER: ["LM", "RM", "LW", "RW"],
    INVERTED_WINGER: ["LM", "RM", "LW", "RW"],
    INSIDE_FORWARD: ["LW", "RW"],

    SHADOW_STRIKER: ["AM", "CF"],
    FALSE_NINE: ["CF", "ST"],
    TARGET_FORWARD: ["CF", "ST"],
    PRESSING_FORWARD: ["CF", "ST"],
    POACHER: ["CF", "ST"],
    COMPLETE_FORWARD: ["CF", "ST"],
  };

  assert.deepEqual(
    Object.keys(expectedCompatibility),
    [...PLAYER_ROLE_CODES],
  );

  for (const role of PLAYER_ROLE_CODES) {
    for (const position of PLAYER_POSITION_CODES) {
      assert.equal(
        isRoleCompatibleWithPosition(
          position,
          role,
        ),
        expectedCompatibility[role].includes(
          position,
        ),
        `${role} / ${position}`,
      );
    }
  }
});


test("20. compatibility API fails closed for unknown Position or Role", () => {
  assert.equal(
    isRoleCompatibleWithPosition(
      "Centre Back",
      "BALL_PLAYING_DEFENDER",
    ),
    false,
  );

  assert.equal(
    isRoleCompatibleWithPosition(
      "CB",
      "LIBERO",
    ),
    false,
  );

  assert.equal(
    isRoleCompatibleWithPosition(
      null,
      "BALL_PLAYING_DEFENDER",
    ),
    false,
  );

  assert.equal(
    isRoleCompatibleWithPosition(
      "CB",
      null,
    ),
    false,
  );
});


test("21. malformed secondary Role values fail closed", () => {
  const unknownRole =
    validatePlayerRoleAssessmentInput({
      assessmentType:
        "ORGANIZATION",
      positionContext:
        "CB",
      primaryRole:
        "BALL_PLAYING_DEFENDER",
      secondaryRoles: [
        "LIBERO",
      ],
      styleTraits:
        [],
      summary:
        "",
      effectiveDate:
        "2026-08-29",
      reason:
        "INITIAL",
    });

  assert.equal(
    unknownRole.ok,
    false,
  );

  if (!unknownRole.ok) {
    assert.equal(
      unknownRole.errors.includes(
        "SECONDARY_ROLE_INVALID",
      ),
      true,
    );
  }

  const nonStringRole =
    validatePlayerRoleAssessmentInput({
      assessmentType:
        "ORGANIZATION",
      positionContext:
        "CB",
      primaryRole:
        "BALL_PLAYING_DEFENDER",
      secondaryRoles: [
        123,
      ],
      styleTraits:
        [],
      summary:
        "",
      effectiveDate:
        "2026-08-29",
      reason:
        "INITIAL",
    });

  assert.equal(
    nonStringRole.ok,
    false,
  );

  if (!nonStringRole.ok) {
    assert.equal(
      nonStringRole.errors.includes(
        "SECONDARY_ROLE_INVALID",
      ),
      true,
    );
  }
});


test("22. malformed Style Trait element values fail closed", () => {
  const result =
    validatePlayerRoleAssessmentInput({
      assessmentType:
        "ORGANIZATION",
      positionContext:
        "CM",
      primaryRole:
        "CENTRAL_PLAYMAKER",
      secondaryRoles:
        [],
      styleTraits: [
        null,
        7,
      ],
      summary:
        "",
      effectiveDate:
        "2026-08-29",
      reason:
        "INITIAL",
    });

  assert.equal(
    result.ok,
    false,
  );

  if (!result.ok) {
    assert.equal(
      result.errors.includes(
        "STYLE_TRAIT_INVALID",
      ),
      true,
    );
  }
});


test("23. summary boundary and type are exact", () => {
  const exactLimit =
    validatePlayerRoleAssessmentInput({
      assessmentType:
        "ORGANIZATION",
      positionContext:
        "CM",
      primaryRole:
        "CENTRAL_PLAYMAKER",
      secondaryRoles:
        [],
      styleTraits:
        [],
      summary:
        "x".repeat(
          MAX_ROLE_SUMMARY_LENGTH,
        ),
      effectiveDate:
        "2026-08-29",
      reason:
        "INITIAL",
    });

  assert.equal(
    exactLimit.ok,
    true,
  );


  for (const summary of [
    "summary ",
    "   ",
    123,
    null,
  ]) {
    const result =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "CM",
        primaryRole:
          "CENTRAL_PLAYMAKER",
        secondaryRoles:
          [],
        styleTraits:
          [],
        summary,
        effectiveDate:
          "2026-08-29",
        reason:
          "INITIAL",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (!result.ok) {
      assert.equal(
        result.errors.includes(
          "SUMMARY_INVALID",
        ),
        true,
      );
    }
  }
});


test("24. effectiveDate validates real calendar boundaries including leap years", () => {
  for (const effectiveDate of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "0000-01-01",
  ]) {
    const result =
      validatePlayerRoleAssessmentInput({
        assessmentType:
          "ORGANIZATION",
        positionContext:
          "ST",
        primaryRole:
          "PRESSING_FORWARD",
        secondaryRoles:
          [],
        styleTraits:
          [],
        summary:
          "",
        effectiveDate,
        reason:
          "INITIAL",
      });

    assert.equal(
      result.ok,
      false,
    );

    if (!result.ok) {
      assert.equal(
        result.errors.includes(
          "EFFECTIVE_DATE_INVALID",
        ),
        true,
      );
    }
  }


  const leapDay =
    validatePlayerRoleAssessmentInput({
      assessmentType:
        "ORGANIZATION",
      positionContext:
        "ST",
      primaryRole:
        "PRESSING_FORWARD",
      secondaryRoles:
        [],
      styleTraits:
        [],
      summary:
        "",
      effectiveDate:
        "2024-02-29",
      reason:
        "INITIAL",
    });

  assert.equal(
    leapDay.ok,
    true,
  );
});


test("25. missing and wrong-type scalar fields fail closed without throwing", () => {
  const cases = [
    {
      assessmentType:
        undefined,
      expected:
        "ASSESSMENT_TYPE_INVALID",
    },
    {
      positionContext:
        undefined,
      expected:
        "POSITION_CONTEXT_INVALID",
    },
    {
      primaryRole:
        42,
      expected:
        "PRIMARY_ROLE_INVALID",
    },
    {
      effectiveDate:
        null,
      expected:
        "EFFECTIVE_DATE_INVALID",
    },
    {
      reason:
        9,
      expected:
        "REASON_INVALID",
    },
  ] as const;

  for (const item of cases) {
    const input: Record<string, unknown> = {
      assessmentType:
        "ORGANIZATION",
      positionContext:
        "CB",
      primaryRole:
        "BALL_PLAYING_DEFENDER",
      secondaryRoles:
        [],
      styleTraits:
        [],
      summary:
        "",
      effectiveDate:
        "2026-08-29",
      reason:
        "INITIAL",
    };

    const field =
      Object.keys(item).find(
        (key) =>
          key !== "expected",
      );

    assert.ok(field);

    input[field] =
      item[field as keyof typeof item];

    const result =
      validatePlayerRoleAssessmentInput(
        input,
      );

    assert.equal(
      result.ok,
      false,
    );

    if (!result.ok) {
      assert.equal(
        result.errors.includes(
          item.expected,
        ),
        true,
      );
    }
  }
});

test("26. canonical exported vocabularies are runtime immutable", () => {
  assert.equal(
    Object.isFrozen(
      PLAYER_ROLE_ASSESSMENT_TYPES,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      PLAYER_ROLE_REASONS,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      PLAYER_ROLE_CODES,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      PLAYER_STYLE_TRAIT_CODES,
    ),
    true,
  );
});


test("27. successful validation returns exact defensive output", () => {
  const secondaryRoles = [
    "COVER_DEFENDER",
  ];

  const styleTraits = [
    "BUILD_UP_INVOLVEMENT",
    "PROGRESSIVE_PASSING",
  ];

  const result =
    validatePlayerRoleAssessmentInput({
      assessmentType:
        "ORGANIZATION",
      positionContext:
        "CB",
      primaryRole:
        "BALL_PLAYING_DEFENDER",
      secondaryRoles,
      styleTraits,
      summary:
        "Builds from the back.",
      effectiveDate:
        "2026-08-29",
      reason:
        "INITIAL",
    });

  assert.equal(
    result.ok,
    true,
  );

  if (!result.ok) {
    return;
  }

  assert.deepEqual(
    Object.keys(result.value).sort(),
    [
      "assessmentType",
      "effectiveDate",
      "positionContext",
      "primaryRole",
      "reason",
      "schemaVersion",
      "secondaryRoles",
      "styleTraits",
      "summary",
    ].sort(),
  );

  assert.notEqual(
    result.value.secondaryRoles,
    secondaryRoles,
  );

  assert.notEqual(
    result.value.styleTraits,
    styleTraits,
  );

  secondaryRoles.push(
    "STOPPER",
  );

  styleTraits.push(
    "FRONT_FOOT_DEFENDING",
  );

  assert.deepEqual(
    result.value.secondaryRoles,
    [
      "COVER_DEFENDER",
    ],
  );

  assert.deepEqual(
    result.value.styleTraits,
    [
      "BUILD_UP_INVOLVEMENT",
      "PROGRESSIVE_PASSING",
    ],
  );
});