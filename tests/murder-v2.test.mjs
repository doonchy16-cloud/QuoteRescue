import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateInput, generateRecoveryPlan, formatPlanText } from '../src/engine.js';
import { STAGES, BLOCKERS, TONES, CHANNELS } from '../src/domain.js';

const base = {
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'555-0100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400', quoteAgeDays:'3',
  lastContactAgeDays:'2', stage:'viewed_no_reply', objection:'none', lastContact:'Sent estimate after inspection.',
  contactPermission:'allowed', smsPermission:'unknown', phonePermission:'unknown', emailPermission:'unknown',
  tone:'consultative', primaryChannel:'sms'
};

const forbiddenInvented = ['today only','limited time','last spot','guaranteed','[your name]','discount','act now'];

function collect(bucket, kind, label, details = {}) {
  bucket[kind] ??= { count:0, examples:[] };
  bucket[kind].count++;
  if (bucket[kind].examples.length < 8) bucket[kind].examples.push({ label, ...details });
}

function failIfAny(title, bucket, scenarioCount = null) {
  const total = Object.values(bucket).reduce((sum, item) => sum + item.count, 0);
  if (!total) return;
  throw new Error(`${title}${scenarioCount == null ? '' : ` — ${scenarioCount.toLocaleString()} scenarios`}\n` + JSON.stringify({ totalFindings:total, findings:bucket }, null, 2));
}

const campaignText = (plan) => JSON.stringify(plan.campaign).toLowerCase();

function assertStepMatchesEffectiveChannel(plan, label, findings) {
  const steps = plan.campaign.sevenDaySteps;
  if (!steps.length) return;
  const first = steps[0];
  const effective = plan.campaign.effectiveChannel;
  if (effective === 'sms' && !first.sms) collect(findings,'effective_sms_missing',label,{first});
  if (effective === 'email' && (!first.subject || !first.body)) collect(findings,'effective_email_missing',label,{first});
  if (effective === 'phone' && !first.voicemail) collect(findings,'effective_phone_missing',label,{first});
}

