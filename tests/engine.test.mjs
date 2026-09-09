import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, scoreRecovery, generateRecoveryPlan, formatPlanText } from '../src/engine.js';

const base = {
  customerName: 'Alex',
  trade: 'HVAC',
  jobDescription: 'replace the upstairs heat pump',
  quoteAmount: 8400,
  quoteAgeDays: 3,
  stage: 'viewed_no_reply',
  objection: 'none',
  lastContact: 'Sent estimate after inspection',
  tone: 'consultative',
  primaryChannel: 'sms'
};

test('validateInput rejects missing core fields', () => {
  const result = validateInput({ ...base, customerName: '', trade: '', jobDescription: '' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.customerName);
  assert.ok(result.errors.trade);
  assert.ok(result.errors.jobDescription);
});

test('scoreRecovery is deterministic and bounded from 0 to 100', () => {
  const first = scoreRecovery(base);
  const second = scoreRecovery(base);
  assert.deepEqual(first, second);
  assert.ok(first.score >= 0 && first.score <= 100);
  assert.ok(first.factors.length >= 4);
});

test('older quotes score materially lower than fresh quotes', () => {
  const fresh = scoreRecovery({ ...base, quoteAgeDays: 2 }).score;
  const old = scoreRecovery({ ...base, quoteAgeDays: 75 }).score;
  assert.ok(fresh - old >= 20, `fresh=${fresh}, old=${old}`);
});

test('budget objection changes diagnosis and objection response', () => {
  const plan = generateRecoveryPlan({ ...base, stage: 'objection', objection: 'budget' });
  assert.match(plan.diagnosis, /budget|investment|scope/i);
  assert.match(plan.objectionResponse, /budget|scope|option|priority/i);
});

test('direct tone produces more concise opening than warm tone', () => {
  const direct = generateRecoveryPlan({ ...base, tone: 'direct' });
  const warm = generateRecoveryPlan({ ...base, tone: 'warm' });
  assert.notEqual(direct.sms, warm.sms);
  assert.ok(direct.sms.length <= warm.sms.length + 25);
});

test('plan contains all paid-value artifacts', () => {
  const plan = generateRecoveryPlan(base);
  assert.ok(Number.isInteger(plan.score));
  assert.ok(plan.band);
  assert.ok(plan.diagnosis);
  assert.ok(plan.nextMove);
  assert.equal(plan.sequence.length, 5);
  assert.ok(plan.sms);
  assert.ok(plan.email.subject);
  assert.ok(plan.email.body);
  assert.ok(plan.voicemail);
  assert.ok(plan.objectionResponse);
  assert.ok(plan.closeLoop);
  assert.ok(plan.reactivation);
});

test('generated copy never invents discount or fake urgency', () => {
  const plan = generateRecoveryPlan(base);
  const text = JSON.stringify(plan).toLowerCase();
  for (const forbidden of ['discount', 'today only', 'limited time', 'last spot', 'guaranteed']) {
    assert.equal(text.includes(forbidden), false, `found forbidden phrase: ${forbidden}`);
  }
});

test('formatPlanText creates an exportable plan with every key section', () => {
  const plan = generateRecoveryPlan(base);
  const text = formatPlanText(base, plan);
  for (const heading of ['QUOTE RESCUE PLAN', 'RECOVERY SCORE', 'NEXT MOVE', '7-DAY RECOVERY SEQUENCE', 'SMS', 'EMAIL', 'VOICEMAIL', 'OBJECTION RESPONSE', 'CLOSE THE LOOP', 'REACTIVATION']) {
    assert.ok(text.includes(heading), `missing ${heading}`);
  }
});
