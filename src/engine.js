const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toneOpeners = {
  warm: ({ name }) => `Hi ${name} — I wanted to check in and make sure you had everything you needed from me.`,
  concise: ({ name }) => `Hi ${name} — quick follow-up on your estimate.`,
  consultative: ({ name }) => `Hi ${name} — I wanted to follow up on the estimate and see what would be most helpful as you decide next steps.`,
  premium: ({ name }) => `Hi ${name} — I’m following up to make sure the proposal is clear and aligned with what you want for the project.`,
  direct: ({ name }) => `Hi ${name} — checking in on the estimate.`
};

const ctaByStage = {
  estimate_sent: 'Would you like me to walk through anything in the estimate?',
  viewed_no_reply: 'Is there one question I can clear up for you?',
  objection: 'Would it help if I broke the options down around your main concern?',
  considering_competitor: 'Would a side-by-side scope check help you compare the proposals fairly?',
  delayed_timing: 'Would you like to map out a timing plan that works better for you?',
  budget_issue: 'Would it help to separate must-haves from nice-to-haves in the scope?',
  financing_issue: 'Would it help to review the project scope before you decide how you want to fund it?',
  lost_ghosted: 'Would you like me to keep this open, or close it out for now?'
};

const objectionCopy = {
  none: ({ name }) => `${name}, if anything in the estimate is unclear, I’m happy to walk through it with you so you can make a clean decision either way.`,
  budget: ({ name, job }) => `${name}, I understand the budget concern. We can review the ${job} scope together and separate the highest-priority work from items that may be optional, without changing anything unless you want to.`,
  price: ({ name }) => `${name}, I understand that price matters. The useful next step is to compare exactly what is included, excluded, and assumed so you can judge the proposals on the same scope.`,
  timing: ({ name }) => `${name}, timing can be just as important as price. We can map out when you actually want the work done and decide whether the current plan still fits.`,
  competitor: ({ name }) => `${name}, comparing another proposal makes sense. I can help you compare scope, exclusions, materials, and assumptions so you know whether the quotes are truly equivalent.`,
  trust: ({ name }) => `${name}, if there is anything you want verified before moving forward—scope, process, warranty, or what happens next—send it over and I’ll address it directly.`,
  financing: ({ name }) => `${name}, I understand the funding question. Before making a decision, it may help to confirm the exact project scope and priorities so you know what you are planning around.`,
  spouse_partner: ({ name }) => `${name}, totally reasonable to review it together. I can give you a short summary of the key scope, assumptions, and decisions so the conversation is easier.`,
  not_ready: ({ name }) => `${name}, no problem if the timing is not right yet. I can keep the project context organized and reconnect when it becomes relevant again.`
};

function normalized(input = {}) {
  return {
    customerName: String(input.customerName ?? '').trim(),
    trade: String(input.trade ?? '').trim(),
    jobDescription: String(input.jobDescription ?? '').trim(),
    quoteAmount: Number(input.quoteAmount) || 0,
    quoteAgeDays: Math.max(0, Number(input.quoteAgeDays) || 0),
    stage: input.stage || 'estimate_sent',
    objection: input.objection || 'none',
    lastContact: String(input.lastContact ?? '').trim(),
    tone: toneOpeners[input.tone] ? input.tone : 'consultative',
    primaryChannel: ['sms', 'email', 'phone'].includes(input.primaryChannel) ? input.primaryChannel : 'sms'
  };
}

export function validateInput(input = {}) {
  const value = normalized(input);
  const errors = {};
  if (!value.customerName) errors.customerName = 'Customer first name is required.';
  if (!value.trade) errors.trade = 'Trade or service is required.';
  if (!value.jobDescription) errors.jobDescription = 'Job description is required.';
  if (value.quoteAgeDays > 3650) errors.quoteAgeDays = 'Quote age looks unusually high.';
  if (value.quoteAmount < 0) errors.quoteAmount = 'Quote amount cannot be negative.';
  return { valid: Object.keys(errors).length === 0, errors, value };
}

