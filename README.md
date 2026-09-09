# QuoteRescue V1.1 — Root-Cause Redesign

QuoteRescue is a standalone estimate-recovery workbench for home-service contractors. It turns a stale or at-risk quote into a **safe recovery decision**, an explainable work-priority score, a reconciled recovery strategy, and ready-to-review SMS/email/voicemail follow-up copy.

## What changed in V1.1

The original V1 passed its happy-path tests but murder testing exposed architectural defects. V1.1 redesigns the pipeline rather than patching symptoms.

### Safety first
- Explicit `Do not contact` is a hard block.
- Deterministic opt-out/no-contact phrases in the last-contact context are detected before scoring.
- Blocked opportunities receive score `0`, no outbound sequence, and a clear stop instruction.

### Real input validation
- Malformed, negative, non-finite, and out-of-range numbers are rejected rather than silently coerced.
- Unknown stage/objection/tone/channel values are rejected.
- Text fields have explicit size limits and control-character cleanup.

### Reconciled recovery intelligence
- Stage, selected objection, and deterministic context cues are reconciled into one derived recovery state.
- The plan exposes contact state, engagement state, primary blocker, recovery mode, confidence, evidence, and any conflicts.
- `budget_issue + no objection` becomes budget-specific throughout the plan.
- `financing_issue + no objection` becomes financing-specific throughout the plan.
- Lost/ghosted and competitor-loss cases cannot be labeled as active/hot follow-up.

### Strategy-safe priority score
The 0–100 value is a work-priority heuristic, **not** a probability of conversion.

Bands:
- 75–100: Priority follow-up
- 55–74: Active recovery
- 35–54: Nurture / resolve blocker
- 1–34: Reactivation / close loop
- 0: Do not contact

### Better campaigns
- Tone affects multiple campaign steps, not only the opener.
- SMS output is bounded to 320 characters.
- Email subjects are single-line and bounded.
- Phone Day 0 includes both voicemail and follow-up SMS.
- Email Day 0 includes subject and body together.
- 30+ day reactivation is separate from the 7-day cadence.
- Representative name/business/callback information makes copy send-ready without `[Your Name]` placeholders.

### Truthful UI state
- Any input edit after generation marks the plan stale.
- Stale or invalid plans cannot be copied/downloaded as current.
- Blocked plans show a dedicated stop screen and disable outreach export actions.
- Field errors use `aria-invalid`, connected descriptions, and an announced error summary.
- Reduced-motion preferences are respected.

## Architecture

- `src/domain.js` — raw parsing, enums, constraints, sanitization
- `src/context.js` — contact gate, cue detection, stage/objection reconciliation
- `src/scoring.js` — strategy-safe priority scoring
- `src/messages.js` — tone/channel-specific campaign generation
- `src/engine.js` — public facade and export
- `src/app.js` — UI state controller and rendering
- `index.html` / `styles.css` — responsive interface

## Run locally

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Test

Requires Node.js 20+.

```bash
npm test
```

The test suite includes domain, context, scoring, messages, engine facade, UI source contracts, and a murder-test matrix covering all 1,080 supported stage × objection × tone × channel combinations.

## Privacy and responsible use

QuoteRescue V1.1 runs in the browser and does not upload/store entered customer data on a QuoteRescue server. Users remain responsible for contact permissions, opt-outs, applicable law, and reviewing every message before sending. Deterministic phrase detection is conservative and is **not legal advice**.

## Current verification boundary

Automated logic/source verification can run locally with no dependencies. Final visual interaction certification in ordinary desktop/mobile browsers remains required after deployment to a reachable preview URL. Vercel deployment, billing, authentication, CRM integrations, automatic sending, and AI APIs remain deferred unless explicitly added later.
