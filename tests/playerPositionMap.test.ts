import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildPlayerPositionMap,
  resolvePlayerPositionMapPoint,
} from "../src/lib/playerPositionMap.ts";


const __filename =
  fileURLToPath(
    import.meta.url,
  );

const __dirname =
  path.dirname(
    __filename,
  );

const repoRoot =
  path.resolve(
    __dirname,
    "..",
  );

const modelSource =
  readFileSync(
    path.join(
      repoRoot,
      "src/lib/playerPositionMap.ts",
    ),
    "utf8",
  );


test(
  "1. current Academy vocabulary remains supported",
  () => {

    const expected = [
      ["GK", "GK"],
      ["CB", "CB"],
      ["LB", "LB"],
      ["RB", "RB"],
      ["CM", "CM"],
      ["Winger", "WINGER"],
      ["Striker", "ST"],
    ] as const;


    for (
      const [input, expectedKey]
      of expected
    ) {

      const point =
        resolvePlayerPositionMapPoint(
          input,
        );

      assert.equal(
        point.canonicalKey,
        expectedKey,
      );

      assert.equal(
        point.matched,
        true,
      );

      assert.equal(
        point.originalText,
        input,
      );
    }
  },
);


test(
  "2. detailed football taxonomy keeps distinct canonical roles",
  () => {

    const expected = [
      ["LB", "LB"],
      ["LWB", "LWB"],
      ["CB", "CB"],
      ["RB", "RB"],
      ["RWB", "RWB"],

      ["DM", "DM"],
      ["LM", "LM"],
      ["CM", "CM"],
      ["RM", "RM"],
      ["AM", "AM"],

      ["LW", "LW"],
      ["Winger", "WINGER"],
      ["RW", "RW"],

      ["CF", "CF"],
      ["ST", "ST"],
    ] as const;


    for (
      const [input, expectedKey]
      of expected
    ) {

      assert.equal(
        resolvePlayerPositionMapPoint(
          input,
        ).canonicalKey,
        expectedKey,
      );
    }
  },
);


test(
  "3. unambiguous aliases are case-insensitive and whitespace tolerant",
  () => {

    const cases = [
      [" goalkeeper ", "GK"],

      ["left wing back", "LWB"],
      ["right wing-back", "RWB"],

      [" Defensive Midfielder ", "DM"],

      ["left midfielder", "LM"],
      ["central midfielder", "CM"],
      ["RIGHT MIDFIELDER", "RM"],

      ["attacking midfielder", "AM"],

      [" left winger ", "LW"],
      ["right winger", "RW"],

      ["centre forward", "CF"],
      ["striker", "ST"],
    ] as const;


    for (
      const [input, expectedKey]
      of cases
    ) {

      assert.equal(
        resolvePlayerPositionMapPoint(
          input,
        ).canonicalKey,
        expectedKey,
      );
    }
  },
);


test(
  "4. generic Winger preserves left-right ambiguity",
  () => {

    const point =
      resolvePlayerPositionMapPoint(
        "Winger",
      );


    assert.equal(
      point.canonicalKey,
      "WINGER",
    );

    assert.equal(
      point.placement,
      "EITHER_FLANK",
    );

    assert.equal(
      point.locations.length,
      2,
    );


    assert.deepEqual(
      point.locations,
      [
        {
          xPercent: 18,
          yPercent: 27,
        },
        {
          xPercent: 82,
          yPercent: 27,
        },
      ],
    );
  },
);


test(
  "5. LM and LW remain distinct football positions",
  () => {

    const lm =
      resolvePlayerPositionMapPoint(
        "Left Midfielder",
      );

    const lw =
      resolvePlayerPositionMapPoint(
        "Left Winger",
      );


    assert.equal(
      lm.canonicalKey,
      "LM",
    );

    assert.equal(
      lw.canonicalKey,
      "LW",
    );

    assert.notEqual(
      lm.locations[0]?.yPercent,
      lw.locations[0]?.yPercent,
    );
  },
);


test(
  "6. RM and RW remain distinct football positions",
  () => {

    const rm =
      resolvePlayerPositionMapPoint(
        "Right Midfielder",
      );

    const rw =
      resolvePlayerPositionMapPoint(
        "Right Winger",
      );


    assert.equal(
      rm.canonicalKey,
      "RM",
    );

    assert.equal(
      rw.canonicalKey,
      "RW",
    );

    assert.notEqual(
      rm.locations[0]?.yPercent,
      rw.locations[0]?.yPercent,
    );
  },
);


test(
  "7. wing-backs remain distinct from full-backs",
  () => {

    const lb =
      resolvePlayerPositionMapPoint(
        "LB",
      );

    const lwb =
      resolvePlayerPositionMapPoint(
        "LWB",
      );

    const rb =
      resolvePlayerPositionMapPoint(
        "RB",
      );

    const rwb =
      resolvePlayerPositionMapPoint(
        "RWB",
      );


    assert.equal(
      lb.canonicalKey,
      "LB",
    );

    assert.equal(
      lwb.canonicalKey,
      "LWB",
    );

    assert.equal(
      rb.canonicalKey,
      "RB",
    );

    assert.equal(
      rwb.canonicalKey,
      "RWB",
    );


    assert.notEqual(
      lb.locations[0]?.yPercent,
      lwb.locations[0]?.yPercent,
    );

    assert.notEqual(
      rb.locations[0]?.yPercent,
      rwb.locations[0]?.yPercent,
    );
  },
);