test('V2 combinatorial murder matrix: 25,920 supported states preserve global invariants', () => {
  const findings = {};
  const quoteAges = [0,7,46,90];
  const contactAges = [null,0,7];
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
                const label = `${stage}/${objection}/${tone}/${primaryChannel}/${contactPermission}/${quoteAgeDays}/${lastContactAgeDays}`;
                const raw = {
                  ...base, stage, objection, tone, primaryChannel, contactPermission,
                  quoteAgeDays:String(quoteAgeDays),
                  lastContactAgeDays:lastContactAgeDays == null ? '' : String(lastContactAgeDays)
                };
                let plan;
                try { plan = generateRecoveryPlan(raw); }
                catch (error) { collect(findings,'crash',label,{error:String(error?.message ?? error)}); continue; }

                if (!Number.isInteger(plan.score) || plan.score < 1 || plan.score > 100) collect(findings,'score_bounds',label,{score:plan.score});
                if (plan.context.contactState === 'do_not_contact') collect(findings,'unexpected_block',label,{});
                if (['close_loop','reactivation'].includes(plan.context.recoveryMode) && plan.band !== 'Reactivation / close loop') collect(findings,'strategy_band_mismatch',label,{mode:plan.context.recoveryMode,band:plan.band});
                if (plan.context.recoveryMode === 'nurture' && plan.score >= 55) collect(findings,'nurture_overcap',label,{score:plan.score});

                for (const step of plan.campaign.sevenDaySteps) if (step.sms && step.sms.length > 320) collect(findings,'sms_over_320',label,{length:step.sms.length,day:step.day});
                if (plan.campaign.sms.length > 320) collect(findings,'opening_sms_over_320',label,{length:plan.campaign.sms.length});
                if (plan.campaign.voicemail.length > 650) collect(findings,'voicemail_over_650',label,{length:plan.campaign.voicemail.length});
                if (plan.campaign.email.subject.length > 90 || /[\r\n]/.test(plan.campaign.email.subject)) collect(findings,'email_subject_contract',label,{subject:plan.campaign.email.subject});
                if (plan.campaign.email.body.length > 1500) collect(findings,'email_body_over_1500',label,{length:plan.campaign.email.body.length});

                const text = campaignText(plan);
                for (const phrase of forbiddenInvented) if (text.includes(phrase)) collect(findings,'forbidden_generated_claim',label,{phrase});

                assertStepMatchesEffectiveChannel(plan,label,findings);

                if (lastContactAgeDays === 0) {
                  if (!/do not send another follow-up today/i.test(plan.nextMove)) collect(findings,'same_day_next_move_missing',label,{nextMove:plan.nextMove});
                  if (plan.campaign.sevenDaySteps[0]?.day === 'Day 0') collect(findings,'same_day_schedule_contradiction',label,{mode:plan.context.recoveryMode,action:plan.campaign.sevenDaySteps[0]?.action});
                }

                if (plan.context.recoveryMode === 'close_loop' && plan.campaign.sevenDaySteps.length > 1) collect(findings,'close_loop_over_contact',label,{steps:plan.campaign.sevenDaySteps.length,nextMove:plan.nextMove});
                if (plan.context.recoveryMode === 'reactivation' && plan.campaign.sevenDaySteps.length !== 0) collect(findings,'reactivation_has_active_cadence',label,{steps:plan.campaign.sevenDaySteps.length,nextMove:plan.nextMove});
                if (plan.context.recoveryMode === 'nurture' && plan.campaign.sevenDaySteps.length > 2) collect(findings,'nurture_over_contact',label,{steps:plan.campaign.sevenDaySteps.length});
                if (['active_followup','objection_resolution'].includes(plan.context.recoveryMode) && plan.campaign.sevenDaySteps.length !== 4) collect(findings,'active_cadence_incomplete',label,{steps:plan.campaign.sevenDaySteps.length});

                if (count % 97 === 0) {
                  const again = generateRecoveryPlan(raw);
                  if (JSON.stringify(again) !== JSON.stringify(plan)) collect(findings,'nondeterminism',label,{});
                  const exported = formatPlanText(raw,plan);
                  if (!exported.includes('QUOTE RESCUE PLAN') || exported.length > 20000) collect(findings,'export_contract',label,{length:exported.length});
                }
              }

  assert.equal(count,25920);
  failIfAny('V2 matrix found contract violations',findings,count);
});

test('V2 safety lexicon: strong global opt-out / wrong-recipient phrases hard-block outreach', () => {
  const phrases = [
    'STOP','Please stop','Stop reaching out',"Don't message me",'Never reach out again',"Please don't reach out again",
    'No more messages','Leave me alone','Take me off your list','Remove me from your list','Remove me from marketing',
    'Remove my number','Delete my number','Opt me out','I revoke consent to contact me','Cease contact','Cease communications',
    'This is the wrong number','Wrong number — remove me','I am not Alex; do not contact this number','Unsubscribe me',
    "Don't reach out",'Do not reach out'
  ];
  const missed=[];
  for (const lastContact of phrases) {
    const plan=generateRecoveryPlan({...base,contactPermission:'unknown',lastContact});
    if (!plan.blocked || plan.score!==0 || plan.campaign.sevenDaySteps.length!==0 || plan.campaign.reactivation!=='') missed.push({phrase:lastContact,blocked:plan.blocked,score:plan.score,mode:plan.context.recoveryMode});
  }
  assert.deepEqual(missed,[],`Missed strong global opt-out/wrong-recipient phrases:\n${JSON.stringify(missed,null,2)}`);
});

