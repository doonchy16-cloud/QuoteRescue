import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, generateRecoveryPlan, formatPlanText } from '../src/engine.js';
import { STAGES, BLOCKERS, TONES, CHANNELS, LIMITS } from '../src/domain.js';

const FAMILIES = 20;
const CASES_PER_FAMILY = 50000;
const EXPECTED_ATTACKS = FAMILIES * CASES_PER_FAMILY;
const forbiddenClaims = ['today only','limited time','last spot','guaranteed','[your name]','act now'];
const formatControls = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;

const base = Object.freeze({
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'5550100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400.50', quoteAgeDays:'3',
  lastContactAgeDays:'2', stage:'viewed_no_reply', objection:'none', lastContact:'Sent estimate after inspection.',
  contactPermission:'allowed', smsPermission:'allowed', phonePermission:'unknown', emailPermission:'unknown',
  tone:'consultative', primaryChannel:'sms'
});

function collect(findings, kind, family, index, details = {}) {
  findings[kind] ??= { count:0, examples:[] };
  findings[kind].count++;
  if (findings[kind].examples.length < 6) findings[kind].examples.push({ family, index, ...details });
}

function payloadCount(plan) {
  let count = 0;
  if (plan.campaign?.sms) count++;
  if (plan.campaign?.voicemail) count++;
  if (plan.campaign?.email?.subject || plan.campaign?.email?.body) count++;
  if (plan.campaign?.reactivation) count++;
  count += plan.campaign?.sevenDaySteps?.length ?? 0;
  return count;
}

function malformedUtf16(value) {
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
      i++;
    } else if (code >= 0xDC00 && code <= 0xDFFF) return true;
  }
  return false;
}

function inspectPlan(raw, validation, family, index, findings) {
  let plan;
  const before = structuredClone(raw);
  try { plan = generateRecoveryPlan(raw); }
  catch (error) { collect(findings,'generation_crash',family,index,{error:String(error?.message ?? error)}); return null; }

  try { assert.deepEqual(raw,before); }
  catch { collect(findings,'input_mutation',family,index); }

  if (plan.blocked) {
    if (plan.score !== 0) collect(findings,'blocked_nonzero_score',family,index,{score:plan.score});
    if (payloadCount(plan) !== 0) collect(findings,'blocked_payload_leak',family,index);
  } else if (!Number.isInteger(plan.score) || plan.score < 1 || plan.score > 100) {
    collect(findings,'score_bounds',family,index,{score:plan.score});
  }

  if (plan.sendBlocked && payloadCount(plan) !== 0) collect(findings,'send_hold_payload_leak',family,index);
  const policy = plan.context?.channelPolicy?.channels ?? {};
  if (policy.sms === 'denied' && plan.campaign?.sms) collect(findings,'denied_sms_leak',family,index);
  if (policy.phone === 'denied' && plan.campaign?.voicemail) collect(findings,'denied_phone_leak',family,index);
  if (policy.email === 'denied' && (plan.campaign?.email?.subject || plan.campaign?.email?.body)) collect(findings,'denied_email_leak',family,index);
  if (plan.campaign?.effectiveChannel && policy[plan.campaign.effectiveChannel] === 'denied') collect(findings,'effective_channel_denied',family,index,{effective:plan.campaign.effectiveChannel});

  const steps = plan.campaign?.sevenDaySteps ?? [];
  const mode = plan.context?.recoveryMode;
  if (mode === 'close_loop' && steps.length > 1) collect(findings,'close_loop_overcontact',family,index,{steps:steps.length});
  if (mode === 'reactivation' && steps.length !== 0) collect(findings,'reactivation_active_cadence',family,index,{steps:steps.length});
  if (mode === 'nurture' && steps.length > 2) collect(findings,'nurture_overcontact',family,index,{steps:steps.length});
  if (['active_followup','objection_resolution'].includes(mode) && !plan.sendBlocked && steps.length !== 4) collect(findings,'active_cadence_shape',family,index,{mode,steps:steps.length});

  for (const step of steps) if ((step.sms ?? '').length > 320) collect(findings,'step_sms_over_320',family,index,{length:step.sms.length});
  if ((plan.campaign?.sms ?? '').length > 320) collect(findings,'sms_over_320',family,index,{length:plan.campaign.sms.length});
  if ((plan.campaign?.voicemail ?? '').length > 650) collect(findings,'voicemail_over_650',family,index,{length:plan.campaign.voicemail.length});
  const subject = plan.campaign?.email?.subject ?? '';
  if (subject.length > 90 || /[\r\n]/.test(subject)) collect(findings,'email_subject_contract',family,index,{subject});
  if ((plan.campaign?.email?.body ?? '').length > 1500) collect(findings,'email_body_over_1500',family,index,{length:plan.campaign.email.body.length});

  const campaignText = JSON.stringify(plan.campaign ?? {}).toLowerCase();
  for (const phrase of forbiddenClaims) if (campaignText.includes(phrase)) collect(findings,'forbidden_claim',family,index,{phrase});
  if (/undefined|\bnan\b|\[object object\]/i.test(campaignText)) collect(findings,'serialization_garbage',family,index);
  if (formatControls.test(campaignText)) collect(findings,'format_control_leak',family,index);
  if (malformedUtf16(campaignText)) collect(findings,'malformed_utf16',family,index);

  if (index % 997 === 0 || family === 19 && index % 101 === 0) {
    try {
      const again = generateRecoveryPlan(raw);
      if (JSON.stringify(again) !== JSON.stringify(plan)) collect(findings,'nondeterminism',family,index);
    } catch (error) { collect(findings,'determinism_recheck_crash',family,index,{error:String(error?.message ?? error)}); }
  }

  if (index % 251 === 0 || family === 16 && index % 17 === 0 || family === 18 && index % 31 === 0) {
    try {
      const exported = formatPlanText(validation.value,plan);
      if (!exported.startsWith('QUOTE RESCUE PLAN')) collect(findings,'export_header_missing',family,index);
      if (exported.length > 25000) collect(findings,'export_unbounded',family,index,{length:exported.length});
      if (/undefined|\bNaN\b|\[object Object\]/.test(exported)) collect(findings,'export_serialization_garbage',family,index);
      if (formatControls.test(exported)) collect(findings,'export_format_control_leak',family,index);
      if (malformedUtf16(exported)) collect(findings,'export_malformed_utf16',family,index);
    } catch (error) { collect(findings,'export_crash',family,index,{error:String(error?.message ?? error)}); }
  }

  return plan;
}

