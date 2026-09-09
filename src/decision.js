const STAGE_BLOCKER = Object.freeze({
  budget_issue:'budget', financing_issue:'financing', considering_competitor:'competitor', delayed_timing:'timing'
});

const INTERPRETER_BLOCKER = Object.freeze({
  budget:'budget', financing:'financing', trust:'trust', timing:'timing', partner:'spouse_partner', not_ready:'not_ready'
});

function structuredMode(stage, blocker, quoteAgeDays) {
  if (stage === 'lost_ghosted') return quoteAgeDays > 30 ? 'reactivation' : 'close_loop';
  if (blocker === 'timing' || blocker === 'not_ready' || stage === 'delayed_timing') return 'nurture';
  if ((blocker && blocker !== 'none') || stage === 'objection') return 'objection_resolution';
  if (quoteAgeDays > 45) return 'reactivation';
  return 'active_followup';
}

function structuredEngagement(stage) {
  if (stage === 'lost_ghosted') return 'lost';
  if (stage === 'viewed_no_reply') return 'unresponsive';
  if (['objection','considering_competitor','budget_issue','financing_issue'].includes(stage)) return 'negative';
  return 'neutral';
}

function currentActiveBlocker(current) {
  for (const [factType, blocker] of Object.entries(INTERPRETER_BLOCKER)) {
    if (current[factType] === 'active') return blocker;
  }
  return null;
}

function resolvedStructuredConflict(structuredBlocker, current) {
  if (!structuredBlocker) return false;
  const factType = Object.entries(INTERPRETER_BLOCKER).find(([, blocker]) => blocker === structuredBlocker)?.[0];
  if (factType && current[factType] === 'resolved') return true;
  if (structuredBlocker === 'competitor' && current.competitor === 'not_selected') return true;
  return false;
}

export function deriveDecision(input = {}, contactPolicy = {}, interpretation = {}) {
  const evidence = [];
  const conflicts = [...(contactPolicy.conflicts ?? [])];
  const current = interpretation.current ?? {};

  if (contactPolicy.blocked || contactPolicy.globalState === 'do_not_contact') {
    return {
      engagementState:'negative', primaryBlocker:'unknown', recoveryMode:'blocked', confidence:'high',
      evidence:[...(contactPolicy.evidence ?? []), ...(interpretation.evidence ?? [])], conflicts
    };
  }

  const stageBlocker = STAGE_BLOCKER[input.stage] ?? null;
  const explicitBlocker = input.objection && input.objection !== 'none' ? input.objection : null;
  const structuredBlocker = explicitBlocker ?? stageBlocker;
  let primaryBlocker = structuredBlocker ?? 'none';
  let engagementState = structuredEngagement(input.stage);
  let recoveryMode = structuredMode(input.stage, primaryBlocker, input.quoteAgeDays ?? 0);

  if (explicitBlocker && stageBlocker && explicitBlocker !== stageBlocker) {
    conflicts.push(`Selected objection (${explicitBlocker}) differs from stage-implied blocker (${stageBlocker}); selected objection is authoritative unless current evidence resolves it.`);
  }

  const activeTextBlocker = currentActiveBlocker(current);
  if (activeTextBlocker) {
    if (structuredBlocker && structuredBlocker !== activeTextBlocker) {
      conflicts.push(`Current text suggests ${activeTextBlocker}, while structured input says ${structuredBlocker}; structured blocker remains authoritative.`);
    } else if (!structuredBlocker) {
      primaryBlocker = activeTextBlocker;
    }
  }

  if (resolvedStructuredConflict(structuredBlocker, current)) {
    conflicts.push(`Current text indicates the structured ${structuredBlocker} blocker is resolved; current resolved evidence overrides the stale blocker.`);
    primaryBlocker = activeTextBlocker ?? 'none';
  }

  if (current.competitor === 'selected') {
    if (structuredBlocker && structuredBlocker !== 'competitor') conflicts.push(`Current text says another provider was selected, overriding structured blocker ${structuredBlocker}.`);
    primaryBlocker = 'competitor';
    engagementState = 'lost';
    recoveryMode = 'close_loop';
  } else if (current.intent === 'declined') {
    engagementState = 'lost';
    recoveryMode = 'close_loop';
  } else if (current.intent === 'negative') {
    engagementState = 'neutral';
    if (primaryBlocker === 'none') primaryBlocker = 'not_ready';
    recoveryMode = 'nurture';
  } else if (current.intent === 'positive') {
    if (input.stage === 'lost_ghosted') conflicts.push('Stage says lost/ghosted, but current text shows positive intent; current intent overrides the stale stage.');
    if (input.stage === 'considering_competitor' && current.competitor === 'not_selected') conflicts.push('Stage says considering competitor, but current text indicates the customer chose us / did not select a competitor.');
    if (['budget_issue','financing_issue','delayed_timing'].includes(input.stage) && resolvedStructuredConflict(stageBlocker, current)) conflicts.push(`Stage-implied ${stageBlocker} issue appears resolved in current text.`);
    engagementState = 'positive';
    if (primaryBlocker === 'none' || resolvedStructuredConflict(structuredBlocker, current)) primaryBlocker = activeTextBlocker ?? 'none';
    recoveryMode = primaryBlocker !== 'none' && primaryBlocker !== 'not_ready' && primaryBlocker !== 'timing' ? 'objection_resolution' : 'active_followup';
  } else if (current.not_ready === 'active') {
    engagementState = 'neutral';
    primaryBlocker = explicitBlocker ?? 'not_ready';
    recoveryMode = 'nurture';
  } else if (activeTextBlocker && !structuredBlocker) {
    engagementState = ['budget','financing','trust'].includes(activeTextBlocker) ? 'negative' : 'neutral';
    recoveryMode = ['timing','not_ready'].includes(activeTextBlocker) ? 'nurture' : 'objection_resolution';
  }

  if (input.quoteAgeDays > 45 && recoveryMode === 'active_followup' && engagementState !== 'positive') recoveryMode = 'reactivation';

  if (stageBlocker) evidence.push(`Stage implies ${stageBlocker}.`);
  if (explicitBlocker) evidence.push(`Selected objection is ${explicitBlocker}.`);
  evidence.push(...(contactPolicy.evidence ?? []), ...(interpretation.evidence ?? []));
  if (Number.isInteger(input.lastContactAgeDays)) evidence.push(`Last recorded contact was ${input.lastContactAgeDays} day${input.lastContactAgeDays === 1 ? '' : 's'} ago.`);

  const hasStrongEvidence = input.contactPermission === 'allowed' || explicitBlocker || stageBlocker || (interpretation.facts?.length ?? 0) > 0;
  const confidence = conflicts.length ? 'medium' : hasStrongEvidence ? 'high' : 'low';
  return { engagementState, primaryBlocker, recoveryMode, confidence, evidence, conflicts };
}
