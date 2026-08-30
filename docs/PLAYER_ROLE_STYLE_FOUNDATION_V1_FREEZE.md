# FutVerse Player Role / Style Foundation V1 — Architecture Freeze

Status: P1A TEST-FIRST FREEZE

## 1. Purpose

Player Role / Style Foundation V1 introduces a canonical football
playing-role and style-trait contract for Academy and Pro presentation.

It is separate from:

- Player Position
- Player Evaluation
- Strength / Weakness assessment
- Development / IDP
- Lifelong Player Identity

The semantic boundary is:

Position = where the player plays.
Role = the football function performed from that position.
Style Trait = how the player tends to perform that function.
Evaluation = how well the player performs.
IDP = what the player should develop.

No value may be inferred automatically from another layer.

## 2. V1 Assessment Authority

V1 supports exactly:

ORGANIZATION

Player Self, Scout, System-Derived and AI-generated assessments are
outside V1.

## 3. Role Assessment Mutation Model

The future persistence model is append-only history.

A newer assessment does not rewrite an older assessment.

Correction is represented by a new assessment with reason CORRECTION.

Update and delete are not part of the V1 history contract.

Persistence paths and Firestore Security Rules are intentionally deferred
until the pure domain contract passes review.

## 4. Canonical Role Vocabulary

V1 role codes are:

SHOT_STOPPER
SWEEPER_KEEPER
BUILD_UP_KEEPER

FULL_BACK
INVERTED_FULL_BACK
WING_BACK

STOPPER
COVER_DEFENDER
BALL_PLAYING_DEFENDER
NO_NONSENSE_DEFENDER

ANCHOR
BALL_WINNING_MIDFIELDER
DEEP_LYING_PLAYMAKER
BOX_TO_BOX_MIDFIELDER
CENTRAL_PLAYMAKER
ADVANCED_PLAYMAKER
WIDE_MIDFIELDER

TOUCHLINE_WINGER
INVERTED_WINGER
INSIDE_FORWARD

SHADOW_STRIKER
FALSE_NINE
TARGET_FORWARD
PRESSING_FORWARD
POACHER
COMPLETE_FORWARD

Role codes are canonical exact values.

No trimming, case folding, synonym mapping or silent normalization is
permitted.

## 5. Canonical Style Trait Vocabulary

V1 style trait codes are:

BUILD_UP_INVOLVEMENT
PROGRESSIVE_PASSING
LINE_BREAKING_PASSING
SWITCHING_PLAY
BALL_CARRYING
TEMPO_CONTROL
LINK_PLAY
FINAL_THIRD_CREATION
ONE_V_ONE_ATTACKING
RUNNING_IN_BEHIND
BOX_PRESENCE
WIDTH_HOLDING
INVERTED_MOVEMENT
FRONT_FOOT_DEFENDING
POSITIONAL_COVER
INTERCEPTION_FOCUS
PRESSING
COUNTER_PRESSING
DUEL_ENGAGEMENT
AERIAL_DUEL_FOCUS
BOX_DEFENDING
RECOVERY_RUNNING
TRANSITION_ATTACKING
TRANSITION_RECOVERY

Traits describe tendencies or behaviours.

They are not ratings, strengths, scores or development goals.

## 6. Position Context

positionContext uses the canonical Player Position V2 vocabulary.

Role validation must never infer a role from positionContext.

A compatibility check may reject an impossible or unsupported
Position/Role pair.

It must not select or replace a Role automatically.

## 6A. Exact Role / Position Compatibility Matrix

V1 freezes the complete compatibility matrix.

SHOT_STOPPER:
GK

SWEEPER_KEEPER:
GK

BUILD_UP_KEEPER:
GK

FULL_BACK:
LB, RB

INVERTED_FULL_BACK:
LB, LWB, RB, RWB

WING_BACK:
LB, LWB, RB, RWB

STOPPER:
CB

