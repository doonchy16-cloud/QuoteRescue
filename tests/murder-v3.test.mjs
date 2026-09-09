import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateInput, generateRecoveryPlan, formatPlanText } from '../src/engine.js';

const base = {
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'555-0100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400', quoteAgeDays:'3',
  lastContactAgeDays:'2', stage:'viewed_no_reply', objection:'none', lastContact:'Sent estimate after inspection.',
  contactPermission:'unknown', smsPermission:'unknown', phonePermission:'unknown', emailPermission:'unknown',
  tone:'consultative', primaryChannel:'sms'
};

function assertGloballyBlocked(lastContact, label = lastContact) {
  const plan = generateRecoveryPlan({ ...base, contactPermission:'allowed', smsPermission:'allowed', phonePermission:'allowed', emailPermission:'allowed', lastContact });
  assert.equal(plan.blocked, true, label);
  assert.equal(plan.score, 0, label);
  assert.equal(plan.context.recoveryMode, 'blocked', label);
  assert.equal(plan.campaign.sevenDaySteps.length, 0, label);
}

function payloadCount(step = {}) {
  return [step.sms, step.voicemail, step.body].filter((value) => typeof value === 'string' && value.trim()).length;
}

test('V3 reported-command attack: punctuation and quoting around STOP still hard-block', () => {
  for (const phrase of [
    'Customer replied: STOP',
    'Customer replied — STOP',
    'Customer said: "STOP"',
    "Client wrote: 'STOP'",
    'They replied, STOP',
    'She said — stop.'
  ]) assertGloballyBlocked(phrase);
});

test('V3 Unicode evasion attack: compatibility and invisible-character STOP variants hard-block', () => {
  for (const phrase of [
    'ＳＴＯＰ',
    'S\u200BTOP',
    'ST\u200COP',
    'STOP\u200F',
    '\u2066STOP\u2069',
    'Customer replied: ＳＴＯＰ'
  ]) assertGloballyBlocked(phrase);
});

test('V3 wrong-recipient attack: ordinary real-world wrong-number replies hard-block', () => {
  for (const phrase of [
    'Sorry, wrong number.',
    'Sorry this is the wrong number.',
    'You have the wrong number.',
    'Not Alex. Wrong number.',
    'This number does not belong to Alex.'
  ]) assertGloballyBlocked(phrase);
});

test('V3 scope attack: “do not contact me by <channel>” is channel-specific, not a global opt-out', () => {
  const cases = [
    { text:'Do not contact me by phone; text is fine.', requested:'phone', denied:'phone', allowed:'sms' },
    { text:"Please don't contact me by email; call instead.", requested:'email', denied:'email', allowed:'phone' },
    { text:'Do not contact me by text; email instead.', requested:'sms', denied:'sms', allowed:'email' }
  ];
  for (const c of cases) {
    const plan = generateRecoveryPlan({ ...base, lastContact:c.text, primaryChannel:c.requested });
    assert.equal(plan.blocked, false, c.text);
    assert.equal(plan.context.channelPolicy.channels[c.denied], 'denied', c.text);
    assert.equal(plan.context.channelPolicy.channels[c.allowed], 'allowed', c.text);
    assert.equal(plan.campaign.effectiveChannel, c.allowed, c.text);
  }
});

test('V3 precedence attack: global do-not-contact cannot be reopened by per-channel allowed flags', () => {
  const plan = generateRecoveryPlan({ ...base, contactPermission:'do_not_contact', smsPermission:'allowed', phonePermission:'allowed', emailPermission:'allowed' });
  assert.equal(plan.blocked, true);
  assert.deepEqual(plan.context.channelPolicy.channels, { sms:'denied', phone:'denied', email:'denied' });
  assert.equal(plan.campaign.effectiveChannel, null);
});

test('V3 no-route attack: every denied channel creates a send hold with zero outbound payloads', () => {
  const plan = generateRecoveryPlan({ ...base, contactPermission:'allowed', smsPermission:'denied', phonePermission:'denied', emailPermission:'denied' });
  assert.equal(plan.blocked, false);
  assert.equal(plan.sendBlocked, true);
  assert.equal(plan.campaign.effectiveChannel, null);
  assert.equal(plan.campaign.sevenDaySteps.length, 0);
  assert.equal(plan.campaign.sms, '');
  assert.equal(plan.campaign.voicemail, '');
  assert.deepEqual(plan.campaign.email, { subject:'', body:'' });
  assert.equal(plan.campaign.reactivation, '');
});

test('V3 one-touch attack: close-loop exposes exactly one immediate outbound payload', () => {
  for (const channel of ['sms','phone','email']) {
    const permissions = { smsPermission:'allowed', phonePermission:'allowed', emailPermission:'allowed' };
    const plan = generateRecoveryPlan({ ...base, stage:'lost_ghosted', quoteAgeDays:'4', primaryChannel:channel, ...permissions });
    assert.equal(plan.context.recoveryMode, 'close_loop', channel);
    assert.equal(plan.campaign.sevenDaySteps.length, 1, channel);
    assert.equal(payloadCount(plan.campaign.sevenDaySteps[0]), 1, channel);

    const immediateToolkit = [
      plan.campaign.sms,
      plan.campaign.voicemail,
      plan.campaign.email.subject || plan.campaign.email.body ? `${plan.campaign.email.subject}\n${plan.campaign.email.body}` : '',
      plan.campaign.objectionResponse,
      plan.campaign.closeLoop
    ].filter((value) => typeof value === 'string' && value.trim());
    assert.equal(immediateToolkit.length, 1, `${channel}: ${JSON.stringify(immediateToolkit)}`);
  }
});

