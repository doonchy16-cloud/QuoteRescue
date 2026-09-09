# QuoteRescue Root-Cause Redesign

## Goal
Redesign QuoteRescue V1 so its paid value comes from reliable recovery judgment, safe contact decisions, coherent strategy, and genuinely send-ready channel-specific copy—not from shallow field substitution.

## Root causes
The murder test exposed architectural, not cosmetic, defects:

1. **Safety state was implicit.** `lastContact` was treated only as blank/nonblank, so explicit opt-outs, legal no-contact requests, competitor loss, and positive intent all collapsed to the same +4 context bonus.
2. **Normalization erased invalid data.** Invalid/negative/non-finite numeric inputs were silently coerced to plausible values before validation.
3. **Business state was fragmented.** Stage and objection were scored independently without reconciliation, producing contradictory diagnosis, score band, and message strategy.
4. **Campaign generation was monolithic.** Tone mostly changed the opener; channel-specific requirements, message-length budgets, contact sequence structure, and representative identity were not first-class concepts.
5. **UI state was one-way.** Once a plan was generated, edits did not mark it stale and invalid resubmission could leave an old plan visible.
6. **The old score implied precision unsupported by the model.** The score mixed simple heuristics with labels such as “Hot recovery,” even when the strategic state was reactivation or closure.

## Redesign principles

### 1. Parse first, then normalize safely
Raw values must be validated before coercion can change meaning. Numeric fields must reject non-finite, negative, malformed, or out-of-range values. Enum fields must reject unknown values. Text fields must be trimmed, control characters removed, and bounded by explicit maximum lengths.

### 2. Contact permission is a hard gate
Contactability is evaluated before recovery strategy or score generation.

Contact states:
- `allowed`
- `limited_channel`
- `do_not_contact`
- `unknown`

Hard-block signals include explicit opt-out language such as “stop texting,” “do not contact,” “unsubscribe,” “never contact,” legal no-contact instructions, or equivalent phrases. A blocked plan must produce no outbound sequence and must state that outreach is blocked until permission is restored outside QuoteRescue.

V1 does not attempt legal interpretation. It uses conservative deterministic phrase matching plus explicit structured input.

### 3. Separate observed context from inferred recovery state
The engine derives a `RecoveryContext` from structured inputs and deterministic text cues.

Derived context fields:
- `contactState`
- `engagementState`: `positive`, `neutral`, `unresponsive`, `negative`, `lost`, `unknown`
- `primaryBlocker`: `none`, `budget`, `price`, `timing`, `competitor`, `trust`, `financing`, `partner_approval`, `not_ready`, `unknown`
- `recoveryMode`: `active_followup`, `objection_resolution`, `nurture`, `reactivation`, `close_loop`, `blocked`
- `confidence`: `high`, `medium`, `low`
- `evidence`: deterministic explanation strings

Structured stage/objection selections remain authoritative when present; text cues can strengthen, downgrade, or block, but cannot silently contradict an explicit structured choice without surfacing the conflict.

### 4. Reconcile stage and objection before scoring
The engine must use a single derived `recoveryMode` and `primaryBlocker` before calculating priority. Contradictory inputs must create a visible reconciliation note rather than two independent strategies.

Examples:
- `budget_issue + none` => `primaryBlocker=budget`
- `financing_issue + none` => `primaryBlocker=financing`
- `lost_ghosted + fresh age` => `recoveryMode=close_loop` or `reactivation`, never “strong follow-up”
- `considering_competitor + none` => `primaryBlocker=competitor`

### 5. Replace “hotness” with recovery priority
The 0–100 value is retained as an explainable work-priority score, but bands become strategy-safe:
- 75–100: `Priority follow-up`
- 55–74: `Active recovery`
- 35–54: `Nurture / resolve blocker`
- 1–34: `Reactivation / close loop`
- 0: `Do not contact`

The score must never override a blocking contact state.

### 6. Make last-contact meaning real
Deterministic phrase classes must identify at minimum:
- explicit opt-out / no-contact
- hired/selected competitor
- positive intent / wants to proceed
- delayed/not-ready language
- budget/price concern
- financing concern
- trust/uncertainty concern
- spouse/partner approval

