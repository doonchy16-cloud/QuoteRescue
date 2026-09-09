import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseInput, shortProjectReference } from '../src/domain.js';
import { generateRecoveryPlan, formatPlanText } from '../src/engine.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const base = Object.freeze({
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'555-0100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400', quoteAgeDays:'3',
  stage:'viewed_no_reply', objection:'none', contactPermission:'allowed', smsPermission:'allowed', phonePermission:'unknown', emailPermission:'allowed',
  lastContactAgeDays:'2', lastContact:'Sent estimate after inspection; customer viewed it yesterday.', tone:'consultative', primaryChannel:'sms'
});

function assertWellFormedUtf16(text, label='text') {
  const value=String(text??'');
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);
    if(code>=0xD800&&code<=0xDBFF){
      const next=value.charCodeAt(i+1);
      assert.ok(next>=0xDC00&&next<=0xDFFF,`${label} contains a lone high surrogate at ${i}`);
      i++;
    } else if(code>=0xDC00&&code<=0xDFFF) {
      assert.fail(`${label} contains a lone low surrogate at ${i}`);
    }
  }
}

function functionSource(startMarker,endMarker){
  const start=app.indexOf(startMarker),end=app.indexOf(endMarker,start+startMarker.length);
  assert.ok(start>=0,`Missing ${startMarker}`);
  assert.ok(end>start,`Missing ${endMarker}`);
  return app.slice(start,end);
}

test('V4 currency-fidelity attack: cents survive generation and text export exactly', () => {
  const plan=generateRecoveryPlan({...base,quoteAmount:'8400.50'});
  const exported=formatPlanText(plan.input,plan);
  assert.match(exported,/Quote amount: \$8,400\.50\b/);
  assert.match(plan.campaign.email.body,/\(\$8,400\.50\)/);
});

test('V4 currency-grammar attack: quote amount rejects more than two fractional digits', () => {
  for(const quoteAmount of ['0.001','8400.005','999.999','1.23456789']){
    const validation=parseInput({...base,quoteAmount});
    assert.equal(validation.valid,false,`Unexpectedly accepted ${quoteAmount}`);
    assert.ok(validation.errors.quoteAmount,`Missing quoteAmount error for ${quoteAmount}`);
  }
});

test('V4 Unicode-boundary attack: short project truncation never splits a surrogate pair', () => {
  const hostile='A'.repeat(63)+'😀'+'Z'.repeat(20);
  const out=shortProjectReference(hostile,65);
  assertWellFormedUtf16(out,'shortProjectReference');
  assert.ok(out.endsWith('…'));
});

test('V4 Unicode-propagation attack: every generated/exported payload remains well-formed UTF-16', () => {
  const hostile='A'.repeat(62)+'😀'+'Z'.repeat(80);
  const plan=generateRecoveryPlan({...base,jobDescription:hostile});
  const payloads=[
    plan.diagnosis,plan.nextMove,plan.campaign.sms,plan.campaign.voicemail,plan.campaign.email.subject,plan.campaign.email.body,
    plan.campaign.objectionResponse,plan.campaign.closeLoop,plan.campaign.reactivation,formatPlanText(plan.input,plan),
    ...plan.campaign.sevenDaySteps.flatMap((step)=>[step.subject,step.body,step.voicemail,step.sms])
  ];
  payloads.forEach((value,index)=>assertWellFormedUtf16(value,`payload ${index}`));
});

test('V4 truncation-alignment attack: SMS and email subjects stay well-formed across emoji boundary positions', () => {
  for(let i=0;i<=58;i++){
    const customerName='A'.repeat(i)+'😀';
    const plan=generateRecoveryPlan({...base,customerName,businessName:'B'.repeat(100),trade:'T'.repeat(80),jobDescription:'J'.repeat(600)});
    assertWellFormedUtf16(plan.campaign.sms,`sms customer position ${i}`);
  }
  for(let i=0;i<=78;i++){
    const trade='T'.repeat(i)+'😀'+'X'.repeat(Math.max(0,78-i));
    const validation=parseInput({...base,trade});
    if(!validation.valid) continue;
    const plan=generateRecoveryPlan({...base,trade});
    assertWellFormedUtf16(plan.campaign.email.subject,`subject trade position ${i}`);
  }
});

test('V4 clipboard-failure attack: fallback cleanup is guaranteed even when execCommand throws', () => {
  const source=functionSource('async function copyText','function showToast');
  assert.match(source,/finally\s*\{[\s\S]*area\.remove\(\)/,'clipboard fallback must remove its temporary textarea in finally');
  assert.match(source,/catch\s*\([^)]*\)|catch\s*\{/,'clipboard fallback must convert browser failure into an honest false result');
});

test('V4 delegated-click attack: non-Element event targets cannot crash the document click handler', () => {
  const clickLine=app.split('\n').find((line)=>line.includes("document.addEventListener('click'"))??'';
  assert.ok(clickLine.includes('?.closest')||clickLine.includes('instanceof Element'),clickLine);
});

test('V4 download-failure attack: temporary resources are cleaned and failure is surfaced honestly', () => {
  const source=functionSource('function downloadText','form.addEventListener');
  assert.match(source,/try\s*\{[\s\S]*a\.click\(\)[\s\S]*\}\s*catch[\s\S]*Download failed[\s\S]*finally\s*\{/,'download failure must be caught and reported before finally');
  assert.match(source,/finally\s*\{[\s\S]*a\.remove\(\)[\s\S]*URL\.revokeObjectURL\(url\)/,'download cleanup must remove anchor and revoke URL');
});

test('V4 stale-state attack: direct copy and download paths independently require a current plan', () => {
  const copy=functionSource('function copyForKey','async function copyText');
  const download=functionSource('function downloadText','form.addEventListener');
  assert.match(copy,/uiStatus\s*!==\s*['"]current['"]/);
  assert.match(download,/uiStatus\s*!==\s*['"]current['"]/);
  assert.match(app,/form\.addEventListener\('input',\s*markPlanStale\)/);
  assert.match(app,/form\.addEventListener\('change',\s*markPlanStale\)/);
});
