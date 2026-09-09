import { sanitizeSingleLine, shortProjectReference } from './domain.js';
import { chooseEffectiveChannel } from './contact-policy.js';

const TONE = Object.freeze({
  warm:{greeting:(n)=>`Hi ${n} — hope you’re doing well.`,ask:'Would it be helpful if I made the next step easier?',close:'No pressure at all—just let me know what works best for you.'},
  concise:{greeting:(n)=>`Hi ${n} — quick follow-up.`,ask:'Want me to clarify the one thing holding this up?',close:'A quick yes, later, or close it out is perfect.'},
  consultative:{greeting:(n)=>`Hi ${n} — I wanted to follow up and make the decision easier.`,ask:'What would be most useful for you to clarify before deciding?',close:'I’m happy to help you get to a clean decision either way.'},
  premium:{greeting:(n)=>`Hi ${n} — I’m following up to make sure the proposal is fully aligned with your project priorities.`,ask:'Would you like a concise review of the scope, assumptions, and next decision?',close:'I’m happy to keep this organized and easy to evaluate.'},
  direct:{greeting:(n)=>`Hi ${n} — checking in on the estimate.`,ask:'What is the main blocker right now?',close:'Should I keep it open, circle back later, or close it out?'}
});

const BLOCKER_GUIDANCE = Object.freeze({
  none:'clarify any remaining question before asking for a decision',budget:'separate must-haves from optional scope without changing the offer unless the customer asks',price:'compare scope, inclusions, exclusions, and assumptions on equal terms',timing:'align the project with the customer’s actual schedule',competitor:'compare scope and assumptions without attacking the competitor',trust:'answer process, scope, warranty, and expectation questions directly',financing:'confirm project priorities and funding constraints before pushing a decision',spouse_partner:'make the proposal easy to review together',not_ready:'reduce pressure and create a specific future reconnect point',unknown:'ask one low-friction question to identify the blocker'
});

const identity=(input)=>`${input.repName}${input.businessName?` with ${input.businessName}`:''}`;
const projectRef=(input)=>shortProjectReference(input.jobDescription,64)||input.trade;
const amountRef=(input)=>input.quoteAmount?` ($${Math.round(input.quoteAmount).toLocaleString()})`:'';
function boundedSms(text){const clean=sanitizeSingleLine(text);return clean.length<=320?clean:`${clean.slice(0,317).trimEnd()}…`;}
function boundedSubject(text){const clean=sanitizeSingleLine(text);return clean.length<=90?clean:`${clean.slice(0,89)}…`;}
function subjectFor(input){return boundedSubject(`Quick follow-up on your ${sanitizeSingleLine(input.trade)||'project'} estimate`);}

