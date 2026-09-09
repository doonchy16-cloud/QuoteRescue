import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRecoveryPlan } from '../src/engine.js';

const base = {
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'555-0100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400', quoteAgeDays:'3',
  lastContactAgeDays:'2', stage:'viewed_no_reply', objection:'none', lastContact:'Sent estimate after inspection.',
  contactPermission:'unknown', smsPermission:'unknown', phonePermission:'unknown', emailPermission:'unknown',
  tone:'consultative', primaryChannel:'sms'
};

test('standalone channel denial denies only that channel instead of fabricating a global opt-out', () => {
  const plan = generateRecoveryPlan({ ...base, lastContact:'Do not call me.', primaryChannel:'sms' });
  assert.equal(plan.blocked, false);
  assert.notEqual(plan.context.contactState, 'do_not_contact');
  assert.equal(plan.context.channelPolicy.channels.phone, 'denied');
  assert.equal(plan.context.channelPolicy.channels.sms, 'unknown');
});

test('a denied preferred channel with no explicitly allowed fallback creates send hold, not global block', () => {
  const plan = generateRecoveryPlan({ ...base, lastContact:'Do not call me.', primaryChannel:'phone' });
  assert.equal(plan.blocked, false);
  assert.equal(plan.sendBlocked, true);
  assert.equal(plan.campaign.effectiveChannel, null);
  assert.equal(plan.campaign.sevenDaySteps.length, 0);
});

test('global allowed contact does not invent explicit permission for an alternative channel', () => {
  const plan = generateRecoveryPlan({ ...base, contactPermission:'allowed', lastContact:'Do not call me.', primaryChannel:'phone' });
  assert.equal(plan.blocked, false);
  assert.equal(plan.context.channelPolicy.channels.phone, 'denied');
  assert.equal(plan.context.channelPolicy.channels.sms, 'unknown');
  assert.equal(plan.context.channelPolicy.channels.email, 'unknown');
  assert.equal(plan.sendBlocked, true);
  assert.equal(plan.campaign.effectiveChannel, null);
});

test('close-loop phone strategy is exactly one outbound communication, not voicemail plus SMS', () => {
  const plan = generateRecoveryPlan({ ...base, stage:'lost_ghosted', quoteAgeDays:'4', contactPermission:'allowed', phonePermission:'allowed', primaryChannel:'phone' });
  assert.equal(plan.context.recoveryMode, 'close_loop');
  assert.equal(plan.campaign.sevenDaySteps.length, 1);
  const step = plan.campaign.sevenDaySteps[0];
  const payloads = [step.sms, step.voicemail, step.body].filter(Boolean);
  assert.equal(payloads.length, 1, JSON.stringify(step));
  assert.ok(step.voicemail);
});

test('business-context phrase “wrong number” does not falsely become wrong-recipient block', () => {
  const plan = generateRecoveryPlan({ ...base, lastContact:'Customer said the quote has the wrong number of windows; revise from 8 to 10.' });
  assert.equal(plan.blocked, false);
});

test('ordinary phrase “please stop by” does not falsely become an opt-out', () => {
  const plan = generateRecoveryPlan({ ...base, lastContact:'Customer said please stop by after 5 to review the estimate.' });
  assert.equal(plan.blocked, false);
});

test('past competitor selection cannot override current renewed positive intent', () => {
  const plan = generateRecoveryPlan({ ...base, stage:'viewed_no_reply', lastContact:'They hired another contractor last month, but now they are back and ready to proceed with us.' });
  assert.equal(plan.context.engagementState, 'positive');
  assert.notEqual(plan.context.recoveryMode, 'close_loop');
  assert.notEqual(plan.context.engagementState, 'lost');
});

test('past blocker without a current blocker does not trap an explicitly ready customer', () => {
  const plan = generateRecoveryPlan({ ...base, stage:'viewed_no_reply', lastContact:'Budget was a problem last week, but now they are ready to proceed.' });
  assert.equal(plan.context.engagementState, 'positive');
  assert.equal(plan.context.primaryBlocker, 'none');
  assert.equal(plan.context.recoveryMode, 'active_followup');
});
