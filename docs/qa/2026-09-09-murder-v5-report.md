# QuoteRescue Murder Attack V5 Report

Date: 2026-09-09
Branch: `redesign-v2`
PR: #2 (`redesign-v2` -> `main`)
V5 baseline: `2152cf7a2b22f5ab9f34ed71c7536982c1fd9d3b`

## Purpose

Murder Attack V5 targeted semantic sentinel integrity and browser state/export boundaries that were not fully exercised by V1-V4. The attack intentionally used RED-first regression tests and preserved all inherited V1-V4 protections.

This report certifies only the automated-engineering scope described below. It is not evidence of real multi-browser interaction testing, rendered visual QA, deployment QA, or payment/access QA.

## Attack surface

V5 added eight regression attacks:

1. Blank optional quote amount must remain distinct from an explicitly supplied zero-dollar quote.
2. An explicit `$0` quote must survive scoring, generated email copy, and text export as supplied data.
3. Currency cents must remain identical across scoring, generated email copy, and text export.
4. The shared currency formatter must not coerce `null`, `undefined`, or an empty string into zero.
5. Copy/download paths must revalidate the live form instead of trusting an old UI status alone.
6. Browser back-forward cache restoration must invalidate a previously current plan.
7. Blob creation, object-URL creation, click failure, and partial download construction must be exception-safe with guarded cleanup.
8. Optional scrolling/browser capabilities must degrade safely when APIs are absent or throw.

## RED evidence

Initial V5 regression commit: `42d3e014c64dc382a9bcaf9c479c0de99fd9cfbb`
GitHub Actions run: #44

Result:

- Tests: 108
- Passed: 100
- Failed: 8
- Skipped: 0
- Cancelled: 0

All eight new V5 attacks failed while the inherited suite remained green.

### Confirmed defects

- Blank quote amount was normalized to numeric `0`, collapsing missing data and explicit zero into one state.
- Explicit zero-dollar quotes appeared as `Not supplied` in the quote-value factor and were omitted from generated email amount references.
- Scoring rounded a cents-bearing value such as `$8,400.50` to `$8,401` while other V4-hardened surfaces preserved cents.
- `formatCurrencyAmount(null)` and equivalent missing values formatted as `0` because of JavaScript numeric coercion.
- Copy/download export authorization depended on cached state and had no semantic comparison against the current live form.
- No `pageshow`/bfcache invalidation path existed for restored form state.
- Download construction protected the anchor click but not every earlier construction step; Blob/object-URL failures could escape before cleanup logic was fully established.
- Results scrolling assumed browser APIs were available and non-throwing.

## Root-cause fixes

### Optional numeric sentinel contract

`src/domain.js`

- Blank optional quote amount now normalizes to `null`.
- Explicit `0` remains numeric zero.
- `formatCurrencyAmount` returns an empty string for `null`, `undefined`, and `''` before numeric coercion.

### Currency fidelity across consumers

`src/scoring.js`, `src/engine.js`, `src/messages.js`

- Scoring now imports and uses the shared currency formatter.
- Quote presence is checked explicitly (`null`/`undefined`) rather than by truthiness.
- Zero-dollar quotes are treated as supplied values.
- Scoring, email copy, and export preserve the same cents representation.

### Live-form export freshness

`src/app.js`

- Added `ensureCurrentPlanFresh()`.
- It validates the current `FormData` and compares the normalized live form with the normalized input used to create the plan.
- A mismatch marks the existing result stale and prevents export.
- Copy and download retain V4's explicit `currentPlan`/`uiStatus` guards and then apply the stronger V5 semantic freshness check.

### Browser lifecycle and capability resilience

`src/app.js`

- `pageshow` with `event.persisted` marks a restored cached result stale.
- Scrolling is progressive enhancement: `matchMedia` and `scrollIntoView` are guarded against absence/throwing.
- Download construction initializes resource handles before the protected block, wraps Blob creation/object-URL creation/anchor creation/click in one try/catch, and conditionally cleans only resources that were actually created.
- Download failure is surfaced as `Download failed` rather than escaping silently.

## Intermediate regression evidence

GitHub Actions run #50 on `7973383bf7c60201525798f0b5ff71f503e1c982`:

- Tests: 108
- Passed: 107
- Failed: 1

All eight V5 tests passed. The one remaining failure was the inherited V4 structural assertion requiring copy and download functions themselves to contain an explicit `uiStatus !== 'current'` guard. V5 had centralized that check inside `ensureCurrentPlanFresh()`, which was functionally stronger but did not satisfy the inherited defense-in-depth contract.

Resolution: the explicit V4 per-export guard was restored while retaining V5 live-form semantic revalidation. No inherited test was weakened.

## GREEN candidate evidence

Candidate head: `7f18689117ab5b3203f1ad6595d87cc1ec0c4840`
GitHub Actions run: #51

Result:

- Tests: 108
- Passed: 108
- Failed: 0
- Skipped: 0
- Cancelled: 0
- JavaScript syntax sweep: PASS

The inherited V1-V4 suite and all eight V5 attacks pass together on the candidate head.

## Files changed by V5 before this report

- `tests/murder-v5.test.mjs`
- `src/domain.js`
- `src/scoring.js`
- `src/engine.js`
- `src/messages.js`
- `src/app.js`

This report adds:

- `docs/qa/2026-09-09-murder-v5-report.md`

## Verification limitation

An attempted local clone was not used as evidence because the execution container could not resolve `github.com`. GitHub Actions remains the authoritative V5 execution environment.

## V5 automated-engineering disposition

Candidate status: PASS for the V5 automated-engineering scope, contingent on a final GitHub Actions run succeeding on the documentation-inclusive branch head created by this report.

Overall QuoteRescue release status remains HOLD until separately required real-browser interaction QA, rendered visual QA, deployment QA, and payment/access QA are completed and individually certified where applicable.