test(
  "8. Centre Forward and Striker remain distinct",
  () => {

    const cf =
      resolvePlayerPositionMapPoint(
        "Centre Forward",
      );

    const st =
      resolvePlayerPositionMapPoint(
        "Striker",
      );


    assert.equal(
      cf.canonicalKey,
      "CF",
    );

    assert.equal(
      st.canonicalKey,
      "ST",
    );

    assert.notEqual(
      cf.locations[0]?.yPercent,
      st.locations[0]?.yPercent,
    );
  },
);


test(
  "9. generic role families are never over-normalized",
  () => {

    const genericValues = [
      "Defender",
      "Fullback",
      "Wing Back",
      "Midfielder",
      "Forward",
    ];


    for (
      const value
      of genericValues
    ) {

      const point =
        resolvePlayerPositionMapPoint(
          value,
        );


      assert.equal(
        point.canonicalKey,
        "UNKNOWN",
      );

      assert.equal(
        point.matched,
        false,
      );

      assert.equal(
        point.originalText,
        value,
      );
    }
  },
);


test(
  "10. unknown Pro free-text preserves exact source and uses safe fallback",
  () => {

    const point =
      resolvePlayerPositionMapPoint(
        "  Shadow 9  ",
      );


    assert.equal(
      point.canonicalKey,
      "UNKNOWN",
    );

    assert.equal(
      point.matched,
      false,
    );

    assert.equal(
      point.placement,
      "FALLBACK",
    );

    assert.equal(
      point.originalText,
      "  Shadow 9  ",
    );

    assert.equal(
      point.displayText,
      "Shadow 9",
    );


    assert.deepEqual(
      point.locations,
      [
        {
          xPercent: 50,
          yPercent: 50,
        },
      ],
    );
  },
);


test(
  "11. blank primary position creates no marker",
  () => {

    const populated =
      buildPlayerPositionMap({
        source: "ACADEMY",
        position: "CB",
      });


    assert.equal(
      populated.markers.length,
      1,
    );

    assert.equal(
      populated.markers[0]?.kind,
      "PRIMARY",
    );


    const empty =
      buildPlayerPositionMap({
        source: "ACADEMY",
        position: "   ",
      });


    assert.deepEqual(
      empty.markers,
      [],
    );
  },
);


test(
  "12. Pro reads existing secondary position when present",
  () => {

    const model =
      buildPlayerPositionMap({
        source: "PRO",
        position:
          "Attacking Midfielder",
        secondaryPosition:
          "Right Midfielder",
      });


    assert.equal(
      model.markers.length,
      2,
    );

    assert.equal(
      model.markers[0]?.kind,
      "PRIMARY",
    );

    assert.equal(
      model.markers[0]?.canonicalKey,
      "AM",
    );

    assert.equal(
      model.markers[1]?.kind,
      "SECONDARY",
    );

    assert.equal(
      model.markers[1]?.canonicalKey,
      "RM",
    );
  },
);


test(
  "13. Academy never fabricates a secondary marker",
  () => {

    const model =
      buildPlayerPositionMap({
        source: "ACADEMY",
        position: "LW",

        // Defensive proof only.
        // Current Academy input contract does not write
        // this field.
        secondaryPosition: "RW",
      });


    assert.equal(
      model.markers.length,
      1,
    );

    assert.equal(
      model.markers[0]?.kind,
      "PRIMARY",
    );

    assert.equal(
      model.markers[0]?.canonicalKey,
      "LW",
    );
  },
);


test(
  "14. all presentation locations remain inside pitch bounds",
  () => {

    const positions = [
      "GK",

      "LB",
      "LWB",
      "CB",
      "RB",
      "RWB",

      "DM",
      "LM",
      "CM",
      "RM",
      "AM",

      "LW",
      "Winger",
      "RW",

      "CF",
      "ST",

      "unknown-role",
    ];


    for (
      const position
      of positions
    ) {

      const point =
        resolvePlayerPositionMapPoint(
          position,
        );


      assert.ok(
        point.locations.length >= 1,
      );


      for (
        const location
        of point.locations
      ) {

        assert.ok(
          location.xPercent >= 0 &&
          location.xPercent <= 100,
        );

        assert.ok(
          location.yPercent >= 0 &&
          location.yPercent <= 100,
        );
      }
    }
  },
);


test(
  "15. returned locations cannot mutate canonical definitions",
  () => {

    const first =
      resolvePlayerPositionMapPoint(
        "RM",
      );


    first.locations[0]!.xPercent =
      999;


    const second =
      resolvePlayerPositionMapPoint(
        "RM",
      );


    assert.equal(
      second.locations[0]?.xPercent,
      82,
    );
  },
);


test(
  "16. position map remains presentation-only and authority-free",
  () => {

    assert.doesNotMatch(
      modelSource,
      /firebase\/firestore|addDoc\s*\(|updateDoc\s*\(|deleteDoc\s*\(|setDoc\s*\(|writeBatch\s*\(|runTransaction\s*\(/,
    );


    assert.doesNotMatch(
      modelSource,
      /\bfutId\b|\bFUTID\b|\bplayerKey\b|playerIdentity/,
    );


    assert.doesNotMatch(
      modelSource,
      /localStorage|sessionStorage/,
    );
  },
);