function blockerQuestion(context,tone){const t=TONE[tone];switch(context.primaryBlocker){case'budget':return tone==='direct'?'Which part of the scope is creating the budget issue?':'Would it help to separate the must-haves from the optional scope?';case'price':return tone==='direct'?'Want to compare what is included line by line?':'Would a quick scope comparison make the price easier to evaluate?';case'timing':return tone==='direct'?'What timing would actually work?':'Would it help to map the project around the timing that works for you?';case'competitor':return tone==='direct'?'Want a quick scope comparison?':'Would a side-by-side scope and assumptions check help you compare fairly?';case'trust':return tone==='direct'?'What specifically needs to be verified?':'What would you like verified before you feel comfortable deciding?';case'financing':return tone==='direct'?'Is funding the main blocker?':'Would it help to confirm the exact scope and priorities before deciding how to fund it?';case'spouse_partner':return tone==='direct'?'Want a short summary you can review together?':'Would a short scope-and-decisions summary make it easier to review together?';case'not_ready':return tone==='direct'?'When should I reconnect?':'What would be a better time for me to reconnect?';default:return t.ask;}}
function buildSms(input,context,phase='open'){const t=TONE[input.tone],ref=projectRef(input);if(phase==='open')return boundedSms(`${t.greeting(input.customerName)} This is ${identity(input)}. I’m following up on the ${input.trade} estimate for ${ref}. ${blockerQuestion(context,input.tone)}`);if(phase==='blocker')return boundedSms(`${input.customerName}, ${blockerQuestion(context,input.tone)} ${t.close}`);if(phase==='clarify')return boundedSms(`${input.customerName}, I can summarize the key scope, assumptions, and decisions for ${ref} in a few bullets so you can review it quickly. ${t.ask}`);return boundedSms(`${input.customerName}, ${t.close}`);}
function buildEmail(input,context){const t=TONE[input.tone],ref=projectRef(input);return{subject:subjectFor(input),body:`${t.greeting(input.customerName)}\n\nThis is ${identity(input)}. I’m following up on the estimate for ${ref}${amountRef(input)}. My goal is to make the next decision clear, not to add pressure.\n\n${blockerQuestion(context,input.tone)}\n\n${t.close}`};}
function buildVoicemail(input,context){const ref=projectRef(input);const callback=input.callbackPhone?` You can call me at ${input.callbackPhone}.`:' You can call me back when convenient.';return `Hi ${input.customerName}, this is ${identity(input)}. I’m following up on the ${input.trade} estimate for ${ref}. ${blockerQuestion(context,input.tone)}${callback} Thanks.`;}
function obstructionCopy(input,context){const t=TONE[input.tone],ref=projectRef(input),guidance=BLOCKER_GUIDANCE[context.primaryBlocker]??BLOCKER_GUIDANCE.unknown;const lead=input.tone==='direct'?`${input.customerName}, here’s the useful next step:`:`${input.customerName}, the most useful next step is to`;return boundedSms(`${lead} ${guidance} for ${ref}. ${blockerQuestion(context,input.tone)} ${t.close}`);}
function closeLoop(input){if(input.tone==='warm')return boundedSms(`${input.customerName}, I don’t want to over-follow-up. Would you prefer that I keep this open, reconnect later, or close it out for now? Any of those is completely fine.`);if(input.tone==='premium')return boundedSms(`${input.customerName}, to keep this organized, would you like me to keep the estimate active, schedule a later follow-up, or close it for now?`);if(input.tone==='consultative')return boundedSms(`${input.customerName}, I want to respect your timing. Should I keep this open, reconnect later, or close it out for now?`);if(input.tone==='concise')return boundedSms(`${input.customerName}, should I keep this open, follow up later, or close it out?`);return boundedSms(`${input.customerName}, keep it open, follow up later, or close it out?`);}
function reactivationSms(input){const ref=projectRef(input),t=TONE[input.tone];return boundedSms(`${input.customerName}, I’m revisiting the ${input.trade} estimate for ${ref}. Has the project become relevant again, or is it still on hold? ${t.close}`);}
function reactivationEmail(input){const t=TONE[input.tone],ref=projectRef(input);return{subject:boundedSubject(`Revisiting your ${sanitizeSingleLine(input.trade)||'project'} estimate`),body:`${t.greeting(input.customerName)}\n\nThis is ${identity(input)}. I’m revisiting the estimate for ${ref}. Has the project become relevant again, or is it still on hold?\n\n${t.close}`};}
function reactivationVoicemail(input){const ref=projectRef(input);const callback=input.callbackPhone?` You can call me at ${input.callbackPhone}.`:' You can call me back when convenient.';return `Hi ${input.customerName}, this is ${identity(input)}. I’m revisiting the ${input.trade} estimate for ${ref}. If the project is relevant again, I’m happy to help; if not, no problem.${callback} Thanks.`;}

