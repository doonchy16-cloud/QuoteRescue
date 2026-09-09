import { CHANNELS } from './domain.js';

const POLICY_FORMAT_CONTROLS = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const CHANNEL_SCOPE = '(?:phone|call|text|sms|email)';
const CHANNEL_SCOPE_SUFFIX = `\\s+(?:me\\s+)?(?:by|via)\\s+${CHANNEL_SCOPE}\\b`;
const REPORTED_PREFIX = /^(?:(?:customer|client|they|he|she)\s+(?:said|wrote|replied)\s*[:;,—–-]?\s*|(?:message|reply|response)\s+(?:received|said|read|was)\s*[:;,—–-]?\s*|(?:message|reply|response)\s*[:;,—–-]\s*)/i;
const OUTER_QUOTE = /^["“”'‘’](.*)["“”'‘’]$/s;
const CONTACT_TARGET = '(?:me|us|them|him|her|this\\s+(?:number|person|customer|client)|the\\s+(?:customer|client))';
const GLOBAL_CONTACT_END = `(?=$|[.!?,;:'"“”‘’]|\\s+(?:again|anymore|further)\\b)`;

function normalizePolicyText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(POLICY_FORMAT_CONTROLS, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function policyCandidates(text) {
  const candidates = new Set();
  const queue = [text];
  while (queue.length) {
    const candidate = queue.shift()?.trim() ?? '';
    if (!candidate || candidates.has(candidate)) continue;
    candidates.add(candidate);
    const unquoted = candidate.match(OUTER_QUOTE)?.[1]?.trim();
    if (unquoted && !candidates.has(unquoted)) queue.push(unquoted);
    const reported = candidate.replace(REPORTED_PREFIX, '').trim();
    if (reported && reported !== candidate && !candidates.has(reported)) queue.push(reported);
  }
  return [...candidates];
}

const BROAD_STOP = [
  /^\s*stop[.!?\s]*$/i,
  /^\s*please\s+stop[.!?\s]*$/i,
  /\b(?:customer|client|they|he|she)\s+(?:said|wrote|replied)\s*[:;,—–-]?\s*["“”'‘’]?stop["“”'‘’]?[.!?\s]*$/i,
  new RegExp(`\\bstop\\s+(?:reaching\\s+out|contacting|messaging)\\b(?!${CHANNEL_SCOPE_SUFFIX})`, 'i'),
  new RegExp(`\\bdo\\s+not\\s+(?:reach\\s+out|message)\\b(?!${CHANNEL_SCOPE_SUFFIX})`, 'i'),
  new RegExp(`\\bdon['’]?t\\s+(?:reach\\s+out|message)\\b(?!${CHANNEL_SCOPE_SUFFIX})`, 'i'),
  new RegExp(`\\bnever\\s+(?:reach\\s+out|message)\\b(?!${CHANNEL_SCOPE_SUFFIX})`, 'i'),
  new RegExp(`\\bdo\\s+not\\s+contact\\b${GLOBAL_CONTACT_END}`, 'i'),
  new RegExp(`\\bdon['’]?t\\s+contact\\b${GLOBAL_CONTACT_END}`, 'i'),
  new RegExp(`\\bnever\\s+contact\\b${GLOBAL_CONTACT_END}`, 'i'),
  new RegExp(`\\bdo\\s+not\\s+contact\\s+${CONTACT_TARGET}\\b(?!${CHANNEL_SCOPE_SUFFIX})`, 'i'),
  new RegExp(`\\bdon['’]?t\\s+contact\\s+${CONTACT_TARGET}\\b(?!${CHANNEL_SCOPE_SUFFIX})`, 'i'),
  new RegExp(`\\bnever\\s+contact\\s+${CONTACT_TARGET}\\b(?!${CHANNEL_SCOPE_SUFFIX})`, 'i'),
  /\bno\s+more\s+(?:messages|contact)\b/i,
  /\bleave\s+me\s+alone\b/i,
  /\b(?:i|we)\s+(?:no\s+longer\s+(?:wish|want)\s+to|do\s+not\s+(?:wish|want)\s+to)\s+be\s+(?:contacted|messaged|called|emailed|texted)\b/i,
  /\b(?:take|remove)\s+(?:me|my\s+(?:number|phone))\s+(?:off|from)\s+(?:your\s+)?(?:contact\s+)?(?:list|marketing)\b/i,
  /\bremove\s+my\s+(?:number|phone)\b/i,
  /\bdelete\s+my\s+(?:number|phone)\b/i,
  /\bopt\s+(?:me\s+)?out\b/i,
  /\brevoke\s+consent\b/i,
  /\bcease\s+(?:all\s+)?(?:contact|communications?)\b/i,
  /\bunsubscribe\b/i,
  /\bnot\s+\w+\s*;?\s*do\s+not\s+contact\s+this\s+number\b/i
];

const WRONG_RECIPIENT = [
  /^\s*(?:sorry[,!]?\s*)?(?:this\s+is\s+)?(?:the\s+)?wrong\s+number(?:\s*[—-]\s*(?:remove\s+me|stop(?:\s+contacting\s+me)?|do\s+not\s+contact.*))?[.!?\s]*$/i,
  /^\s*(?:sorry[,!]?\s*)?you(?:'ve|\s+have)?\s+(?:got\s+)?the\s+wrong\s+number[.!?\s]*$/i,
  /^\s*not\s+[^.!?]+[.!?]\s*wrong\s+number[.!?\s]*$/i,
  /^\s*this\s+number\s+(?:does\s+not|doesn't)\s+belong\s+to\s+[^.!?]+[.!?\s]*$/i,
  /\bi\s+am\s+not\s+[^.;]+\s*;?\s*do\s+not\s+contact\s+this\s+number\b/i,
  /\b(?:you\s+(?:have|got)\s+(?:the\s+)?wrong\s+person|wrong\s+person)\b/i,
  /\byou\s+(?:reached|have\s+reached)\s+someone\s+else\b/i,
  /\bthis\s+number\s+(?:was|has\s+been)\s+reassigned\b/i,
  /\bi\s+am\s+not\s+the\s+customer\s+you\s+are\s+looking\s+for\b/i
];

const DENY = Object.freeze({
  sms:[
    /\bdo\s+not\s+text(?:\s+me)?\b/i,/\bdon['’]?t\s+text(?:\s+me)?\b/i,/\bnever\s+text(?:\s+me)?\b/i,
    /\bno\s+(?:more\s+)?texts?(?:\s+please)?\b/i,/\bquit\s+texting(?:\s+me)?\b/i,/\bstop\s+texting(?:\s+me)?\b/i,
    /\b(?:do\s+not|don['’]?t|never)\s+contact(?:\s+me)?\s+(?:by|via)\s+(?:text|sms)\b/i
  ],
  phone:[
    /\bdo\s+not\s+call(?:\s+me)?\b/i,/\bdon['’]?t\s+call(?:\s+me)?\b/i,/\bnever\s+call(?:\s+me)?\b/i,
    /\bno\s+(?:more\s+)?calls?(?:\s+please)?\b/i,/\bquit\s+calling(?:\s+me)?\b/i,/\bstop\s+calling(?:\s+me)?\b/i,
    /\b(?:take|remove)\s+me\s+(?:off|from)\s+(?:the\s+)?call\s+list\b/i,
    /\b(?:do\s+not|don['’]?t|never)\s+contact(?:\s+me)?\s+(?:by|via)\s+(?:phone|call)\b/i
  ],
  email:[
    /\bdo\s+not\s+email(?:\s+me)?\b/i,/\bdon['’]?t\s+email(?:\s+me)?\b/i,/\bnever\s+email(?:\s+me)?\b/i,
    /\bno\s+(?:more\s+)?emails?(?:\s+please)?\b/i,/\bstop\s+emailing(?:\s+me)?\b/i,
    /\b(?:do\s+not|don['’]?t|never)\s+contact(?:\s+me)?\s+(?:by|via)\s+email\b/i
  ]
});

const ALLOW = Object.freeze({
  sms:[/\btext\s+is\s+fine\b/i,/\b(?:please\s+)?text(?:\s+me)?\s+instead\b/i,/\btext\s+only\b/i,/\btexts?\s+(?:are|is)\s+ok(?:ay)?\b/i],
  phone:[/\bcall\s+is\s+fine\b/i,/\bphone\s+is\s+fine\b/i,/\bcall(?:\s+me)?\s+instead\b/i,/\bphone\s+only\b/i,/\bcall\s+only\b/i,/\bcalls?\s+(?:are|is)\s+ok(?:ay)?\b/i],
  email:[/\bemail\s+is\s+fine\b/i,/\bemail(?:\s+me)?\s+instead\b/i,/\bemail\s+only\b/i,/\bemails?\s+(?:are|is)\s+ok(?:ay)?\b/i]
});

const ONLY = Object.freeze({
  sms:/\btext\s+only\b/i,
  phone:/\b(?:phone|call)\s+only\b/i,
  email:/\bemail\s+only\b/i
});

const anyMatch=(patterns,text)=>patterns.some((pattern)=>pattern.test(text));
const escapeRegExp=(value)=>String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function matchesWrongRecipient(candidates, customerName='') {
  if (candidates.some((candidate)=>anyMatch(WRONG_RECIPIENT,candidate))) return true;
  const name=normalizePolicyText(customerName);
  if (!name) return false;
  const escaped=escapeRegExp(name);
  const dynamic=[
    new RegExp(`^\\s*(?:this\\s+is|i\\s+am|i['’]?m)\\s+not\\s+${escaped}[.!?\\s]*$`,'i'),
    new RegExp(`^\\s*not\\s+${escaped}[.!?\\s]*$`,'i'),
    new RegExp(`\\b${escaped}\\s+no\\s+longer\\s+(?:owns|uses|has)\\s+this\\s+(?:number|phone)\\b`,'i')
  ];
  return candidates.some((candidate)=>anyMatch(dynamic,candidate));
}

export function deriveContactPolicy(input={}){
  const text=normalizePolicyText(input.lastContact);
  const evidence=[],conflicts=[];
  const channels={sms:input.smsPermission??'unknown',phone:input.phonePermission??'unknown',email:input.emailPermission??'unknown'};

  if(input.contactPermission==='allowed')evidence.push('Structured global contact permission is allowed; channel permissions remain independently recorded.');
  else if(input.contactPermission==='do_not_contact')evidence.push('Structured global contact permission is do not contact.');
  else evidence.push('Global contact permission is not explicitly confirmed.');

  const explicitAllowed=new Set(),explicitDenied=new Set();
  for(const channel of CHANNELS){
    if(anyMatch(ALLOW[channel],text))explicitAllowed.add(channel);
    if(anyMatch(DENY[channel],text))explicitDenied.add(channel);
    if(ONLY[channel].test(text)){explicitAllowed.add(channel);for(const other of CHANNELS)if(other!==channel)explicitDenied.add(other);}
  }

  for(const channel of explicitDenied){if(channels[channel]==='allowed')conflicts.push(`Structured ${channel} permission says allowed, but last-contact text denies ${channel}; denial wins.`);channels[channel]='denied';evidence.push(`Last-contact text denies ${channel}.`);}
  for(const channel of explicitAllowed){if(channels[channel]==='denied')conflicts.push(`Structured ${channel} permission says denied, while last-contact text allows ${channel}; denial wins.`);else channels[channel]='allowed';evidence.push(`Last-contact text explicitly allows ${channel}.`);}

  const candidates=policyCandidates(text);
  const broadStop=candidates.some((candidate)=>anyMatch(BROAD_STOP,candidate));
  const wrongRecipient=matchesWrongRecipient(candidates,input.customerName);
  const hardBlocked=input.contactPermission==='do_not_contact'||broadStop||wrongRecipient;

  if(hardBlocked){
    if(input.contactPermission==='allowed'&&(broadStop||wrongRecipient))conflicts.push('Structured permission says allowed, but current text contains a stronger stop-contact signal; stop-contact wins.');
    for(const channel of CHANNELS)channels[channel]='denied';
    return{globalState:'do_not_contact',channels,evidence:[...evidence,'Current contact evidence requires outreach to stop.'],conflicts,blocked:true,blockedReason:'Current contact evidence indicates this customer/number should not receive QuoteRescue outreach.'};
  }

  return{globalState:input.contactPermission==='allowed'?'allowed':'unknown',channels,evidence,conflicts,blocked:false,blockedReason:''};
}

export function chooseEffectiveChannel(requested,policy={}){
  const channels=policy.channels??{};
  if(policy.blocked||policy.globalState==='do_not_contact')return{channel:null,sendState:'blocked',reason:'Global contact policy blocks outreach.'};
  if(channels[requested]!=='denied')return{channel:requested,sendState:channels[requested]==='allowed'?'allowed':'permission_unknown',reason:''};
  const allowedAlternative=CHANNELS.find((channel)=>channel!==requested&&channels[channel]==='allowed');
  if(allowedAlternative)return{channel:allowedAlternative,sendState:'switched_channel',reason:`Requested ${requested} is denied; using explicitly allowed ${allowedAlternative}.`};
  return{channel:null,sendState:'blocked_channel',reason:`Requested ${requested} is denied and no alternative channel is explicitly allowed.`};
}