export function scoreRecovery(input = {}) {
  const value = normalized(input);
  let score = 72;
  const factors = [];

  let ageDelta = 0;
  if (value.quoteAgeDays <= 3) ageDelta = 10;
  else if (value.quoteAgeDays <= 7) ageDelta = 5;
  else if (value.quoteAgeDays <= 14) ageDelta = 0;
  else if (value.quoteAgeDays <= 30) ageDelta = -10;
  else if (value.quoteAgeDays <= 60) ageDelta = -22;
  else ageDelta = -35;
  score += ageDelta;
  factors.push({ label: 'Quote age', delta: ageDelta, detail: `${value.quoteAgeDays} day${value.quoteAgeDays === 1 ? '' : 's'} old` });

  const stageDelta = {
    estimate_sent: 4,
    viewed_no_reply: 2,
    objection: -3,
    considering_competitor: -8,
    delayed_timing: -10,
    budget_issue: -10,
    financing_issue: -12,
    lost_ghosted: -18
  }[value.stage] ?? 0;
  score += stageDelta;
  factors.push({ label: 'Current stage', delta: stageDelta, detail: value.stage.replaceAll('_', ' ') });

  const objectionDelta = {
    none: 5,
    budget: -6,
    price: -6,
    timing: -4,
    competitor: -7,
    trust: -9,
    financing: -9,
    spouse_partner: -2,
    not_ready: -7
  }[value.objection] ?? 0;
  score += objectionDelta;
  factors.push({ label: 'Objection', delta: objectionDelta, detail: value.objection.replaceAll('_', ' ') });

  const contactDelta = value.lastContact ? 4 : -4;
  score += contactDelta;
  factors.push({ label: 'Contact context', delta: contactDelta, detail: value.lastContact ? 'Last contact supplied' : 'No last-contact context' });

  let valueDelta = 0;
  if (value.quoteAmount >= 10000) valueDelta = 3;
  else if (value.quoteAmount > 0 && value.quoteAmount < 1000) valueDelta = -2;
  score += valueDelta;
  factors.push({ label: 'Quote value', delta: valueDelta, detail: value.quoteAmount ? `$${Math.round(value.quoteAmount).toLocaleString()}` : 'Not supplied' });

  score = clamp(Math.round(score), 0, 100);
  const band = score >= 75 ? 'Hot recovery' : score >= 55 ? 'Strong follow-up opportunity' : score >= 35 ? 'Nurture / objection resolution' : 'Reactivation / close-the-loop';
  return { score, band, factors };
}

function diagnosisFor(value) {
  if (value.objection === 'budget' || value.stage === 'budget_issue') {
    return 'Budget friction is the main blocker. The best recovery path is to clarify priorities and scope before pushing for a yes/no decision.';
  }
  if (value.objection === 'competitor' || value.stage === 'considering_competitor') {
    return 'The customer appears to be comparing alternatives. Win clarity before trying to win the job: make scope, exclusions, and assumptions easy to compare.';
  }
  if (value.stage === 'delayed_timing' || value.objection === 'timing' || value.objection === 'not_ready') {
    return 'The opportunity looks timing-sensitive rather than fully lost. Preserve trust and create a clean reason to reconnect instead of increasing pressure.';
  }
  if (value.stage === 'lost_ghosted' || value.quoteAgeDays > 45) {
    return 'This is a reactivation case. Use a low-pressure close-the-loop message first, then give the customer an easy path to restart the conversation.';
  }
  if (value.stage === 'viewed_no_reply') {
    return 'The estimate has attention but no response. Reduce decision friction with one simple question and a specific offer to clarify the scope.';
  }
  return 'The quote is still recoverable. Use a concise, helpful follow-up that makes the next decision easy without adding pressure.';
}

function nextMoveFor(value) {
  if (value.objection === 'budget') return 'Ask which part of the scope matters most, then review priorities before discussing any revised option.';
  if (value.objection === 'competitor') return 'Offer a scope-comparison check rather than arguing price.';
  if (value.stage === 'lost_ghosted' || value.quoteAgeDays > 45) return 'Send a close-the-loop message now; if there is no reply, move the quote to reactivation rather than repeated chasing.';
  if (value.primaryChannel === 'phone') return 'Use the voicemail first, then send the short SMS so the customer has an easy reply path.';
  if (value.primaryChannel === 'email') return 'Send the email first, then use the SMS follow-up only if there is no response.';
  return 'Send the short SMS first and make the CTA a single easy-to-answer question.';
}

function buildSms(value) {
  const opener = toneOpeners[value.tone]({ name: value.customerName });
  const cta = ctaByStage[value.stage] ?? ctaByStage.estimate_sent;
  const jobRef = value.jobDescription ? ` for ${value.jobDescription}` : '';
  if (value.tone === 'direct') return `${opener} ${cta}`;
  return `${opener} I’m following up on the ${value.trade} estimate${jobRef}. ${cta}`;
}

function buildEmail(value) {
  const amount = value.quoteAmount ? ` ($${Math.round(value.quoteAmount).toLocaleString()})` : '';
  const subject = `Quick follow-up on your ${value.trade} estimate`;
  const body = `${toneOpeners[value.tone]({ name: value.customerName })}\n\nI’m following up on the estimate for ${value.jobDescription}${amount}. My goal is simply to make sure the scope is clear and that you have what you need to make the right decision.\n\n${ctaByStage[value.stage] ?? ctaByStage.estimate_sent}\n\nIf the timing has changed, that is completely fine too—just let me know where things stand and I’ll update my follow-up accordingly.`;
  return { subject, body };
}

