# QuoteRescue Murder Attack V3 — QA Report

Date: 2026-09-09
Branch: `redesign-v2`
Base: `main`
Scope: adversarial robustness extension after the Redesign-2 automated engineering gate.

## Purpose

Murder Attack V3 deliberately targeted valid-looking semantic, policy, rendering, and boundary cases that ordinary malformed-input fuzzing could miss. The suite was added test-first and run against the existing Redesign-2 candidate before production fixes.

## V3 attack groups

1. Reported-command punctuation and quoting around `STOP`.
2. Unicode compatibility and invisible-character opt-out evasion.
3. Real-world wrong-number / wrong-recipient replies.
4. Channel-scoped `do not contact me by <channel>` semantics.
5. Global do-not-contact precedence over per-channel allowed flags.
6. All-channels-denied routing and zero-payload send hold.
7. Close-loop one-touch payload leakage.
8. Reactivation one-touch payload leakage.
9. Plain-text export reserved-heading injection.
10. Bidi and zero-width display spoofing.
11. Type-confusion coercion using arrays, objects, and booleans.
12. Multi-stage contradictory chronology and current-vs-past precedence.
13. Full production-JavaScript browser/network/dynamic-code boundary scan.
14. Browser UI vs domain decimal quote-amount contract.
15. Caller-input immutability.

## Initial RED result

The first V3 execution ran 91 total test groups and exposed 10 failures. Five V3 groups passed immediately: global do-not-contact precedence, all-channels-denied send hold, deep chronology, full-source browser/privacy boundary, and input immutability.

The failures were:

- Reported `STOP` punctuation/quoting was not consistently recognized.
- Unicode/full-width/zero-width `STOP` forms could evade policy matching.
- Common wrong-number replies were under-recognized.
- Channel-scoped `do not contact me by ...` wording could be over-escalated to global opt-out.
- Close-loop mode exposed extra immediately usable toolkit payloads despite a one-touch invariant.
- Reactivation mode exposed generic active-toolkit payloads despite being a separate one-touch path.
- Multiline project text could visually forge reserved headings in the text export.
- Bidi/zero-width formatting controls could survive normalized user fields.
- Non-string/non-number values could be coerced into plausible form values.
- The engine accepted decimal quote amounts while the HTML input used `step="1"`.

## Root fixes

### Domain boundary hardening

`src/domain.js`

- Strips zero-width and bidi formatting controls from normalized user-facing text.
- Preserves whitespace boundaries when flattening multiline text.
- Rejects non-string text values rather than coercing arrays/objects/booleans.
- Rejects non-string/non-number numeric values before decimal parsing.
- Rejects non-string enum values.

### Contact-policy hardening

`src/contact-policy.js`

- Normalizes policy text with Unicode NFKC before matching.
- Removes invisible/bidi formatting controls before safety classification.
- Recognizes reported `STOP` commands with common punctuation and quoting.
- Covers additional ordinary wrong-recipient formulations.
- Distinguishes channel-scoped contact denials from global no-contact instructions.

### One-touch campaign enforcement

`src/messages.js`

- Close-loop mode exposes one immediate outbound payload matching the effective channel.
- Reactivation mode exposes only the reactivation playbook, not a parallel active generic toolkit.
- Existing global/channel permission routing remains authoritative.

### Export boundary hardening

`src/engine.js`

- User project text is flattened before insertion into the structured plain-text export header, preventing reserved-heading injection.

### Browser/domain contract alignment

`index.html`

- Quote amount now uses `step="0.01"`, matching the accepted decimal grammar.

## Final verification

Final candidate commit before this report: `6e11f60d4b116a2a061696cef31fc276d6733085`
GitHub Actions run: `#34` / run ID `34349414018`

Observed result:

- Tests: 91
- Passed: 91
- Failed: 0
- Cancelled: 0
- Skipped: 0
- Todo: 0
- V2 combinatorial murder matrix: 25,920 supported states — PASS
- V2 deterministic fuzz: 10,000 mutated raw inputs — PASS
- Murder Attack V3: all 15 new adversarial groups — PASS
- JavaScript syntax sweep for `src/*.js` — PASS

## Certification boundary

Murder Attack V3 certifies only the automated engineering scope represented by these tests and checks. It does not replace rendered-browser visual QA, real interaction QA, deployment verification, payment/access-path verification, or final release certification.
