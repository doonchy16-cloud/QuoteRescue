import { parseInput } from './domain.js';
import { deriveRecoveryContext } from './context.js';
import { scorePriority } from './scoring.js';
import { buildCampaign, buildDiagnosis } from './messages.js';

export function validateInput(raw = {}) { return parseInput(raw); }
function requireValid(raw) { const validation = parseInput(raw); if (!validation.valid) { const error = new Error('QuoteRescue input is invalid.'); error.validationErrors = validation.errors; throw error; } return validation.value; }
export function scoreRecovery(raw = {}) { const input = requireValid(raw); const context = deriveRecoveryContext(input); return scorePriority(input, context); }
export function generateRecoveryPlan(raw = {}) {
  const input = requireValid(raw); const context = deriveRecoveryContext(input); const priority = scorePriority(input, context); const { diagnosis, nextMove } = buildDiagnosis(input, context); const campaign = buildCampaign(input, context); const blocked = context.recoveryMode === 'blocked' || context.contactState === 'do_not_contact'; const blockedReason = blocked ? diagnosis : '';
  return { input, context, priority, campaign, blocked, blockedReason, diagnosis, nextMove, score:priority.score, band:priority.band, factors:priority.factors, sequence:campaign.sevenDaySteps, sms:campaign.sms, email:campaign.email, voicemail:campaign.voicemail, objectionResponse:campaign.objectionResponse, closeLoop:campaign.closeLoop, reactivation:campaign.reactivation };
}
function renderStep(step) { const parts = [`${step.day} — ${step.action}`, step.purpose]; if (step.subject) parts.push(`Subject: ${step.subject}`); if (step.body) parts.push(step.body); if (step.voicemail) parts.push(`Voicemail: ${step.voicemail}`); if (step.sms) parts.push(`SMS: ${step.sms}`); return parts.join('\n'); }
export function formatPlanText(raw = {}, suppliedPlan = null) {
  const plan = suppliedPlan ?? generateRecoveryPlan(raw); const input = plan.input ?? requireValid(raw); const amount = input.quoteAmount ? `$${Math.round(input.quoteAmount).toLocaleString()}` : 'Not supplied'; const evidence = plan.context.evidence.length ? plan.context.evidence.map((item) => `- ${item}`).join('\n') : '- No deterministic context cue matched.'; const conflicts = plan.context.conflicts.length ? `\n\nCONTEXT CONFLICTS\n${plan.context.conflicts.map((item) => `- ${item}`).join('\n')}` : '';
  const header = `QUOTE RESCUE PLAN\n\nCustomer: ${input.customerName}\nRepresentative: ${input.repName}${input.businessName ? ` — ${input.businessName}` : ''}\nTrade: ${input.trade}\nProject: ${input.jobDescription}\nQuote amount: ${amount}\nQuote age: ${input.quoteAgeDays} days\nContact state: ${plan.context.contactState}\nRecovery mode: ${plan.context.recoveryMode}\nPrimary blocker: ${plan.context.primaryBlocker}`;
  if (plan.blocked) return `${header}\n\nOUTREACH BLOCKED — DO NOT CONTACT\n${plan.blockedReason}\n\nNEXT MOVE\n${plan.nextMove}\n\nEVIDENCE\n${evidence}${conflicts}\n`;
  const sequence = plan.campaign.sevenDaySteps.map(renderStep).join('\n\n');
  return `${header}\n\nRECOVERY PRIORITY\n${plan.priority.score}/100 — ${plan.priority.band}\n\nEVIDENCE\n${evidence}${conflicts}\n\nDIAGNOSIS\n${plan.diagnosis}\n\nNEXT MOVE\n${plan.nextMove}\n\n7-DAY RECOVERY SEQUENCE\n${sequence}\n\nREACTIVATION\n${plan.campaign.reactivation}\n\nSMS\n${plan.campaign.sms}\n\nEMAIL\nSubject: ${plan.campaign.email.subject}\n\n${plan.campaign.email.body}\n\nVOICEMAIL\n${plan.campaign.voicemail}\n\nOBJECTION RESPONSE\n${plan.campaign.objectionResponse}\n\nCLOSE THE LOOP\n${plan.campaign.closeLoop}\n`;
}
