# QuoteRescue Murder Attack V6 — Real Browser QA

Date: 2026-09-09
Branch: `redesign-v2`
Scope: real Chromium browser behavior, keyboard validation flow, live/stale state integrity, DNC rendering, browser download fidelity, reduced-motion behavior, responsive/mobile layout, and rendered evidence.

## Certification rule

V6 is PASS only if every V6 browser test is green, the inherited Node regression suite is green, JavaScript syntax checks are green, rendered desktop/mobile evidence is reviewed, and the exact report-inclusive head is reverified in CI. V6 does not certify untested browser engines, deployment, or payment/access flows.

## Infrastructure added

- Playwright `1.63.0` as a development dependency.
- `npm run test:browser` runs `tests/browser-v6.mjs`.
- GitHub Actions now contains a separate `browser-v6` job.
- The browser job installs Chromium and uploads `artifacts/v6/` on every run.
- V1–V5 Node regression and JavaScript syntax checks remain isolated in the existing `test` job.

## V6 browser attack matrix

1. Valid desktop plan renders without page errors and exposes a usable current plan.
2. Keyboard submit exposes validation and focuses the first invalid field in visual/form order.
3. Ordinary input edits visibly stale an existing plan and disable all export controls.
4. Silent DOM value mutation without input/change events is caught by export-time live-form revalidation.
5. Global do-not-contact state renders a hard block and exposes no usable export.
6. Real browser download contains the current plan and preserves exact currency value `$8,400.50`.
7. Reduced-motion browser preference causes non-smooth result scrolling.
8. Mobile channel-permission controls collapse to a usable single column.
9. Mobile send-hold presentation collapses to one column.
10. Mobile resolved channel-policy cards remain readable without horizontal viewport overflow or page errors.

## RED evidence

### Run #55 — first real-browser RED

Workflow run: `34400856305`
Browser result: **8 passed / 2 failed**.
Inherited Node/syntax job: PASS.

Failures:

- **Real defect:** keyboard validation focused `customerName` even though `repName` is the first invalid field in visual form order.
- **Over-constrained test:** an initial mobile assertion required the resolved policy summary to use exactly one column. Chromium showed the existing two-column phone layout without horizontal overflow; the test was refined to measure actual readability/overflow instead of dictating an arbitrary layout.

### Run #57 — refined RED

Workflow run: `34401253910`
Browser result: **9 passed / 1 failed**.
Inherited Node/syntax job: PASS.

The sole remaining failure was the real keyboard-focus defect:

- expected focus: `repName`
- actual focus: `customerName`

All mobile, stale-state, DNC, download, reduced-motion, and happy-path browser tests were green.

## Root cause

`showErrors()` focused the first key in the validation error object:

```js
form.elements.namedItem(Object.keys(errors)[0])?.focus();
```

Validation object order is not the same as the visible form order. `customerName` is validated before `repName`, while `repName` appears first in the form. Keyboard users therefore landed on the wrong invalid control.

## Production fix

`showErrors()` now selects the first invalid field by the form's actual DOM order:

```js
const firstInvalid = Array.from(form.elements).find((field) => field?.name && errors[field.name]);
firstInvalid?.focus();
```

Production fix commit: `0a9703cc191418c3eedc7265de42563726e24e38`.

No recovery-engine semantics or mobile layout design were changed for this fix.

## GREEN evidence

### Run #58 — post-fix candidate

Workflow run: `34401598225`
Tested branch head: `0a9703cc191418c3eedc7265de42563726e24e38`

Browser job:

- Chromium E2E: **10 / 10 PASS**
- failures: 0
- skipped: 0
- cancelled: 0

Inherited Node/syntax job:

- Node regression: **108 / 108 PASS**
- failures: 0
- JavaScript syntax check: PASS

Browser evidence artifact:

- artifact ID: `10123682640`
- artifact name: `quoterescue-v6-browser-evidence`
- digest: `sha256:03ff3444e0bc995282ace8378e26c1d1314096d3c9bafb7ecc0e1fe3b73c92fe`
- head SHA: `0a9703cc191418c3eedc7265de42563726e24e38`
- includes `desktop-current.png` and `mobile-current.png`

## Rendered evidence review

The exact post-fix Chromium screenshots were downloaded and visually inspected.

### Desktop

- Hero hierarchy and workbench layout remain intact.
- Intake and result surfaces stay visually separated and readable.
- Result toolbar, policy summary, score card, and campaign controls fit without visible clipping.
- No raw/debug-style browser UI is exposed.

### Mobile — 390 × 844 viewport

- Form sections stack correctly.
- Permission controls are full-width and usable.
- Send-hold layout stacks correctly.
- Two-column resolved policy summary remains legible; it is intentionally retained.
- Measured browser invariant reports no horizontal viewport overflow.
- Score, context, timeline, and message cards remain readable down the page.
- No browser page errors were emitted by the tested flows.

## V6 scope scorecard

| Category | Result |
| --- | --- |
| Chromium happy path | 10.0/10 |
| Keyboard validation navigation | 10.0/10 |
| Stale/live-state integrity | 10.0/10 |
| DNC browser behavior | 10.0/10 |
| Browser download fidelity | 10.0/10 |
| Reduced-motion behavior | 10.0/10 |
| Mobile interaction/layout invariants | 10.0/10 |
| Rendered Chromium visual inspection | 10.0/10 |
| V1–V5 regression preservation | 10.0/10 |
| JavaScript syntax | 10.0/10 |

Candidate V6 status: **10.0/10 within the tested Chromium/browser scope**, pending one final CI run on the report-inclusive head.

## Explicit non-certifications

V6 does **not** establish any of the following:

- Firefox compatibility.
- WebKit/Safari compatibility.
- Production hosting/deployment behavior.
- Payment, checkout, entitlement, or access-control behavior.
- Real assistive-technology/screen-reader interoperability beyond the tested keyboard and DOM/accessibility behavior.

Those remain separate gates and must not be implied by the V6 Chromium PASS.
