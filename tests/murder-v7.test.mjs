import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, generateRecoveryPlan, formatPlanText } from '../src/engine.js';
import { STAGES, BLOCKERS, TONES, CHANNELS } from '../src/domain.js';

const base = Object.freeze({
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'555-0100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400.50', quoteAgeDays:'3',
  lastContactAgeDays:'2', stage:'viewed_no_reply', objection:'none', lastContact:'Sent estimate after inspection.',
  contactPermission:'allowed', smsPermission:'allowed', phonePermission:'unknown', emailPermission:'unknown',
  tone:'consultative', primaryChannel:'sms'
});

const forbiddenClaims = ['today only','limited time','last spot','guaranteed','[your name]','act now'];
const formatControls = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;

function cloneRaw(raw) {
  return structuredClone(raw);
}

function collect(findings, kind, family, index, details = {}) {
  findings[kind] ??= { count:0, examples:[] };
  findings[kind].count++;
  if (findings[kind].examples.length < 8) findings[kind].examples.push({ family, index, ...details });
}

function campaignPayloadCount(plan) {
  let count = 0;
  if (plan.campaign.sms) count++;
  if (plan.campaign.voicemail) count++;
  if (plan.campaign.email?.subject || plan.campaign.email?.body) count++;
  if (plan.campaign.reactivation) count++;
  count += plan.campaign.sevenDaySteps?.length ?? 0;
  return count;
}