function buildVoicemail(value) {
  return `Hi ${value.customerName}, this is [Your Name]. I’m following up on the ${value.trade} estimate for ${value.jobDescription}. No pressure—I just wanted to make sure you had everything you need and see whether there is one question I can clear up. You can call or text me back when convenient. Thanks.`;
}

function buildSequence(value, sms, email, objectionResponse) {
  const primary = value.primaryChannel === 'email' ? 'Email' : value.primaryChannel === 'phone' ? 'Voicemail + SMS' : 'SMS';
  return [
    { day: 'Day 0', action: primary, purpose: 'Reopen the conversation with one low-friction question.', copy: value.primaryChannel === 'email' ? email.body : value.primaryChannel === 'phone' ? buildVoicemail(value) : sms },
    { day: 'Day 2', action: 'Objection follow-up', purpose: 'Address the likely blocker without defending the quote.', copy: objectionResponse },
    { day: 'Day 4', action: 'Value / scope clarification', purpose: 'Make comparison and decision-making easier.', copy: `${value.customerName}, if it helps, I can summarize the key scope, assumptions, and options in a few bullets so you can review the estimate without digging through everything again.` },
    { day: 'Day 7', action: 'Close the loop', purpose: 'Give the customer an easy yes / later / no decision.', copy: `${value.customerName}, I don’t want to keep chasing you. Should I keep the ${value.trade} estimate open, reconnect later, or close it out for now? Any of those is completely fine.` },
    { day: '30+ days', action: 'Reactivation', purpose: 'Create a clean restart point for an older opportunity.', copy: `${value.customerName}, circling back on the ${value.trade} project for ${value.jobDescription}. Has anything changed since we last discussed it, or is the project still on hold?` }
  ];
}

export function generateRecoveryPlan(input = {}) {
  const validation = validateInput(input);
  if (!validation.valid) {
    const error = new Error('QuoteRescue input is incomplete.');
    error.validationErrors = validation.errors;
    throw error;
  }

  const value = validation.value;
  const scoring = scoreRecovery(value);
  const sms = buildSms(value);
  const email = buildEmail(value);
  const voicemail = buildVoicemail(value);
  const objectionResponse = (objectionCopy[value.objection] ?? objectionCopy.none)({
    name: value.customerName,
    job: value.jobDescription
  });
  const closeLoop = `${value.customerName}, I don’t want to over-follow-up. Should I keep this ${value.trade} estimate open, reconnect later, or close it out for now?`;
  const reactivation = `${value.customerName}, I’m revisiting the ${value.trade} estimate for ${value.jobDescription}. Has the project become relevant again, or is it still on hold?`;

  return {
    ...scoring,
    diagnosis: diagnosisFor(value),
    nextMove: nextMoveFor(value),
    sms,
    email,
    voicemail,
    objectionResponse,
    closeLoop,
    reactivation,
    sequence: buildSequence(value, sms, email, objectionResponse)
  };
}

export function formatPlanText(input = {}, plan) {
  const value = normalized(input);
  const safePlan = plan ?? generateRecoveryPlan(value);
  const amount = value.quoteAmount ? `$${Math.round(value.quoteAmount).toLocaleString()}` : 'Not supplied';
  const sequence = safePlan.sequence
    .map((step) => `${step.day} — ${step.action}\n${step.purpose}\n${step.copy}`)
    .join('\n\n');

  return `QUOTE RESCUE PLAN\n\nCustomer: ${value.customerName}\nTrade: ${value.trade}\nProject: ${value.jobDescription}\nQuote amount: ${amount}\nQuote age: ${value.quoteAgeDays} days\n\nRECOVERY SCORE\n${safePlan.score}/100 — ${safePlan.band}\n\nDIAGNOSIS\n${safePlan.diagnosis}\n\nNEXT MOVE\n${safePlan.nextMove}\n\n7-DAY RECOVERY SEQUENCE\n${sequence}\n\nSMS\n${safePlan.sms}\n\nEMAIL\nSubject: ${safePlan.email.subject}\n\n${safePlan.email.body}\n\nVOICEMAIL\n${safePlan.voicemail}\n\nOBJECTION RESPONSE\n${safePlan.objectionResponse}\n\nCLOSE THE LOOP\n${safePlan.closeLoop}\n\nREACTIVATION\n${safePlan.reactivation}\n`;
}
