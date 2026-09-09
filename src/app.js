import { validateInput, generateRecoveryPlan, formatPlanText } from './engine.js';

const form = document.querySelector('#rescue-form');
const emptyState = document.querySelector('#empty-state');
const results = document.querySelector('#results');
const toast = document.querySelector('#toast');
let currentInput = null;
let currentPlan = null;

const example = {
  customerName: 'Alex',
  trade: 'HVAC',
  jobDescription: 'replace the upstairs heat pump and air handler',
  quoteAmount: 8400,
  quoteAgeDays: 3,
  stage: 'viewed_no_reply',
  objection: 'none',
  lastContact: 'Sent estimate after inspection; customer viewed it yesterday.',
  tone: 'consultative',
  primaryChannel: 'sms'
};

function getInput() {
  return Object.fromEntries(new FormData(form).entries());
}

function setFormValues(values) {
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value;
  }
}

function clearErrors() {
  document.querySelectorAll('[data-error]').forEach((node) => { node.textContent = ''; });
}

function showErrors(errors) {
  clearErrors();
  for (const [field, message] of Object.entries(errors)) {
    const node = document.querySelector(`[data-error="${field}"]`);
    if (node) node.textContent = message;
  }
  const first = Object.keys(errors)[0];
  form.elements.namedItem(first)?.focus();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function factorChip(factor) {
  const sign = factor.delta > 0 ? '+' : '';
  const cls = factor.delta >= 0 ? 'positive' : 'negative';
  return `<span class="factor-chip"><b>${escapeHtml(factor.label)}</b> · ${escapeHtml(factor.detail)} · <span class="${cls}">${sign}${factor.delta}</span></span>`;
}

function sequenceStep(step, index) {
  return `<article class="timeline-step">
    <div class="timeline-day">${escapeHtml(step.day)}</div>
    <div>
      <h4>${escapeHtml(step.action)}</h4>
      <p>${escapeHtml(step.purpose)}</p>
      <div class="timeline-copy">${escapeHtml(step.copy)}</div>
    </div>
    <button class="copy-button" type="button" data-copy="sequence-${index}">Copy</button>
  </article>`;
}

function messageCard(title, key, copy, wide = false) {
  return `<article class="message-card${wide ? ' wide' : ''}">
    <div class="message-card-header"><h4>${escapeHtml(title)}</h4><button class="copy-button" type="button" data-copy="${escapeHtml(key)}">Copy</button></div>
    <div class="message-copy">${escapeHtml(copy)}</div>
  </article>`;
}

function renderPlan(input, plan) {
  document.querySelector('#result-title').textContent = `${input.customerName}'s ${input.trade} quote`;
  document.querySelector('#score-value').textContent = plan.score;
  document.querySelector('#score-band').textContent = plan.band;
  const scoreRing = document.querySelector('#score-ring');
  scoreRing.style.setProperty('--score-angle', `${plan.score * 3.6}deg`);
  scoreRing.setAttribute('aria-label', `Recovery score ${plan.score} out of 100: ${plan.band}`);
  document.querySelector('#factor-list').innerHTML = plan.factors.map(factorChip).join('');
  document.querySelector('#diagnosis').textContent = plan.diagnosis;
  document.querySelector('#next-move').textContent = plan.nextMove;
  document.querySelector('#sequence').innerHTML = plan.sequence.map(sequenceStep).join('');

  const email = `Subject: ${plan.email.subject}\n\n${plan.email.body}`;
  document.querySelector('#message-cards').innerHTML = [
    messageCard('SMS', 'sms', plan.sms),
    messageCard('Voicemail', 'voicemail', plan.voicemail),
    messageCard('Email', 'email', email, true),
    messageCard('Objection response', 'objection', plan.objectionResponse, true),
    messageCard('Close the loop', 'closeLoop', plan.closeLoop),
    messageCard('Reactivation', 'reactivation', plan.reactivation)
  ].join('');

  emptyState.hidden = true;
  results.hidden = false;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function copyForKey(key) {
  if (!currentPlan) return '';
  if (key === 'full') return formatPlanText(currentInput, currentPlan);
  if (key === 'sms') return currentPlan.sms;
  if (key === 'voicemail') return currentPlan.voicemail;
  if (key === 'email') return `Subject: ${currentPlan.email.subject}\n\n${currentPlan.email.body}`;
  if (key === 'objection') return currentPlan.objectionResponse;
  if (key === 'closeLoop') return currentPlan.closeLoop;
  if (key === 'reactivation') return currentPlan.reactivation;
  if (key.startsWith('sequence-')) return currentPlan.sequence[Number(key.split('-')[1])]?.copy ?? '';
  return '';
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  showToast('Copied');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 1400);
}

function downloadText() {
  if (!currentPlan) return;
  const text = formatPlanText(currentInput, currentPlan);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = `${currentInput.customerName}-${currentInput.trade}-quote-rescue`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.href = url;
  a.download = `${safeName || 'quote-rescue-plan'}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Plan downloaded');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = getInput();
  const validation = validateInput(input);
  if (!validation.valid) {
    showErrors(validation.errors);
    return;
  }
  clearErrors();
  currentInput = validation.value;
  currentPlan = generateRecoveryPlan(currentInput);
  renderPlan(currentInput, currentPlan);
});

document.querySelector('#load-example').addEventListener('click', () => {
  setFormValues(example);
  clearErrors();
  showToast('Example loaded');
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  copyText(copyForKey(button.dataset.copy));
});

document.querySelector('#download-plan').addEventListener('click', downloadText);
