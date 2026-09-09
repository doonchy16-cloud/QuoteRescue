# QuoteRescue Murder Attack V7 — 100,000-Way Adversarial Grid

Date: 2026-09-09
Branch: `redesign-v2`
V6 certified baseline: `16dfa4b92723df991c7364bb140b060caf182d49`

## Mandate

V7 was required to attack QuoteRescue in **literally 100,000 different ways**.

The V7 harness therefore executes:

- 10 adversarial families
- 10,000 cases per family
- exactly 100,000 raw attack inputs
- a hard uniqueness assertion requiring exactly 100,000 distinct serialized inputs

A duplicated input, an attack-count mismatch, any invariant violation, any inherited regression, or any syntax/browser failure is a V7 failure.

## Attack families

1. Supported-state combinatorics across stage, blocker, tone, requested channel, global/channel permissions, quote age, and contact age.
2. Global opt-out and wrong-recipient language with punctuation, quoting, reported-speech wrappers, and invisible-format-control variants.
3. Structured channel denials, explicit fallbacks, no-route states, and send-hold behavior.
4. Hostile numeric grammar including signs, exponents, hexadecimal-like syntax, commas, excessive decimals, underscores, words, NaN-like, and Infinity-like strings.
5. Type-confusion inputs including arrays, objects, booleans, numbers, Date objects, and BigInt values in text/enum positions.
6. Unicode/display-control and control-character sanitation attacks.
7. Chronology and blocker-resolution language where obsolete concerns must not remain current blockers.
8. Maximum/boundary text shapes, emoji/UTF-16 boundaries, maximum quote values, and maximum age values.
9. Missing-value versus explicit-zero semantics for currency and contact age.
10. Fully valid end-to-end generation/export/determinism/currency pipeline stress.

## Global invariants

The V7 grid checks, as applicable, that:

- validation does not crash;
- hostile numeric/type-confusion inputs are rejected;
- caller input is not mutated;
- generation remains deterministic on repeated checks;
- hard-blocked contact has score 0 and no outbound payloads;
- send-hold states expose no outbound payloads;
- denied channels never leak SMS, phone, or email payloads;
- the effective channel is never a denied channel;
- cadence shapes remain bounded by recovery mode;
- SMS, voicemail, email subject, and email body remain within output contracts;
- generated campaign copy does not invent forbidden urgency/guarantee claims;
- output contains no `undefined`, `NaN`, or `[object Object]` serialization garbage;
- format controls do not leak into normalized/generated/exported content;
- generated/exported text remains well-formed UTF-16;
- exports remain bounded and begin with the QuoteRescue plan header;
- opt-out/wrong-recipient variants hard-block correctly;
- obsolete resolved blockers do not remain current blockers;
- missing quote amount remains distinct from explicit zero.

## RED evidence

Initial V7 commit: `68e901768461d9a3c9e006ea03a11197c7e9f343`

GitHub Actions run:

- Run number: **60**
- Run ID: `34404795579`
- V7 attacks executed: **100,000 distinct**
- Valid inputs/plans: **80,000**
- Hostile inputs rejected: **20,000**
- Invariant findings: **1,500**

The inherited suite had 109 Node subtests after adding V7: 108 passed and the V7 subtest failed.

### Finding family 1 — reported/quoted stop-contact misses

Count: **500**

Examples that were incorrectly treated as active outreach included:

- `“STOP”`
- `“This is the wrong number”`
- `Customer said: This is the wrong number`
- `Message received — STOP`
- `Message received — This is the wrong number`

Root cause: contact-policy normalization handled compatibility/invisible characters, but broad-stop and wrong-recipient rules still evaluated the full normalized string. Quoted or reported-message wrappers could prevent anchored stop/wrong-recipient rules from matching.

### Finding family 2 — resolved trust/warranty blocker remained active

Count: **1,000**

Representative failing input:

`Warranty concern was resolved; we trust the proposal now.`

Observed before the fix:

- primary blocker: `trust`
- recovery mode: `objection_resolution`

Root cause: the interpreter recognized several trust-resolution forms but did not model explicit forms such as `warranty concern was resolved` or present positive trust in the proposal/quote/estimate/plan.

## Root fixes

### Contact-policy semantic unwrapping

Commit: `8e8e40c046d0281db36450fc4518065769d4d45d`

The contact-policy layer now derives policy candidates from the normalized text by safely unwrapping:

- outer ASCII/curly quotation marks; and
- common reported-message/source prefixes such as customer/client/person said/wrote/replied and message/reply/response received/said/read.

Broad stop-contact and wrong-recipient rules evaluate those semantic candidates. Channel-specific deny/allow behavior remains separate.

### Trust/warranty resolution coverage

Commit: `f80e7e12061bb48724f804c299b2b183d06c11bb`

The interpreter now recognizes additional explicit current/resolved trust forms including:

- trusting the proposal/quote/estimate/plan;
- trust concern/issue resolved; and
- warranty concern/issue resolved.

No scoring formula or campaign cadence rule was loosened for V7.

## GREEN evidence

Post-fix GitHub Actions run:

- Run number: **62**
- Run ID: `34404999396`

Exact V7 test output:

> `V7 VERIFIED: 100,000 distinct attacks; 80,000 valid plans inspected; 20,000 hostile inputs rejected; 0 invariant violations.`

Node verification:

- subtests: **109**
- pass: **109**
- fail: **0**
- skipped: **0**
- cancelled: **0**
- V7 subtest duration: approximately 18.15 seconds
- JavaScript syntax check: **PASS**

Important counting note: the Node harness reports 109 subtests; one of those subtests internally executes the literal 100,000-case V7 adversarial grid.

Inherited real-browser regression:

- Chromium tests: **10**
- pass: **10**
- fail: **0**
- skipped: **0**
- cancelled: **0**

Browser evidence artifact from run 62:

- artifact ID: `10124972018`
- SHA-256: `fa74da0c3234d33f12eb788889e0ca44b5561e754070a1ff4e31815acd32a127`

## Scope and non-certifications

V7 certifies the 100,000-way adversarial-grid scope only after an exact-head verification run also passes following this report commit.

V7 does **not** by itself certify:

- Firefox rendering/behavior;
- Safari/WebKit rendering/behavior;
- full screen-reader/manual assistive-technology behavior;
- production-host deployment behavior;
- payment/access-control behavior; or
- external legal/compliance review.

Those remain separate gates and must not be inferred from V7.