const HARD_BLOCK_PATTERNS = [
  /\bstop\s+(?:texting|calling|contacting|messaging)\b/i,
  /\bdo\s+not\s+contact\b/i,
  /\bdon['’]?t\s+contact\b/i,
  /\bnever\s+contact\b/i,
  /\bunsubscribe\b/i,
  /\bremove\s+me\b/i,
  /\bopt\s*out\b/i,
  /\battorney\b.*\b(?:no|never|do not|don['’]?t)\b.*\bcontact\b/i,
  /\blawyer\b.*\b(?:no|never|do not|don['’]?t)\b.*\bcontact\b/i
];

const CUES = [
  { kind:'competitor_loss', blocker:'competitor', engagement:'lost', mode:'close_loop', patterns:[/\bhired\b.*\b(?:another|other)\b.*\b(?:contractor|company|provider)\b/i, /\bwent with\b.*\b(?:another|someone else|competitor)\b/i, /\bselected\b.*\bcompetitor\b/i] },
  { kind:'positive', blocker:null, engagement:'positive', mode:null, patterns:[/\b(?:love|loved|likes?|ready|wants?)\b.*\b(?:proposal|quote|estimate|move forward|proceed)\b/i, /\bmove forward\b/i, /\bready to proceed\b/i] },
  { kind:'not_ready', blocker:'not_ready', engagement:'neutral', mode:'nurture', patterns:[/\bnot ready\b/i, /\bon hold\b/i, /\bnext month\b/i, /\blater this year\b/i] },
  { kind:'budget', blocker:'budget', engagement:'negative', mode:'objection_resolution', patterns:[/\bbudget\b/i, /\bcan['’]?t afford\b/i, /\btoo expensive\b/i] },
  { kind:'financing', blocker:'financing', engagement:'negative', mode:'objection_resolution', patterns:[/\bfinanc(?:e|ing)\b/i, /\bfunding\b/i, /\bloan\b/i] },
  { kind:'trust', blocker:'trust', engagement:'negative', mode:'objection_resolution', patterns:[/\bnot sure\b/i, /\buncertain\b/i, /\btrust\b/i, /\bwarranty\b.*\bconcern/i] },
  { kind:'partner', blocker:'spouse_partner', engagement:'neutral', mode:'objection_resolution', patterns:[/\bspouse\b/i, /\bhusband\b/i, /\bwife\b/i, /\bpartner\b.*\b(?:decide|approve|review)\b/i] },
  { kind:'timing', blocker:'timing', engagement:'neutral', mode:'nurture', patterns:[/\btiming\b/i, /\bschedule\b.*\bproblem/i, /\bdelay(?:ed|ing)?\b/i] }
];

const STAGE_DEFAULT_BLOCKER = Object.freeze({ budget_issue:'budget', financing_issue:'financing', considering_competitor:'competitor', delayed_timing:'timing' });

function textCue(text = '') {
  for (const cue of CUES) if (cue.patterns.some((pattern) => pattern.test(text))) return cue;
  return null;
}

function baseMode(stage, blocker) {
  if (stage === 'lost_ghosted') return 'close_loop';
  if (blocker && blocker !== 'none' && blocker !== 'not_ready' && blocker !== 'timing') return 'objection_resolution';
  if (stage === 'delayed_timing' || blocker === 'not_ready' || blocker === 'timing') return 'nurture';
  if (stage === 'objection') return 'objection_resolution';
  return 'active_followup';
}

function engagementFromStage(stage) {
  if (stage === 'lost_ghosted') return 'lost';
  if (stage === 'viewed_no_reply') return 'unresponsive';
  if (['objection','considering_competitor','budget_issue','financing_issue'].includes(stage)) return 'negative';
  return 'neutral';
}

export function deriveRecoveryContext(input = {}) {
  const evidence = [];
  const conflicts = [];
  const text = String(input.lastContact ?? '');

  if (input.contactPermission === 'do_not_contact' || HARD_BLOCK_PATTERNS.some((pattern) => pattern.test(text))) {
    evidence.push(input.contactPermission === 'do_not_contact' ? 'Structured contact permission is set to do not contact.' : 'Last-contact context contains an explicit no-contact/opt-out signal.');
    return { contactState:'do_not_contact', engagementState:'negative', primaryBlocker:'unknown', recoveryMode:'blocked', confidence:'high', evidence, conflicts };
  }

  const contactState = input.contactPermission === 'allowed' ? 'allowed' : input.contactPermission === 'limited_channel' ? 'limited_channel' : 'unknown';
  if (contactState !== 'unknown') evidence.push(`Structured contact permission: ${contactState.replace('_',' ')}.`);

  const stageBlocker = STAGE_DEFAULT_BLOCKER[input.stage] ?? null;
  const explicitBlocker = input.objection && input.objection !== 'none' ? input.objection : null;
  const cue = textCue(text);

  let primaryBlocker = explicitBlocker ?? stageBlocker ?? cue?.blocker ?? 'none';
  if (explicitBlocker && stageBlocker && explicitBlocker !== stageBlocker) {
    conflicts.push(`Selected objection (${explicitBlocker}) differs from the stage-implied blocker (${stageBlocker}); using the selected objection.`);
  }
  if (explicitBlocker && cue?.blocker && explicitBlocker !== cue.blocker) {
    conflicts.push(`Last-contact text suggests ${cue.blocker}, but the selected objection is ${explicitBlocker}; using the selected objection.`);
  }
  if (!explicitBlocker && stageBlocker) evidence.push(`Stage implies ${stageBlocker} as the primary blocker.`);
  if (cue) evidence.push(`Last-contact context matched the ${cue.kind.replace('_',' ')} cue class.`);

  let engagementState = cue?.engagement ?? engagementFromStage(input.stage);
  let recoveryMode = baseMode(input.stage, primaryBlocker);

  if (cue?.kind === 'competitor_loss') {
    engagementState = 'lost';
    recoveryMode = 'close_loop';
    primaryBlocker = explicitBlocker ?? 'competitor';
  } else if (!explicitBlocker && !stageBlocker && cue?.mode) {
    recoveryMode = cue.mode;
  }

  if (input.stage === 'lost_ghosted') recoveryMode = input.quoteAgeDays > 30 ? 'reactivation' : 'close_loop';
  if (recoveryMode === 'reactivation' && input.quoteAgeDays <= 30) recoveryMode = 'close_loop';

  const confidence = input.contactPermission === 'allowed' || explicitBlocker || stageBlocker || cue ? (conflicts.length ? 'medium' : 'high') : 'low';
  return { contactState, engagementState, primaryBlocker, recoveryMode, confidence, evidence, conflicts };
}
