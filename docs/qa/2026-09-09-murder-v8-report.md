# QuoteRescue Murder Attack V8 — 1,000,000-Case Adversarial QA

Date: 2026-09-09
Branch: `redesign-v2`
Status at report creation: GREEN candidate; exact report-inclusive certification rerun still required.

## Mandate

V8 was created after the owner requested a materially longer attack, approximately 1,000,000 cases. The harness therefore executes exactly 1,000,000 distinct adversarial cases, not an estimate and not one test repeated one million times.

The matrix is divided into 20 independent adversarial families with exactly 50,000 cases per family. It hard-asserts the total case count, every per-family count, and unique attack IDs.

## Attack families

1. Supported state-space combinations across stage, blocker, tone, channel, permissions, quote age, and contact age.
2. Global opt-out language and reporting/quotation wrappers.
3. Wrong-recipient / reassigned-number language.
4. Denied preferred channel with an explicitly allowed fallback.
5. All channels denied / send-hold behavior.
6. Hostile numeric grammar.
7. JavaScript type confusion.
8. Numeric exact-boundary and over-boundary values.
9. Exact text maximum lengths.
10. Text maximum + 1 rejection.
11. Unicode, bidi, invisible, and control-character sanitization.
12. Unicode / grapheme / surrogate-boundary propagation.
13. Resolved multi-clause chronology.
14. Negative / lost chronology.
15. False-positive policy phrases containing words such as stop, wrong number, contact, or call in non-policy contexts.
16. Channel-specific allow/deny language.
17. Export / display / injection-like hostile text.
18. Missing, null, and explicit-zero semantics.
19. Maximum-shape output pressure.
20. Deterministic pseudo-random state fuzz.

## Per-valid-plan invariants

V8 does not stop at validation. Every valid input generates a real recovery plan. Applicable invariants include:

- caller input is not mutated;
- blocked contact produces score 0 and no outbound payload;
- send-hold produces no outbound payload;
- denied channels cannot leak copy or become the effective channel;
- score remains integer and bounded;
- recovery-mode cadence remains bounded and mode-appropriate;
- SMS, voicemail, email subject, and email body remain within product budgets;
- email subject remains single-line;
- forbidden fabricated urgency / guarantee language remains absent;
- serialization does not leak `undefined`, `NaN`, or object-string garbage;
- bidi / invisible formatting controls do not propagate;
- generated and exported content remains well-formed UTF-16;
- sampled plans regenerate deterministically;
- sampled exports remain bounded, structured, and clean.

## RED run 1 — GitHub Actions #64

Commit under attack: `79b7129aace8f3af1af6ef5f326421114718bbc3`

V8 runtime for the million-case subtest: approximately 148.2 seconds.

Result:

- 1,000,000 distinct attacks executed.
- 825,000 inputs validated and generated plans.
- 175,000 hostile inputs were rejected.
- 101,786 findings were reported.
- Chromium regression remained 10/10 GREEN.

Finding buckets:

### Production defects

- 62,500 global stop / wrong-recipient misses. Examples included `I no longer wish to be contacted`, `Take my number off your list`, `Cease all communications`, `Please remove me from your contact list`, several wrong-person / reassigned-number variants, and wrapped equivalents.
- 5,000 false-positive global blocks caused by non-human phrases such as `Do not contact the adhesive before it cures.`
- 20,000 channel-allow misses, notably `email is fine` after another channel had been denied.

### Harness defect

- 14,286 `distinctness_witness_corrupted` findings were caused by the boundary family intentionally overwriting `callbackPhone`, which the first witness implementation incorrectly assumed would always remain the unique marker. Attack IDs themselves were still unique. The witness rule was corrected to accept the per-case unique business-name marker or callback marker.

## Root fixes after RED run 1

`src/contact-policy.js` was hardened to:

- recognize natural global opt-outs such as no-longer-wish-to-be-contacted, remove/take my number from the contact list, and cease all communications;
- recognize additional wrong-recipient and reassigned-number language;
- use the supplied customer name for safe dynamic forms such as `This is not Alex` and `Alex no longer owns this number`;
- distinguish human do-not-contact commands from physical-domain phrases such as `Do not contact the adhesive before it cures`;
- recognize explicit channel permission phrases including `email is fine`, `call is fine`, and `phone is fine`.

The V8 distinctness witness was also corrected without weakening the requirement that all 1,000,000 attack IDs be unique.

A syntax defect introduced during the first policy patch was caught before certification and corrected before the next full behavioral run.

## RED run 2 — GitHub Actions #67

Commit under attack: `057ab7d1dd9e0a42d069d0cce3754b107ca3fbbc`

V8 runtime for the million-case subtest: approximately 147.8 seconds.

Result:

- 1,000,000 distinct attacks executed.
- 825,000 valid inputs / plans inspected.
- 175,000 hostile inputs rejected.
- Findings dropped from 101,786 to 3,500.
- Chromium regression remained 10/10 GREEN.

The only remaining bucket was 3,500 `required_global_block_missed` cases, all isolating the same wrapper root cause: bare reported-message prefixes such as `Reply: 'STOP'` were not unwrapped because the reporter parser recognized `reply received`, `reply said`, etc., but not bare `Reply:`.

## Root fix after RED run 2

Commit: `1e29980f00701ce62f80c4698b79a7d56256bc25`

The reported-message parser was extended to unwrap bare `Reply:`, `Response:`, and `Message:` prefixes only when punctuation makes them unambiguously wrappers. Targeted proof confirmed:

- `Reply: 'STOP'` -> `STOP`;
- `Reply: “STOP”` -> `STOP`;
- `Response: STOP` -> `STOP`;
- `Message: STOP` -> `STOP`;
- ordinary text such as `Reply later tomorrow` is not stripped.

## GREEN run 3 — GitHub Actions #68

Commit under attack: `1e29980f00701ce62f80c4698b79a7d56256bc25`

Fresh result from the harness:

> V8 VERIFIED: 1,000,000 distinct attacks across 20 families; 825,000 valid inputs; 175,000 hostile inputs rejected; 825,000 generated plans inspected; 0 invariant violations.

V8 subtest duration: 127,610.7 ms (about 127.6 seconds).

Inherited verification on the same run:

- V7: 100,000 distinct attacks, 0 invariant violations.
- Full Node suite: 110/110 passed, 0 failed, 0 skipped.
- JavaScript syntax checks: passed.
- Chromium regression: 10/10 passed.

## Cumulative V8 campaign execution before final report-head rerun

Three complete V8 million-case passes have already executed during RED -> GREEN development:

- Run #64: 1,000,000 cases — RED.
- Run #67: 1,000,000 cases — RED, reduced to one root-cause bucket.
- Run #68: 1,000,000 cases — GREEN.

That is 3,000,000 V8 adversarial case executions before the final report-inclusive certification rerun, excluding the inherited V7 100,000-case run embedded in each full suite and all other regression tests.

## Certification rule

This report does not certify itself. Because adding this report advances the branch head, Elite Lane certification requires one more complete run on the exact report-inclusive head: the entire Node suite including V7 and V8, JavaScript syntax, and real Chromium regression must all be GREEN. Any failure returns V8 to HOLD.