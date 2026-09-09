# QuoteRescue Root-Cause Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace QuoteRescue's shallow scoring/message layer with a safe, validated, coherent recovery-decision pipeline while preserving the static zero-backend product model.

**Architecture:** Split raw parsing/validation, context reconciliation, priority scoring, and campaign generation into isolated modules. Keep `engine.js` as the public facade and make `app.js` an explicit UI-state controller so stale/invalid plans cannot masquerade as current results.

**Tech Stack:** Browser ES modules, Node.js 20+ built-in test runner, semantic HTML/CSS, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-09-quoterescue-root-cause-redesign.md`

## Global Constraints
- Static browser app; no backend, account, CRM, or AI API.
- Contact-permission block must execute before scoring or campaign generation.
- No generated copy may invent discounts, scarcity, guarantees, availability, or actions not supplied by the user.
- Invalid numeric and enum input must be rejected, never silently normalized.
- 30+ day reactivation is separate from the 7-day cadence.
- UI copy/download must be disabled for stale, invalid, or blocked outreach plans.
- Preserve escaped rendering for all user-controlled text.

---

### Task 1: Harden raw input and domain contracts

**Files:**
- Create: `src/domain.js`
- Create: `tests/domain.test.mjs`

**Interfaces:**
- Produces: `parseInput(raw): { valid, errors, value }`
- Produces: exported `STAGES`, `BLOCKERS`, `TONES`, `CHANNELS`, `LIMITS`
- Produces: `sanitizeSingleLine(text, max)`, `sanitizeText(text, max)`

- [ ] Write failing tests for malformed/negative/non-finite numbers, unknown enums, control characters, and maximum lengths.
- [ ] Verify tests fail because the module does not exist.
- [ ] Implement minimal safe parsing and sanitization.
- [ ] Verify domain tests pass.

### Task 2: Derive safe recovery context

**Files:**
- Create: `src/context.js`
- Create: `tests/context.test.mjs`

**Interfaces:**
- Consumes: parsed input from `domain.js`
- Produces: `deriveRecoveryContext(input)` with `contactState`, `engagementState`, `primaryBlocker`, `recoveryMode`, `confidence`, `evidence`, `conflicts`

- [ ] Write failing tests for explicit opt-out/no-contact, competitor loss, positive intent, delayed timing, budget, financing, trust, partner approval, and stage/objection reconciliation.
- [ ] Verify tests fail.
- [ ] Implement conservative phrase classes and reconciliation rules.
- [ ] Verify context tests pass.

### Task 3: Replace score with strategy-safe priority

**Files:**
- Create: `src/scoring.js`
- Create: `tests/scoring.test.mjs`

**Interfaces:**
- Consumes: parsed input + derived context
- Produces: `scorePriority(input, context): { score, band, factors }`

- [ ] Write failing tests proving blocked=0, lost/ghosted cannot receive active-priority band, age lowers score, positive engagement can raise priority, and factors remain explainable.
- [ ] Verify tests fail.
- [ ] Implement minimal strategy-safe scoring.
- [ ] Verify scoring tests pass.

### Task 4: Build channel- and tone-aware campaigns

**Files:**
- Create: `src/messages.js`
- Create: `tests/messages.test.mjs`

**Interfaces:**
- Consumes: parsed input + context
- Produces: `buildCampaign(input, context)` and `buildDiagnosis(input, context)`

- [ ] Write failing tests for blocked=no campaign, SMS budgets, phone Day 0 voicemail+SMS, email Day 0 subject+body, tone variation across campaign, sanitized subject, separate reactivation, and no forbidden claims/placeholders.
- [ ] Verify tests fail.
- [ ] Implement bounded project references, tone profiles, and channel-specific steps.
- [ ] Verify message tests pass.

### Task 5: Rebuild engine facade and export

**Files:**
- Modify: `src/engine.js`
- Modify: `tests/engine.test.mjs`

**Interfaces:**
- Produces: `validateInput(raw)`, `generateRecoveryPlan(raw)`, `formatPlanText(raw, plan)`
- Unified plan shape follows redesign spec.

- [ ] Replace old happy-path tests with facade tests while retaining regression coverage.
- [ ] Verify tests fail against old engine.
- [ ] Replace monolithic implementation with imports/delegation to new modules.
- [ ] Verify all engine/domain/context/scoring/message tests pass.

### Task 6: Redesign UI input and truthful result state

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `styles.css`
- Create: `tests/ui-source.test.mjs`

**Interfaces:**
- UI states: `empty`, `current`, `stale`, `invalid`, `blocked`

- [ ] Write source-contract tests for representative identity fields, error summary, stale banner, accessibility connections, blocked result surface, and separate reactivation section.
- [ ] Verify source tests fail.
- [ ] Update form and result markup.
- [ ] Update app controller so edits mark current plan stale and disable copy/download.
- [ ] Add accurate clipboard failure handling and reduced-motion-safe scrolling.
- [ ] Update responsive styles for new states.
- [ ] Verify source-contract tests and full suite pass.

### Task 7: Murder regression suite

**Files:**
- Create: `tests/murder.test.mjs`
- Modify: `package.json` only if test discovery requires it.

- [ ] Add adversarial cases from the QA report: opt-out, attorney/no-contact, invalid numerics, unknown enums, contradictions, 1,080 supported combinations, max-length input, forbidden claims, and message budgets.
- [ ] Run the full suite and require zero failures.
- [ ] Run JS syntax checks on all source modules.
- [ ] Re-read the redesign acceptance criteria and record any remaining unverified browser-only items in README rather than claiming certification.

### Task 8: Update product documentation

**Files:**
- Modify: `README.md`

- [ ] Document redesigned safety gate, scoring meaning, input limits, campaign structure, and remaining live-browser verification boundary.
- [ ] Run the full test suite again after documentation-only changes to preserve fresh release evidence.
