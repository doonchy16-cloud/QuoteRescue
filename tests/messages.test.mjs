import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCampaign, buildDiagnosis } from '../src/messages.js';

const input = {
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'555-0100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:8400, quoteAgeDays:3,
  stage:'viewed_no_reply', objection:'none', lastContact:'Sent estimate yesterday.', contactPermission:'allowed',
  tone:'consultative', primaryChannel:'sms'
};
const context = { contactState:'allowed', engagementState:'unresponsive', primaryBlocker:'none', recoveryMode:'active_followup', confidence:'medium', evidence:[], conflicts:[] };

test('blocked context returns no outbound campaign', () => {
  const campaign = buildCampaign(input, { ...context, contactState:'do_not_contact', recoveryMode:'blocked' });
  assert.equal(campaign.sevenDaySteps.length, 0);
  assert.equal(campaign.reactivation, '');
});

test('phone Day 0 contains both voicemail and SMS', () => {
  const campaign = buildCampaign({ ...input, primaryChannel:'phone' }, context);
  assert.equal(campaign.sevenDaySteps[0].action, 'Voicemail + SMS');
  assert.ok(campaign.sevenDaySteps[0].voicemail);
  assert.ok(campaign.sevenDaySteps[0].sms);
});

test('email Day 0 contains subject and body together with single-line subject', () => {
  const campaign = buildCampaign({ ...input, primaryChannel:'email', trade:'HVAC\nBCC: test' }, context);
  const step = campaign.sevenDaySteps[0];
  assert.equal(step.action, 'Email');
  assert.ok(step.subject);
  assert.ok(step.body);
  assert.equal(step.subject.includes('\n'), false);
});

test('SMS stays within budget with maximum job description', () => {
  const campaign = buildCampaign({ ...input, jobDescription:'x'.repeat(600) }, context);
  for (const step of campaign.sevenDaySteps) if (step.sms) assert.ok(step.sms.length <= 320, `${step.day}: ${step.sms.length}`);
});

test('tone changes more than just the opener', () => {
  const warm = buildCampaign({ ...input, tone:'warm' }, context);
  const direct = buildCampaign({ ...input, tone:'direct' }, context);
  assert.notEqual(warm.sevenDaySteps[1].sms, direct.sevenDaySteps[1].sms);
  assert.notEqual(warm.closeLoop, direct.closeLoop);
});

test('reactivation is separate from the seven-day cadence', () => {
  const campaign = buildCampaign(input, context);
  assert.equal(campaign.sevenDaySteps.length, 4);
  assert.ok(campaign.reactivation);
  assert.equal(campaign.sevenDaySteps.some((s) => /30/.test(s.day)), false);
});

test('generated copy has no placeholder identity or forbidden sales claims', () => {
  const campaign = buildCampaign(input, context);
  const text = JSON.stringify(campaign).toLowerCase();
  for (const forbidden of ['[your name]','today only','limited time','last spot','guaranteed','discount']) assert.equal(text.includes(forbidden), false, forbidden);
});

test('diagnosis follows reconciled financing and budget blockers', () => {
  assert.match(buildDiagnosis(input, { ...context, primaryBlocker:'budget', recoveryMode:'objection_resolution' }).diagnosis, /budget|scope/i);
  assert.match(buildDiagnosis(input, { ...context, primaryBlocker:'financing', recoveryMode:'objection_resolution' }).diagnosis, /financ|fund/i);
});

test('close-loop recovery mode overrides blocker-specific diagnosis', () => {
  const result = buildDiagnosis(input, { ...context, primaryBlocker:'budget', engagementState:'lost', recoveryMode:'close_loop' });
  assert.match(result.diagnosis, /close|reactivation|no longer.*active/i);
  assert.match(result.nextMove, /close|stop repeated|reactivation/i);
});
