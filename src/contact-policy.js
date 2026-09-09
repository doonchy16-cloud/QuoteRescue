import { CHANNELS } from './domain.js';

const BROAD_STOP = [
  /^\s*stop[.!\s]*$/i,
  /\bplease\s+stop\b/i,
  /\bstop\s+(?:reaching\s+out|contacting|messaging)\b/i,
  /\bdo\s+not\s+(?:contact|reach\s+out|message)\b/i,
  /\bdon['’]?t\s+(?:contact|reach\s+out|message)\b/i,
  /\bnever\s+(?:contact|reach\s+out|message)\b/i,
  /\bno\s+more\s+(?:messages|contact)\b/i,
  /\bleave\s+me\s+alone\b/i,
  /\b(?:take|remove)\s+me\s+off\b/i,
  /\bremove\s+my\s+(?:number|phone)\b/i,
  /\bdelete\s+my\s+(?:number|phone)\b/i,
  /\bopt\s+(?:me\s+)?out\b/i,
  /\brevoke\s+consent\b/i,
  /\bcease\s+(?:contact|communications?)\b/i,
  /\bunsubscribe\b/i,
  /\bwrong\s+number\b/i,
  /\bnot\s+\w+\s*;?\s*do\s+not\s+contact\s+this\s+number\b/i
];

const DENY = Object.freeze({
  sms:[/\bdo\s+not\s+text(?:\s+me)?\b/i,/\bdon['’]?t\s+text(?:\s+me)?\b/i,/\bnever\s+text(?:\s+me)?\b/i,/\bno\s+(?:more\s+)?texts?(?:\s+please)?\b/i,/\bquit\s+texting(?:\s+me)?\b/i,/\bstop\s+texting(?:\s+me)?\b/i],
  phone:[/\bdo\s+not\s+call(?:\s+me)?\b/i,/\bdon['’]?t\s+call(?:\s+me)?\b/i,/\bnever\s+call(?:\s+me)?\b/i,/\bno\s+(?:more\s+)?calls?(?:\s+please)?\b/i,/\bquit\s+calling(?:\s+me)?\b/i,/\bstop\s+calling(?:\s+me)?\b/i],
  email:[/\bdo\s+not\s+email(?:\s+me)?\b/i,/\bdon['’]?t\s+email(?:\s+me)?\b/i,/\bnever\s+email(?:\s+me)?\b/i,/\bno\s+(?:more\s+)?emails?(?:\s+please)?\b/i,/\bstop\s+emailing(?:\s+me)?\b/i]
});

const ALLOW = Object.freeze({
  sms:[/\btext\s+is\s+fine\b/i,/\b(?:please\s+)?text(?:\s+me)?\s+instead\b/i,/\btext\s+only\b/i,/\btexts?\s+(?:are|is)\s+ok(?:ay)?\b/i],
  phone:[/\bcall(?:\s+me)?\s+instead\b/i,/\bphone\s+only\b/i,/\bcall\s+only\b/i,/\bcalls?\s+(?:are|is)\s+ok(?:ay)?\b/i],
  email:[/\bemail(?:\s+me)?\s+instead\b/i,/\bemail\s+only\b/i,/\bemails?\s+(?:are|is)\s+ok(?:ay)?\b/i]
});

const ONLY = Object.freeze({
  sms:/\btext\s+only\b/i,
  phone:/\b(?:phone|call)\s+only\b/i,
  email:/\bemail\s+only\b/i
});

const anyMatch = (patterns, text) => patterns.some((pattern) => pattern.test(text));

export function deriveContactPolicy(input = {}) {
  const text = String(input.lastContact ?? '');
  const evidence = [];
  const conflicts = [];
  const channels = {
    sms:input.smsPermission ?? 'unknown',
    phone:input.phonePermission ?? 'unknown',
    email:input.emailPermission ?? 'unknown'
  };

  if (input.contactPermission === 'allowed') {
    for (const channel of CHANNELS) if (channels[channel] === 'unknown') channels[channel] = 'allowed';
    evidence.push('Structured global contact permission is allowed.');
  } else if (input.contactPermission === 'do_not_contact') {
    evidence.push('Structured global contact permission is do not contact.');
  } else {
    evidence.push('Global contact permission is not explicitly confirmed.');
  }

  const explicitAllowed = new Set();
  const explicitDenied = new Set();

  for (const channel of CHANNELS) {
    if (anyMatch(ALLOW[channel], text)) explicitAllowed.add(channel);
    if (anyMatch(DENY[channel], text)) explicitDenied.add(channel);
    if (ONLY[channel].test(text)) {
      explicitAllowed.add(channel);
      for (const other of CHANNELS) if (other !== channel) explicitDenied.add(other);
    }
  }

  for (const channel of explicitDenied) {
    if (channels[channel] === 'allowed') conflicts.push(`Structured ${channel} permission says allowed, but last-contact text denies ${channel}; denial wins.`);
    channels[channel] = 'denied';
    evidence.push(`Last-contact text denies ${channel}.`);
  }
  for (const channel of explicitAllowed) {
    if (channels[channel] === 'denied') conflicts.push(`Structured ${channel} permission says denied, while last-contact text allows ${channel}; denial wins.`);
    else channels[channel] = 'allowed';
    evidence.push(`Last-contact text explicitly allows ${channel}.`);
  }

  const broadStop = anyMatch(BROAD_STOP, text);
  const channelDenyWithoutAlternative = explicitDenied.size > 0 && explicitAllowed.size === 0;
  const wrongRecipient = /\bwrong\s+number\b/i.test(text) || /\bi\s+am\s+not\s+[^.;]+\b.*\bdo\s+not\s+contact\s+this\s+number\b/i.test(text);
  const hardBlocked = input.contactPermission === 'do_not_contact' || broadStop || wrongRecipient || channelDenyWithoutAlternative;

  if (hardBlocked) {
    if (input.contactPermission === 'allowed' && (broadStop || wrongRecipient || channelDenyWithoutAlternative)) conflicts.push('Structured permission says allowed, but current text contains a stronger stop-contact signal; stop-contact wins.');
    for (const channel of CHANNELS) channels[channel] = 'denied';
    return {
      globalState:'do_not_contact', channels, evidence:[...evidence,'Current contact evidence requires outreach to stop.'], conflicts,
      blocked:true, blockedReason:'Current contact evidence indicates this customer/number should not receive QuoteRescue outreach.'
    };
  }

  const globalState = input.contactPermission === 'allowed' ? 'allowed' : 'unknown';
  return { globalState, channels, evidence, conflicts, blocked:false, blockedReason:'' };
}

export function chooseEffectiveChannel(requested, policy = {}) {
  const channels = policy.channels ?? {};
  if (policy.blocked || policy.globalState === 'do_not_contact') return { channel:null, sendState:'blocked', reason:'Global contact policy blocks outreach.' };
  if (channels[requested] !== 'denied') return { channel:requested, sendState:channels[requested] === 'allowed' ? 'allowed' : 'permission_unknown', reason:'' };
  const allowedAlternative = CHANNELS.find((channel) => channel !== requested && channels[channel] === 'allowed');
  if (allowedAlternative) return { channel:allowedAlternative, sendState:'switched_channel', reason:`Requested ${requested} is denied; using explicitly allowed ${allowedAlternative}.` };
  return { channel:null, sendState:'blocked_channel', reason:`Requested ${requested} is denied and no alternative channel is explicitly allowed.` };
}