function toolkit(input,context){const policy=context.channelPolicy?.channels??{};return{
  sms:policy.sms==='denied'?'':buildSms(input,context,'open'),
  email:policy.email==='denied'?{subject:'',body:''}:buildEmail(input,context),
  voicemail:policy.phone==='denied'?'':buildVoicemail(input,context),
  objectionResponse:policy.sms==='denied'?'':obstructionCopy(input,context),
  closeLoop:policy.sms==='denied'?'':closeLoop(input)
};}

function buildReactivationPlan(input,channel){
  const day=input.lastContactAgeDays===0?'Day 1+':'When relevant';
  if(channel==='email'){const email=reactivationEmail(input);return{channel:'email',day,subject:email.subject,body:email.body};}
  if(channel==='phone')return{channel:'phone',day,voicemail:reactivationVoicemail(input)};
  return{channel:'sms',day,sms:reactivationSms(input)};
}
function reactivationText(plan){if(!plan)return'';if(plan.channel==='email')return`Subject: ${plan.subject}\n\n${plan.body}`;if(plan.channel==='phone')return plan.voicemail;return plan.sms;}

function stepForChannel(day,action,purpose,channel,kit,input,context){
  if(channel==='email')return{day,action:'Email',purpose,subject:kit.email.subject,body:kit.email.body};
  if(channel==='phone'){const step={day,action:'Voicemail',purpose,voicemail:kit.voicemail};if(kit.sms){step.action='Voicemail + SMS';step.sms=kit.sms;}return step;}
  return{day,action:'SMS',purpose,sms:kit.sms||buildSms(input,context,'open')};
}

export function buildDiagnosis(input,context){
  if(context.recoveryMode==='blocked')return{diagnosis:'Outreach is blocked because current contact-permission evidence says this customer/number should not be contacted.',nextMove:'Do not send any QuoteRescue message. Resolve permission outside QuoteRescue before future outreach.'};
  if(context.recoveryMode==='close_loop')return{diagnosis:'This opportunity is no longer a normal active follow-up. Repeated chasing would conflict with the current recovery state.',nextMove:'Send at most one respectful close-loop message, then stop repeated follow-up.'};
  if(context.recoveryMode==='reactivation')return{diagnosis:'This is a reactivation case rather than an active follow-up.',nextMove:'Use one reactivation message when appropriate; do not run an active Day 0/2/4/7 chase.'};
  const blocker=context.primaryBlocker;
  if(blocker==='budget')return{diagnosis:'Budget friction is the primary blocker. Clarify priorities and scope before discussing any revised option.',nextMove:'Ask which scope elements matter most, then separate must-haves from optional work without changing the offer unless the customer asks.'};
  if(blocker==='financing')return{diagnosis:'Funding or financing is the primary blocker.',nextMove:'Confirm the must-have scope and decision priorities, then let the customer choose how they want to handle funding.'};
  if(blocker==='competitor')return{diagnosis:context.engagementState==='lost'?'The customer appears to have selected another provider.':'The customer is comparing alternatives.',nextMove:context.engagementState==='lost'?'Close the opportunity respectfully.':'Offer a side-by-side scope and assumptions review.'};
  if(blocker==='timing'||blocker==='not_ready')return{diagnosis:'Timing—not necessarily value—is the main friction.',nextMove:'Create a specific, low-pressure reconnect point that matches the customer’s timing.'};
  if(blocker==='trust')return{diagnosis:'Trust or uncertainty is the main blocker.',nextMove:'Ask what needs to be verified and answer only with facts you can support.'};
  if(blocker==='spouse_partner')return{diagnosis:'The decision involves another stakeholder.',nextMove:'Provide a concise scope, assumptions, and decision summary.'};
  if(context.engagementState==='positive')return{diagnosis:'The customer has shown positive intent.',nextMove:'Ask one specific next-step question rather than restarting the entire sales conversation.'};
  return{diagnosis:'The quote remains recoverable, but the main blocker is not yet clear.',nextMove:'Use one concise question to identify the blocker before adding more follow-up.'};
}

