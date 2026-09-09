export const STAGES = Object.freeze([
  'estimate_sent','viewed_no_reply','objection','considering_competitor','delayed_timing','budget_issue','financing_issue','lost_ghosted'
]);
export const BLOCKERS = Object.freeze(['none','budget','price','timing','competitor','trust','financing','spouse_partner','not_ready']);
export const TONES = Object.freeze(['warm','concise','consultative','premium','direct']);
export const CHANNELS = Object.freeze(['sms','email','phone']);
export const CONTACT_PERMISSIONS = Object.freeze(['allowed','unknown','do_not_contact']);
export const CHANNEL_PERMISSION_STATES = Object.freeze(['allowed','unknown','denied']);
export const LIMITS = Object.freeze({
  customerName: 60,
  repName: 60,
  businessName: 100,
  callbackPhone: 40,
  trade: 80,
  jobDescription: 600,
  lastContact: 800,
  quoteAmount: 1000000000,
  quoteAgeDays: 3650,
  lastContactAgeDays: 3650
});

const FORMAT_CONTROLS = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

function stripControls(value, allowNewlines = true) {
  const text = String(value ?? '').replace(FORMAT_CONTROLS, '');
  const pattern = allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return text.replace(pattern, '');
}

export function sanitizeText(value) {
  return stripControls(value, true).trim();
}

export function sanitizeSingleLine(value) {
  const spaced = String(value ?? '').replace(/[\r\n\t]+/g, ' ');
  return stripControls(spaced, false).replace(/\s{2,}/g, ' ').trim();
}

export function truncateWithEllipsis(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  const contentBudget = Math.max(0, maxLength - 1);
  let sliced = text.slice(0, contentBudget);
  if (sliced.length) {
    const last = sliced.charCodeAt(sliced.length - 1);
    if (last >= 0xD800 && last <= 0xDBFF) sliced = sliced.slice(0, -1);
  }
  return `${sliced.trimEnd()}…`;
}

export function formatCurrencyAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const hasFraction = !Number.isInteger(number);
  return number.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2
  });
}

function validateText(raw, key, { required = false, singleLine = false } = {}, errors = {}) {
  const max = LIMITS[key];
  if (raw !== undefined && raw !== null && typeof raw !== 'string') {
    errors[key] = `${labelFor(key)} must be text.`;
    return '';
  }
  const text = singleLine ? sanitizeSingleLine(raw) : sanitizeText(raw);
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

function numberLabel(key) {
  return ({ quoteAgeDays:'Quote age', quoteAmount:'Quote amount', lastContactAgeDays:'Days since last contact' })[key] ?? key;
}

function parseDecimal(raw, key, { optional = false, emptyValue = 0, min = 0, max = Number.MAX_SAFE_INTEGER, integer = false, maxFractionDigits = null } = {}, errors = {}) {
  if (raw !== undefined && raw !== null && typeof raw !== 'string' && typeof raw !== 'number') {
    errors[key] = `${numberLabel(key)} must be a decimal number.`;
    return emptyValue;
  }
  const text = String(raw ?? '').trim();
  if (text === '') {
    if (optional) return emptyValue;
    errors[key] = `${numberLabel(key)} is required.`;
    return 0;
  }
  let grammar;
  if (integer) grammar = /^(?:0|[1-9]\d*)$/;
  else if (maxFractionDigits) grammar = new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${maxFractionDigits}})?$`);
  else grammar = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if (!grammar.test(text)) {
    errors[key] = `${numberLabel(key)} must use decimal numbers only${maxFractionDigits ? ` with at most ${maxFractionDigits} decimal places` : ''}.`;
    return emptyValue;
  }
  const number = Number(text);
  if (!Number.isFinite(number)) {
    errors[key] = `${numberLabel(key)} must be a finite number.`;
    return emptyValue;
  }
  if (integer && !Number.isInteger(number)) {
    errors[key] = `${numberLabel(key)} must be a whole number.`;
    return emptyValue;
  }
  if (number < min || number > max) {
    errors[key] = `${numberLabel(key)} must be between ${min} and ${max}.`;
    return emptyValue;
  }
  return number;
}

function parseEnum(raw, key, allowed, fallback, errors) {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') {
    errors[key] = `Choose a valid ${key}.`;
    return fallback;
  }
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
    quoteAmount: parseDecimal(raw.quoteAmount, 'quoteAmount', { optional:true, min:0, max:LIMITS.quoteAmount, maxFractionDigits:2 }, errors),
    quoteAgeDays: parseDecimal(raw.quoteAgeDays, 'quoteAgeDays', { optional:false, min:0, max:LIMITS.quoteAgeDays, integer:true }, errors),
    lastContactAgeDays: parseDecimal(raw.lastContactAgeDays, 'lastContactAgeDays', { optional:true, emptyValue:null, min:0, max:LIMITS.lastContactAgeDays, integer:true }, errors),
    stage: parseEnum(raw.stage, 'stage', STAGES, 'estimate_sent', errors),
    objection: parseEnum(raw.objection, 'objection', BLOCKERS, 'none', errors),
    lastContact: validateText(raw.lastContact, 'lastContact', {}, errors),
    contactPermission: parseEnum(raw.contactPermission, 'contactPermission', CONTACT_PERMISSIONS, 'unknown', errors),
    smsPermission: parseEnum(raw.smsPermission, 'smsPermission', CHANNEL_PERMISSION_STATES, 'unknown', errors),
    phonePermission: parseEnum(raw.phonePermission, 'phonePermission', CHANNEL_PERMISSION_STATES, 'unknown', errors),
    emailPermission: parseEnum(raw.emailPermission, 'emailPermission', CHANNEL_PERMISSION_STATES, 'unknown', errors),
    tone: parseEnum(raw.tone, 'tone', TONES, 'consultative', errors),
    primaryChannel: parseEnum(raw.primaryChannel, 'primaryChannel', CHANNELS, 'sms', errors)
  };
  return { valid:Object.keys(errors).length === 0, errors, value };
}

export function shortProjectReference(jobDescription, max = 72) {
  const cleaned = sanitizeSingleLine(jobDescription);
  return truncateWithEllipsis(cleaned, max);
}
