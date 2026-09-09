import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePriority } from '../src/scoring.js';

const input = { quoteAgeDays:3, quoteAmount:8400, lastContact:'Sent estimate yesterday.' };

test('blocked contact always scores zero', () => {
  const result = scorePriority(input, { contactState:'do_not_contact', recoveryMode:'blocked', engagementState:'negative', primaryBlocker:'unknown' });
  assert.deepEqual({score:result.score, band:result.band}, {score:0, band:'Do not contact'});
});

test('lost or close-loop context cannot receive active priority labels', () => {
  const result = scorePriority(input, { contactState:'allowed', recoveryMode:'close_loop', engagementState:'lost', primaryBlocker:'competitor' });
  assert.ok(result.score <= 34);
  assert.equal(result.band, 'Reactivation / close loop');
});

test('older opportunities score lower than fresh equivalent', () => {
  const context = { contactState:'allowed', recoveryMode:'active_followup', engagementState:'neutral', primaryBlocker:'none' };
  const fresh = scorePriority({ ...input, quoteAgeDays:2 }, context).score;
  const old = scorePriority({ ...input, quoteAgeDays:80 }, context).score;
  assert.ok(fresh - old >= 20, `${fresh} vs ${old}`);
});

test('unknown contact permission lowers work priority versus explicitly allowed contact', () => {
  const common = { recoveryMode:'active_followup', engagementState:'neutral', primaryBlocker:'none' };
  const allowed = scorePriority(input, { ...common, contactState:'allowed' }).score;
  const unknown = scorePriority(input, { ...common, contactState:'unknown' }).score;
  assert.ok(allowed > unknown, `${allowed} vs ${unknown}`);
});

test('contact recency affects priority when supplied', () => {
  const context = { contactState:'allowed', recoveryMode:'active_followup', engagementState:'neutral', primaryBlocker:'none' };
  const sameDay = scorePriority({ ...input, lastContactAgeDays:0 }, context).score;
  const fourDays = scorePriority({ ...input, lastContactAgeDays:4 }, context).score;
  assert.ok(fourDays > sameDay, `${fourDays} vs ${sameDay}`);
});