function hasMalformedUtf16(value) {
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

function inspectValidPlan(raw, validation, family, index, findings, { exportCheck = false, deterministic = false } = {}) {
  const before = cloneRaw(raw);
  let plan;
  try {
    plan = generateRecoveryPlan(raw);
  } catch (error) {
    collect(findings,'valid_generation_crash',family,index,{error:String(error?.message ?? error)});
    return;
  }

  if (!assert.deepEqual) throw new Error('assertion library unavailable');
  try { assert.deepEqual(raw,before); }
  catch { collect(findings,'input_mutation',family,index); }

  if (plan.blocked) {
    if (plan.score !== 0) collect(findings,'blocked_nonzero_score',family,index,{score:plan.score});
    if (campaignPayloadCount(plan) !== 0) collect(findings,'blocked_payload_leak',family,index,{campaign:plan.campaign});
  } else if (!Number.isInteger(plan.score) || plan.score < 1 || plan.score > 100) {
    collect(findings,'score_bounds',family,index,{score:plan.score});
  }

  if (plan.sendBlocked && campaignPayloadCount(plan) !== 0) collect(findings,'send_hold_payload_leak',family,index,{campaign:plan.campaign});

  const policy = plan.context.channelPolicy?.channels ?? {};
  if (policy.sms === 'denied' && plan.campaign.sms) collect(findings,'denied_sms_leak',family,index);
  if (policy.phone === 'denied' && plan.campaign.voicemail) collect(findings,'denied_phone_leak',family,index);
  if (policy.email === 'denied' && (plan.campaign.email?.subject || plan.campaign.email?.body)) collect(findings,'denied_email_leak',family,index);
  if (plan.campaign.effectiveChannel && policy[plan.campaign.effectiveChannel] === 'denied') collect(findings,'effective_channel_denied',family,index,{effective:plan.campaign.effectiveChannel,policy});

  const steps = plan.campaign.sevenDaySteps ?? [];
  if (plan.context.recoveryMode === 'close_loop' && steps.length > 1) collect(findings,'close_loop_overcontact',family,index,{steps:steps.length});
  if (plan.context.recoveryMode === 'reactivation' && steps.length !== 0) collect(findings,'reactivation_active_cadence',family,index,{steps:steps.length});
  if (plan.context.recoveryMode === 'nurture' && steps.length > 2) collect(findings,'nurture_overcontact',family,index,{steps:steps.length});
  if (['active_followup','objection_resolution'].includes(plan.context.recoveryMode) && !plan.sendBlocked && steps.length !== 4) collect(findings,'active_cadence_shape',family,index,{mode:plan.context.recoveryMode,steps:steps.length});

  for (const step of steps) if (step.sms && step.sms.length > 320) collect(findings,'step_sms_over_320',family,index,{length:step.sms.length});
  if ((plan.campaign.sms ?? '').length > 320) collect(findings,'sms_over_320',family,index,{length:plan.campaign.sms.length});
  if ((plan.campaign.voicemail ?? '').length > 650) collect(findings,'voicemail_over_650',family,index,{length:plan.campaign.voicemail.length});
  if ((plan.campaign.email?.subject ?? '').length > 90 || /[\r\n]/.test(plan.campaign.email?.subject ?? '')) collect(findings,'email_subject_contract',family,index,{subject:plan.campaign.email?.subject});
  if ((plan.campaign.email?.body ?? '').length > 1500) collect(findings,'email_body_over_1500',family,index,{length:plan.campaign.email?.body?.length});

  const campaignText = JSON.stringify(plan.campaign).toLowerCase();
  for (const phrase of forbiddenClaims) if (campaignText.includes(phrase)) collect(findings,'forbidden_claim',family,index,{phrase});
  if (/undefined|\bnan\b|\[object object\]/i.test(campaignText)) collect(findings,'serialization_garbage',family,index);
  if (formatControls.test(campaignText)) collect(findings,'format_control_leak',family,index);
  if (hasMalformedUtf16(campaignText)) collect(findings,'malformed_utf16',family,index);

  if (deterministic) {
    try {
      const again = generateRecoveryPlan(raw);
      if (JSON.stringify(again) !== JSON.stringify(plan)) collect(findings,'nondeterminism',family,index);
    } catch (error) {
      collect(findings,'determinism_recheck_crash',family,index,{error:String(error?.message ?? error)});
    }
  }

  if (exportCheck) {
    try {
      const exported = formatPlanText(validation.value,plan);
      if (!exported.startsWith('QUOTE RESCUE PLAN')) collect(findings,'export_header_missing',family,index);
      if (exported.length > 25000) collect(findings,'export_unbounded',family,index,{length:exported.length});
      if (/undefined|\bNaN\b|\[object Object\]/.test(exported)) collect(findings,'export_serialization_garbage',family,index);
      if (formatControls.test(exported)) collect(findings,'export_format_control_leak',family,index);
      if (hasMalformedUtf16(exported)) collect(findings,'export_malformed_utf16',family,index);
    } catch (error) {
      collect(findings,'export_crash',family,index,{error:String(error?.message ?? error)});
    }
  }
}

function makeCase(family, index) {
  const unique = `V7-${family}-${String(index).padStart(4,'0')}`;
  const raw = { ...base, businessName:unique };
  const variant = index % 10;

  if (family === 0) {
    raw.stage = STAGES[index % STAGES.length];
    raw.objection = BLOCKERS[Math.floor(index / STAGES.length) % BLOCKERS.length];
    raw.tone = TONES[Math.floor(index / 17) % TONES.length];
    raw.primaryChannel = CHANNELS[Math.floor(index / 29) % CHANNELS.length];
    raw.contactPermission = ['allowed','unknown','do_not_contact'][Math.floor(index / 43) % 3];
    raw.smsPermission = ['allowed','unknown','denied'][Math.floor(index / 59) % 3];
    raw.phonePermission = ['allowed','unknown','denied'][Math.floor(index / 71) % 3];
    raw.emailPermission = ['allowed','unknown','denied'][Math.floor(index / 83) % 3];
    raw.quoteAgeDays = String(index % 3651);
    raw.lastContactAgeDays = index % 7 === 0 ? '' : String(index % 3651);
  }

  if (family === 1) {
    raw.contactPermission = 'unknown';
    const phrases = [
      'STOP','Please stop contacting me','Do not contact me again','Never contact me again','Leave me alone',
      'Remove me from your list','Opt me out','Unsubscribe me','This is the wrong number','I am not Alex; do not contact this number'
    ];
    const wrappers = [
      (s) => s,
      (s) => `  ${s}  `,
      (s) => `“${s}”`,
      (s) => `\u200B${s}\u200B`,
      (s) => `\u2066${s}\u2069`,
      (s) => `${s}.`,
      (s) => `${s}!`,
      (s) => `${s}\n`,
      (s) => `Customer said: ${s}`,
      (s) => `Message received — ${s}`
    ];
    raw.lastContact = wrappers[Math.floor(index / phrases.length) % wrappers.length](phrases[index % phrases.length]);
  }

  if (family === 2) {
    raw.contactPermission = index % 3 === 0 ? 'unknown' : 'allowed';
    const denied = CHANNELS[index % 3];
    raw.primaryChannel = denied;
    raw.smsPermission = denied === 'sms' ? 'denied' : (index % 2 ? 'allowed' : 'unknown');
    raw.phonePermission = denied === 'phone' ? 'denied' : (index % 5 ? 'unknown' : 'allowed');
    raw.emailPermission = denied === 'email' ? 'denied' : (index % 7 ? 'unknown' : 'allowed');
    if (index % 4 === 0) {
      raw.smsPermission = 'denied'; raw.phonePermission = 'denied'; raw.emailPermission = 'denied';
    }
  }

  if (family === 3) {
    const bad = [
      `+${index}`, `-${index + 1}`, `${index}e2`, `0x${(index + 1).toString(16)}`, `${index},00`,
      `${index}.000`, `${index}_0`, `${index} dollars`, `NaN${index}`, `Infinity${index}`
    ][variant];
    if (index % 2 === 0) raw.quoteAmount = bad;
    else raw.quoteAgeDays = bad;
  }

  if (family === 4) {
    const targets = ['customerName','repName','trade','jobDescription','stage','objection','tone','primaryChannel','contactPermission','smsPermission'];
    const badValues = [[],{},true,false,[unique],{value:unique},new Date(0),42,0,BigInt(index)];
    raw[targets[variant]] = badValues[variant];
  }

  if (family === 5) {
    const controls = ['\u200B','\u200E','\u202E','\u2060','\u2066','\u2069','\uFEFF','\u0001','\u0007','\u001F'];
    const c = controls[variant];
    raw.customerName = `Al${c}ex`;
    raw.repName = `Sa${c}m`;
    raw.trade = `HV${c}AC`;
    raw.jobDescription = `replace ${c}heat pump ${unique}`;
    raw.lastContact = `Customer ${c}viewed estimate; ${unique}.`;
  }

  if (family === 6) {
    const resolved = [
      'Budget was a concern, but it is resolved and we are ready to proceed.',
      'Financing was the issue, but the loan is approved and we are ready to proceed.',
      'Timing was a problem, but the schedule now works and we want to move forward.',
      'We were unsure before, but now we trust you and are ready to proceed.',
      'We considered another contractor, but have not hired them and want to proceed with you.',
      'My spouse had questions, but approved it and we are ready to move forward.',
      'Price was a concern earlier, but that concern is resolved now.',
      'We were not ready last week, but now we are ready to proceed.',
      'Warranty concern was resolved; we trust the proposal now.',
      'A competitor was considered earlier; now we want to continue this quote.'
    ];
    raw.stage = 'viewed_no_reply';
    raw.objection = 'none';
    raw.lastContact = `${resolved[variant]} Ref ${unique}.`;
  }

  if (family === 7) {
    const emoji = '😀';
    raw.customerName = `${'A'.repeat(58)}${index % 10}`;
    raw.repName = `${'R'.repeat(58)}${index % 10}`;
    raw.trade = `${'T'.repeat(78)}${index % 10}`;
    raw.jobDescription = `${emoji.repeat(120)} ${'J'.repeat(350)} ${unique}`.slice(0,600);
    raw.lastContact = `${emoji.repeat(120)} ${'C'.repeat(540)} ${unique}`.slice(0,800);
    raw.quoteAmount = index % 2 ? '1000000000' : '999999999.99';
    raw.quoteAgeDays = String(index % 3651);
  }

  if (family === 8) {
    const amountModes = ['',null,undefined,'0',0,'0.00','1','1.01','999999999.99','1000000000'];
    const contactAgeModes = ['',null,undefined,'0',0,'1','3650','7','30','90'];
    raw.quoteAmount = amountModes[variant];
    raw.lastContactAgeDays = contactAgeModes[variant];
  }

  if (family === 9) {
    raw.stage = STAGES[(index * 7) % STAGES.length];
    raw.objection = BLOCKERS[(index * 11) % BLOCKERS.length];
    raw.tone = TONES[(index * 13) % TONES.length];
    raw.primaryChannel = CHANNELS[(index * 17) % CHANNELS.length];
    raw.contactPermission = index % 19 === 0 ? 'unknown' : 'allowed';
    raw.smsPermission = ['allowed','unknown','denied'][(index * 23) % 3];
    raw.phonePermission = ['allowed','unknown','denied'][(index * 29) % 3];
    raw.emailPermission = ['allowed','unknown','denied'][(index * 31) % 3];
    raw.quoteAmount = `${index % 1000000}.${String(index % 100).padStart(2,'0')}`;
    raw.quoteAgeDays = String(index % 3651);
    raw.lastContactAgeDays = String(index % 3651);
    raw.jobDescription = `Project ${unique} — ${'x'.repeat(index % 97)}`;
  }

  return raw;
}

test('V7 literal 100,000-way murder attack: every distinct adversarial case preserves validation, safety, determinism, channel, Unicode, boundary, and export invariants', () => {
  const findings = {};
  const fingerprints = new Set();
  const familyCounts = Array(10).fill(0);
  let attacks = 0;
  let valid = 0;
  let invalid = 0;

  for (let family = 0; family < 10; family++) {
    for (let index = 0; index < 10000; index++) {
      attacks++;
      familyCounts[family]++;
      const raw = makeCase(family,index);
      let fingerprint;
      try { fingerprint = JSON.stringify(raw,(_,value) => typeof value === 'bigint' ? `bigint:${value}` : value); }
      catch (error) { collect(findings,'fingerprint_crash',family,index,{error:String(error?.message ?? error)}); continue; }
      if (fingerprints.has(fingerprint)) collect(findings,'duplicate_attack_input',family,index);
      fingerprints.add(fingerprint);

      let validation;
      try { validation = validateInput(raw); }
      catch (error) { collect(findings,'validation_crash',family,index,{error:String(error?.message ?? error)}); continue; }

      if (family === 3 || family === 4) {
        if (validation.valid) collect(findings,'hostile_input_accepted',family,index,{raw});
      }

      if (family === 1 && validation.valid) {
        try {
          const plan = generateRecoveryPlan(raw);
          if (!plan.blocked || plan.score !== 0 || campaignPayloadCount(plan) !== 0) collect(findings,'optout_variant_not_blocked',family,index,{text:raw.lastContact,blocked:plan.blocked,score:plan.score,mode:plan.context.recoveryMode});
        } catch (error) {
          collect(findings,'optout_generation_crash',family,index,{error:String(error?.message ?? error)});
        }
      }

      if (!validation.valid) {
        invalid++;
        continue;
      }
      valid++;

      if (family === 5) {
        for (const [key,value] of Object.entries(validation.value)) {
          if (typeof value === 'string' && formatControls.test(value)) collect(findings,'normalized_format_control_leak',family,index,{key});
        }
      }

      if (family === 6) {
        try {
          const plan = generateRecoveryPlan(raw);
          if (plan.context.engagementState === 'lost') collect(findings,'resolved_history_still_lost',family,index,{text:raw.lastContact,blocker:plan.context.primaryBlocker,mode:plan.context.recoveryMode});
          if (['budget','financing','timing','trust','spouse_partner','competitor','price','not_ready'].includes(plan.context.primaryBlocker) && /resolved|approved|ready|want to proceed|continue this quote/i.test(raw.lastContact)) collect(findings,'resolved_history_stale_blocker',family,index,{text:raw.lastContact,blocker:plan.context.primaryBlocker,mode:plan.context.recoveryMode});
        } catch (error) {
          collect(findings,'resolved_history_crash',family,index,{error:String(error?.message ?? error)});
        }
      }

      if (family === 8) {
        const suppliedAmount = raw.quoteAmount !== '' && raw.quoteAmount !== null && raw.quoteAmount !== undefined;
        if (!suppliedAmount && validation.value.quoteAmount !== null) collect(findings,'missing_amount_not_null',family,index,{raw:raw.quoteAmount,value:validation.value.quoteAmount});
        if (suppliedAmount && Number(raw.quoteAmount) === 0 && validation.value.quoteAmount !== 0) collect(findings,'explicit_zero_lost',family,index,{raw:raw.quoteAmount,value:validation.value.quoteAmount});
      }

      inspectValidPlan(raw,validation,family,index,findings,{
        exportCheck: family === 7 || family === 8 || family === 9 || index % 97 === 0,
        deterministic: family === 9 || index % 211 === 0
      });
    }
  }

  assert.equal(attacks,100000,'V7 must execute exactly 100,000 attacks');
  assert.deepEqual(familyCounts,Array(10).fill(10000),'every V7 family must execute exactly 10,000 attacks');
  assert.equal(fingerprints.size,100000,'all 100,000 V7 raw attack inputs must be distinct');

  const totalFindings = Object.values(findings).reduce((sum,item) => sum + item.count,0);
  if (totalFindings) {
    throw new Error(`V7 found ${totalFindings.toLocaleString()} invariant violations across ${attacks.toLocaleString()} distinct attacks (${valid.toLocaleString()} valid / ${invalid.toLocaleString()} invalid).\n${JSON.stringify(findings,null,2)}`);
  }

  console.log(`V7 VERIFIED: ${attacks.toLocaleString()} distinct attacks; ${valid.toLocaleString()} valid plans inspected; ${invalid.toLocaleString()} hostile inputs rejected; 0 invariant violations.`);
});
