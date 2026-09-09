export const STAGES = Object.freeze([
  'estimate_sent','viewed_no_reply','objection','considering_competitor','delayed_timing','budget_issue','financing_issue','lost_ghosted'
]);
export const BLOCKERS = Object.freeze(['none','budget','price','timing','competitor','trust','financing','spouse_partner','not_ready']);
export const TONES = Object.freeze(['warm','concise','consultative','premium','direct']);
export const CHANNELS = Object.freeze(['sms','email','phone']);
export const CONTACT_PERMISSIONS = Object.freeze(['allowed','unknown','limited_channel','do_not_contact']);
export const LIMITS = Object.freeze({
  customerName: 60,
  repName: 60,
  businessName: 100,
  callbackPhone: 40,
  trade: 80,
  jobDescription: 600,
  lastContact: 800,
  quoteAmount: 1000000000,
  quoteAgeDays: 3650
});

function stripControls(value, allowNewlines = true) {
  const text = String(value ?? '');
  const pattern = allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return text.replace(pattern, '');
}

export function sanitizeText(value, max) {
  return stripControls(value, true).trim();
}

export function sanitizeSingleLine(value, max) {
  return stripControls(value, false).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function validateText(raw, key, { required = false, singleLine = false } = {}, errors = {}) {
  const max = LIMITS[key];
  const text = singleLine ? sanitizeSingleLine(raw, max) : sanitizeText(raw, max);
  if (required && !text) errors[key] = `${labelFor(key)} is required.`;
  if (text.length > max) errors[key] = `${labelFor(key)} must be ${max} characters or fewer.`;
  return text;
}

function labelFor(key) {
  return ({
    customerName:'Customer first name', repName:'Representative first name', businessName:'Business name', callbackPhone:'Callback phone',
    trade:'Trade or service', jobDescription:'Job description', lastContact:'Last contact/context'
  })[key] ?? key;
}

function parseFinite(raw, key, { optional = false, min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}, errors = {}) {
  const text = String(raw ?? '').trim();
  if (text === '') {
    if (optional) return 0;
    errors[key] = `${key === 'quoteAgeDays' ? 'Quote age' : 'Quote amount'} is required.`;
    return 0;
  }
  const number = Number(text);
  if (!Number.isFinite(number)) {
    errors[key] = `${key === 'quoteAgeDays' ? 'Quote age' : 'Quote amount'} must be a finite number.`;
    return 0;
  }
  if (integer && !Number.isInteger(number)) {
    errors[key] = `${key === 'quoteAgeDays' ? 'Quote age' : 'Quote amount'} must be a whole number.`;
    return 0;
  }
  if (number < min || number > max) {
    errors[key] = `${key === 'quoteAgeDays' ? 'Quote age' : 'Quote amount'} must be between ${min} and ${max}.`;
    return 0;
  }
  return number;
}

function parseEnum(raw, key, allowed, fallback, errors) {
  const value = String(raw ?? fallback).trim();
  if (!allowed.includes(value)) {
    errors[key] = `Choose a valid ${key}.`;
    return fallback;
  }
  return value;
}

export function parseInput(raw = {}) {
  const errors = {};
  const value = {
    customerName: validateText(raw.customerName, 'customerName', { required:true, singleLine:true }, errors),
    repName: validateText(raw.repName, 'repName', { required:true, singleLine:true }, errors),
    businessName: validateText(raw.businessName, 'businessName', { singleLine:true }, errors),
    callbackPhone: validateText(raw.callbackPhone, 'callbackPhone', { singleLine:true }, errors),
    trade: validateText(raw.trade, 'trade', { required:true, singleLine:true }, errors),
    jobDescription: validateText(raw.jobDescription, 'jobDescription', { required:true }, errors),
    quoteAmount: parseFinite(raw.quoteAmount, 'quoteAmount', { optional:true, min:0, max:LIMITS.quoteAmount }, errors),
    quoteAgeDays: parseFinite(raw.quoteAgeDays, 'quoteAgeDays', { optional:false, min:0, max:LIMITS.quoteAgeDays, integer:true }, errors),
    stage: parseEnum(raw.stage, 'stage', STAGES, 'estimate_sent', errors),
    objection: parseEnum(raw.objection, 'objection', BLOCKERS, 'none', errors),
    lastContact: validateText(raw.lastContact, 'lastContact', {}, errors),
    contactPermission: parseEnum(raw.contactPermission, 'contactPermission', CONTACT_PERMISSIONS, 'unknown', errors),
    tone: parseEnum(raw.tone, 'tone', TONES, 'consultative', errors),
    primaryChannel: parseEnum(raw.primaryChannel, 'primaryChannel', CHANNELS, 'sms', errors)
  };
  return { valid:Object.keys(errors).length === 0, errors, value };
}

export function shortProjectReference(jobDescription, max = 72) {
  const cleaned = sanitizeSingleLine(jobDescription, LIMITS.jobDescription);
  if (cleaned.length <= max) return cleaned;
  const sliced = cleaned.slice(0, Math.max(1, max - 1)).trimEnd();
  return `${sliced}…`;
}
