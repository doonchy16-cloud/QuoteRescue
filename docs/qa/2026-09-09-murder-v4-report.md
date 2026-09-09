# QuoteRescue Murder Attack V4 — QA Report

Date: 2026-09-09
Branch: `redesign-v2`
Base: `main`
Scope: browser/state-machine, data-fidelity, Unicode-boundary, and browser-I/O robustness extension after Murder Attack V3.

## Purpose

Murder Attack V4 targeted boundary failures that can survive semantic, combinatorial, and malformed-input testing: exact currency fidelity, JavaScript UTF-16 truncation behavior, delegated browser events, clipboard fallback failure, temporary download-resource cleanup, and stale-result action gating.

The V4 tests were added before production fixes. Failures were observed in GitHub Actions before code was changed.

## V4 attack groups

1. Currency fidelity: cent values must survive generation and export exactly.
2. Currency grammar: quote amounts with more than two fractional digits must be rejected.
3. Unicode boundary: project-reference truncation must never split a surrogate pair.
4. Unicode propagation: generated and exported payloads must remain well-formed UTF-16.
5. Truncation alignment: SMS and email-subject truncation must remain well-formed across many emoji boundary positions.
6. Clipboard fallback failure: temporary textarea cleanup must be guaranteed even when the fallback copy operation throws.
7. Delegated click robustness: non-Element event targets must not crash the document-level copy handler.
8. Download failure: temporary anchor/object URL cleanup must be guaranteed and failure must be surfaced honestly.
9. Stale-state export gating: direct copy/download paths must independently require a current plan and form changes must invalidate the generated result.

## Initial RED evidence

### Run #36

Commit: `ae07fdb55284f9155921633f33fd46660a4f0586`
Run ID: `34352332927`

Observed:
- Total tests: 99
- Passed: 92
- Failed: 7
- Stale-state action gating passed immediately.

The first seven failures exposed:
- cents silently rounded in customer-facing copy/export;
- quote amounts with arbitrary fractional precision accepted;
- project-reference truncation splitting UTF-16 surrogate pairs;
- malformed Unicode propagating into generated payloads;
- clipboard fallback cleanup not guaranteed when `execCommand` throws;
- delegated click handling assuming every event target implements `closest`;
- download cleanup not protected against exceptions.

### Expanded RED run #37

Commit: `802628865a1b52dab4685044fc649dda3238b404`
Run ID: `34352528852`

The Unicode attack was expanded across truncation alignments. Observed:
- Total tests: 100
- Passed: 92
- Failed: 8

The new failing group proved that email-subject truncation could also split a surrogate pair. This established a shared truncation primitive as the appropriate root fix rather than patching only project references.

## Root fixes

### Currency semantics

`src/domain.js`
- Quote amount grammar is now explicitly limited to at most two fractional digits.
- Added one shared currency-formatting helper for customer-facing output.
- Whole-dollar amounts retain compact whole-dollar display; cent-bearing amounts retain two decimal places.

`src/messages.js`
- Generated email quote amounts now use the shared currency formatter instead of `Math.round`.

`src/engine.js`
- Plain-text export quote amounts now use the same shared currency formatter.

### Unicode-safe truncation

`src/domain.js`
- Added one truncation helper that preserves the existing UTF-16 code-unit length budget while preventing a cut after a lone high surrogate.
- `shortProjectReference` now uses the shared safe truncation helper.

`src/messages.js`
- SMS and email-subject bounds now use the same safe truncation helper.
- This removes the shared code-unit slicing defect across project references, SMS output, and email subjects.

### Browser I/O hardening

`src/app.js`
- Clipboard fallback now catches fallback-copy exceptions, reports failure honestly, and removes the temporary textarea in `finally`.
- Delegated document click handling verifies that the event target is an `Element` before calling `closest`.
- Text-download handling now catches click failures, reports `Download failed`, and always removes the temporary anchor and revokes the object URL in `finally`.
- Existing stale/current guards remain independently enforced for copy and download actions.

## Final candidate verification

Candidate commit before this report: `f5064a554b2a377efd35b8ab0b6a64c173af030a`
GitHub Actions run: `#42`
Run ID: `34353092276`

Observed result:
- Tests: 100
- Passed: 100
- Failed: 0
- Cancelled: 0
- Skipped: 0
- Todo: 0
- V2 combinatorial matrix: 25,920 supported states — PASS
- V2 deterministic fuzz: 10,000 mutated raw inputs — PASS
- Murder Attack V3 regression groups — PASS
- Murder Attack V4: all 9 new groups — PASS
- JavaScript syntax sweep for `src/*.js` — PASS

## Certification boundary

Murder Attack V4 certifies the automated engineering scope represented by the repository tests and syntax checks. It does not replace rendered-browser visual QA, true browser interaction testing across engines/devices, deployment verification, or payment/access-path verification. Those remain separate release gates.
