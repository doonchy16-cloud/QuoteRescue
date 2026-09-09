import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const artifacts=path.join(root,'artifacts','v6');
let server,browser,baseURL;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};

function serve(req,res){
  try{
    const u=new URL(req.url??'/','http://127.0.0.1');
    const pathname=decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname);
    const file=path.resolve(root,`.${pathname}`);
    if(file!==root&&!file.startsWith(`${root}${path.sep}`)){res.writeHead(403).end('Forbidden');return;}
    fs.readFile(file).then(body=>{res.writeHead(200,{'content-type':mime[path.extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(body);}).catch(()=>res.writeHead(404).end('Not found'));
  }catch{res.writeHead(400).end('Bad request');}
}

async function open(viewport={width:1440,height:1000},options={}){
  const context=await browser.newContext({viewport,...options});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(baseURL,{waitUntil:'networkidle'});
  return{context,page,pageErrors};
}

async function loadExample(page,overrides={}){
  await page.locator('#load-example').click();
  for(const [name,value] of Object.entries({contactPermission:'allowed',smsPermission:'allowed',...overrides})){
    const field=page.locator(`[name="${name}"]`);
    const tag=await field.evaluate(node=>node.tagName.toLowerCase());
    if(tag==='select')await field.selectOption(String(value));else await field.fill(String(value));
  }
}

async function generate(page,overrides={}){
  await loadExample(page,overrides);
  await page.locator('.primary-button').click();
  await page.locator('#results').waitFor({state:'visible'});
}

const tracks=(page,selector)=>page.locator(selector).evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length);

before(async()=>{
  await fs.mkdir(artifacts,{recursive:true});
  server=http.createServer(serve);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  baseURL=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});

test('V6 Chromium happy path: valid quote renders a current usable plan without page errors',async()=>{
  const{context,page,pageErrors}=await open();
  try{
    await generate(page);
    assert.equal(await page.locator('#current-plan-content').isVisible(),true);
    assert.equal(await page.locator('#blocked-state').isVisible(),false);
    assert.equal(await page.locator('#send-hold-state').isVisible(),false);
    assert.equal(await page.locator('[data-copy="full"]').isEnabled(),true);
    const score=Number(await page.locator('#score-value').textContent());
    assert.ok(Number.isInteger(score)&&score>=1&&score<=100);
    assert.ok(await page.locator('#sequence .timeline-step').count()>=1);
    assert.deepEqual(pageErrors,[]);
    await page.screenshot({path:path.join(artifacts,'desktop-current.png'),fullPage:true});
  }finally{await context.close();}
});

test('V6 keyboard attack: keyboard submit focuses the first invalid field in visual form order',async()=>{
  const{context,page}=await open();
  try{
    await page.locator('.primary-button').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#error-summary').isVisible(),true);
    assert.equal(await page.locator('[name="repName"]').getAttribute('aria-invalid'),'true');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('name')),'repName');
  }finally{await context.close();}
});

test('V6 stale-state attack: ordinary edits stale the plan and disable every export control',async()=>{
  const{context,page}=await open();
  try{
    await generate(page);
    await page.locator('[name="customerName"]').fill('Jordan');
    assert.equal(await page.locator('#stale-banner').isVisible(),true);
    assert.equal(await page.locator('[data-copy="full"]').isDisabled(),true);
    assert.equal(await page.locator('#download-plan').isDisabled(),true);
    assert.equal(await page.locator('[data-copy]:not(:disabled)').count(),0);
  }finally{await context.close();}
});

test('V6 silent DOM mutation attack: export revalidation catches mutation without input/change events',async()=>{
  const{context,page}=await open();
  try{
    await generate(page);
    await page.locator('[name="trade"]').evaluate(node=>{node.value='Roofing';});
    assert.equal(await page.locator('#stale-banner').isVisible(),false);
    assert.equal(await page.locator('[data-copy="full"]').isEnabled(),true);
    await page.locator('[data-copy="full"]').click();
    assert.equal(await page.locator('#stale-banner').isVisible(),true);
    assert.equal(await page.locator('[data-copy="full"]').isDisabled(),true);
  }finally{await context.close();}
});

test('V6 do-not-contact attack: global opt-out renders hard block with no usable export',async()=>{
  const{context,page}=await open();
  try{
    await generate(page,{contactPermission:'do_not_contact',smsPermission:'allowed'});
    assert.equal(await page.locator('#blocked-state').isVisible(),true);
    assert.equal(await page.locator('#current-plan-content').isVisible(),false);
    assert.equal(await page.locator('[data-copy="full"]').isDisabled(),true);
    assert.equal(await page.locator('#download-plan').isDisabled(),true);
  }finally{await context.close();}
});

test('V6 download attack: browser download contains current plan and exact quote amount',async()=>{
  const{context,page}=await open();
  try{
    await generate(page,{quoteAmount:'8400.50'});
    const waiting=page.waitForEvent('download');
    await page.locator('#download-plan').click();
    const download=await waiting;
    const p=await download.path();
    assert.ok(p);
    const text=await fs.readFile(p,'utf8');
    assert.match(text,/QUOTE RESCUE PLAN/);
    assert.match(text,/Quote amount: \$8,400\.50\b/);
    assert.match(text,/Customer: Alex\b/);
  }finally{await context.close();}
});

test('V6 reduced-motion attack: browser generation requests non-smooth scrolling',async()=>{
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const page=await context.newPage();
  try{
    await page.addInitScript(()=>{window.__qrScroll=[];Element.prototype.scrollIntoView=function(options){window.__qrScroll.push(options??null);};});
    await page.goto(baseURL,{waitUntil:'networkidle'});
    await generate(page);
    const calls=await page.evaluate(()=>window.__qrScroll);
    assert.ok(calls.length>=1);
    assert.equal(calls.at(-1)?.behavior,'auto');
  }finally{await context.close();}
});

test('V6 mobile attack: channel-permission inputs collapse to one usable phone-width column',async()=>{
  const{context,page}=await open({width:390,height:844});
  try{
    assert.equal(await tracks(page,'.permission-grid'),1);
    const width=await page.locator('[name="smsPermission"]').evaluate(node=>node.getBoundingClientRect().width);
    assert.ok(width>=250,`SMS permission control too narrow: ${width}px`);
  }finally{await context.close();}
});

test('V6 mobile attack: send-hold card collapses to one column at phone width',async()=>{
  const{context,page}=await open({width:390,height:844});
  try{
    await generate(page,{smsPermission:'denied',phonePermission:'unknown',emailPermission:'unknown',primaryChannel:'sms'});
    assert.equal(await page.locator('#send-hold-state').isVisible(),true);
    assert.equal(await tracks(page,'#send-hold-state'),1);
  }finally{await context.close();}
});

test('V6 mobile attack: resolved channel-policy cards remain readable and never overflow horizontally',async()=>{
  const{context,page,pageErrors}=await open({width:390,height:844});
  try{
    await generate(page,{smsPermission:'allowed'});
    await page.screenshot({path:path.join(artifacts,'mobile-current.png'),fullPage:true});
    assert.ok(await tracks(page,'#channel-policy-summary')<=2);
    const minWidth=await page.locator('#channel-policy-summary > div').evaluateAll(nodes=>Math.min(...nodes.map(node=>node.getBoundingClientRect().width)));
    assert.ok(minWidth>=120,`policy card too narrow: ${minWidth}px`);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=1,`horizontal overflow: ${overflow}px`);
    assert.deepEqual(pageErrors,[]);
  }finally{await context.close();}
});