COVER_DEFENDER:
CB

BALL_PLAYING_DEFENDER:
CB

NO_NONSENSE_DEFENDER:
CB

ANCHOR:
DM

BALL_WINNING_MIDFIELDER:
DM, CM

DEEP_LYING_PLAYMAKER:
DM, CM

BOX_TO_BOX_MIDFIELDER:
CM

CENTRAL_PLAYMAKER:
CM, AM

ADVANCED_PLAYMAKER:
CM, AM

WIDE_MIDFIELDER:
LM, RM

TOUCHLINE_WINGER:
LM, RM, LW, RW

INVERTED_WINGER:
LM, RM, LW, RW

INSIDE_FORWARD:
LW, RW

SHADOW_STRIKER:
AM, CF

FALSE_NINE:
CF, ST

TARGET_FORWARD:
CF, ST

PRESSING_FORWARD:
CF, ST

POACHER:
CF, ST

COMPLETE_FORWARD:
CF, ST

Every canonical Role must appear exactly once in this matrix.

Every compatible Position must be a canonical Player Position V2 code.

isRoleCompatibleWithPosition must return false for every Role/Position
pair not explicitly listed above.

Unknown Role or Position values return false.

Compatibility is validation only.

Compatibility must never infer, select, replace, normalize or recommend
a Role.

Style Traits are intentionally not hard-constrained to Position or Role
in V1. A future version may introduce recommendations or compatibility
without rewriting the stored canonical trait vocabulary.

## 7. Limits

Maximum secondary roles: 2.

Maximum style traits: 6.

Maximum summary length: 500 characters.

Primary Role may not also appear in secondaryRoles.

Secondary roles must be distinct.

Style traits must be distinct.

## 7A. Runtime Canonical Integrity

Canonical exported vocabulary collections are runtime immutable.

The following exported collections must be frozen at runtime:

PLAYER_ROLE_ASSESSMENT_TYPES
PLAYER_ROLE_REASONS
PLAYER_ROLE_CODES
PLAYER_STYLE_TRAIT_CODES

TypeScript readonly typing alone is not sufficient because runtime
mutation could make exported vocabulary disagree with internal validation
sets or compatibility behavior.

Validation must also return fresh secondaryRoles and styleTraits arrays.

Mutating the original input arrays after successful validation must not
mutate the returned validated value.

The successful validated payload must contain exactly:

schemaVersion
assessmentType
positionContext
primaryRole
secondaryRoles
styleTraits
summary
effectiveDate
reason

No input-only unknown field may survive validation.

## 8. Reason

V1 reason is exactly one of:

INITIAL
PERIODIC_REVIEW
ROLE_CHANGE
CORRECTION

## 9. Effective Date

effectiveDate is a strict valid YYYY-MM-DD calendar date.

No Date object, locale string, timestamp or implicit timezone conversion
belongs in the pure input contract.

## 10. Exact Input Shape

The pure V1 assessment input contains exactly:

assessmentType
positionContext
primaryRole
secondaryRoles
styleTraits
summary
effectiveDate
reason

Unknown fields fail validation.

Firestore metadata such as createdAt and createdBy does not belong in this
pure input contract.

Identity fields such as playerKey and FUTID do not belong in this input
contract.

## 11. Explicitly Out Of Scope

P1A does not:

- modify Firestore Security Rules
- add Firestore repositories
- modify Academy Player writers
- modify Pro Player writers
- modify Player Profile / CV UI
- modify Position V2
- modify Evaluation
- modify IDP
- bind contextual players to playerKey
- create AI-derived roles or traits
- create Player Self assessment
- create Scout assessment
- commit, push, merge or deploy

## 12. P1A Test-First Requirement

The contract tests must exist and fail before the implementation module
exists.

Expected P1A RED cause:

src/lib/playerRoleStyleFoundation.ts does not yet exist.

P1B may create that module only after this RED gate is verified.