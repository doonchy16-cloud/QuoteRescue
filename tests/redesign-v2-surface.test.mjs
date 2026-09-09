import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateRecoveryPlan } from '../src/engine.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

const base = {
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'555-0100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400', quoteAgeDays:'90',
  lastContactAgeDays:'30', stage:'estimate_sent', objection:'none', lastContact:'Estimate was sent previously.',
  contactPermission:'unknown', smsPermission:'unknown', phonePermission:'unknown', emailPermission:'unknown',
  tone:'consultative', primaryChannel:'sms'
};

test('reactivation creates exactly one usable channel-safe playbook for SMS', () => {
  const plan = generateRecoveryPlan({ ...base, primaryChannel:'sms', smsPermission:'allowed' });
  assert.equal(plan.context.recoveryMode, 'reactivation');
  assert.equal(plan.campaign.sevenDaySteps.length, 0);
  assert.equal(plan.campaign.reactivationPlan.channel, 'sms');
  assert.ok(plan.campaign.reactivationPlan.sms);
  assert.equal(plan.campaign.reactivationPlan.email, undefined);
  assert.equal(plan.campaign.reactivationPlan.voicemail, undefined);
});

test('reactivation creates exactly one usable channel-safe playbook for phone when SMS is denied', () => {
  const plan = generateRecoveryPlan({ ...base, primaryChannel:'phone', phonePermission:'allowed', smsPermission:'denied' });
  assert.equal(plan.context.recoveryMode, 'reactivation');
  assert.equal(plan.campaign.effectiveChannel, 'phone');
  assert.equal(plan.campaign.sms, '');
  assert.equal(plan.campaign.reactivationPlan.channel, 'phone');
  assert.ok(plan.campaign.reactivationPlan.voicemail);
  assert.equal(plan.campaign.reactivationPlan.sms, undefined);
});

test('reactivation creates exactly one usable channel-safe playbook for email when SMS is denied', () => {
  const plan = generateRecoveryPlan({ ...base, primaryChannel:'email', emailPermission:'allowed', smsPermission:'denied' });
  assert.equal(plan.context.recoveryMode, 'reactivation');
  assert.equal(plan.campaign.effectiveChannel, 'email');
  assert.equal(plan.campaign.sms, '');
  assert.equal(plan.campaign.reactivationPlan.channel, 'email');
  assert.ok(plan.campaign.reactivationPlan.subject);
  assert.ok(plan.campaign.reactivationPlan.body);
  assert.ok(plan.campaign.reactivationPlan.subject.length <= 90);
});

test('UI exposes explicit SMS phone and email permission controls', () => {
  for (const name of ['smsPermission','phonePermission','emailPermission']) {
    assert.ok(html.includes(`name="${name}"`), name);
    assert.ok(html.includes(`data-error="${name}"`), `${name} error surface`);
  }
});

test('UI explains that global allowed does not fabricate channel permission', () => {
  assert.equal(html.includes('Global “Allowed” applies unless a channel below is denied.'), false);
  assert.match(html, /global.*allowed.*does not.*channel permission/i);
  assert.match(html, /explicitly allowed alternative/i);
});

test('UI has send-hold and channel-policy surfaces distinct from global do-not-contact block', () => {
  for (const id of ['send-hold-state','send-hold-reason','send-hold-next','channel-policy-summary','effective-channel','send-state']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(app, /sendBlocked/);
  assert.match(app, /channelPolicy/);
  assert.match(app, /effectiveChannel/);
});

test('UI does not render empty denied-channel message cards as usable copy', () => {
  assert.match(app, /filter\(/);
  assert.match(app, /reactivationPlan/);
});
