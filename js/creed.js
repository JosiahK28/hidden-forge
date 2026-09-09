/* ============================================================
   Creed Audit — nine statements, five-point scale, one verdict.
   Add or edit statements here; the page builds itself from this list.
   ============================================================ */

const AUDIT_ITEMS = [
  { id: 'a1', pillar: 'II', text: 'When something went wrong, I named my portion of it before naming anyone else\u2019s.' },
  { id: 'a2', pillar: 'II', text: 'I kept a promise that nobody was checking on.' },
  { id: 'a3', pillar: 'II', text: 'I asked for hard feedback and did not argue with the answer.' },
  { id: 'a4', pillar: 'III', text: 'I got up at the hour I set the night before.' },
  { id: 'a5', pillar: 'III', text: 'I refused an appetite that usually wins.' },
  { id: 'a6', pillar: 'III', text: 'I trained my body when I did not feel like it.' },
  { id: 'a7', pillar: '\u2014', text: 'I did the hardest task of the day first, not last.' },
  { id: 'a8', pillar: '\u2014', text: 'I said a true thing that cost me something socially.' },
  { id: 'a9', pillar: '\u2014', text: 'I finished the day with something built, not just consumed.' }
];

const VERDICTS = [
  { min: 40, title: 'Forged', body: 'The creed is not aspirational for you this week — it is descriptive. Raise the bar; a standard you clear easily has stopped teaching you anything.' },
  { min: 31, title: 'Holding the line', body: 'Most days went the right way. The gap is in the specific pillars below, and gaps that stay small stay fixable. Pick one and close it.' },
  { min: 22, title: 'Split', body: 'You are two men this week, and the weaker one has been getting the mornings. Do not attempt a total reform. Take the lowest-scoring statement and make it non-negotiable for seven days.' },
  { min: 13, title: 'Slipping', body: 'The creed is currently something you agree with rather than something you do. That distance is the whole problem, and it closes with one kept promise, not a new system.' },
  { min: 0,  title: 'Cold iron', body: 'Nothing is being forged. This is not a verdict on your character; it is a reading of a week. Choose the single smallest act you cannot fail at, do it tomorrow, and audit again in seven days.' }
];

const itemsEl   = document.getElementById('audit-items');
const statusEl  = document.getElementById('audit-status');
const verdictEl = document.getElementById('verdict');

let lastResult = null;

/* --- build the form ------------------------------------------------ */

AUDIT_ITEMS.forEach((item, i) => {
  const wrap = document.createElement('div');
  wrap.className = 'audit-item';

  const q = document.createElement('p');
  q.textContent = `${i + 1}. ${item.text}`;
  wrap.appendChild(q);

  const scale = document.createElement('div');
  scale.className = 'scale';
  scale.setAttribute('role', 'group');
  scale.setAttribute('aria-label', item.text);

  const low = document.createElement('span');
  low.className = 'scale-legend';
  low.textContent = 'never';
  scale.appendChild(low);

  for (let v = 1; v <= 5; v++) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = item.id;
    input.value = String(v);
    input.id = `${item.id}-${v}`;
    input.addEventListener('change', updateStatus);

    const label = document.createElement('label');
    label.setAttribute('for', input.id);
    label.textContent = String(v);

    scale.appendChild(input);
    scale.appendChild(label);
  }

  const high = document.createElement('span');
  high.className = 'scale-legend';
  high.textContent = 'consistently';
  scale.appendChild(high);

  wrap.appendChild(scale);
  itemsEl.appendChild(wrap);
});

/* --- behaviour ----------------------------------------------------- */

function answers() {
  return AUDIT_ITEMS.map(item => {
    const checked = document.querySelector(`input[name="${item.id}"]:checked`);
    return { item, value: checked ? Number(checked.value) : null };
  });
}

function updateStatus() {
  const answered = answers().filter(a => a.value !== null).length;
  statusEl.textContent = `${answered} of ${AUDIT_ITEMS.length} answered`;
}

document.getElementById('audit-score').addEventListener('click', () => {
  const rows = answers();
  const missing = rows.filter(r => r.value === null);
  if (missing.length) {
    statusEl.textContent = `${missing.length} still unanswered — an audit with holes tells you nothing.`;
    return;
  }

  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const verdict = VERDICTS.find(v => total >= v.min);
  const weakest = rows.slice().sort((a, b) => a.value - b.value).slice(0, 2);

  document.getElementById('verdict-score').textContent = `${total} / 45`;
  document.getElementById('verdict-title').textContent = verdict.title;
  document.getElementById('verdict-body').textContent = verdict.body;
  document.getElementById('verdict-weak').textContent =
    'Weakest ground: ' + weakest.map(w => `“${w.item.text}” (${w.value})`).join('  ·  ');

  verdictEl.hidden = false;
  verdictEl.scrollIntoView({ block: 'nearest' });

  lastResult = { total, verdict, rows };
  updateStatus();
});

document.getElementById('audit-reset').addEventListener('click', () => {
  document.getElementById('audit').reset();
  verdictEl.hidden = true;
  lastResult = null;
  updateStatus();
});

document.getElementById('audit-save').addEventListener('click', (e) => {
  if (!lastResult) return;
  const { total, verdict, rows } = lastResult;
  let text = `Creed Audit — ${total}/45 · ${verdict.title}\n\n`;
  rows.forEach((r, i) => { text += `${i + 1}. [${r.value}] ${r.item.text}\n`; });
  text += `\n${verdict.body}`;

  HF.add({ text, tags: ['creed', 'audit'], source: 'creed-audit' });
  hfFlash(e.target, 'Saved to journal');
});

updateStatus();
