import { sanitizeSingleLine, shortProjectReference } from './domain.js';

const TONE = Object.freeze({
  warm: { greeting:(n)=>`Hi ${n} — hope you’re doing well.`, ask:'Would it be helpful if I made the next step easier?', close:'No pressure at all—just let me know what works best for you.' },
  concise: { greeting:(n)=>`Hi ${n} — quick follow-up.`, ask:'Want me to clarify the one thing holding this up?', close:'A quick yes, later, or close it out is perfect.' },
  consultative: { greeting:(n)=>`Hi ${n} — I wanted to follow up and make the decision easier.`, ask:'What would be most useful for you to clarify before deciding?', close:'I’m happy to help you get to a clean decision either way.' },
  premium: { greeting:(n)=>`Hi ${n} — I’m following up to make sure the proposal is fully aligned with your project priorities.`, ask:'Would you like a concise review of the scope, assumptions, and next decision?', close:'I’m happy to keep this organized and easy to evaluate.' },
  direct: { greeting:(n)=>`Hi ${n} — checking in on the estimate.`, ask:'What is the main blocker right now?', close:'Should I keep it open, circle back later, or close it out?' }
});

const BLOCKER_GUIDANCE = Object.freeze({
  none:'clarify any remaining question before asking for a decision',
  budget:'separate must-haves from optional scope without changing the offer unless the customer asks',
  price:'compare scope, inclusions, exclusions, and assumptions on equal terms',
  timing:'align the project with the customer’s actual schedule',
  competitor:'compare scope and assumptions without attacking the competitor',
  trust:'answer process, scope, warranty, and expectation questions directly',
  financing:'confirm project priorities and funding constraints before pushing a decision',
  spouse_partner:'make the proposal easy to review together',
  not_ready:'reduce pressure and create a specific future reconnect point',
  unknown:'ask one low-friction question to identify the blocker'
});

function identity(input) { const business = input.businessName ? ` with ${input.businessName}` : ''; return `${input.repName}${business}`; }
function projectRef(input) { return shortProjectReference(input.jobDescription, 64) || input.trade; }
function amountRef(input) { return input.quoteAmount ? ` ($${Math.round(input.quoteAmount).toLocaleString()})` : ''; }
function boundedSms(text) { const clean = sanitizeSingleLine(text, 1000); return clean.length <= 320 ? clean : `${clean.slice(0, 317).trimEnd()}…`; }
function subjectFor(input) { const trade = sanitizeSingleLine(input.trade, 60) || 'project'; const subject = `Quick follow-up on your ${trade} estimate`; return subject.length <= 90 ? subject : `${subject.slice(0, 89)}…`; }

function blockerQuestion(context, tone) {
  const t = TONE[tone];
  switch (context.primaryBlocker) {
    case 'budget': return tone === 'direct' ? 'Which part of the scope is creating the budget issue?' : 'Would it help to separate the must-haves from the optional scope?';
    case 'price': return tone === 'direct' ? 'Want to compare what is included line by line?' : 'Would a quick scope comparison make the price easier to evaluate?';
    case 'timing': return tone === 'direct' ? 'What timing would actually work?' : 'Would it help to map the project around the timing that works for you?';
    case 'competitor': return tone === 'direct' ? 'Want a quick scope comparison?' : 'Would a side-by-side scope and assumptions check help you compare fairly?';
    case 'trust': return tone === 'direct' ? 'What specifically needs to be verified?' : 'What would you like verified before you feel comfortable deciding?';
    case 'financing': return tone === 'direct' ? 'Is funding the main blocker?' : 'Would it help to confirm the exact scope and priorities before deciding how to fund it?';
    case 'spouse_partner': return tone === 'direct' ? 'Want a short summary you can review together?' : 'Would a short scope-and-decisions summary make it easier to review together?';
    case 'not_ready': return tone === 'direct' ? 'When should I reconnect?' : 'What would be a better time for me to reconnect?';
    default: return t.ask;
  }
}

function buildSms(input, context, phase = 'open') {
  const t = TONE[input.tone]; const ref = projectRef(input);
  if (phase === 'open') return boundedSms(`${t.greeting(input.customerName)} This is ${identity(input)}. I’m following up on the ${input.trade} estimate for ${ref}. ${blockerQuestion(context, input.tone)}`);
  if (phase === 'blocker') return boundedSms(`${input.customerName}, ${blockerQuestion(context, input.tone)} ${t.close}`);
  if (phase === 'clarify') return boundedSms(`${input.customerName}, I can summarize the key scope, assumptions, and decisions for ${ref} in a few bullets so you can review it quickly. ${t.ask}`);
  return boundedSms(`${input.customerName}, ${t.close}`);
}

function buildEmail(input, context) {
  const t = TONE[input.tone]; const ref = projectRef(input);
  return { subject:subjectFor(input), body:`${t.greeting(input.customerName)}\n\nThis is ${identity(input)}. I’m following up on the estimate for ${ref}${amountRef(input)}. My goal is to make the next decision clear, not to add pressure.\n\n${blockerQuestion(context, input.tone)}\n\n${t.close}` };
}

function buildVoicemail(input, context) {
  const ref = projectRef(input); const callback = input.callbackPhone ? ` You can call or text me at ${input.callbackPhone}.` : ' You can call or text me back when convenient.';
  return `Hi ${input.customerName}, this is ${identity(input)}. I’m following up on the ${input.trade} estimate for ${ref}. ${blockerQuestion(context, input.tone)}${callback} Thanks.`;
}

