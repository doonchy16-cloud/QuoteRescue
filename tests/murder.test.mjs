import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, generateRecoveryPlan, formatPlanText } from '../src/engine.js';
import { STAGES, BLOCKERS, TONES, CHANNELS } from '../src/domain.js';

const base = {
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'555-0100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400', quoteAgeDays:'3',
  stage:'viewed_no_reply', objection:'none', lastContact:'Sent estimate yesterday.', contactPermission:'allowed',
  tone:'consultative', primaryChannel:'sms'
};

const forbidden = ['today only','limited time','last spot','guaranteed','[your name]','discount','act now'];
function allCampaignText(plan) { return JSON.stringify(plan.campaign).toLowerCase(); }

test('murder matrix: all 1,080 supported stage/blocker/tone/channel combinations survive safely', () => {
  let count = 0;
  for (const stage of STAGES) for (const objection of BLOCKERS) for (const tone of TONES) for (const primaryChannel of CHANNELS) {
    const plan = generateRecoveryPlan({ ...base, stage, objection, tone, primaryChannel });
    count++;
    assert.ok(plan.score >= 1 && plan.score <= 100, `${stage}/${objection}/${tone}/${primaryChannel}`);
    if (stage === 'lost_ghosted') assert.equal(plan.band, 'Reactivation / close loop');
    for (const step of plan.campaign.sevenDaySteps) if (step.sms) assert.ok(step.sms.length <= 320, `${stage}/${objection}/${tone}/${primaryChannel}: ${step.sms.length}`);
    assert.ok(plan.campaign.email.subject.length <= 90);
    assert.equal(plan.campaign.email.subject.includes('\n'), false);
    const text = allCampaignText(plan);
    for (const phrase of forbidden) assert.equal(text.includes(phrase), false, `${phrase} in ${stage}/${objection}/${tone}/${primaryChannel}`);
  }
  assert.equal(count, 1080);
});

test('all explicit global no-contact variants block before score or campaign', () => {
  const phrases = ['STOP','Do not contact me again',"Don't contact us",'unsubscribe','remove me from your list','I opt out','Never contact this number','My attorney said do not contact me','Lawyer says never contact again'];
  for (const lastContact of phrases) {
    const plan = generateRecoveryPlan({ ...base, lastContact, contactPermission:'unknown' });
    assert.equal(plan.blocked, true, lastContact);
    assert.equal(plan.score, 0, lastContact);
    assert.equal(plan.campaign.sevenDaySteps.length, 0, lastContact);
    assert.equal(plan.campaign.reactivation, '', lastContact);
  }
});

test('bad numeric values never become plausible quote values or ages', () => {
  for (const quoteAgeDays of ['-10','abc','Infinity','1e999','3.4']) assert.equal(validateInput({ ...base, quoteAgeDays }).valid, false, quoteAgeDays);
  for (const quoteAmount of ['-10','abc','Infinity','1e999']) assert.equal(validateInput({ ...base, quoteAmount }).valid, false, quoteAmount);
});

test('max-length supported text stays bounded and export is practical', () => {
  const plan = generateRecoveryPlan({ ...base, customerName:'A'.repeat(60), repName:'R'.repeat(60), businessName:'B'.repeat(100), trade:'T'.repeat(80), jobDescription:'J'.repeat(600), lastContact:'L'.repeat(800) });
  for (const step of plan.campaign.sevenDaySteps) if (step.sms) assert.ok(step.sms.length <= 320);
  const exported = formatPlanText(plan.input, plan);
  assert.ok(exported.length < 20000, exported.length);
});

test('structured opt-out beats positive language', () => {
  const plan = generateRecoveryPlan({ ...base, contactPermission:'do_not_contact', lastContact:'Customer loves the proposal and wants to proceed.' });
  assert.equal(plan.blocked, true);
  assert.equal(plan.score, 0);
});

test('competitor loss cue cannot remain an active recovery', () => {
  const plan = generateRecoveryPlan({ ...base, lastContact:'Customer hired another contractor.' });
  assert.equal(plan.context.engagementState, 'lost');
  assert.equal(plan.context.recoveryMode, 'close_loop');
  assert.equal(plan.band, 'Reactivation / close loop');
});

test('negated intent phrases do not become positive recovery signals', () => {
  for (const lastContact of ['Customer is not ready to move forward.','Customer does not want to proceed.','Customer will not proceed.']) {
    const plan = generateRecoveryPlan({ ...base, lastContact });
    assert.notEqual(plan.context.engagementState, 'positive', lastContact);
  }
});
