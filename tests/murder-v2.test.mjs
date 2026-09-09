import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateInput, generateRecoveryPlan, formatPlanText } from '../src/engine.js';
import { STAGES, BLOCKERS, TONES, CHANNELS } from '../src/domain.js';

const base = {
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'555-0100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400', quoteAgeDays:'3',
  lastContactAgeDays:'2', stage:'viewed_no_reply', objection:'none', lastContact:'Sent estimate after inspection.',
  contactPermission:'allowed', tone:'consultative', primaryChannel:'sms'
};

const forbiddenInvented = ['today only','limited time','last spot','guaranteed','[your name]','discount','act now'];

function collect(bucket, kind, label, details = {}) {
  bucket[kind] ??= { count:0, examples:[] };
  bucket[kind].count++;
  if (bucket[kind].examples.length < 6) bucket[kind].examples.push({ label, ...details });
}

function failIfAny(title, bucket, scenarioCount = null) {
  const total = Object.values(bucket).reduce((sum, item) => sum + item.count, 0);
  if (!total) return;
  throw new Error(`${title}${scenarioCount == null ? '' : ` — ${scenarioCount.toLocaleString()} scenarios`}\n` + JSON.stringify({ totalFindings:total, findings:bucket }, null, 2));
}

function campaignText(plan) {
  return JSON.stringify(plan.campaign).toLowerCase();
}

