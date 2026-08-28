import assert from "node:assert/strict";
import test from "node:test";

import {
  toAcademyPlayerProfileReadModel,
  toProPlayerProfileReadModel,
} from "../src/lib/playerProfileReadModel";

test(
  "1. Academy adapter maps current storage fields into shared read model",
  () => {
    const result =
      toAcademyPlayerProfileReadModel(
        {
          id: "academy-player-1",
          firstName: "Niran",
          lastName: "Sukjai",
          position: "CM",
          ageGroup: "U16",
          dob: "2010-09-10",
          avatar: "academy-avatar",
        },
        "2026-08-28",
      );

    assert.deepEqual(
      result,
      {
        source: "ACADEMY",
        sourceDocumentId:
          "academy-player-1",
        displayName:
          "Niran Sukjai",
        position: "CM",
        dateOfBirth:
          "2010-09-10",
        age: 15,
        avatarUrl:
          "academy-avatar",
        ageGroup: "U16",
      },
    );
  },
);

test(
  "2. Academy stored age is ignored and age is derived from DOB",
  () => {
    const result =
      toAcademyPlayerProfileReadModel(
        {
          id: "academy-player-age",
          firstName: "A",
          lastName: "Player",
          position: "FW",
          ageGroup: "U18",
          dob: "2010-01-01",
          age: 99,
          fitness_status: "Fit",
        },
        "2026-08-28",
      );

    assert.equal(
      result.age,
      16,
    );

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        result,
        "fitness_status",
      ),
      false,
    );
  },
);

test(
  "3. Academy invalid DOB remains visible but derived age fails closed",
  () => {
    const result =
      toAcademyPlayerProfileReadModel(
        {
          id: "academy-player-invalid-dob",
          firstName: "Invalid",
          lastName: "Date",
          position: "GK",
          ageGroup: "U14",
          dob: "2026-02-30",
          avatar: "",
        },
        "2026-08-28",
      );

    assert.equal(
      result.dateOfBirth,
      "2026-02-30",
    );

    assert.equal(
      result.age,
      null,
    );

    assert.equal(
      result.avatarUrl,
      null,
    );
  },
);

test(
  "4. Pro adapter maps common core and preserves Pro-only extensions",
  () => {
    const result =
      toProPlayerProfileReadModel(
        {
          id: "pro-player-1",
          name: "Somchai Football",
          position: "CB",
          dob: "1998-04-21",
          avatarUrl: "pro-avatar",
          secondaryPosition: "RB",
          preferredFoot: "Right",
          nationality: "Thai",
          height: 182,
          weight: 76,
          currentClub: "Example FC",
          league: "T3",
        },
        "2026-08-28",
      );

    assert.deepEqual(
      result,
      {
        source: "PRO",
        sourceDocumentId:
          "pro-player-1",
        displayName:
          "Somchai Football",
        position: "CB",
        dateOfBirth:
          "1998-04-21",
        age: 28,
        avatarUrl:
          "pro-avatar",
        secondaryPosition: "RB",
        preferredFoot: "Right",
        nationality: "Thai",
        height: 182,
        weight: 76,
        currentClub: "Example FC",
        league: "T3",
      },
    );
  },
);

test(
  "5. Shared read model does not fabricate FUTID or playerKey authority",
  () => {
    const academy =
      toAcademyPlayerProfileReadModel(
        {
          id: "academy-player-identity",
          firstName: "Identity",
          lastName: "Boundary",
          position: "DM",
          ageGroup: "U18",
          dob: "2009-05-10",
        },
        "2026-08-28",
      );

    const pro =
      toProPlayerProfileReadModel(
        {
          id: "pro-player-identity",
          name: "Identity Boundary",
          position: "DM",
          dob: "2000-05-10",
        },
        "2026-08-28",
      );

    for (const profile of [
      academy,
      pro,
    ]) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(
          profile,
          "futId",
        ),
        false,
      );

      assert.equal(
        Object.prototype.hasOwnProperty.call(
          profile,
          "playerKey",
        ),
        false,
      );
    }
  },
);

test(
  "6. Invalid comparison date also fails age derivation closed",
  () => {
    const result =
      toProPlayerProfileReadModel(
        {
          id: "pro-invalid-on-date",
          name: "Date Boundary",
          position: "GK",
          dob: "2000-01-01",
        },
        "not-a-date",
      );

    assert.equal(
      result.age,
      null,
    );
  },
);
