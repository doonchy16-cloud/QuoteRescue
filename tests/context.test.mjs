import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRecoveryContext } from '../src/context.js';

const base = { stage:'viewed_no_reply', objection:'none', lastContact:'Sent estimate yesterday.', contactPermission:'unknown', quoteAgeDays:3 };

test('explicit opt-out language hard-blocks outreach', () => {
  for (const text of ['Customer said STOP texting me', 'Do not contact again', 'unsubscribe me', 'Attorney said never contact them again']) {
    const c = deriveRecoveryContext({ ...base, lastContact:text });
    assert.equal(c.contactState, 'do_not_contact', text);
    assert.equal(c.recoveryMode, 'blocked', text);
    assert.ok(c.evidence.some((e) => /contact|opt|stop|legal/i.test(e)));
  }
});

test('explicit permission choice can block without relying on free text', () => {
  const c = deriveRecoveryContext({ ...base, contactPermission:'do_not_contact' });
  assert.equal(c.contactState, 'do_not_contact');
  assert.equal(c.recoveryMode, 'blocked');
});

test('stage reconciles missing blocker for budget financing and competitor', () => {
  assert.equal(deriveRecoveryContext({ ...base, stage:'budget_issue' }).primaryBlocker, 'budget');
  assert.equal(deriveRecoveryContext({ ...base, stage:'financing_issue' }).primaryBlocker, 'financing');
  assert.equal(deriveRecoveryContext({ ...base, stage:'considering_competitor' }).primaryBlocker, 'competitor');
});

test('text cues materially alter engagement and recovery context', () => {
  const positive = deriveRecoveryContext({ ...base, lastContact:'Customer loves the proposal and wants to move forward.' });
  const lost = deriveRecoveryContext({ ...base, lastContact:'Customer hired another contractor.' });
  const delayed = deriveRecoveryContext({ ...base, lastContact:'Not ready yet, maybe next month.' });
  assert.equal(positive.engagementState, 'positive');
  assert.equal(lost.engagementState, 'lost');
  assert.equal(lost.recoveryMode, 'close_loop');
  assert.equal(delayed.primaryBlocker, 'not_ready');
  assert.equal(delayed.recoveryMode, 'nurture');
});

test('explicit blocker wins over weaker text cue and conflict is surfaced', () => {
  const c = deriveRecoveryContext({ ...base, objection:'budget', lastContact:'Customer mentioned timing may be difficult.' });
  assert.equal(c.primaryBlocker, 'budget');
  assert.ok(c.conflicts.length >= 1);
});

test('negative phrasing is never misread as positive intent', () => {
  const notReady = deriveRecoveryContext({ ...base, lastContact:'Customer is not ready to move forward.' });
  const declined = deriveRecoveryContext({ ...base, lastContact:'Customer does not want to proceed.' });
  assert.equal(notReady.engagementState, 'neutral');
  assert.equal(notReady.primaryBlocker, 'not_ready');
  assert.equal(notReady.recoveryMode, 'nurture');
  assert.equal(declined.engagementState, 'lost');
  assert.equal(declined.recoveryMode, 'close_loop');
});

test('old untouched quote becomes reactivation instead of active follow-up', () => {
  const c = deriveRecoveryContext({ ...base, quoteAgeDays:75, stage:'viewed_no_reply', lastContact:'No reply.' });
  assert.equal(c.recoveryMode, 'reactivation');
});