test('V2 combinatorial murder matrix: 25,920 supported states preserve global invariants', () => {
  const findings = {};
  const quoteAges = [0, 7, 46, 90];
  const contactAges = [null, 0, 7];
  const permissions = ['allowed','unknown'];
  let count = 0;

  for (const stage of STAGES)
    for (const objection of BLOCKERS)
      for (const tone of TONES)
        for (const primaryChannel of CHANNELS)
          for (const contactPermission of permissions)
            for (const quoteAgeDays of quoteAges)
              for (const lastContactAgeDays of contactAges) {
                count++;
                const raw = {
                  ...base, stage, objection, tone, primaryChannel, contactPermission,
                  quoteAgeDays:String(quoteAgeDays),
                  lastContactAgeDays:lastContactAgeDays == null ? '' : String(lastContactAgeDays)
                };
                let plan;
                try { plan = generateRecoveryPlan(raw); }
                catch (error) { collect(findings,'crash',`${stage}/${objection}/${tone}/${primaryChannel}/${contactPermission}/${quoteAgeDays}/${lastContactAgeDays}`,{ error:String(error?.message ?? error) }); continue; }

                if (!Number.isInteger(plan.score) || plan.score < 1 || plan.score > 100) collect(findings,'score_bounds',`${stage}/${objection}`,{ score:plan.score });
                if (plan.context.contactState === 'do_not_contact') collect(findings,'unexpected_block',`${stage}/${objection}`,{});
                if (['close_loop','reactivation'].includes(plan.context.recoveryMode) && plan.band !== 'Reactivation / close loop') collect(findings,'strategy_band_mismatch',`${stage}/${objection}`,{ mode:plan.context.recoveryMode, band:plan.band });
                if (plan.context.recoveryMode === 'nurture' && plan.score >= 55) collect(findings,'nurture_overcap',`${stage}/${objection}`,{ score:plan.score });

                for (const step of plan.campaign.sevenDaySteps) {
                  if (step.sms && step.sms.length > 320) collect(findings,'sms_over_320',`${stage}/${objection}/${tone}`,{ length:step.sms.length, day:step.day });
                }
                if (plan.campaign.sms.length > 320) collect(findings,'opening_sms_over_320',`${stage}/${objection}/${tone}`,{ length:plan.campaign.sms.length });
                if (plan.campaign.voicemail.length > 650) collect(findings,'voicemail_over_650',`${stage}/${objection}/${tone}`,{ length:plan.campaign.voicemail.length });
                if (plan.campaign.email.subject.length > 90 || /[\r\n]/.test(plan.campaign.email.subject)) collect(findings,'email_subject_contract',`${stage}/${objection}/${tone}`,{ subject:plan.campaign.email.subject });
                if (plan.campaign.email.body.length > 1500) collect(findings,'email_body_over_1500',`${stage}/${objection}/${tone}`,{ length:plan.campaign.email.body.length });

                const text = campaignText(plan);
                for (const phrase of forbiddenInvented) if (text.includes(phrase)) collect(findings,'forbidden_generated_claim',`${stage}/${objection}/${tone}`,{ phrase });

                if (primaryChannel === 'phone') {
                  const day0 = plan.campaign.sevenDaySteps[0];
                  if (!day0?.voicemail || !day0?.sms) collect(findings,'phone_day0_incomplete',`${stage}/${objection}/${tone}`,{});
                }
                if (primaryChannel === 'email') {
                  const day0 = plan.campaign.sevenDaySteps[0];
                  if (!day0?.subject || !day0?.body) collect(findings,'email_day0_incomplete',`${stage}/${objection}/${tone}`,{});
                }

                if (lastContactAgeDays === 0) {
                  if (!/do not send another follow-up today/i.test(plan.nextMove)) collect(findings,'same_day_next_move_missing',`${stage}/${objection}/${tone}`,{ nextMove:plan.nextMove });
                  if (plan.campaign.sevenDaySteps[0]?.day === 'Day 0') collect(findings,'same_day_schedule_contradiction',`${stage}/${objection}/${tone}`,{ mode:plan.context.recoveryMode, action:plan.campaign.sevenDaySteps[0]?.action });
                }

                if (plan.context.recoveryMode === 'close_loop' && plan.campaign.sevenDaySteps.length > 1) collect(findings,'close_loop_over_contact',`${stage}/${objection}/${tone}`,{ steps:plan.campaign.sevenDaySteps.length, nextMove:plan.nextMove });
                if (plan.context.recoveryMode === 'reactivation' && plan.campaign.sevenDaySteps.length > 0) collect(findings,'reactivation_has_active_cadence',`${stage}/${objection}/${tone}`,{ steps:plan.campaign.sevenDaySteps.length, nextMove:plan.nextMove });

                if (count % 97 === 0) {
                  const again = generateRecoveryPlan(raw);
                  if (JSON.stringify(again) !== JSON.stringify(plan)) collect(findings,'nondeterminism',`${stage}/${objection}/${tone}/${primaryChannel}`,{});
                  const exported = formatPlanText(raw, plan);
                  if (!exported.includes('QUOTE RESCUE PLAN') || exported.length > 20000) collect(findings,'export_contract',`${stage}/${objection}/${tone}`,{ length:exported.length });
                }
              }

  assert.equal(count, 25920);
  failIfAny('V2 matrix found contract violations', findings, count);
});

test('V2 safety lexicon: strong opt-out / wrong-recipient phrases must stop outreach', () => {
  const phrases = [
    'STOP', 'Please stop', 'Stop reaching out', 'Stop emailing me', 'Do not call me', 'Do not text me',
    'Do not email me', "Don't call me", "Don't text me", "Don't message me", 'Never call me', 'Never text me',
    'Never email me', 'Never reach out again', "Please don't reach out again", 'No more texts', 'No more calls',
    'No more messages', 'Leave me alone', 'Take me off your list', 'Take me off the call list', 'Remove my number',
    'Delete my number', 'Opt me out', 'I revoke consent to contact me', 'Cease contact', 'Cease communications',
    'This is the wrong number', 'Wrong number — remove me', 'I am not Alex; do not contact this number',
    'Unsubscribe me', 'Remove me from marketing', 'Quit texting me', 'Quit calling me', 'No calls please',
    'No texts please', "Don't reach out", 'Do not reach out'
  ];
  const missed = [];
  for (const lastContact of phrases) {
    const plan = generateRecoveryPlan({ ...base, contactPermission:'unknown', lastContact });
    if (!plan.blocked || plan.score !== 0 || plan.campaign.sevenDaySteps.length !== 0 || plan.campaign.reactivation !== '') {
      missed.push({ phrase:lastContact, blocked:plan.blocked, score:plan.score, mode:plan.context.recoveryMode });
    }
  }
  assert.deepEqual(missed, [], `Missed strong opt-out/wrong-recipient phrases:\n${JSON.stringify(missed, null, 2)}`);
});