function makeCase(family,index) {
  const attackId = family * CASES_PER_FAMILY + index;
  const unique = `V8-${String(attackId).padStart(7,'0')}`;
  const raw = { ...base, businessName:unique, callbackPhone:String(1000000 + attackId) };
  const variant = index % 10;
  const expectation = { valid:null, blocked:null, notBlocked:null, resolved:null, lost:null, channel:null };

  if (family === 0) {
    raw.stage = STAGES[index % STAGES.length];
    raw.objection = BLOCKERS[Math.floor(index / STAGES.length) % BLOCKERS.length];
    raw.tone = TONES[Math.floor(index / 13) % TONES.length];
    raw.primaryChannel = CHANNELS[Math.floor(index / 17) % CHANNELS.length];
    raw.contactPermission = ['allowed','unknown','do_not_contact'][Math.floor(index / 19) % 3];
    raw.smsPermission = ['allowed','unknown','denied'][Math.floor(index / 23) % 3];
    raw.emailPermission = ['allowed','unknown','denied'][Math.floor(index / 29) % 3];
    raw.phonePermission = ['allowed','unknown','denied'][Math.floor(index / 31) % 3];
    raw.quoteAgeDays = String(index % 3651);
    raw.lastContactAgeDays = index % 11 === 0 ? '' : String((index * 7) % 3651);
  }

  if (family === 1) {
    raw.contactPermission = 'unknown';
    const phrases = [
      'STOP','Please stop contacting me','Please do not reach out again','I no longer wish to be contacted',
      'Take my number off your list','Cease all communications','Do not contact this number again',
      'Please remove me from your contact list','Never message me again','Leave me alone'
    ];
    const wrappers = [
      s=>s,s=>`“${s}”`,s=>`Customer said: ${s}`,s=>`Message received — ${s}`,s=>`Reply: '${s}'`,
      s=>`  ${s}  `,s=>`\u200B${s}\u2069`,s=>`${s}.`,s=>`${s}!`,s=>`Client wrote — “${s}”`
    ];
    raw.lastContact = wrappers[Math.floor(index / 10) % 10](phrases[variant]);
    expectation.blocked = true;
  }

  if (family === 2) {
    raw.contactPermission = 'unknown';
    const phrases = [
      'This is the wrong number','You have the wrong person','Wrong person','This is not Alex',
      'Alex no longer owns this number','You reached someone else','This number was reassigned',
      'I am not the customer you are looking for','Please stop, you have the wrong person','Not Alex. Wrong number.'
    ];
    const wrappers = [s=>s,s=>`“${s}”`,s=>`Customer replied: ${s}`,s=>`Message received — ${s}`,s=>`Reply: ${s}`];
    raw.lastContact = wrappers[Math.floor(index / 10) % wrappers.length](phrases[variant]);
    expectation.blocked = true;
  }

  if (family === 3) {
    const denied = CHANNELS[index % 3];
    const allowed = CHANNELS[(index + 1) % 3];
    raw.primaryChannel = denied;
    raw.contactPermission = index % 2 ? 'allowed' : 'unknown';
    raw.smsPermission = 'unknown'; raw.emailPermission = 'unknown'; raw.phonePermission = 'unknown';
    raw[`${denied}Permission`] = 'denied';
    raw[`${allowed}Permission`] = 'allowed';
    expectation.channel = allowed;
  }

  if (family === 4) {
    raw.primaryChannel = CHANNELS[index % 3];
    raw.smsPermission = 'denied'; raw.emailPermission = 'denied'; raw.phonePermission = 'denied';
  }

  if (family === 5) {
    const bad = [`+${index}`,`-${index+1}`,`${index}e2`,`0x${(index+1).toString(16)}`,`${index},00`,`${index}.000`,`${index}_0`,`${index} dollars`,`NaN${index}`,`Infinity${index}`][variant];
    if (index % 3 === 0) raw.quoteAmount = bad;
    else if (index % 3 === 1) raw.quoteAgeDays = bad;
    else raw.lastContactAgeDays = bad;
    expectation.valid = false;
  }

  if (family === 6) {
    const targets = ['customerName','repName','trade','jobDescription','stage','objection','tone','primaryChannel','contactPermission','emailPermission'];
    const values = [[],{},true,false,[unique],{value:unique},new Date(index),42,0,BigInt(index)];
    raw[targets[variant]] = values[variant];
    expectation.valid = false;
  }

  if (family === 7) {
    const modes = [
      ()=>{raw.quoteAmount='0';return true;},()=>{raw.quoteAmount='1000000000';return true;},
      ()=>{raw.quoteAmount='1000000000.01';return false;},()=>{raw.quoteAmount='0001';return false;},
      ()=>{raw.quoteAmount='1.00';return true;},()=>{raw.quoteAgeDays='3650';return true;},
      ()=>{raw.quoteAgeDays='3651';return false;},()=>{raw.quoteAgeDays='1.0';return false;},
      ()=>{raw.lastContactAgeDays='3650';return true;},()=>{raw.lastContactAgeDays='3651';return false;}
    ];
    expectation.valid = modes[variant]();
  }

  if (family === 8) {
    const fields = ['customerName','repName','businessName','callbackPhone','trade','jobDescription','lastContact'];
    const field = fields[index % fields.length];
    raw[field] = 'A'.repeat(LIMITS[field]);
    if (field === 'businessName') raw.lastContact = `Neutral context ${unique}`;
    expectation.valid = true;
  }

  if (family === 9) {
    const fields = ['customerName','repName','businessName','callbackPhone','trade','jobDescription','lastContact'];
    const field = fields[index % fields.length];
    raw[field] = 'B'.repeat(LIMITS[field] + 1);
    expectation.valid = false;
  }

  if (family === 10) {
    const controls = ['\u200B','\u200E','\u202E','\u2060','\u2066','\u2069','\uFEFF','\u0001','\u0007','\u001F'];
    const c = controls[variant];
    raw.customerName = `Al${c}ex`; raw.repName = `Sa${c}m`; raw.trade = `HV${c}AC`;
    raw.jobDescription = `replace ${c}heat pump ${unique}`; raw.lastContact = `Customer ${c}viewed estimate.`;
    expectation.valid = true;
  }

  if (family === 11) {
    const glyphs = ['😀','🧰','🏠','é','e\u0301','שלום','مرحبا','漢字','👨‍👩‍👧‍👦','⚡'];
    const g = glyphs[variant];
    raw.customerName = `A${g}x`.slice(0,LIMITS.customerName);
    raw.trade = `HVAC ${g}`.slice(0,LIMITS.trade);
    raw.jobDescription = (`${g} `.repeat(40) + unique).slice(0,LIMITS.jobDescription);
    raw.lastContact = (`Viewed ${g} `.repeat(30) + unique).slice(0,LIMITS.lastContact);
    expectation.valid = true;
  }

  if (family === 12) {
    const resolved = [
      'Budget was a concern, but it is resolved and we are ready to proceed.',
      'Financing was the issue, but the loan is approved and we are ready to proceed.',
      'Timing was a problem, but the schedule now works and we want to move forward.',
      'We were unsure before, but now we trust the proposal and are ready to proceed.',
      'We considered another contractor, but have not hired them and want to proceed with you.',
      'My spouse had questions, but approved it and we are ready to move forward.',
      'The price concern was resolved and we are ready to proceed.',
      'We were not ready last week, but now we are ready to proceed.',
      'Warranty concern was resolved; we trust the proposal now.',
      'Earlier we considered a competitor; now we want to continue this quote.'
    ];
    raw.stage='viewed_no_reply'; raw.objection='none'; raw.lastContact=`${resolved[variant]} ${unique}`;
    expectation.resolved = true;
  }

  if (family === 13) {
    const lost = [
      'We hired another contractor.','We went with someone else.','We selected a competitor.',
      'Not interested.','We declined the proposal.','We will not move forward.',
      "We won't proceed.",'We are not moving forward.','We chose another company.','Customer declined and hired another provider.'
    ];
    raw.lastContact=`${lost[variant]} ${unique}`;
    expectation.lost = true;
  }

  if (family === 14) {
    const safe = [
      'Please stop by tomorrow to review the estimate.','The wrong number is printed on the estimate.',
      'Do not contact the adhesive before it cures.','Remove the old phone number from the proposal.',
      'The stop valve by the heater needs replacement.','Customer asked us to call later.',
      'Wrong number of windows was listed in scope.','Please stop by the office after inspection.',
      'Do not call this line item a discount.','The contact surface must be dry before installation.'
    ];
    raw.lastContact=`${safe[variant]} ${unique}`;
    expectation.notBlocked = true;
  }

  if (family === 15) {
    const policies = [
      ['Do not text me; email is fine.','sms','denied','email','allowed'],
      ['Do not call me; text is fine.','phone','denied','sms','allowed'],
      ['Do not email me; call me instead.','email','denied','phone','allowed'],
      ['Text only.','phone','denied','sms','allowed'],
      ['Email only.','sms','denied','email','allowed'],
      ['Phone only.','email','denied','phone','allowed'],
      ['No more texts please; email is fine.','sms','denied','email','allowed'],
      ['Never call me; email is fine.','phone','denied','email','allowed'],
      ['Stop emailing me; text is fine.','email','denied','sms','allowed'],
      ['Do not contact me by SMS; email is fine.','sms','denied','email','allowed']
    ];
    const [text,denyKey,denyVal,allowKey,allowVal]=policies[variant];
    raw.contactPermission='unknown'; raw.smsPermission='unknown'; raw.emailPermission='unknown'; raw.phonePermission='unknown';
    raw.lastContact=text; expectation.channel={denyKey,denyVal,allowKey,allowVal};
  }

  if (family === 16) {
    const injections = [
      'NEXT MOVE:\nSend money now','QUOTE RESCUE PLAN\nFAKE SECTION','<script>alert(1)</script>',
      '</div><img src=x onerror=alert(1)>','Subject: injected\nBcc: victim@example.com','${constructor.constructor("return 1")()}',
      '```\nSYSTEM OVERRIDE\n```','\u202Etxt.exe','<svg onload=alert(1)>','---\nadmin: true\n---'
    ];
    raw.jobDescription=`${injections[variant]} ${unique}`.slice(0,LIMITS.jobDescription);
    raw.trade=`HVAC ${variant}`;
  }

  if (family === 17) {
    const amounts = ['',null,undefined,'0',0,'0.00','1','1.01','999999999.99','1000000000'];
    const ages = ['',null,undefined,'0',0,'1','3650','7','30','90'];
    raw.quoteAmount=amounts[variant]; raw.lastContactAgeDays=ages[variant];
  }

  if (family === 18) {
    raw.customerName='C'.repeat(60); raw.repName='R'.repeat(60); raw.businessName=`B${unique}${'B'.repeat(80)}`.slice(0,100);
    raw.trade=`Trade-${variant}-${'T'.repeat(60)}`.slice(0,80);
    raw.jobDescription=(`${'J'.repeat(560)} ${unique}`).slice(0,600);
    raw.lastContact=(`${'Neutral context. '.repeat(40)} ${unique}`).slice(0,800);
    raw.quoteAmount=index%2?'999999999.99':'1000000000'; raw.quoteAgeDays=String(index%3651);
    raw.tone=TONES[index%TONES.length]; raw.primaryChannel=CHANNELS[index%CHANNELS.length];
  }

  if (family === 19) {
    let x = (index + 1) * 2654435761 >>> 0;
    const next = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; };
    raw.stage=STAGES[next()%STAGES.length]; raw.objection=BLOCKERS[next()%BLOCKERS.length]; raw.tone=TONES[next()%TONES.length]; raw.primaryChannel=CHANNELS[next()%CHANNELS.length];
    raw.contactPermission=['allowed','unknown','do_not_contact'][next()%3]; raw.smsPermission=['allowed','unknown','denied'][next()%3]; raw.emailPermission=['allowed','unknown','denied'][next()%3]; raw.phonePermission=['allowed','unknown','denied'][next()%3];
    raw.quoteAmount=`${next()%1000000000}.${String(next()%100).padStart(2,'0')}`; raw.quoteAgeDays=String(next()%3651); raw.lastContactAgeDays=String(next()%3651);
    raw.jobDescription=`Project ${unique} ${'x'.repeat(next()%120)}`;
  }

  return { attackId, raw, expectation };
}

