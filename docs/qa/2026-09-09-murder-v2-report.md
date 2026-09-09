# QuoteRescue V2 Murder Test Report

## Scope

Destructive QA against `main` commit `7c4540ced57ade10baee77191025d69e6f868a87` using draft PR #1 / branch `qa-murder-v2-10000`.

Coverage added by `tests/murder-v2.test.mjs`:
- 25,920 deterministic supported-state combinations across stage, blocker, tone, channel, permission, quote age, and contact age.
- 10,000 deterministic fuzz mutations.
- Strong opt-out/wrong-recipient phrase attacks.
- Channel-specific contact restriction attacks.
- Semantic negation and resolved-objection attacks.
- Negative-intent phrase attacks.
- Structured-vs-text contradiction attacks.
- Numeric grammar attacks.
- Maximum legal input/output-budget attacks.
- Browser-network/exfiltration primitive scan.

GitHub Actions result: 59 test groups; 51 passed; 8 failed.

## Critical findings

### QR-V2-001 — Strategy/campaign divergence
The matrix produced 12,240 contract violations:
- 8,640 same-day schedule contradictions: `nextMove` says not to follow up today while the campaign still begins at `Day 0`.
- 1,980 reactivation cases still receive a four-step active seven-day cadence.
- 1,620 close-loop cases still receive a four-step active seven-day cadence despite diagnosis saying to send one respectful close-loop message and stop repeated chasing.

Root cause: campaign construction does not branch on `recoveryMode` except for `blocked`; cadence generation is fixed after diagnosis/scoring.

### QR-V2-002 — Opt-out vocabulary coverage is too narrow
38 strong opt-out/wrong-recipient phrases were attacked; 34 were not recognized as blocking by the current global phrase gate. Examples include `STOP`, `Please stop`, `Leave me alone`, `Take me off your list`, `I revoke consent to contact me`, `Cease contact`, `This is the wrong number`, and `Do not reach out`.

Some channel-specific phrases should become channel restrictions rather than necessarily global blocks, but the current model has no way to represent them safely.

Root cause: hard-block regexes enumerate only a small set of exact verb/object constructions.

### QR-V2-003 — Channel-specific restrictions cannot be honored
All 9 explicit channel-restriction attacks failed. Examples: `Do not call me; text is fine` still produced `Voicemail + SMS`; `Do not text me; call instead` still produced SMS; `Do not email me; call instead` still produced email.

Root cause: V1.1 has only `allowed`, `unknown`, and `do_not_contact`. There is no per-channel permission/restriction state, yet campaign generation independently uses the selected primary channel.

## High findings

### QR-V2-004 — Cue parser creates false blockers from resolved/positive statements
18 semantic false positives were reproduced. Examples:
- `Budget is fine` => budget blocker / negative engagement.
- `Financing is approved` => financing blocker / negative engagement.
- `We trust you` => trust blocker / negative engagement.
- `Timing is perfect` => timing blocker / nurture.
- `My husband approved it` => spouse/partner blocker.
- `We have not hired another contractor` => competitor loss / close-loop.

Root cause: first-match regex classification treats keyword presence as blocker evidence without local polarity/negation/resolution semantics.

### QR-V2-005 — Additional negative-intent constructions become positive intent
Five phrases including `I can't move forward`, `I cannot move forward`, and `Unable to move forward` were classified as positive engagement.

Root cause: broad positive `move forward` matching is not preceded by comprehensive negation/inability handling.

### QR-V2-006 — Contrast and temporal resolution are ignored
All 5 tested `old problem, but now resolved` sentences were trapped by the earlier negative cue. Example: `Budget was a concern, but it is resolved and we are ready to proceed` stayed a budget objection.

Root cause: `textCue` returns the first matching cue from a static precedence list and has no clause/contrast or resolution model.

### QR-V2-007 — Stage/text contradictions can be hidden while confidence remains high
2 of 4 targeted impossible mixed states were not surfaced as conflicts. Example: stage `lost_ghosted` + text `Customer is ready to proceed with us` yielded positive engagement + close-loop mode + high confidence + no conflict.

Root cause: conflict generation focuses on blocker-vs-blocker disagreement, not engagement/mode contradictions between structured stage and text evidence.

## Medium finding

### QR-V2-008 — Non-decimal JavaScript numeric grammar is accepted
`0x10`, `0b1010`, and `0o77` were accepted for both quote amount and quote age and converted to 16, 10, and 63.

Root cause: numeric parsing delegates grammar to `Number(text)` and then validates only finiteness/range/integer-ness.

## What survived V2

- No crashes in the 25,920 supported-state matrix.
- 10,000 deterministic fuzz mutations completed without validation crashes; valid cases remained deterministic.
- Existing score bounds and strategy band caps survived.
- SMS limits, voicemail/email size checks, email subject single-line/length checks, and maximum-shape export-size checks survived.
- Phone Day 0 still includes voicemail + SMS; email Day 0 includes subject + body.
- Forbidden generated sales-claim scan survived the clean-input matrix.
- Browser source scan found no `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, or `EventSource` transport primitives.
- Existing V1.1 tests remained green; failures are from new V2 attack coverage.

## Release decision

**HOLD.** Do not merge the QA PR as a product change. Keep it as an adversarial specification until the root causes are redesigned and all V2 tests pass.