The text parser must expose matched cues in evidence. It must not pretend semantic certainty; unmatched text remains neutral/unknown.

### 7. Build campaigns from channel strategy
Campaign generation is separate from diagnosis/scoring.

Each `CampaignPlan` contains:
- `mode`
- `primaryChannel`
- `messages[]`
- `reactivation`
- `objectionResponse`
- `closeLoop`

The Day 0 step must contain everything its action label promises.
- Phone: voicemail + follow-up SMS as separate copy fields in the same step.
- Email: subject + body together.
- SMS: SMS only.

The 30+ day reactivation item is not part of the “7-day cadence.” It is rendered separately.

### 8. Enforce message budgets
Recommended soft limits:
- SMS target <= 320 chars, prefer <= 240
- Voicemail target <= 650 chars
- Email subject <= 90 chars and single-line only
- Email body target <= 1,500 chars

If user input is long, messages use a bounded short project reference rather than embedding the full raw description.

### 9. Make tone systemic
Tone must alter not only the opener but CTA style, sentence length, formality, and close-loop language across the campaign. Five tones remain: warm, concise, consultative, premium, direct.

### 10. Make outputs send-ready
Add:
- representative first name
- business name (optional)
- callback phone (optional)

Generated voicemail must never contain `[Your Name]`.

### 11. UI state must be truthful
After a plan is generated:
- any form edit marks the plan `stale`
- stale output remains visible but clearly disabled/labeled until regenerated
- an invalid resubmit must not present old output as current
- copy/download actions must be disabled while stale or invalid
- clipboard success is shown only when copy succeeds

### 12. Accessibility
- field errors use `aria-invalid=true`
- error text is connected through `aria-describedby`
- an error summary is announced
- reduced-motion users do not receive forced smooth scroll
- status changes use polite live regions

## Proposed module boundaries

### `src/domain.js`
Enums, constraints, safe raw parsing, validation, text sanitization.

### `src/context.js`
Contact-permission detection, last-contact cue classification, stage/objection reconciliation, derived recovery state.

### `src/scoring.js`
Strategy-safe priority scoring and factor explanations. Does not generate copy.

### `src/messages.js`
Tone profiles, channel-specific message building, bounded project references, subject sanitization, length budgets.

### `src/engine.js`
Facade only: validate -> derive context -> block if needed -> score -> build campaign -> return unified plan.

### `src/app.js`
UI state machine, rendering, stale/invalid handling, clipboard/download behavior.

## Unified plan shape

```js
{
  input,
  context: {
    contactState,
    engagementState,
    primaryBlocker,
    recoveryMode,
    confidence,
    evidence,
    conflicts
  },
  priority: {
    score,
    band,
    factors
  },
  diagnosis,
  nextMove,
  campaign: {
    sevenDaySteps,
    reactivation,
    objectionResponse,
    closeLoop
  },
  blocked,
  blockedReason
}
```

## Acceptance criteria
- Explicit no-contact language always yields score 0, mode `blocked`, no outbound campaign, and no copy/downloadable outreach plan.
- Invalid numeric input is rejected rather than silently normalized.
- Unknown enum values are rejected.
- Stage/objection contradictions are reconciled deterministically and explained.
- `budget_issue + none` produces budget-specific diagnosis and copy.
- `financing_issue + none` produces financing-specific diagnosis and copy.
- `lost_ghosted` never receives a priority band implying active/hot follow-up.
- Last-contact cue classes materially alter derived context where deterministic evidence exists.
- Phone Day 0 contains voicemail and SMS.
- Email Day 0 contains subject and body.
- 30+ day reactivation is separate from the 7-day cadence.
- Generated SMS remains within the configured maximum for all supported stages, blockers, and tones using maximum allowed input lengths.
- No generated message invents discounts, scarcity, guarantees, availability, or actions not supplied by the user.
- No `[Your Name]` placeholder appears when valid representative identity is supplied.
- Any form change after generation marks results stale and disables copy/download until regeneration.
- Error states do not leave an old plan appearing current.
- Existing XSS escaping remains intact.
- Automated tests cover normal, boundary, contradictory, and safety cases.
