import { validateInput, generateRecoveryPlan, formatPlanText } from './engine.js';

const form = document.querySelector('#rescue-form');
const emptyState = document.querySelector('#empty-state');
const results = document.querySelector('#results');
const staleBanner = document.querySelector('#stale-banner');
const invalidBanner = document.querySelector('#invalid-banner');
const blockedState = document.querySelector('#blocked-state');
const sendHoldState = document.querySelector('#send-hold-state');
const currentPlanContent = document.querySelector('#current-plan-content');
const toast = document.querySelector('#toast');
const errorSummary = document.querySelector('#error-summary');
let currentInput = null;
let currentPlan = null;
let uiStatus = 'empty';

const example = {
  repName:'Sam', businessName:'Peak HVAC', callbackPhone:'(555) 010-2020', customerName:'Alex', trade:'HVAC',
  jobDescription:'replace the upstairs heat pump and air handler', quoteAmount:'8400', quoteAgeDays:'3',
  stage:'viewed_no_reply', objection:'none', contactPermission:'allowed',
  smsPermission:'unknown', phonePermission:'unknown', emailPermission:'unknown',
  lastContactAgeDays:'2', lastContact:'Sent estimate after inspection; customer viewed it yesterday.', tone:'consultative', primaryChannel:'sms'
};

const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const getInput = () => Object.fromEntries(new FormData(form).entries());
const humanize = (value) => String(value ?? 'unknown').replaceAll('_',' ');

function setFormValues(values) {
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value;
  }
}

function setExportEnabled(enabled) {
  document.querySelectorAll('[data-copy], #download-plan').forEach((button) => { button.disabled = !enabled; });
}

function clearErrors() {
  errorSummary.hidden = true;
  errorSummary.innerHTML = '';
  form.querySelectorAll('[data-error]').forEach((node) => { node.textContent = ''; });
  form.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.setAttribute('aria-invalid','false'));
}

function showErrors(errors) {
  clearErrors();
  const items = [];
  for (const [field, message] of Object.entries(errors)) {
    const errorNode = document.querySelector(`[data-error="${field}"]`);
    const input = form.elements.namedItem(field);
    if (errorNode) errorNode.textContent = message;
    if (input) input.setAttribute('aria-invalid','true');
    items.push(`<li>${escapeHtml(message)}</li>`);
  }
  errorSummary.innerHTML = `<strong>Fix these fields before generating a plan:</strong><ul>${items.join('')}</ul>`;
  errorSummary.hidden = false;
  form.elements.namedItem(Object.keys(errors)[0])?.focus();
}

function markPlanStale() {
  if (!currentPlan || uiStatus === 'stale') return;
  uiStatus = 'stale';
  staleBanner.hidden = false;
  invalidBanner.hidden = true;
  results.classList.add('is-stale');
  setExportEnabled(false);
}

function markPlanInvalid() {
  if (!currentPlan) return;
  uiStatus = 'invalid';
  staleBanner.hidden = true;
  invalidBanner.hidden = false;
  results.classList.add('is-stale');
  setExportEnabled(false);
}

function resetPlanState(status) {
  uiStatus = status;
  staleBanner.hidden = true;
  invalidBanner.hidden = true;
  results.classList.remove('is-stale');
}

function factorChip(factor) {
  const sign = factor.delta > 0 ? '+' : '';
  return `<span class="factor-chip"><b>${escapeHtml(factor.label)}</b> · ${escapeHtml(factor.detail)} · <span class="${factor.delta >= 0 ? 'positive' : 'negative'}">${sign}${factor.delta}</span></span>`;
}

function stepCopy(step) {
  const parts = [];
  if (step.subject) parts.push(`Subject: ${step.subject}`);
  if (step.body) parts.push(step.body);
  if (step.voicemail) parts.push(`Voicemail: ${step.voicemail}`);
  if (step.sms) parts.push(`SMS: ${step.sms}`);
  return parts.join('\n\n');
}

function sequenceStep(step, index) {
  const content = [];
  if (step.subject) content.push(`<div class="copy-block"><span class="copy-label">Subject</span>${escapeHtml(step.subject)}</div>`);
  if (step.body) content.push(`<div class="copy-block">${escapeHtml(step.body)}</div>`);
  if (step.voicemail) content.push(`<div class="copy-block"><span class="copy-label">Voicemail</span>${escapeHtml(step.voicemail)}</div>`);
  if (step.sms) content.push(`<div class="copy-block"><span class="copy-label">SMS</span>${escapeHtml(step.sms)}</div>`);
  return `<article class="timeline-step"><div class="timeline-day">${escapeHtml(step.day)}</div><div><h4>${escapeHtml(step.action)}</h4><p>${escapeHtml(step.purpose)}</p>${content.join('')}</div><button class="copy-button" type="button" data-copy="step-${index}">Copy step</button></article>`;
}