test('V2 standalone channel-denial lexicon denies only the named channel', () => {
  const cases = [
    { text:'Do not call me', requested:'phone', denied:'phone' },
    { text:"Don't call me", requested:'phone', denied:'phone' },
    { text:'Never call me', requested:'phone', denied:'phone' },
    { text:'No more calls', requested:'phone', denied:'phone' },
    { text:'Take me off the call list', requested:'phone', denied:'phone' },
    { text:'Quit calling me', requested:'phone', denied:'phone' },
    { text:'No calls please', requested:'phone', denied:'phone' },
    { text:'Do not text me', requested:'sms', denied:'sms' },
    { text:"Don't text me", requested:'sms', denied:'sms' },
    { text:'Never text me', requested:'sms', denied:'sms' },
    { text:'No more texts', requested:'sms', denied:'sms' },
    { text:'Quit texting me', requested:'sms', denied:'sms' },
    { text:'No texts please', requested:'sms', denied:'sms' },
    { text:'Stop emailing me', requested:'email', denied:'email' },
    { text:'Do not email me', requested:'email', denied:'email' },
    { text:'Never email me', requested:'email', denied:'email' }
  ];
  const violations=[];
  for (const c of cases) {
    const plan=generateRecoveryPlan({...base,contactPermission:'unknown',lastContact:c.text,primaryChannel:c.requested});
    if (plan.blocked || plan.context.channelPolicy.channels[c.denied]!=='denied' || !plan.sendBlocked) violations.push({ ...c, blocked:plan.blocked, policy:plan.context.channelPolicy, sendBlocked:plan.sendBlocked });
  }
  assert.deepEqual(violations,[],`Standalone channel-denial violations:\n${JSON.stringify(violations,null,2)}`);
});

test('V2 channel restriction attack: prohibited channels are never generated or selected', () => {
  const cases = [
    { text:'Do not call me; text is fine.', requested:'phone', denied:'phone', allowed:'sms' },
    { text:"Don't call; please text instead.", requested:'phone', denied:'phone', allowed:'sms' },
    { text:'Text only, please.', requested:'phone', denied:'phone', allowed:'sms' },
    { text:'Do not text me; call instead.', requested:'sms', denied:'sms', allowed:'phone' },
    { text:"Don't text; email me instead.", requested:'sms', denied:'sms', allowed:'email' },
    { text:'Call only, please.', requested:'sms', denied:'sms', allowed:'phone' },
    { text:'Do not email me; call instead.', requested:'email', denied:'email', allowed:'phone' },
    { text:"Don't email; text me instead.", requested:'email', denied:'email', allowed:'sms' },
    { text:'Phone only, please.', requested:'email', denied:'email', allowed:'phone' }
  ];
  const violations=[];
  for (const c of cases) {
    const plan=generateRecoveryPlan({...base,contactPermission:'unknown',lastContact:c.text,primaryChannel:c.requested});
    const p=plan.context.channelPolicy.channels;
    if (p[c.denied]!=='denied' || p[c.allowed]!=='allowed' || plan.campaign.effectiveChannel!==c.allowed) violations.push({...c,policy:p,effective:plan.campaign.effectiveChannel});
    if (c.denied==='sms' && plan.campaign.sms) violations.push({...c,leak:'sms'});
    if (c.denied==='phone' && plan.campaign.voicemail) violations.push({...c,leak:'voicemail'});
    if (c.denied==='email' && (plan.campaign.email.subject||plan.campaign.email.body)) violations.push({...c,leak:'email'});
  }
  assert.deepEqual(violations,[],`Channel-restriction violations:\n${JSON.stringify(violations,null,2)}`);
});

test('V2 structured channel-policy attack: explicit denied requested channel needs allowed fallback or send hold', () => {
  const switched=generateRecoveryPlan({...base,primaryChannel:'phone',phonePermission:'denied',smsPermission:'allowed'});
  assert.equal(switched.campaign.effectiveChannel,'sms');
  assert.equal(switched.campaign.voicemail,'');
  const hold=generateRecoveryPlan({...base,contactPermission:'unknown',primaryChannel:'phone',phonePermission:'denied',smsPermission:'unknown',emailPermission:'unknown'});
  assert.equal(hold.sendBlocked,true);
  assert.equal(hold.campaign.sevenDaySteps.length,0);
  assert.match(hold.nextMove,/verify contact permission/i);
});