test('V8 literal 1,000,000-way murder attack: one million distinct adversarial cases preserve QuoteRescue invariants', () => {
  const findings = {};
  const seenIds = new Set();
  const familyCounts = Array(FAMILIES).fill(0);
  let attacks=0, valid=0, invalid=0, plans=0;

  for (let family=0; family<FAMILIES; family++) {
    for (let index=0; index<CASES_PER_FAMILY; index++) {
      attacks++; familyCounts[family]++;
      const { attackId, raw, expectation } = makeCase(family,index);
      if (seenIds.has(attackId)) collect(findings,'duplicate_attack_id',family,index,{attackId});
      seenIds.add(attackId);
      const uniqueWitness = `V8-${String(attackId).padStart(7,'0')}`;
      const hasDistinctWitness = String(raw.businessName ?? '').includes(uniqueWitness) || raw.callbackPhone === String(1000000 + attackId);
      if (!hasDistinctWitness) collect(findings,'distinctness_witness_corrupted',family,index,{attackId,businessName:raw.businessName,callbackPhone:raw.callbackPhone});

      let validation;
      try { validation=validateInput(raw); }
      catch (error) { collect(findings,'validation_crash',family,index,{error:String(error?.message ?? error)}); continue; }

      if (expectation.valid === true && !validation.valid) collect(findings,'expected_valid_rejected',family,index,{errors:validation.errors});
      if (expectation.valid === false && validation.valid) collect(findings,'expected_invalid_accepted',family,index,{raw});

      if (!validation.valid) { invalid++; continue; }
      valid++;

      if (family === 10) {
        for (const [key,value] of Object.entries(validation.value)) if (typeof value === 'string' && formatControls.test(value)) collect(findings,'normalized_format_control_leak',family,index,{key});
      }
      if (family === 11) {
        for (const value of Object.values(validation.value)) if (typeof value === 'string' && malformedUtf16(value)) collect(findings,'normalized_malformed_utf16',family,index);
      }

      const plan=inspectPlan(raw,validation,family,index,findings);
      if (!plan) continue;
      plans++;

      if (expectation.blocked === true && (!plan.blocked || plan.score !== 0 || payloadCount(plan) !== 0)) collect(findings,'required_global_block_missed',family,index,{text:raw.lastContact,blocked:plan.blocked,score:plan.score,mode:plan.context?.recoveryMode});
      if (expectation.notBlocked === true && plan.blocked) collect(findings,'false_positive_global_block',family,index,{text:raw.lastContact});
      if (expectation.resolved === true) {
        if (plan.context?.engagementState === 'lost') collect(findings,'resolved_history_still_lost',family,index,{text:raw.lastContact,blocker:plan.context?.primaryBlocker});
        if (['budget','financing','timing','trust','spouse_partner','competitor','price','not_ready'].includes(plan.context?.primaryBlocker)) collect(findings,'resolved_history_stale_blocker',family,index,{text:raw.lastContact,blocker:plan.context?.primaryBlocker,mode:plan.context?.recoveryMode});
      }
      if (expectation.lost === true && plan.context?.engagementState !== 'lost' && plan.context?.recoveryMode !== 'close_loop') collect(findings,'negative_history_not_lost',family,index,{text:raw.lastContact,state:plan.context?.engagementState,mode:plan.context?.recoveryMode});

      if (family === 3 && typeof expectation.channel === 'string' && plan.campaign?.effectiveChannel !== expectation.channel) collect(findings,'allowed_fallback_not_selected',family,index,{requested:raw.primaryChannel,expected:expectation.channel,actual:plan.campaign?.effectiveChannel,policy:plan.context?.channelPolicy?.channels});
      if (family === 4 && (!plan.sendBlocked || payloadCount(plan) !== 0)) collect(findings,'all_channels_denied_not_held',family,index,{sendBlocked:plan.sendBlocked,payloads:payloadCount(plan)});
      if (family === 15 && expectation.channel && typeof expectation.channel === 'object') {
        const p=plan.context?.channelPolicy?.channels ?? {};
        if (p[expectation.channel.denyKey] !== expectation.channel.denyVal) collect(findings,'text_channel_deny_missed',family,index,{text:raw.lastContact,policy:p});
        if (p[expectation.channel.allowKey] !== expectation.channel.allowVal) collect(findings,'text_channel_allow_missed',family,index,{text:raw.lastContact,policy:p});
      }

      if (family === 17) {
        const supplied=raw.quoteAmount!==''&&raw.quoteAmount!==null&&raw.quoteAmount!==undefined;
        if (!supplied && validation.value.quoteAmount!==null) collect(findings,'missing_amount_not_null',family,index,{raw:raw.quoteAmount,value:validation.value.quoteAmount});
        if (supplied && Number(raw.quoteAmount)===0 && validation.value.quoteAmount!==0) collect(findings,'explicit_zero_lost',family,index,{raw:raw.quoteAmount,value:validation.value.quoteAmount});
      }
    }
  }

  assert.equal(attacks,EXPECTED_ATTACKS,'V8 must execute exactly 1,000,000 attacks');
  assert.deepEqual(familyCounts,Array(FAMILIES).fill(CASES_PER_FAMILY),'every V8 family must execute exactly 50,000 attacks');
  assert.equal(seenIds.size,EXPECTED_ATTACKS,'all V8 attack IDs must be unique');

  const totalFindings=Object.values(findings).reduce((sum,item)=>sum+item.count,0);
  if (totalFindings) throw new Error(`V8 found ${totalFindings.toLocaleString()} invariant violations across ${attacks.toLocaleString()} distinct attacks (${valid.toLocaleString()} valid / ${invalid.toLocaleString()} invalid / ${plans.toLocaleString()} plans inspected).\n${JSON.stringify(findings,null,2)}`);

  console.log(`V8 VERIFIED: ${attacks.toLocaleString()} distinct attacks across ${FAMILIES} families; ${valid.toLocaleString()} valid inputs; ${invalid.toLocaleString()} hostile inputs rejected; ${plans.toLocaleString()} generated plans inspected; 0 invariant violations.`);
});