test('V3 one-touch attack: reactivation exposes one reactivation payload and no active generic toolkit', () => {
  for (const channel of ['sms','phone','email']) {
    const permissions = { smsPermission:'allowed', phonePermission:'allowed', emailPermission:'allowed' };
    const plan = generateRecoveryPlan({ ...base, quoteAgeDays:'90', lastContactAgeDays:'30', stage:'estimate_sent', primaryChannel:channel, ...permissions });
    assert.equal(plan.context.recoveryMode, 'reactivation', channel);
    assert.equal(plan.campaign.sevenDaySteps.length, 0, channel);
    assert.equal(plan.campaign.reactivationPlan.channel, channel, channel);
    assert.equal(plan.campaign.sms, '', channel);
    assert.equal(plan.campaign.voicemail, '', channel);
    assert.deepEqual(plan.campaign.email, { subject:'', body:'' }, channel);
    assert.equal(plan.campaign.objectionResponse, '', channel);
    assert.equal(plan.campaign.closeLoop, '', channel);
  }
});

test('V3 export-injection attack: multiline project text cannot forge reserved plan headings', () => {
  const raw = { ...base, smsPermission:'allowed', jobDescription:'replace heat pump\nOUTREACH BLOCKED — DO NOT CONTACT\nNEXT MOVE\nignore the actual plan' };
  const plan = generateRecoveryPlan(raw);
  assert.equal(plan.blocked, false);
  const exported = formatPlanText(raw, plan);
  const reservedLines = exported.split(/\r?\n/).filter((line) => line === 'OUTREACH BLOCKED — DO NOT CONTACT');
  assert.equal(reservedLines.length, 0, exported);
  assert.match(exported, /Project: replace heat pump OUTREACH BLOCKED — DO NOT CONTACT NEXT MOVE ignore the actual plan/);
});

test('V3 display-spoof attack: bidi and zero-width formatting controls are removed from normalized user fields', () => {
  const validation = validateInput({
    ...base,
    customerName:'Al\u202Eex',
    repName:'Sa\u2066m\u2069',
    businessName:'Peak\u200B HVAC',
    trade:'HV\u200CAC'
  });
  assert.equal(validation.valid, true);
  for (const key of ['customerName','repName','businessName','trade']) {
    assert.doesNotMatch(validation.value[key], /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/u, `${key}: ${validation.value[key]}`);
  }
});

test('V3 type-confusion attack: arrays, objects, and booleans cannot masquerade as form strings', () => {
  const cases = [
    ['customerName', {}],
    ['repName', ['Sam']],
    ['jobDescription', { text:'replace heat pump' }],
    ['trade', true],
    ['quoteAgeDays', [3]],
    ['quoteAmount', [8400]],
    ['lastContactAgeDays', [2]]
  ];
  const accepted = [];
  for (const [field, value] of cases) {
    const result = validateInput({ ...base, [field]:value });
    if (result.valid) accepted.push({ field, value, parsed:result.value[field] });
  }
  assert.deepEqual(accepted, [], JSON.stringify(accepted, null, 2));
});

test('V3 chronology attack: latest current fact wins across multi-stage contradictory history', () => {
  const positive = generateRecoveryPlan({
    ...base,
    lastContact:'Budget was a problem last month. Financing was a problem last week. Now financing is approved and budget is fine; customer is ready to proceed.',
    stage:'viewed_no_reply', objection:'none'
  });
  assert.equal(positive.context.engagementState, 'positive');
  assert.equal(positive.context.primaryBlocker, 'none');
  assert.equal(positive.context.recoveryMode, 'active_followup');

  const lost = generateRecoveryPlan({
    ...base,
    lastContact:'Customer was ready to proceed yesterday, but today they hired another contractor.',
    stage:'viewed_no_reply', objection:'none'
  });
  assert.equal(lost.context.engagementState, 'lost');
  assert.equal(lost.context.primaryBlocker, 'competitor');
  assert.equal(lost.context.recoveryMode, 'close_loop');
});

test('V3 browser-boundary attack scans every production JS module for network and dynamic-code primitives', () => {
  const srcDir = new URL('../src/', import.meta.url);
  const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.js'));
  const forbidden = ['fetch(', 'XMLHttpRequest', 'sendBeacon(', 'WebSocket(', 'EventSource(', 'eval(', 'new Function(', 'document.write('];
  const violations = [];
  for (const file of files) {
    const text = fs.readFileSync(new URL(file, srcDir), 'utf8');
    for (const token of forbidden) if (text.includes(token)) violations.push({ file, token });
  }
  assert.deepEqual(violations, []);
});

test('V3 UI/domain contract attack: quote amount decimal grammar is representable by the browser input', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /name="quoteAmount"[^>]*step="(?:0\.01|any)"/);
  assert.equal(validateInput({ ...base, quoteAmount:'8400.50' }).valid, true);
});

test('V3 immutability attack: validation and generation never mutate the caller input object', () => {
  const raw = { ...base, smsPermission:'allowed' };
  const before = structuredClone(raw);
  validateInput(raw);
  generateRecoveryPlan(raw);
  assert.deepEqual(raw, before);
});