test('V2 semantic-negation attack: resolved statements do not become active blockers', () => {
  const cases = [
    ['Budget is not a problem.','budget'],['Budget is fine.','budget'],['We have enough budget.','budget'],["We don't have a budget issue.",'budget'],
    ['Financing is approved.','financing'],['Loan is approved.','financing'],['Funding is secured.','financing'],["Financing isn't a problem.",'financing'],['No financing is needed.','financing'],
    ['We trust you.','trust'],['Trust is not a concern.','trust'],['Warranty is not a concern.','trust'],
    ['Timing works for us.','timing'],['Timing is perfect.','timing'],['Schedule is not a problem.','timing'],
    ['My husband approved it.','spouse_partner'],['My wife already approved.','spouse_partner'],['My partner approved the quote.','spouse_partner'],
    ['We have not hired another contractor.','competitor'],['We did not select a competitor.','competitor']
  ];
  const falsePositives=[];
  for (const [lastContact,forbiddenBlocker] of cases) {
    const plan=generateRecoveryPlan({...base,stage:'viewed_no_reply',objection:'none',lastContact});
    if (plan.context.primaryBlocker===forbiddenBlocker || (forbiddenBlocker==='competitor'&&plan.context.engagementState==='lost')) falsePositives.push({text:lastContact,blocker:plan.context.primaryBlocker,engagement:plan.context.engagementState,mode:plan.context.recoveryMode});
  }
  assert.deepEqual(falsePositives,[],`Semantic false positives:\n${JSON.stringify(falsePositives,null,2)}`);
});

test('V2 negative-intent attack: inability/refusal to move forward is never positive', () => {
  const phrases=["I can't move forward.",'I cannot move forward.','Unable to move forward.','Not able to move forward.',"We aren't able to move forward.",'We are unable to proceed.','We cannot proceed.',"We can't proceed.",'Customer is not ready to move forward.'];
  const failures=[];
  for(const lastContact of phrases){const plan=generateRecoveryPlan({...base,lastContact,stage:'viewed_no_reply',objection:'none'});if(plan.context.engagementState==='positive')failures.push({phrase:lastContact,blocker:plan.context.primaryBlocker,mode:plan.context.recoveryMode});}
  assert.deepEqual(failures,[],`False positive intent:\n${JSON.stringify(failures,null,2)}`);
});

test('V2 contrast/resolution attack: current resolved state outranks obsolete earlier cue', () => {
  const cases=[
    'Budget was a concern, but it is resolved and we are ready to proceed.',
    'We were unsure before, but now we trust you and are ready to move forward.',
    'Financing was the issue, but the loan is approved and we are ready to proceed.',
    'They were not ready last week; now they are ready to proceed.',
    'Timing was a problem, but the schedule now works perfectly and they want to move forward.'
  ];
  const failures=[];
  for(const lastContact of cases){const plan=generateRecoveryPlan({...base,stage:'viewed_no_reply',objection:'none',lastContact});if(plan.context.engagementState!=='positive'||['budget','financing','trust','timing','not_ready'].includes(plan.context.primaryBlocker))failures.push({text:lastContact,blocker:plan.context.primaryBlocker,engagement:plan.context.engagementState,mode:plan.context.recoveryMode});}
  assert.deepEqual(failures,[],`Resolution/contrast failures:\n${JSON.stringify(failures,null,2)}`);
});

