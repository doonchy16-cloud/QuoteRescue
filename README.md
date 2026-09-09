# QuoteRescue V1

QuoteRescue is a standalone estimate-recovery workbench for home-service contractors. It turns a stale or at-risk quote into an explainable recovery score, a recommended next move, a 7-day follow-up cadence, and ready-to-send SMS, email, voicemail, objection, close-the-loop, and reactivation copy.

## What V1 does

- Runs entirely in the browser.
- Requires no account, backend, CRM, or AI API.
- Produces a deterministic 0-100 recovery-priority score with factor breakdown.
- Changes diagnosis and copy based on quote age, stage, objection, tone, and preferred channel.
- Copies individual messages or the complete plan.
- Downloads the full recovery plan as a `.txt` file.
- Does not auto-send messages or alter customer data anywhere else.

## Local run

From the repository root:

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Tests

Requires Node.js 20+.

```bash
npm test
```

The V1 engine uses Node's built-in test runner and has no npm runtime dependencies.

## Privacy and responsible use

QuoteRescue V1 does not upload or store entered customer data on a server. Users are responsible for contacting only people they are permitted to contact, honoring opt-outs, reviewing messages before sending, and complying with applicable law and platform/provider rules. The recovery score is a prioritization aid, not a prediction or guarantee.

## V1 boundaries

Deferred until after V1 validation: authentication, cloud storage, billing, subscriptions, CRM integrations, auto-sending, AI APIs, analytics, teams, and Vercel deployment.
