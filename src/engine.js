import { parseInput } from './domain.js';
import { deriveRecoveryContext } from './context.js';
import { scorePriority } from './scoring.js';
import { buildCampaign, buildDiagnosis } from './messages.js';

export function validateInput(raw = {}) { return parseInput(raw); }

function requireValid(raw) {
  const validation = parseInput(raw);
  if (!validation.valid) {
    const error = new Error('QuoteRescue input is invalid.');
    error.validationErrors = validation.errors;
    throw error;
  }
  return validation.value;
}

export function scoreRecovery(raw = {}) {
  const input = requireValid(raw);
  const context = deriveRecoveryContext(input);
  return scorePriority(input, context);
}

function nextMoveFor(input, context, campaign, diagnosisNextMove) {
  if (context.recoveryMode === 'blocked') return diagnosisNextMove;
  if (campaign.sendState === 'blocked_channel') return `Do not send yet. ${campaign.sendReason} Verify contact permission outside QuoteRescue before choosing another channel.`;
  let modeMove = diagnosisNextMove;
  if (context.recoveryMode === 'close_loop') modeMove = 'Send at most one respectful close-loop touch, then stop repeated follow-up.';
  if (context.recoveryMode === 'reactivation') modeMove = 'Use one reactivation touch when the opportunity is relevant; do not run an active Day 0/2/4/7 cadence.';
  if (context.recoveryMode === 'nurture') modeMove = 'Use the low-pressure reconnect cadence and preserve the customer’s timing.';
  if (campaign.sendState === 'switched_channel') modeMove = `${campaign.sendReason} ${modeMove}`;
  if (input.lastContactAgeDays === 0) return `Do not send another follow-up today. Start on the next appropriate business day. ${modeMove}`;
  return modeMove;
}

export function generateRecoveryPlan(raw = {}) {
  const input = requireValid(raw);
  const context = deriveRecoveryContext(input);
  const priority = scorePriority(input, context);
  const diagnosisResult = buildDiagnosis(input, context);
  const campaign = buildCampaign(input, context);
  const diagnosis = diagnosisResult.diagnosis;
  const nextMove = nextMoveFor(input, context, campaign, diagnosisResult.nextMove);
  const blocked = context.recoveryMode === 'blocked' || context.contactState === 'do_not_contact';
  const blockedReason = blocked ? diagnosis : '';
  const sendBlocked = campaign.sendState === 'blocked_channel';
  return {
    input, context, priority, campaign, blocked, blockedReason, sendBlocked,
    diagnosis, nextMove,
    score:priority.score, band:priority.band, factors:priority.factors,
    sequence:campaign.sevenDaySteps,
    sms:campaign.sms, email:campaign.email, voicemail:campaign.voicemail,
    objectionResponse:campaign.objectionResponse, closeLoop:campaign.closeLoop, reactivation:campaign.reactivation
  };
}

function renderStep(step) {
  const parts = [`${step.day} — ${step.action}`, step.purpose];
  if (step.subject) parts.push(`Subject: ${step.subject}`);
  if (step.body) parts.push(step.body);
  if (step.voicemail) parts.push(`Voicemail: ${step.voicemail}`);
  if (step.sms) parts.push(`SMS: ${step.sms}`);
  return parts.join('\n');
}

export function formatPlanText(raw = {}, suppliedPlan = null) {
  const plan = suppliedPlan ?? generateRecoveryPlan(raw);
  const input = plan.input ?? requireValid(raw);
  const amount = input.quoteAmount ? `$${Math.round(input.quoteAmount).toLocaleString()}` : 'Not supplied';
  const evidence = plan.context.evidence.length ? plan.context.evidence.map((item) => `- ${item}`).join('\n') : '- No deterministic context cue matched.';
  const conflicts = plan.context.conflicts.length ? `\n\nCONTEXT CONFLICTS\n${plan.context.conflicts.map((item) => `- ${item}`).join('\n')}` : '';
  const channelPolicy = plan.context.channelPolicy?.channels ?? {};
  const channelLine = `Channel policy: SMS ${channelPolicy.sms ?? 'unknown'} / Phone ${channelPolicy.phone ?? 'unknown'} / Email ${channelPolicy.email ?? 'unknown'}`;
  const header = `QUOTE RESCUE PLAN\n\nCustomer: ${input.customerName}\nRepresentative: ${input.repName}${input.businessName ? ` — ${input.businessName}` : ''}\nTrade: ${input.trade}\nProject: ${input.jobDescription}\nQuote amount: ${amount}\nQuote age: ${input.quoteAgeDays} days\nContact state: ${plan.context.contactState}\n${channelLine}\nRecovery mode: ${plan.context.recoveryMode}\nPrimary blocker: ${plan.context.primaryBlocker}`;
  if (plan.blocked) return `${header}\n\nOUTREACH BLOCKED — DO NOT CONTACT\n${plan.blockedReason}\n\nNEXT MOVE\n${plan.nextMove}\n\nEVIDENCE\n${evidence}${conflicts}\n`;
  if (plan.sendBlocked) return `${header}\n\nSEND HOLD — CHANNEL PERMISSION\n${plan.campaign.sendReason}\n\nNEXT MOVE\n${plan.nextMove}\n\nEVIDENCE\n${evidence}${conflicts}\n`;
  const sequence = plan.campaign.sevenDaySteps.map(renderStep).join('\n\n');
  const sequenceTitle = plan.context.recoveryMode === 'reactivation'
    ? '7-DAY RECOVERY SEQUENCE\nNot applicable — reactivation is a separate one-touch path.'
    : `7-DAY RECOVERY SEQUENCE\n${sequence}`;
  return `${header}\n\nRECOVERY PRIORITY\n${plan.priority.score}/100 — ${plan.priority.band}\n\nEVIDENCE\n${evidence}${conflicts}\n\nDIAGNOSIS\n${plan.diagnosis}\n\nNEXT MOVE\n${plan.nextMove}\n\n${sequenceTitle}\n\nREACTIVATION\n${plan.campaign.reactivation}\n\nSMS\n${plan.campaign.sms}\n\nEMAIL\nSubject: ${plan.campaign.email.subject}\n\n${plan.campaign.email.body}\n\nVOICEMAIL\n${plan.campaign.voicemail}\n\nOBJECTION RESPONSE\n${plan.campaign.objectionResponse}\n\nCLOSE THE LOOP\n${plan.campaign.closeLoop}\n`;
}
