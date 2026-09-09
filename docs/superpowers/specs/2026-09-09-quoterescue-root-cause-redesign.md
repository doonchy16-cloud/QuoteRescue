# QuoteRescue Root-Cause Redesign

## Goal
Redesign QuoteRescue so paid value comes from reliable recovery judgment, safe contact decisions, coherent strategy, and genuinely usable channel-specific copy—not shallow field substitution.

## Root causes
Murder testing showed architectural defects: safety state was implicit; normalization erased invalid data; stage/objection/context were fragmented; campaign generation was monolithic; UI result state could become stale without saying so; and the old score implied more precision than the model supported.

## Governing pipeline

`raw input -> validate/sanitize -> contact-permission gate -> derive/reconcile recovery context -> score work priority -> build diagnosis/next move -> build channel/tone campaign -> truthful UI state`

No later layer may bypass an earlier safety decision.

## Domain contract

### Valid contact states
- `allowed`
- `unknown`
- `do_not_contact`

`limited_channel` is intentionally **not modeled in V1.1**. The product cannot safely represent “allowed by only one channel” without also representing which channel is allowed. It must reject that ambiguous state rather than guess.

### Numeric validation
Quote amount, quote age, and optional days since last contact must reject malformed, negative, non-finite, fractional-when-integer-required, and out-of-range values. Validation happens before normalization can change meaning.

### Text limits
Customer/representative/business/trade/project/contact fields have explicit bounds; control characters are removed and single-line fields cannot inject newlines into generated subjects or headers.

## Contact-permission gate
Contactability is evaluated before recovery strategy or scoring. Structured `do_not_contact` and conservative deterministic opt-out/no-contact cues hard-block outreach. A blocked plan has score 0, recovery mode `blocked`, no campaign, no reactivation copy, and no copy/downloadable outreach result.

The phrase matcher is conservative and deterministic, not a legal interpretation engine.

## Recovery context
The engine derives:
- `contactState`
- `engagementState`: positive, neutral, unresponsive, negative, lost, unknown
- `primaryBlocker`: none, budget, price, timing, competitor, trust, financing, spouse_partner, not_ready, unknown
- `recoveryMode`: active_followup, objection_resolution, nurture, reactivation, close_loop, blocked
- `confidence`: high, medium, low
- `evidence[]`
- `conflicts[]`

Structured stage/objection choices remain authoritative when present. Deterministic text cues can strengthen, downgrade, close, reactivate, or block, but contradictions must be surfaced instead of silently producing multiple incompatible strategies.

### Cue precedence
Negative/final cues must be evaluated before positive-intent cues. At minimum:
1. explicit no-contact / opt-out
2. competitor loss
3. explicit decline / not interested / does not want to proceed
4. not-ready / on-hold timing
5. budget
6. financing
7. trust/uncertainty
8. spouse/partner approval
9. timing
10. positive intent

This prevents phrases such as “not ready to move forward” from being misread as positive intent.

### Recency
Optional `lastContactAgeDays` is a structured factor. Same-day contact lowers priority and the orchestrator must explicitly advise **not to send another follow-up today**. Unknown recency is not treated as recent contact.

Quote age >45 days with no positive engagement and no stronger structured recovery mode becomes `reactivation`, not active follow-up.

## Reconciliation
Stage, selected objection, text cues, quote age, and contact recency are reconciled into one recovery mode and one primary blocker before scoring or message generation.

Examples:
- `budget_issue + none` => blocker `budget`
- `financing_issue + none` => blocker `financing`
- `considering_competitor + none` => blocker `competitor`
- declined/competitor-loss context => `close_loop`
- old untouched quote => `reactivation`
- explicit selected blocker conflicting with text cue => selected blocker remains authoritative and a conflict is shown

`close_loop`, `reactivation`, and `blocked` strategy modes override blocker-specific diagnosis copy; the product must not tell a user both “close this” and “actively resolve budget” as simultaneous next moves.

## Priority score
The 0–100 value is a deterministic **work-priority heuristic**, not conversion probability.

Bands:
- 75–100: Priority follow-up
- 55–74: Active recovery
- 35–54: Nurture / resolve blocker
- 1–34: Reactivation / close loop
- 0: Do not contact

Factors include contact permission, quote age, optional contact recency, engagement, primary blocker, and quote value. Unknown permission lowers priority relative to explicitly allowed contact. Strategy-mode caps ensure close-loop/reactivation cannot receive an active-priority label.

## Campaign generation
Campaign generation is separate from diagnosis/scoring.

Requirements:
- Phone Day 0 contains voicemail **and** follow-up SMS.
- Email Day 0 contains subject **and** body.
- SMS Day 0 contains SMS only.
- 30+ day reactivation is separate from the 7-day cadence.
- Tone affects CTA/formality/close language across multiple steps, not just the opener.
- SMS is bounded to 320 characters.
- Email subject is single-line and <=90 characters.
- Long project text is represented by a bounded project reference.
- Representative identity removes `[Your Name]` placeholders.
- Generated campaign copy must not invent scarcity, guarantees, availability, urgency, or discount language not supplied by the contractor.

## UI truthfulness
States are explicit: `empty`, `current`, `stale`, `invalid`, `blocked`.

After generation, any form edit marks results stale and disables copy/download. An invalid resubmit cannot leave the old plan appearing current. Blocked plans render a dedicated stop state and disable outreach export. Clipboard success is reported only after a successful copy operation.

## Accessibility
Field errors use `aria-invalid`; descriptions connect through `aria-describedby`; an error summary is announced; status changes use live regions; reduced-motion users do not receive forced smooth scrolling.

## Module boundaries
- `src/domain.js`: contracts, sanitization, parsing, validation
- `src/context.js`: permission gate, cue classification, reconciliation
- `src/scoring.js`: strategy-safe work-priority scoring
- `src/messages.js`: diagnosis plus channel/tone campaign generation
- `src/engine.js`: facade/orchestration/export; applies same-day timing guard
- `src/app.js`: UI state machine/rendering/copy/download

## Acceptance criteria
- Explicit no-contact always => score 0 + blocked + no outbound copy.
- Invalid numbers/enums are rejected, never silently coerced.
- Ambiguous channel-limited permission is rejected.
- Negative/declined phrases cannot be classified as positive intent.
- Stage/objection contradictions reconcile deterministically and are explained.
- Budget/financing implied by stage are reflected throughout diagnosis and copy.
- Lost/declined/competitor-loss/old untouched opportunities cannot receive active follow-up strategy labels.
- Same-day prior contact produces an explicit “do not send another follow-up today” next move.
- Unknown permission lowers priority versus explicit allowed permission.
- Phone/email Day 0 include all copy their labels promise.
- Reactivation is separate from the 7-day cadence.
- Every supported stage × blocker × tone × channel combination remains within message budgets and forbidden-claim rules.
- Campaign output contains no `[Your Name]`, fake scarcity, guarantees, or discount language.
- Stale/invalid/blocked UI states cannot copy/download an outreach plan as current.
- Automated tests cover normal, boundary, contradiction, safety, and adversarial matrix cases.