test('V2 contradiction attack: stale structured state versus current text is surfaced and confidence capped', () => {
  const cases=[
    {stage:'lost_ghosted',objection:'none',lastContact:'Customer is ready to proceed with us.'},
    {stage:'considering_competitor',objection:'none',lastContact:'Customer said they chose us and want to move forward.'},
    {stage:'budget_issue',objection:'none',lastContact:'Customer said budget is fine and wants to proceed.'},
    {stage:'financing_issue',objection:'none',lastContact:'Loan is approved and customer is ready to proceed.'}
  ];
  const hidden=[];
  for(const c of cases){const plan=generateRecoveryPlan({...base,...c});if(plan.context.engagementState==='positive'&&(plan.context.conflicts.length===0||plan.context.confidence==='high'))hidden.push({...c,context:plan.context});}
  assert.deepEqual(hidden,[],`Unsurfaced contradictions:\n${JSON.stringify(hidden,null,2)}`);
});

test('V2 numeric grammar attack: hostile non-decimal syntax is rejected', () => {
  const tokens=['0x10','0b1010','0o77','+Infinity','-Infinity','NaN','1_000','1,000','--1','++1','1e999','1e3'];
  const accepted=[];
  for(const token of tokens){const quote=validateInput({...base,quoteAmount:token});const age=validateInput({...base,quoteAgeDays:token});if(quote.valid)accepted.push({field:'quoteAmount',token,parsed:quote.value.quoteAmount});if(age.valid)accepted.push({field:'quoteAgeDays',token,parsed:age.value.quoteAgeDays});}
  assert.deepEqual(accepted,[],`Unexpected numeric grammar accepted:\n${JSON.stringify(accepted,null,2)}`);
});

test('V2 maximum-shape attack: max legal input stays bounded and export practical', () => {
  const plan=generateRecoveryPlan({...base,customerName:'A'.repeat(60),repName:'R'.repeat(60),businessName:'B'.repeat(100),trade:'T'.repeat(80),jobDescription:'J'.repeat(600),lastContact:'L'.repeat(800)});
  for(const step of plan.campaign.sevenDaySteps)if(step.sms)assert.ok(step.sms.length<=320,step.sms.length);
  assert.ok(plan.campaign.voicemail.length<=650,plan.campaign.voicemail.length);
  assert.ok(plan.campaign.email.subject.length<=90,plan.campaign.email.subject.length);
  assert.ok(plan.campaign.email.body.length<=1500,plan.campaign.email.body.length);
  assert.ok(formatPlanText(plan.input,plan).length<20000);
});

test('V2 privacy attack: browser app contains no outbound network transport primitives', () => {
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const engine=fs.readFileSync(new URL('../src/engine.js',import.meta.url),'utf8');
  const joined=`${app}\n${engine}`;
  for(const token of ['fetch(','XMLHttpRequest','sendBeacon(','WebSocket(','EventSource('])assert.equal(joined.includes(token),false,token);
});

function lcg(seed){let s=seed>>>0;return()=>((s=(Math.imul(1664525,s)+1013904223)>>>0)/4294967296);}

test('V2 deterministic fuzz: 10,000 mutated raw inputs never crash validation; valid cases remain deterministic', () => {
  const rand=lcg(0x51a7f00d);
  const weird=['',' ','0','-1','1','3.5','Infinity','NaN','0x10','💥','\u0000','A'.repeat(900),'not ready','STOP','12345'];
  let validCount=0;
  for(let i=0;i<10000;i++){
    const raw={...base};
    const fields=['customerName','repName','businessName','callbackPhone','trade','jobDescription','quoteAmount','quoteAgeDays','lastContactAgeDays','lastContact'];
    for(let j=0;j<1+Math.floor(rand()*4);j++)raw[fields[Math.floor(rand()*fields.length)]]=weird[Math.floor(rand()*weird.length)];
    let validation;
    assert.doesNotThrow(()=>{validation=validateInput(raw);});
    if(validation.valid){validCount++;const a=generateRecoveryPlan(raw);const b=generateRecoveryPlan(raw);assert.equal(JSON.stringify(a),JSON.stringify(b));}
  }
  assert.ok(validCount>=0);
});
