function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
}

function splitClauses(text) {
  return normalize(text)
    .replace(/\b(?:but|however)\b/g, '|')
    .split(/[|;.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const has = (text, pattern) => pattern.test(text);
const fact = (type, state, clause, index, temporal = 'current', confidence = 'high') => ({ type, state, clause, index, temporal, confidence });

function temporalFor(clause) {
  if (/\b(?:now|currently|today|at this point)\b/.test(clause)) return 'current';
  if (/\b(?:before|previously|last week|used to|was|were|had been)\b/.test(clause)) return 'past';
  return 'current';
}

function clauseFacts(clause, index, previousBlocker = null) {
  const temporal = temporalFor(clause);
  const facts = [];

  const negativeIntent = /\b(?:can(?:not|'t)|unable|not able|aren't able|isn't able|won't|will not|does not want|doesn't want|do not want|don't want)\s+(?:to\s+)?(?:move forward|proceed)\b/;
  const explicitDecline = /\b(?:not interested|declined|not moving forward|will not proceed|won't proceed)\b/;
  const positiveIntent = /\b(?:ready\s+to\s+(?:proceed|move forward)|wants?\s+to\s+(?:proceed|move forward)|want\s+to\s+(?:proceed|move forward)|move forward|proceed with us|chose us|choose us)\b/;

  if (has(clause, negativeIntent)) {
    facts.push(fact('intent','negative',clause,index,temporal));
    facts.push(fact('not_ready','active',clause,index,temporal));
  } else if (has(clause, explicitDecline)) {
    facts.push(fact('intent','declined',clause,index,temporal));
  }

  if (/\bnot\s+ready\b/.test(clause) || /\bon\s+hold\b/.test(clause)) facts.push(fact('not_ready','active',clause,index,temporal));
  if (/\b(?:ready\s+now|now\s+ready|ready\s+to\s+(?:proceed|move forward))\b/.test(clause)) facts.push(fact('not_ready','resolved',clause,index,'current'));

  if (/\b(?:budget\s+(?:is\s+)?(?:fine|works|approved|resolved|not\s+a\s+problem)|enough\s+budget|do(?:es)?n't\s+have\s+a\s+budget\s+issue|no\s+budget\s+(?:issue|problem))\b/.test(clause)) {
    facts.push(fact('budget','resolved',clause,index,temporal));
  } else if (/\b(?:budget|can't afford|cannot afford|too expensive)\b/.test(clause)) {
    facts.push(fact('budget','active',clause,index,temporal));
  }

  if (/\b(?:financing\s+(?:is\s+)?(?:approved|resolved|fine|not\s+a\s+problem)|loan\s+(?:is\s+)?approved|funding\s+(?:is\s+)?secured|no\s+financing\s+(?:is\s+)?needed)\b/.test(clause)) {
    facts.push(fact('financing','resolved',clause,index,temporal));
  } else if (/\b(?:financing|funding|loan)\b/.test(clause)) {
    facts.push(fact('financing','active',clause,index,temporal));
  }

  if (/\b(?:we\s+trust\s+you|trust\s+(?:is\s+)?not\s+a\s+concern|warranty\s+(?:is\s+)?not\s+a\s+concern|trust\s+(?:is\s+)?resolved)\b/.test(clause)) {
    facts.push(fact('trust','resolved',clause,index,temporal));
  } else if (/\b(?:not sure|uncertain|trust issue|warranty concern)\b/.test(clause)) {
    facts.push(fact('trust','active',clause,index,temporal));
  }

  if (/\b(?:timing\s+(?:works|is\s+perfect|is\s+fine|is\s+not\s+a\s+problem)|schedule\s+(?:now\s+)?works|schedule\s+(?:is\s+)?not\s+a\s+problem)\b/.test(clause)) {
    facts.push(fact('timing','resolved',clause,index,temporal));
  } else if (/\b(?:timing\s+(?:issue|problem)|schedule\s+(?:issue|problem)|delay(?:ed|ing)?)\b/.test(clause)) {
    facts.push(fact('timing','active',clause,index,temporal));
  }

  if (/\b(?:husband|wife|spouse|partner)\b.*\b(?:approved|agreed|said yes)\b/.test(clause)) {
    facts.push(fact('partner','resolved',clause,index,temporal));
  } else if (/\b(?:husband|wife|spouse|partner)\b.*\b(?:decide|approve|review|needs? to)\b/.test(clause)) {
    facts.push(fact('partner','active',clause,index,temporal));
  }

  if (/\b(?:have\s+not|haven't|did\s+not|didn't)\s+(?:hire|hired|select|selected|choose|chose)\s+(?:another\s+contractor|a\s+competitor|another\s+company)\b/.test(clause) || /\b(?:did\s+not|didn't)\s+select\s+a\s+competitor\b/.test(clause) || /\bchose\s+us\b/.test(clause)) {
    facts.push(fact('competitor','not_selected',clause,index,temporal));
  } else if (/\b(?:hired\s+(?:another|other)\s+(?:contractor|company|provider)|went\s+with\s+(?:another|someone else|a competitor)|selected\s+(?:a\s+)?competitor|chose\s+(?:another|someone else))\b/.test(clause)) {
    facts.push(fact('competitor','selected',clause,index,temporal));
  }

  if (/\b(?:resolved|fixed|no longer an issue|no longer a problem)\b/.test(clause) && previousBlocker && !facts.some((item) => item.type === previousBlocker)) {
    facts.push(fact(previousBlocker,'resolved',clause,index,'current','medium'));
  }

  const hasNegativeIntent = facts.some((item) => item.type === 'intent' && ['negative','declined'].includes(item.state));
  if (!hasNegativeIntent && has(clause, positiveIntent)) facts.push(fact('intent','positive',clause,index,temporal));

  return facts;
}

function rank(item) {
  const temporal = item.temporal === 'current' ? 100 : 20;
  const resolution = item.state === 'resolved' || item.state === 'not_selected' ? 20 : 0;
  return temporal + resolution + item.index;
}

function resolveFacts(facts) {
  const current = {
    intent:'unknown', competitor:'unknown', budget:'unknown', financing:'unknown', trust:'unknown', timing:'unknown', partner:'unknown', not_ready:'unknown'
  };
  const types = Object.keys(current);
  for (const type of types) {
    const candidates = facts.filter((item) => item.type === type).sort((a,b) => rank(a) - rank(b));
    if (candidates.length) current[type] = candidates.at(-1).state;
  }
  if (current.intent === 'positive') current.not_ready = current.not_ready === 'active' ? 'resolved' : current.not_ready;
  return current;
}

export function interpretContextText(text = '') {
  const clauses = splitClauses(text);
  const facts = [];
  let previousBlocker = null;
  clauses.forEach((clause,index) => {
    const extracted = clauseFacts(clause,index,previousBlocker);
    facts.push(...extracted);
    const active = extracted.find((item) => ['budget','financing','trust','timing','partner','not_ready'].includes(item.type) && item.state === 'active');
    if (active) previousBlocker = active.type;
    const resolved = extracted.find((item) => item.state === 'resolved' && item.type === previousBlocker);
    if (resolved) previousBlocker = null;
  });
  const current = resolveFacts(facts);
  const evidence = facts.map((item) => `${item.temporal} ${item.type}: ${item.state} — “${item.clause}”`);
  return { clauses, facts, current, evidence };
}
