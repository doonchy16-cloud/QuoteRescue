import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseInput, formatCurrencyAmount } from '../src/domain.js';
import { generateRecoveryPlan, formatPlanText } from '../src/engine.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const base = Object.freeze({
  customerName:'Alex', repName:'Sam', businessName:'Peak HVAC', callbackPhone:'555-0100', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400', quoteAgeDays:'3',
  stage:'viewed_no_reply', objection:'none', contactPermission:'allowed', smsPermission:'allowed', phonePermission:'unknown', emailPermission:'allowed',
  lastContactAgeDays:'2', lastContact:'Sent estimate after inspection; customer viewed it yesterday.', tone:'consultative', primaryChannel:'sms'
});

function functionSource(startMarker,endMarker){
  const start=app.indexOf(startMarker),end=app.indexOf(endMarker,start+startMarker.length);
  assert.ok(start>=0,`Missing ${startMarker}`);
  assert.ok(end>start,`Missing ${endMarker}`);
  return app.slice(start,end);
}

test('V5 missing-value attack: blank quote amount remains distinct from explicit zero', () => {
  const blank=parseInput({...base,quoteAmount:''});
  const zero=parseInput({...base,quoteAmount:'0'});
  assert.equal(blank.valid,true);
  assert.equal(zero.valid,true);
  assert.equal(blank.value.quoteAmount,null,'blank optional amount must use a null sentinel');
  assert.equal(zero.value.quoteAmount,0,'explicit zero must remain numeric zero');
});

test('V5 zero-dollar attack: explicit zero survives score, email, and export as supplied data', () => {
  const plan=generateRecoveryPlan({...base,quoteAmount:'0'});
  const exported=formatPlanText(plan.input,plan);
  const valueFactor=plan.priority.factors.find((factor)=>factor.label==='Quote value');
  assert.equal(valueFactor?.detail,'$0');
  assert.match(plan.campaign.email.body,/\(\$0\)/);
  assert.match(exported,/Quote amount: \$0\b/);
  assert.doesNotMatch(exported,/Quote amount: Not supplied/);
});

test('V5 cross-surface currency attack: scoring preserves the same cents as email and export', () => {
  const plan=generateRecoveryPlan({...base,quoteAmount:'8400.50'});
  const valueFactor=plan.priority.factors.find((factor)=>factor.label==='Quote value');
  assert.equal(valueFactor?.detail,'$8,400.50');
  assert.match(plan.campaign.email.body,/\(\$8,400\.50\)/);
  assert.match(formatPlanText(plan.input,plan),/Quote amount: \$8,400\.50\b/);
});

test('V5 formatter-sentinel attack: missing currency values never stringify as zero', () => {
  for(const missing of [null,undefined,'']) assert.equal(formatCurrencyAmount(missing),'');
  assert.equal(formatCurrencyAmount(0),'0');
});

test('V5 silent-mutation attack: copy and download revalidate the live form before exporting', () => {
  assert.match(app,/function\s+ensureCurrentPlanFresh\s*\(/,'missing live-form freshness gate');
  const freshness=functionSource('function ensureCurrentPlanFresh','function copyForKey');
  assert.match(freshness,/validateInput\(getInput\(\)\)/,'freshness gate must revalidate live form state');
  assert.match(freshness,/markPlanStale\(\)/,'freshness mismatch must visibly stale the old plan');
  const copy=functionSource('function copyForKey','async function copyText');
  const download=functionSource('function downloadText','form.addEventListener');
  assert.match(copy,/ensureCurrentPlanFresh\(\)/,'copy path must not trust uiStatus alone');
  assert.match(download,/ensureCurrentPlanFresh\(\)/,'download path must not trust uiStatus alone');
});

test('V5 history-lifecycle attack: bfcache restoration invalidates any previously current plan', () => {
  assert.match(app,/window\.addEventListener\(['"]pageshow['"][\s\S]*persisted[\s\S]*markPlanStale\(\)/,'pageshow/bfcache restoration must stale cached output');
});

test('V5 download-construction attack: Blob and object-URL failures are caught without unsafe cleanup', () => {
  const source=functionSource('function downloadText','form.addEventListener');
  assert.match(source,/let\s+url\s*=\s*null/,'download must track whether an object URL was actually created');
  assert.match(source,/try\s*\{[\s\S]*new Blob\([\s\S]*URL\.createObjectURL\([\s\S]*a\.click\(\)/,'Blob, object URL creation, and click must share the protected try boundary');
  assert.match(source,/finally\s*\{[\s\S]*(?:a\?\.remove\(\)|if\s*\(a\)\s*a\.remove\(\))[\s\S]*if\s*\(url\)[\s\S]*URL\.revokeObjectURL\(url\)/,'cleanup must tolerate partially constructed downloads');
});

test('V5 browser-capability attack: scrolling degrades safely when optional browser APIs are absent or throw', () => {
  const source=functionSource('function scrollToResults','function copyForKey');
  assert.match(source,/try\s*\{/,'scroll capability checks must be guarded');
  assert.match(source,/scrollIntoView\?\./,'scrolling must tolerate missing scrollIntoView');
});
