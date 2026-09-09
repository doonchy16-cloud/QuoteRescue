import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = path.join(repoRoot, 'artifacts', 'v6');
let server;
let browser;
let baseURL;

const mime = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
});

function serveStatic(req, res) {
  try {
    const requestURL = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(requestURL.pathname === '/' ? '/index.html' : requestURL.pathname);
    const filePath = path.resolve(repoRoot, `.${pathname}`);
    if (filePath !== repoRoot && !filePath.startsWith(`${repoRoot}${path.sep}`)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(filePath).then((body) => {
      res.writeHead(200, { 'content-type': mime[path.extname(filePath)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    }).catch(() => res.writeHead(404).end('Not found'));
  } catch {
    res.writeHead(400).end('Bad request');
  }
}

async function openPage(viewport = { width: 1440, height: 1000 }, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  return { context, page, pageErrors };
}

async function loadExample(page, overrides = {}) {
  await page.locator('#load-example').click();
  const values = {
    contactPermission: 'allowed',
    smsPermission: 'allowed',
    ...overrides
  };
  for (const [name, value] of Object.entries(values)) {
    const locator = page.locator(`[name="${name}"]`);
    const tag = await locator.evaluate((node) => node.tagName.toLowerCase());
    if (tag === 'select') await locator.selectOption(String(value));
    else await locator.fill(String(value));
  }
}

async function generateCurrentPlan(page, overrides = {}) {
  await loadExample(page, overrides);
  await page.locator('.primary-button').click();
  await page.locator('#results').waitFor({ state: 'visible' });
}

async function gridTrackCount(page, selector) {
  return page.locator(selector).evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
}

before(async () => {
  await fs.mkdir(artifactDir, { recursive: true });
  server = http.createServer(serveStatic);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  baseURL = `http://127.0.0.1:${address.port}/`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test('V6 Chromium happy path: a valid quote renders a current usable recovery plan without page errors', async () => {
  const { context, page, pageErrors } = await openPage();
  try {
    await generateCurrentPlan(page);
    assert.equal(await page.locator('#current-plan-content').isVisible(), true);
    assert.equal(await page.locator('#blocked-state').isVisible(), false);
    assert.equal(await page.locator('#send-hold-state').isVisible(), false);
    assert.equal(await page.locator('[data-copy="full"]').isEnabled(), true);
    const score = Number(await page.locator('#score-value').textContent());
    assert.ok(Number.isInteger(score) && score >= 1 && score <= 100, `unexpected score ${score}`);
    assert.ok(await page.locator('#sequence .timeline-step').count() >= 1);
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: path.join(artifactDir, 'desktop-current.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('V6 keyboard attack: keyboard submit exposes validation and focuses the first invalid field', async () => {
  const { context, page } = await openPage();
  try {
    await page.locator('.primary-button').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#error-summary').isVisible(), true);
    assert.equal(await page.locator('[name="repName"]').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'repName');
  } finally {
    await context.close();
  }
});

test('V6 stale-state attack: ordinary edits visibly stale the plan and disable every export control', async () => {
  const { context, page } = await openPage();
  try {
    await generateCurrentPlan(page);
    await page.locator('[name="customerName"]').fill('Jordan');
    assert.equal(await page.locator('#stale-banner').isVisible(), true);
    assert.equal(await page.locator('[data-copy="full"]').isDisabled(), true);
    assert.equal(await page.locator('#download-plan').isDisabled(), true);
    const enabledCopies = await page.locator('[data-copy]:not(:disabled)').count();
    assert.equal(enabledCopies, 0);
  } finally {
    await context.close();
  }
});

test('V6 silent DOM mutation attack: export revalidation catches a value change that fired no input/change event', async () => {
  const { context, page } = await openPage();
  try {
    await generateCurrentPlan(page);
    await page.locator('[name="trade"]').evaluate((node) => { node.value = 'Roofing'; });
    assert.equal(await page.locator('#stale-banner').isVisible(), false, 'mutation intentionally bypasses normal input events');
    assert.equal(await page.locator('[data-copy="full"]').isEnabled(), true);
    await page.locator('[data-copy="full"]').click();
    assert.equal(await page.locator('#stale-banner').isVisible(), true);
    assert.equal(await page.locator('[data-copy="full"]').isDisabled(), true);
  } finally {
    await context.close();
  }
});

test('V6 do-not-contact attack: global opt-out renders a hard block with no usable export', async () => {
  const { context, page } = await openPage();
  try {
    await generateCurrentPlan(page, { contactPermission: 'do_not_contact', smsPermission: 'allowed' });
    assert.equal(await page.locator('#blocked-state').isVisible(), true);
    assert.equal(await page.locator('#current-plan-content').isVisible(), false);
    assert.equal(await page.locator('[data-copy="full"]').isDisabled(), true);
    assert.equal(await page.locator('#download-plan').isDisabled(), true);
  } finally {
    await context.close();
  }
});

test('V6 download attack: browser download contains the currently rendered plan and exact quote amount', async () => {
  const { context, page } = await openPage();
  try {
    await generateCurrentPlan(page, { quoteAmount: '8400.50' });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-plan').click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    assert.ok(downloadPath, 'browser did not produce a downloadable file');
    const text = await fs.readFile(downloadPath, 'utf8');
    assert.match(text, /QUOTE RESCUE PLAN/);
    assert.match(text, /Quote amount: \$8,400\.50\b/);
    assert.match(text, /Customer: Alex\b/);
  } finally {
    await context.close();
  }
});

test('V6 reduced-motion attack: real browser generation requests non-smooth scrolling when reduced motion is enabled', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      window.__quoteRescueScrollCalls = [];
      Element.prototype.scrollIntoView = function scrollIntoView(options) {
        window.__quoteRescueScrollCalls.push(options ?? null);
      };
    });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await generateCurrentPlan(page);
    const calls = await page.evaluate(() => window.__quoteRescueScrollCalls);
    assert.ok(calls.length >= 1);
    assert.equal(calls.at(-1)?.behavior, 'auto');
  } finally {
    await context.close();
  }
});

test('V6 mobile layout attack: channel-permission inputs collapse to one usable column at phone width', async () => {
  const { context, page } = await openPage({ width: 390, height: 844 });
  try {
    assert.equal(await gridTrackCount(page, '.permission-grid'), 1, 'three permission selects must not remain cramped into three phone-width columns');
    const width = await page.locator('[name="smsPermission"]').evaluate((node) => node.getBoundingClientRect().width);
    assert.ok(width >= 250, `SMS permission control is too narrow on mobile: ${width}px`);
  } finally {
    await context.close();
  }
});

test('V6 mobile layout attack: send-hold card collapses to one column at phone width', async () => {
  const { context, page } = await openPage({ width: 390, height: 844 });
  try {
    await generateCurrentPlan(page, {
      smsPermission: 'denied',
      phonePermission: 'unknown',
      emailPermission: 'unknown',
      primaryChannel: 'sms'
    });
    assert.equal(await page.locator('#send-hold-state').isVisible(), true);
    assert.equal(await gridTrackCount(page, '#send-hold-state'), 1, 'send-hold icon and copy should stack on mobile like the blocked state');
  } finally {
    await context.close();
  }
});

test('V6 mobile layout attack: resolved channel-policy cards collapse to one readable column and render without horizontal overflow', async () => {
  const { context, page, pageErrors } = await openPage({ width: 390, height: 844 });
  try {
    await generateCurrentPlan(page, { smsPermission: 'allowed' });
    assert.equal(await gridTrackCount(page, '#channel-policy-summary'), 1, 'resolved policy cards must not remain three cramped phone-width columns');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `page horizontally overflows viewport by ${overflow}px`);
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: path.join(artifactDir, 'mobile-current.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