test('V2 channel restriction attack: never recommend a channel the customer explicitly prohibited', () => {
  const cases = [
    { text:'Do not call me; text is fine.', channel:'phone', field:'voicemail' },
    { text:"Don't call; please text instead.", channel:'phone', field:'voicemail' },
    { text:'Text only, please.', channel:'phone', field:'voicemail' },
    { text:'Do not text me; call instead.', channel:'sms', field:'sms' },
    { text:"Don't text; email me instead.", channel:'sms', field:'sms' },
    { text:'Call only, please.', channel:'sms', field:'sms' },
    { text:'Do not email me; call instead.', channel:'email', field:'email' },
    { text:"Don't email; text me instead.", channel:'email', field:'email' },
    { text:'Phone only, please.', channel:'email', field:'email' }
  ];
  const violations = [];
  for (const c of cases) {
    const plan = generateRecoveryPlan({ ...base, contactPermission:'unknown', lastContact:c.text, primaryChannel:c.channel });
    const day0 = plan.campaign.sevenDaySteps[0] ?? {};
    const prohibitedProduced = c.field === 'email' ? Boolean(day0.subject || day0.body) : Boolean(day0[c.field]);
    if (!plan.blocked && prohibitedProduced) violations.push({ ...c, mode:plan.context.recoveryMode, day0Action:day0.action });
  }
  assert.deepEqual(violations, [], `Channel-restriction violations:\n${JSON.stringify(violations, null, 2)}`);
});

test('V2 semantic-negation attack: positive/resolved statements must not become negative blockers', () => {
  const cases = [
    ['Budget is not a problem.','budget'],
    ['Budget is fine.','budget'],
    ['We have enough budget.','budget'],
    ["We don't have a budget issue.",'budget'],
    ['Financing is approved.','financing'],
    ['Loan is approved.','financing'],
    ['Funding is secured.','financing'],
    ["Financing isn't a problem.",'financing'],
    ['No financing is needed.','financing'],
    ['We trust you.','trust'],
    ['Trust is not a concern.','trust'],
    ['Warranty is not a concern.','trust'],
    ['Timing works for us.','timing'],
    ['Timing is perfect.','timing'],
    ['Schedule is not a problem.','timing'],
    ['My husband approved it.','spouse_partner'],
    ['My wife already approved.','spouse_partner'],
    ['My partner approved the quote.','spouse_partner'],
    ['We have not hired another contractor.','competitor'],
    ['We did not select a competitor.','competitor']
  ];
  const falsePositives = [];
  for (const [lastContact, forbiddenBlocker] of cases) {
    const plan = generateRecoveryPlan({ ...base, stage:'viewed_no_reply', objection:'none', lastContact });
    if (plan.context.primaryBlocker === forbiddenBlocker || (forbiddenBlocker === 'competitor' && plan.context.engagementState === 'lost')) {
      falsePositives.push({ text:lastContact, blocker:plan.context.primaryBlocker, engagement:plan.context.engagementState, mode:plan.context.recoveryMode });
    }
  }
  assert.deepEqual(falsePositives, [], `Semantic false positives:\n${JSON.stringify(falsePositives, null, 2)}`);
});