function messageCard(title, key, copy, wide = false) {
  return `<article class="message-card${wide ? ' wide' : ''}"><div class="message-card-header"><h4>${escapeHtml(title)}</h4><button class="copy-button" type="button" data-copy="${escapeHtml(key)}">Copy</button></div><div class="message-copy">${escapeHtml(copy)}</div></article>`;
}

function renderEvidence(plan) {
  document.querySelector('#evidence-list').innerHTML = (plan.context.evidence.length ? plan.context.evidence : ['No deterministic context cue matched.']).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  document.querySelector('#conflict-list').innerHTML = (plan.context.conflicts.length ? plan.context.conflicts : ['No conflicts detected.']).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderChannelPolicy(plan) {
  const channelPolicy = plan.context.channelPolicy?.channels ?? {};
  document.querySelector('#policy-sms').textContent = humanize(channelPolicy.sms);
  document.querySelector('#policy-phone').textContent = humanize(channelPolicy.phone);
  document.querySelector('#policy-email').textContent = humanize(channelPolicy.email);
  document.querySelector('#effective-channel').textContent = plan.campaign.effectiveChannel ? humanize(plan.campaign.effectiveChannel) : 'none';
  document.querySelector('#send-state').textContent = humanize(plan.campaign.sendState);
}

function showResultsShell(input) {
  document.querySelector('#result-title').textContent = `${input.customerName}'s ${input.trade} quote`;
  emptyState.hidden = true;
  results.hidden = false;
}

function renderBlocked(input, plan) {
  resetPlanState('blocked');
  showResultsShell(input);
  document.querySelector('#blocked-reason').textContent = plan.blockedReason;
  document.querySelector('#blocked-next').textContent = plan.nextMove;
  blockedState.hidden = false;
  sendHoldState.hidden = true;
  currentPlanContent.hidden = true;
  setExportEnabled(false);
  scrollToResults();
}

function renderSendHold(input, plan) {
  resetPlanState('send-hold');
  showResultsShell(input);
  document.querySelector('#send-hold-reason').textContent = plan.campaign.sendReason || 'The preferred channel cannot be used safely with the current permission evidence.';
  document.querySelector('#send-hold-next').textContent = plan.nextMove;
  blockedState.hidden = true;
  sendHoldState.hidden = false;
  currentPlanContent.hidden = true;
  setExportEnabled(false);
  scrollToResults();
}

function cadenceTitle(plan) {
  if (plan.context.recoveryMode === 'close_loop') return 'Single close-loop touch';
  if (plan.context.recoveryMode === 'nurture') return 'Low-pressure reconnect cadence';
  if (plan.context.recoveryMode === 'reactivation') return 'No active chase for reactivation';
  return '7-day recovery cadence';
}

function renderPlan(input, plan) {
  resetPlanState('current');
  showResultsShell(input);
  blockedState.hidden = true;
  sendHoldState.hidden = true;
  currentPlanContent.hidden = false;
  renderChannelPolicy(plan);

  document.querySelector('#score-value').textContent = plan.score;
  document.querySelector('#score-band').textContent = plan.band;
  const ring = document.querySelector('#score-ring');
  ring.style.setProperty('--score-angle', `${plan.score * 3.6}deg`);
  ring.setAttribute('aria-label', `Recovery priority ${plan.score} out of 100: ${plan.band}`);
  document.querySelector('#factor-list').innerHTML = plan.factors.map(factorChip).join('');
  document.querySelector('#context-summary').innerHTML = `<span><b>Mode</b>${escapeHtml(humanize(plan.context.recoveryMode))}</span><span><b>Blocker</b>${escapeHtml(humanize(plan.context.primaryBlocker))}</span><span><b>Engagement</b>${escapeHtml(plan.context.engagementState)}</span><span><b>Confidence</b>${escapeHtml(plan.context.confidence)}</span>`;
  document.querySelector('#diagnosis').textContent = plan.diagnosis;
  document.querySelector('#next-move').textContent = plan.nextMove;
  renderEvidence(plan);

  document.querySelector('#cadence-title').textContent = cadenceTitle(plan);
  const sequence = document.querySelector('#sequence');
  sequence.innerHTML = plan.campaign.sevenDaySteps.length
    ? plan.campaign.sevenDaySteps.map(sequenceStep).join('')
    : '<div class="empty-cadence"><strong>No active multi-touch cadence.</strong><span>Use the separate reactivation playbook instead.</span></div>';

  const reactivationPlan = plan.campaign.reactivationPlan;
  const reactivationCard = document.querySelector('#reactivation-card');
  if (reactivationPlan && plan.campaign.reactivation) {
    reactivationCard.innerHTML = `<div class="message-card-header"><div><span class="channel-tag">${escapeHtml(reactivationPlan.channel)}</span><h4>Reactivation touch · ${escapeHtml(reactivationPlan.day)}</h4></div><button class="copy-button" type="button" data-copy="reactivation">Copy</button></div><div class="message-copy">${escapeHtml(plan.campaign.reactivation)}</div>`;
    document.querySelector('#reactivation-section').hidden = false;
  } else {
    reactivationCard.innerHTML = '';
    document.querySelector('#reactivation-section').hidden = true;
  }

  const emailCopy = plan.campaign.email.subject || plan.campaign.email.body ? `Subject: ${plan.campaign.email.subject}\n\n${plan.campaign.email.body}` : '';
  const cards = [
    { title:'Opening SMS', key:'sms', copy:plan.campaign.sms },
    { title:'Voicemail', key:'voicemail', copy:plan.campaign.voicemail },
    { title:'Email', key:'email', copy:emailCopy, wide:true },
    { title:'Blocker response', key:'objection', copy:plan.campaign.objectionResponse, wide:true },
    { title:'Close the loop', key:'closeLoop', copy:plan.campaign.closeLoop }
  ].filter((item) => item.copy && item.copy.trim());
  document.querySelector('#message-cards').innerHTML = cards.length
    ? cards.map((item) => messageCard(item.title,item.key,item.copy,item.wide)).join('')
    : '<div class="empty-cadence"><strong>No extra channel-safe toolkit items.</strong><span>Use the campaign payload above.</span></div>';

  setExportEnabled(true);
  scrollToResults();
}

function scrollToResults() {
  let reduceMotion = false;
  try {
    reduceMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    reduceMotion = false;
  }
  try {
    results.scrollIntoView?.({ behavior:reduceMotion ? 'auto' : 'smooth', block:'start' });
  } catch {
    // Scrolling is progressive enhancement; rendering must remain usable without it.
  }
}

function ensureCurrentPlanFresh() {
  if (!currentPlan || !currentInput || uiStatus !== 'current') return false;
  const validation = validateInput(getInput());
  if (!validation.valid || JSON.stringify(validation.value) !== JSON.stringify(currentInput)) {
    markPlanStale();
    return false;
  }
  return true;
}

function copyForKey(key) {
  if (!currentPlan || uiStatus !== 'current') return '';
  if (!ensureCurrentPlanFresh()) return '';
  if (key === 'full') return formatPlanText(currentInput, currentPlan);
  if (key === 'sms') return currentPlan.campaign.sms;
  if (key === 'voicemail') return currentPlan.campaign.voicemail;
  if (key === 'email') return currentPlan.campaign.email.subject || currentPlan.campaign.email.body ? `Subject: ${currentPlan.campaign.email.subject}\n\n${currentPlan.campaign.email.body}` : '';
  if (key === 'objection') return currentPlan.campaign.objectionResponse;
  if (key === 'closeLoop') return currentPlan.campaign.closeLoop;
  if (key === 'reactivation') return currentPlan.campaign.reactivation;
  if (key.startsWith('step-')) return stepCopy(currentPlan.campaign.sevenDaySteps[Number(key.split('-')[1])] ?? {});
  return '';
}

async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied');
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed'; area.style.opacity = '0';
    let copied = false;
    try {
      document.body.appendChild(area);
      area.select();
      copied = Boolean(document.execCommand?.('copy'));
    } catch {
      copied = false;
    } finally {
      area.remove();
    }
    showToast(copied ? 'Copied' : 'Copy failed');
    return copied;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1500);
}

