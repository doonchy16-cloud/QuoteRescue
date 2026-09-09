# QuoteRescue V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, static, paid-value QuoteRescue V1 that diagnoses stale quotes and generates a deterministic multi-channel recovery plan.

**Architecture:** A dependency-free browser app separates pure recovery logic (`src/engine.js`) from DOM/rendering (`src/app.js`). The pure engine is covered with Node's built-in test runner; the UI consumes only the engine's public functions and can be hosted as static files.

**Tech Stack:** HTML5, CSS3, vanilla ES modules, Node.js built-in `node:test`, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-09-quoterescue-v1-design.md`

## Global Constraints

- Standalone product; no QuoteSnap integration.
- No backend or paid AI API in V1.
- No server-side customer data storage.
- No invented discounts, scarcity, availability, guarantees, or actions.
- Score is a prioritization aid, not a conversion prediction.
- Vercel deployment is deferred until after V1 implementation and verification.

---

### Task 1: Recovery engine and tests

**Files:**
- Create: `tests/engine.test.mjs`
- Create: `src/engine.js`
- Create: `package.json`

**Interfaces:**
- Produces: `validateInput(input) -> { valid, errors }`
- Produces: `scoreRecovery(input) -> { score, band, factors }`
- Produces: `generateRecoveryPlan(input) -> plan`

- [ ] **Step 1: Write failing tests** covering required-field validation, 0-100 score bounds, materially lower aging score, objection-specific output, tone-specific output, and required plan artifacts.
- [ ] **Step 2: Run `npm test` and confirm failure because `src/engine.js` does not exist.**
- [ ] **Step 3: Implement the minimal deterministic engine.** Normalize input, calculate factorized score, select diagnosis/recommendation, build channel/tone/objection-aware copy, and return all required artifacts.
- [ ] **Step 4: Run `npm test` and require zero failures.**
- [ ] **Step 5: Refactor only while tests stay green.**

### Task 2: Paid-value single-page UI

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/app.js`

**Interfaces:**
- Consumes: `validateInput`, `generateRecoveryPlan` from `src/engine.js`.
- Produces: responsive intake form, diagnosis dashboard, score/factors, recovery timeline, copy actions, full-plan export.

- [ ] **Step 1: Create semantic app shell and complete intake form.**
- [ ] **Step 2: Wire submit flow to pure engine validation/generation.**
- [ ] **Step 3: Render score, diagnosis, next move, sequence, SMS, email, voicemail, objection response, close-loop, reactivation.**
- [ ] **Step 4: Implement delegated copy buttons plus `Copy full plan` and `Download .txt`.**
- [ ] **Step 5: Add privacy/compliance copy and loading/empty/error states.**
- [ ] **Step 6: Apply responsive visual system with a usable 375px layout.**

### Task 3: Release documentation and verification

**Files:**
- Create: `README.md`
- Create: `.gitignore`

**Interfaces:**
- Documents local run/test procedure and Vercel-ready static structure.

- [ ] **Step 1: Document product scope, local serving, tests, privacy boundary, and deferred features.**
- [ ] **Step 2: Run `npm test` fresh and require zero failures.**
- [ ] **Step 3: Serve locally with `python -m http.server 4173` and verify `index.html`, `styles.css`, `src/app.js`, and `src/engine.js` return HTTP 200.**
- [ ] **Step 4: Verify repository contents against the V1 design acceptance criteria and report any unverified browser-only items as HOLD rather than PASS.**