test('V2 negative-intent attack: inability/refusal to move forward must never be positive intent', () => {
  const phrases = [
    "I can't move forward.", 'I cannot move forward.', 'Unable to move forward.', 'Not able to move forward.',
    "We aren't able to move forward.", 'We are unable to proceed.', 'We cannot proceed.', "We can't proceed."
  ];
  const failures = [];
  for (const lastContact of phrases) {
    const plan = generateRecoveryPlan({ ...base, lastContact, stage:'viewed_no_reply', objection:'none' });
    if (plan.context.engagementState === 'positive') failures.push({ phrase:lastContact, blocker:plan.context.primaryBlocker, mode:plan.context.recoveryMode });
  }
  assert.deepEqual(failures, [], `False positive intent:\n${JSON.stringify(failures, null, 2)}`);
});

test('V2 contrast/resolution attack: later resolution should not be trapped by an obsolete earlier cue', () => {
  const cases = [
    'Budget was a concern, but it is resolved and we are ready to proceed.',
    'We were unsure before, but now we trust you and are ready to move forward.',
    'Financing was the issue, but the loan is approved and we are ready to proceed.',
    'They were not ready last week; now they are ready to proceed.',
    'Timing was a problem, but the schedule now works perfectly and they want to move forward.'
  ];
  const failures = [];
  for (const lastContact of cases) {
    const plan = generateRecoveryPlan({ ...base, stage:'viewed_no_reply', objection:'none', lastContact });
    if (plan.context.engagementState !== 'positive' || ['budget','financing','trust','timing','not_ready'].includes(plan.context.primaryBlocker)) {
      failures.push({ text:lastContact, blocker:plan.context.primaryBlocker, engagement:plan.context.engagementState, mode:plan.context.recoveryMode });
    }
  }
  assert.deepEqual(failures, [], `Resolution/contrast failures:\n${JSON.stringify(failures, null, 2)}`);
});

test('V2 structured/text contradiction attack: impossible mixed states are surfaced as conflicts', () => {
  const cases = [
    { stage:'lost_ghosted', objection:'none', lastContact:'Customer is ready to proceed with us.' },
    { stage:'considering_competitor', objection:'none', lastContact:'Customer said they chose us and want to move forward.' },
    { stage:'budget_issue', objection:'none', lastContact:'Customer said budget is fine and wants to proceed.' },
    { stage:'financing_issue', objection:'none', lastContact:'Loan is approved and customer is ready to proceed.' }
  ];
  const hiddenContradictions = [];
  for (const c of cases) {
    const plan = generateRecoveryPlan({ ...base, ...c });
    const negativeStage = ['lost_ghosted','considering_competitor','budget_issue','financing_issue'].includes(c.stage);
    if (negativeStage && plan.context.engagementState === 'positive' && plan.context.conflicts.length === 0) hiddenContradictions.push({ ...c, context:plan.context });
  }
  assert.deepEqual(hiddenContradictions, [], `Unsurfaced structured/text contradictions:\n${JSON.stringify(hiddenContradictions, null, 2)}`);
});

test('V2 numeric grammar attack: hostile non-decimal numeric syntax is rejected', () => {
  const tokens = ['0x10','0b1010','0o77','+Infinity','-Infinity','NaN','1_000','1,000','--1','++1','1e999'];
  const accepted = [];
  for (const token of tokens) {
    const quote = validateInput({ ...base, quoteAmount:token });
    const age = validateInput({ ...base, quoteAgeDays:token });
    if (quote.valid) accepted.push({ field:'quoteAmount', token, parsed:quote.value.quoteAmount });
    if (age.valid) accepted.push({ field:'quoteAgeDays', token, parsed:age.value.quoteAgeDays });
  }
  assert.deepEqual(accepted, [], `Unexpected numeric grammar accepted:\n${JSON.stringify(accepted, null, 2)}`);
});