function downloadText() {
  if (!currentPlan || uiStatus !== 'current') return;
  if (!ensureCurrentPlanFresh()) return;
  let url = null;
  let a = null;
  try {
    const blob = new Blob([formatPlanText(currentInput, currentPlan)], { type:'text/plain;charset=utf-8' });
    url = URL.createObjectURL(blob);
    a = document.createElement('a');
    const safeName = `${currentInput.customerName}-${currentInput.trade}-quote-rescue`.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    a.href = url; a.download = `${safeName || 'quote-rescue-plan'}.txt`;
    document.body.appendChild(a);
    a.click();
    showToast('Plan downloaded');
  } catch {
    showToast('Download failed');
  } finally {
    if (a) a.remove();
    if (url) URL.revokeObjectURL(url);
  }
}

form.addEventListener('input', markPlanStale);
form.addEventListener('change', markPlanStale);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const raw = getInput();
  const validation = validateInput(raw);
  if (!validation.valid) { showErrors(validation.errors); markPlanInvalid(); return; }
  clearErrors();
  currentInput = validation.value;
  currentPlan = generateRecoveryPlan(currentInput);
  if (currentPlan.blocked) renderBlocked(currentInput,currentPlan);
  else if (currentPlan.sendBlocked) renderSendHold(currentInput,currentPlan);
  else renderPlan(currentInput,currentPlan);
});

window.addEventListener('pageshow', (event) => { if (event.persisted) markPlanStale(); });
document.querySelector('#load-example').addEventListener('click', () => { setFormValues(example); clearErrors(); markPlanStale(); showToast('Example loaded'); });
document.addEventListener('click', (event) => { const button = event.target instanceof Element ? event.target.closest('[data-copy]') : null; if (button && !button.disabled) copyText(copyForKey(button.dataset.copy)); });
document.querySelector('#download-plan').addEventListener('click', downloadText);
