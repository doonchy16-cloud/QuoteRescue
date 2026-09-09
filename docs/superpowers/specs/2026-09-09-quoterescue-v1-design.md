# QuoteRescue V1 Design

## Product goal
Build a standalone, paid-value contractor follow-up tool that turns a stale or at-risk quote into a practical recovery plan and ready-to-send communication sequence without requiring a backend, account, CRM integration, or paid AI API.

## V1 user
Home-service contractors, estimators, salespeople, and owner-operators following up on quotes for remodeling, HVAC, roofing, windows, plumbing, electrical, landscaping, and similar services.

## Core promise
Given the quote context, QuoteRescue diagnoses the recovery situation, assigns a transparent recovery score, recommends the best next move, and generates a tailored multi-channel follow-up sequence the user can copy or export.

## Scope
V1 is a static browser app. It runs client-side and stores no customer data on a server.

### Inputs
- Customer first name
- Service/trade
- Job description
- Quote amount
- Quote age in days
- Current stage: estimate sent, viewed/no reply, objection, considering competitor, delayed timing, budget issue, financing issue, lost/ghosted
- Primary objection
- Last contact summary
- Desired tone: warm, concise, consultative, premium, direct
- Preferred primary channel: SMS, email, phone/voicemail

### Outputs
- Recovery score from 0-100 with labeled factors
- Situation diagnosis
- Recommended next move
- 7-day recovery sequence with specific timing
- SMS copy
- Email subject/body copy
- Voicemail script
- Objection response
- Final close-the-loop message
- Reactivation message for older quotes
- Full text export

## Recovery score
The score is deterministic and explainable, not a prediction guarantee. It starts from a baseline and adjusts for quote age, stage, objection type, quote value, and recency/quality of last contact. It is displayed as a prioritization aid only.

Score bands:
- 75-100: Hot recovery
- 55-74: Strong follow-up opportunity
- 35-54: Nurture / objection resolution
- 0-34: Reactivation / close-the-loop

## Message engine
The generator uses a structured template engine, not random canned text. Each output is assembled from:
- trade/job context
- quote amount when present
- age/stage
- objection-specific framing
- tone rules
- CTA rules
- channel-specific length rules

Messages must avoid fake scarcity, fake discounts, invented availability, pressure claims, guarantees, or pretending the contractor took an action not supplied by the user.

## UX
One responsive page with three zones:
1. Header/value proposition and privacy note
2. Quote intake form
3. Recovery dashboard/results

Results use cards, score meter, factor chips, timeline steps, and copy buttons. A single "Copy full plan" and "Download .txt" action make the output immediately usable.

## Privacy and compliance boundary
No server storage in V1. Inputs remain in the browser session. The UI states that users must contact only people they are permitted to contact and honor opt-outs. QuoteRescue does not provide legal advice or guarantee response/conversion.

## Architecture
- `index.html`: app shell and semantic UI
- `styles.css`: responsive visual system
- `src/engine.js`: validation, recovery scoring, diagnosis, and message generation
- `src/app.js`: DOM wiring, rendering, clipboard/export
- `tests/engine.test.mjs`: deterministic behavior tests
- `package.json`: Node built-in test command; no runtime dependencies

## Acceptance criteria
- App works as a static site with no backend.
- Required fields validate clearly.
- Score is deterministic and bounded 0-100.
- Different stages/objections materially alter diagnosis and copy.
- Tone selection materially alters phrasing.
- Generated plan includes SMS, email, voicemail, objection handling, a 7-day sequence, final close-the-loop, and reactivation copy.
- Copy and `.txt` export work in supported browsers.
- No message engine path invents discounts, urgency, guarantees, or availability.
- Mobile layout remains usable at 375px width.
- Automated engine tests pass before release.

## Explicitly deferred
Authentication, cloud storage, CRM integrations, automatic sending, subscriptions/billing, AI API calls, analytics, teams, and Vercel deployment are deferred beyond V1.