test('V2 maximum-shape attack: max legal input never breaks output budgets or export size', () => {
  const raw = {
    ...base,
    customerName:'N'.repeat(60), repName:'R'.repeat(60), businessName:'B'.repeat(100), callbackPhone:'9'.repeat(40),
    trade:'T'.repeat(80), jobDescription:'J'.repeat(600), lastContact:'L'.repeat(800), quoteAmount:'1000000000', quoteAgeDays:'3650', lastContactAgeDays:'3650'
  };
  for (const tone of TONES) for (const channel of CHANNELS) {
    const plan = generateRecoveryPlan({ ...raw, tone, primaryChannel:channel });
    for (const step of plan.campaign.sevenDaySteps) if (step.sms) assert.ok(step.sms.length <= 320, `${tone}/${channel} step ${step.day} SMS ${step.sms.length}`);
    assert.ok(plan.campaign.sms.length <= 320, `${tone}/${channel} opening SMS ${plan.campaign.sms.length}`);
    assert.ok(plan.campaign.voicemail.length <= 650, `${tone}/${channel} voicemail ${plan.campaign.voicemail.length}`);
    assert.ok(plan.campaign.email.subject.length <= 90 && !/[\r\n]/.test(plan.campaign.email.subject));
    assert.ok(plan.campaign.email.body.length <= 1500, `${tone}/${channel} email body ${plan.campaign.email.body.length}`);
    assert.ok(formatPlanText(raw, plan).length < 20000, `${tone}/${channel} export too large`);
  }
});

test('V2 privacy attack: browser app contains no outbound network transport primitives', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon\s*\(/, /new\s+WebSocket\s*\(/, /EventSource\s*\(/];
  for (const pattern of forbidden) assert.equal(pattern.test(source), false, `Outbound network primitive found: ${pattern}`);
});

test('V2 deterministic fuzz: 10,000 mutated raw inputs never crash validation; valid cases remain deterministic', () => {
  let state = 0x5eed1234;
  const rand = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
  const pick = (items) => items[Math.floor(rand() * items.length)];
  const noises = ['', ' ', '\u0000', '<script>alert(1)</script>', '🚧', 'A'.repeat(61), 'A'.repeat(601), 'STOP', "can't move forward", 'Budget is fine', 'loan approved'];
  const numberTokens = ['', '0', '1', '3', '46', '3650', '-1', '3.5', 'NaN', 'Infinity', '1e3', '0x10'];
  let validCount = 0;
  for (let i = 0; i < 10000; i++) {
    const raw = {
      ...base,
      customerName: rand() < .15 ? pick(noises) : `Alex${i}`,
      repName: rand() < .1 ? pick(noises) : 'Sam',
      businessName: rand() < .15 ? pick(noises) : 'Peak HVAC',
      trade: rand() < .12 ? pick(noises) : pick(['HVAC','Roofing','Windows','Plumbing']),
      jobDescription: rand() < .12 ? pick(noises) : `Project ${i}`,
      quoteAmount: pick(numberTokens), quoteAgeDays: pick(numberTokens), lastContactAgeDays: pick(numberTokens),
      stage: rand() < .06 ? 'INVALID_STAGE' : pick(STAGES),
      objection: rand() < .06 ? 'INVALID_BLOCKER' : pick(BLOCKERS),
      tone: rand() < .04 ? 'INVALID_TONE' : pick(TONES),
      primaryChannel: rand() < .04 ? 'INVALID_CHANNEL' : pick(CHANNELS),
      contactPermission: rand() < .05 ? 'limited_channel' : pick(['allowed','unknown','do_not_contact']),
      lastContact: pick(noises)
    };
    let validation;
    assert.doesNotThrow(() => { validation = validateInput(raw); }, `validation crash at fuzz ${i}`);
    assert.equal(typeof validation.valid, 'boolean');
    if (validation.valid) {
      validCount++;
      const a = generateRecoveryPlan(raw);
      const b = generateRecoveryPlan(raw);
      assert.deepEqual(a, b, `non-determinism at fuzz ${i}`);
      assert.ok(Number.isInteger(a.score) && a.score >= 0 && a.score <= 100, `score invalid at fuzz ${i}`);
      if (a.blocked) {
        assert.equal(a.score, 0);
        assert.equal(a.campaign.sevenDaySteps.length, 0);
        assert.equal(a.campaign.reactivation, '');
      }
    }
  }
  assert.ok(validCount > 0, 'fuzz generated no valid cases');
});
