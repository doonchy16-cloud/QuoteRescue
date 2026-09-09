import { deriveContactPolicy } from './contact-policy.js';
import { interpretContextText } from './interpreter.js';
import { deriveDecision } from './decision.js';

export function deriveRecoveryContext(input = {}) {
  const channelPolicy = deriveContactPolicy(input);
  const interpretation = interpretContextText(input.lastContact ?? '');
  const decision = deriveDecision(input, channelPolicy, interpretation);
  return {
    contactState:channelPolicy.globalState,
    channelPolicy,
    interpretation,
    engagementState:decision.engagementState,
    primaryBlocker:decision.primaryBlocker,
    recoveryMode:decision.recoveryMode,
    confidence:decision.confidence,
    evidence:decision.evidence,
    conflicts:decision.conflicts
  };
}