function obstructionCopy(input, context) {
  const t = TONE[input.tone]; const ref = projectRef(input); const guidance = BLOCKER_GUIDANCE[context.primaryBlocker] ?? BLOCKER_GUIDANCE.unknown;
  const lead = input.tone === 'direct' ? `${input.customerName}, here’s the useful next step:` : `${input.customerName}, the most useful next step is to`;
  return boundedSms(`${lead} ${guidance} for ${ref}. ${blockerQuestion(context, input.tone)} ${t.close}`);
}

function closeLoop(input) {
  if (input.tone === 'warm') return boundedSms(`${input.customerName}, I don’t want to over-follow-up. Would you prefer that I keep this open, reconnect later, or close it out for now? Any of those is completely fine.`);
  if (input.tone === 'premium') return boundedSms(`${input.customerName}, to keep this organized, would you like me to keep the estimate active, schedule a later follow-up, or close it for now?`);
  if (input.tone === 'consultative') return boundedSms(`${input.customerName}, I want to respect your timing. Should I keep this open, reconnect later, or close it out for now?`);
  if (input.tone === 'concise') return boundedSms(`${input.customerName}, should I keep this open, follow up later, or close it out?`);
  return boundedSms(`${input.customerName}, keep it open, follow up later, or close it out?`);
}

function reactivation(input) { const ref = projectRef(input); const t = TONE[input.tone]; return boundedSms(`${input.customerName}, I’m revisiting the ${input.trade} estimate for ${ref}. Has the project become relevant again, or is it still on hold? ${t.close}`); }

export function buildDiagnosis(input, context) {
  if (context.recoveryMode === 'blocked') return { diagnosis:'Outreach is blocked because the available contact-permission evidence indicates the customer should not be contacted.', nextMove:'Do not send any QuoteRescue message. Resolve permission outside QuoteRescue before any future outreach.' };
  const blocker = context.primaryBlocker;
  if (blocker === 'budget') return { diagnosis:'Budget friction is the primary blocker. The recovery path is to clarify priorities and scope before discussing any revised option.', nextMove:'Ask which scope elements matter most, then separate must-haves from optional work without inventing a discount.' };
  if (blocker === 'financing') return { diagnosis:'Funding or financing is the primary blocker. Pushing the quote before the customer understands the exact project priorities is likely to add friction.', nextMove:'Confirm the must-have scope and decision priorities, then let the customer choose how they want to handle funding.' };
  if (blocker === 'competitor') return { diagnosis:context.engagementState === 'lost' ? 'The customer appears to have selected another provider. Treat this as a close-loop or future-reactivation case, not an active chase.' : 'The customer is comparing alternatives. Clarity on scope and assumptions matters more than defending price.', nextMove:context.engagementState === 'lost' ? 'Close the opportunity respectfully and preserve a clean future reactivation path.' : 'Offer a side-by-side scope and assumptions review.' };
  if (blocker === 'timing' || blocker === 'not_ready') return { diagnosis:'Timing—not necessarily value—is the main friction. More pressure is unlikely to help.', nextMove:'Create a specific, low-pressure reconnect point that matches the customer’s timing.' };
  if (blocker === 'trust') return { diagnosis:'Trust or uncertainty is the main blocker. The customer needs verifiable clarity before another sales push.', nextMove:'Ask what needs to be verified and answer only with facts you can support.' };
  if (blocker === 'spouse_partner') return { diagnosis:'The decision involves another stakeholder. Make the proposal easier to review together instead of repeating the pitch.', nextMove:'Provide a concise scope, assumptions, and decision summary.' };
  if (context.recoveryMode === 'close_loop' || context.recoveryMode === 'reactivation') return { diagnosis:'This is no longer a normal active follow-up. The right move is to close the loop or create a clean reactivation point.', nextMove:'Use one respectful close-loop message, then stop repeated chasing.' };
  if (context.engagementState === 'positive') return { diagnosis:'The customer has shown positive intent. Reduce friction and make the next decision concrete.', nextMove:'Ask one specific next-step question rather than restarting the entire sales conversation.' };
  return { diagnosis:'The quote remains recoverable, but the main blocker is not yet clear.', nextMove:'Use one concise question to identify the blocker before adding more follow-up.' };
}

export function buildCampaign(input, context) {
  if (context.recoveryMode === 'blocked' || context.contactState === 'do_not_contact') return { sevenDaySteps:[], reactivation:'', objectionResponse:'', closeLoop:'', sms:'', email:{subject:'',body:''}, voicemail:'' };
  const sms = buildSms(input, context, 'open'); const email = buildEmail(input, context); const voicemail = buildVoicemail(input, context);
  let day0;
  if (input.primaryChannel === 'phone') day0 = { day:'Day 0', action:'Voicemail + SMS', purpose:'Reopen the conversation and leave an easy reply path.', voicemail, sms };
  else if (input.primaryChannel === 'email') day0 = { day:'Day 0', action:'Email', purpose:'Reopen the conversation with complete context.', subject:email.subject, body:email.body };
  else day0 = { day:'Day 0', action:'SMS', purpose:'Reopen the conversation with one low-friction question.', sms };
  const sevenDaySteps = [day0,{ day:'Day 2', action:'Resolve blocker', purpose:'Address the most likely blocker without defending the quote.', sms:buildSms(input, context, 'blocker') },{ day:'Day 4', action:'Clarify value / scope', purpose:'Make the decision easier to evaluate.', sms:buildSms(input, context, 'clarify') },{ day:'Day 7', action:'Close the loop', purpose:'Give the customer an easy yes / later / no decision.', sms:closeLoop(input) }];
  return { sevenDaySteps, reactivation:reactivation(input), objectionResponse:obstructionCopy(input, context), closeLoop:closeLoop(input), sms, email, voicemail };
}