export function buildCampaign(input,context){
  const empty={sevenDaySteps:[],reactivation:'',reactivationPlan:null,objectionResponse:'',closeLoop:'',sms:'',email:{subject:'',body:''},voicemail:'',effectiveChannel:null,sendState:'blocked',sendReason:''};
  if(context.recoveryMode==='blocked'||context.contactState==='do_not_contact')return empty;

  const selection=chooseEffectiveChannel(input.primaryChannel,context.channelPolicy);
  const kit=toolkit(input,context);
  if(!selection.channel)return{...empty,sendState:selection.sendState,sendReason:selection.reason};

  const channel=selection.channel;
  const sameDay=input.lastContactAgeDays===0;
  const firstDay=sameDay?'Day 1+':'Day 0';
  const purpose='Use the safest next touch for the resolved recovery state.';
  const reactivationPlan=buildReactivationPlan(input,channel);
  let sevenDaySteps=[];

  if(context.recoveryMode==='close_loop'){
    const closeCopy=kit.closeLoop||closeLoop(input);
    if(channel==='email')sevenDaySteps=[{day:firstDay,action:'Close-loop email',purpose,subject:kit.email.subject,body:`${kit.email.body}\n\n${closeCopy}`}];
    else if(channel==='phone')sevenDaySteps=[{day:firstDay,action:kit.sms?'Close-loop voicemail + SMS':'Close-loop voicemail',purpose,voicemail:kit.voicemail,...(kit.sms?{sms:closeCopy}:{})}];
    else sevenDaySteps=[{day:firstDay,action:'Close-loop SMS',purpose,sms:closeCopy}];
  } else if(context.recoveryMode==='reactivation'){
    sevenDaySteps=[];
  } else if(context.recoveryMode==='nurture'){
    const first=stepForChannel(firstDay,'Reconnect',purpose,channel,kit,input,context);
    const later=channel==='email'?{day:'Day 7+',action:'Low-pressure email',purpose:'Offer a clean future reconnect point.',subject:kit.email.subject,body:kit.email.body}:channel==='phone'?{day:'Day 7+',action:'Low-pressure voicemail',purpose:'Offer a clean future reconnect point.',voicemail:kit.voicemail}:{day:'Day 7+',action:'Low-pressure SMS',purpose:'Offer a clean future reconnect point.',sms:buildSms(input,context,'close')};
    sevenDaySteps=[first,later];
  } else {
    const days=sameDay?['Day 1+','Day 3','Day 5','Day 7']:['Day 0','Day 2','Day 4','Day 7'];
    const first=stepForChannel(days[0],'Reopen',purpose,channel,kit,input,context);
    const second=channel==='sms'?{day:days[1],action:'Resolve blocker',purpose:'Address the resolved primary blocker.',sms:buildSms(input,context,'blocker')}:stepForChannel(days[1],'Resolve blocker','Address the resolved primary blocker.',channel,kit,input,context);
    const third=channel==='sms'?{day:days[2],action:'Clarify value / scope',purpose:'Make the decision easier to evaluate.',sms:buildSms(input,context,'clarify')}:stepForChannel(days[2],'Clarify value / scope','Make the decision easier to evaluate.',channel,kit,input,context);
    const fourth=channel==='sms'?{day:days[3],action:'Close the loop',purpose:'Give the customer an easy yes / later / no decision.',sms:closeLoop(input)}:stepForChannel(days[3],'Close the loop','Give the customer an easy yes / later / no decision.',channel,kit,input,context);
    sevenDaySteps=[first,second,third,fourth];
  }

  return{sevenDaySteps,reactivation:reactivationText(reactivationPlan),reactivationPlan,objectionResponse:kit.objectionResponse,closeLoop:kit.closeLoop,sms:kit.sms,email:kit.email,voicemail:kit.voicemail,effectiveChannel:channel,sendState:selection.sendState,sendReason:selection.reason};
}
